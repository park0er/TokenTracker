/**
 * tracker.js - TokenTracker V2 (Log-based)
 * 
 * Reads OpenClaw session transcript .jsonl files every minute,
 * importing new messages that haven't been seen yet (tracked by message_id).
 * This gives accurate per-request billing data that matches provider invoices.
 */

const Database = require('better-sqlite3');
const cron = require('node-cron');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

const db = new Database('ledger.db');

// --- Config ---
const PRICING_FILE = 'pricing_config.json';
const SESSIONS_DIR = path.join(
  process.env.HOME || '/Users/park0er',
  '.openclaw', 'agents', 'main', 'sessions'
);

// --- Pricing ---
function loadPricing() {
  if (fs.existsSync(PRICING_FILE)) {
    return JSON.parse(fs.readFileSync(PRICING_FILE, 'utf8'));
  }
  return { default: { input: 0.50, output: 3.00, cacheRead: 0.125, currency: 'USD' }, settings: { exchange_rate: 6.91 } };
}

function calculateCostCNY(model, input, output, cacheRead, cacheWrite) {
  const pricingConfig = loadPricing();
  const price = pricingConfig[model] || pricingConfig['default'];
  const cacheReadRate = price.cacheRead ?? price.input;
  // IMPORTANT: JSONL `input` already INCLUDES cacheRead!
  // Non-cached input = input - cacheRead
  const nonCachedInput = Math.max(0, input - (cacheRead || 0));
  let cost = ((nonCachedInput + (cacheWrite || 0)) * price.input
    + (cacheRead || 0) * cacheReadRate
    + output * price.output) / 1000000;

  if (price.currency === 'USD') {
    const rate = pricingConfig.settings?.exchange_rate || 6.91;
    cost *= rate;
  }
  return cost;
}

// --- State: Track which message IDs we've already imported ---
const seenMessageIds = new Set();

function loadSeenIds() {
  const rows = db.prepare('SELECT message_id FROM usage_logs WHERE message_id IS NOT NULL').all();
  for (const row of rows) {
    seenMessageIds.add(row.message_id);
  }
  console.log(`Loaded ${seenMessageIds.size} known message IDs from DB.`);
}

// --- JSONL Parsing ---
async function scanSessionFile(filePath) {
  const newEntries = [];
  const fileStream = fs.createReadStream(filePath, { encoding: 'utf-8' });
  const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

  let sessionModel = 'unknown';

  for await (const line of rl) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    try {
      const entry = JSON.parse(trimmed);

      if (entry.type === 'model_change' && entry.modelId) {
        sessionModel = entry.modelId;
      }

      if (entry.type !== 'message') continue;
      const msg = entry.message;
      if (!msg || msg.role !== 'assistant') continue;

      const usage = msg.usage;
      if (!usage) continue;

      const messageId = entry.id;
      if (!messageId || seenMessageIds.has(messageId)) continue;

      const input = usage.input || usage.inputTokens || 0;
      const output = usage.output || usage.outputTokens || 0;
      const cacheRead = usage.cacheRead || usage.cache_read || 0;
      const cacheWrite = usage.cacheWrite || usage.cache_write || 0;
      // input already includes cacheRead, so total = input + output
      const totalTokens = input + output;
      const model = msg.model || sessionModel;
      const timestamp = entry.timestamp || new Date().toISOString();

      newEntries.push({
        timestamp,
        messageId,
        model,
        input,
        output,
        cacheRead,
        cacheWrite,
        totalTokens,
      });
    } catch (e) {
      // Skip unparseable lines silently
    }
  }

  return newEntries;
}

// --- Main Poll ---
const insertLog = db.prepare(`
  INSERT INTO usage_logs (
    timestamp, session_key, model, total_tokens,
    input_tokens, output_tokens, input_delta, output_delta, 
    cost_usd, message_id, cache_read
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

const upsertDailyStat = db.prepare(`
  INSERT INTO daily_stats (date, total_tokens, total_cost_usd, input_tokens, output_tokens, cache_read)
  VALUES (?, ?, ?, ?, ?, ?)
  ON CONFLICT(date) DO UPDATE SET
    total_tokens = total_tokens + excluded.total_tokens,
    total_cost_usd = total_cost_usd + excluded.total_cost_usd,
    input_tokens = input_tokens + excluded.input_tokens,
    output_tokens = output_tokens + excluded.output_tokens,
    cache_read = cache_read + excluded.cache_read
`);

async function pollLogs() {
  try {
    const files = fs.readdirSync(SESSIONS_DIR)
      .filter(f => f.endsWith('.jsonl') && !f.includes('.deleted.'))
      .map(f => path.join(SESSIONS_DIR, f));

    let totalNew = 0;

    for (const filePath of files) {
      const sessionId = path.basename(filePath, '.jsonl');
      const newEntries = await scanSessionFile(filePath);

      if (newEntries.length === 0) continue;

      db.transaction(() => {
        for (const e of newEntries) {
          const costCNY = calculateCostCNY(e.model, e.input, e.output, e.cacheRead, e.cacheWrite);

          // Convert timestamp to local date for daily bucket
          const date = new Date(e.timestamp);
          const today = date.toLocaleDateString('en-CA', { timeZone: 'Asia/Shanghai' });

          insertLog.run(
            e.timestamp,
            `session:${sessionId}`,
            e.model,
            e.totalTokens,    // total_tokens: input + output (matches provider dashboard)
            e.input,          // input_tokens
            e.output,         // output_tokens
            e.input,          // input_delta
            e.output,         // output_delta
            costCNY,
            e.messageId,
            e.cacheRead
          );

          upsertDailyStat.run(
            today,
            e.totalTokens,
            costCNY,
            e.input,
            e.output,
            e.cacheRead
          );

          seenMessageIds.add(e.messageId);
          totalNew++;
        }
      })();

      if (newEntries.length > 0) {
        const ts = new Date().toISOString();
        console.log(`[${ts}] ${sessionId}: +${newEntries.length} new messages`);
      }
    }

    if (totalNew > 0) {
      console.log(`[${new Date().toISOString()}] Imported ${totalNew} new messages total.`);
    }
  } catch (e) {
    console.error('Poll error:', e.message);
  }
}

// --- Start ---
console.log('TokenTracker V2 (Log-based) starting...');
console.log(`Sessions dir: ${SESSIONS_DIR}`);
loadSeenIds();

// Run once immediately
pollLogs();

// Then every minute
cron.schedule('* * * * *', pollLogs);
console.log('Polling every minute for new log entries...');
