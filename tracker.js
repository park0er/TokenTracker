/**
 * tracker.js - TokenTracker V2 (Log-based) with Self-Healing
 * 
 * Reads OpenClaw session transcript .jsonl files every minute,
 * importing new messages that haven't been seen yet (tracked by message_id).
 * 
 * Resilience features:
 *   - Consecutive failure watchdog: auto-restarts after 5 failed polls
 *   - Daily scheduled restart at 4:00 AM CST to prevent memory/fd leaks
 *   - Health check heartbeat file for external monitoring
 *   - Verbose error logging with timestamps
 */

const Database = require('better-sqlite3');
const cron = require('node-cron');
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { spawn } = require('child_process');

const db = new Database('ledger.db');

// --- Config ---
const PRICING_FILE = 'pricing_config.json';
const SESSIONS_DIR = path.join(
  process.env.HOME || '/Users/park0er',
  '.openclaw', 'agents', 'main', 'sessions'
);
const HEARTBEAT_FILE = path.join(__dirname, '.tracker_heartbeat');
const MAX_CONSECUTIVE_FAILURES = 5;

// --- Watchdog State ---
let consecutiveFailures = 0;
let lastSuccessfulPoll = new Date();
let totalPollCount = 0;

function log(msg) {
  const ts = new Date().toISOString();
  console.log(`[${ts}] ${msg}`);
}

function logError(msg, err) {
  const ts = new Date().toISOString();
  console.error(`[${ts}] ❌ ${msg}`, err?.stack || err?.message || err);
}

// --- Heartbeat ---
function writeHeartbeat(status) {
  try {
    const data = JSON.stringify({
      status,
      lastSuccess: lastSuccessfulPoll.toISOString(),
      consecutiveFailures,
      totalPolls: totalPollCount,
      seenMessages: seenMessageIds.size,
      uptime: Math.round(process.uptime()),
      pid: process.pid,
      timestamp: new Date().toISOString(),
    }, null, 2);
    fs.writeFileSync(HEARTBEAT_FILE, data);
  } catch (e) {
    // Heartbeat write failure is non-critical
  }
}

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
  const inputIncludesCache = price.inputIncludesCache ?? false;

  const nonCachedInput = inputIncludesCache ? Math.max(0, input - (cacheRead || 0)) : input;

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
  log(`Loaded ${seenMessageIds.size} known message IDs from DB.`);
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
  totalPollCount++;

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

          const pricingConfig = loadPricing();
          const price = pricingConfig[e.model] || pricingConfig['default'];
          const inputIncludesCache = price.inputIncludesCache ?? false;

          const totalInputTokens = inputIncludesCache ? e.input : (e.input + e.cacheRead);
          const providerTotal = totalInputTokens + e.output;

          insertLog.run(
            e.timestamp,
            `session:${sessionId}`,
            e.model,
            providerTotal,    // total_tokens
            totalInputTokens, // input_tokens
            e.output,         // output_tokens
            totalInputTokens, // input_delta
            e.output,         // output_delta
            costCNY,
            e.messageId,
            e.cacheRead
          );

          upsertDailyStat.run(
            today,
            providerTotal,
            costCNY,
            totalInputTokens,
            e.output,
            e.cacheRead
          );

          seenMessageIds.add(e.messageId);
          totalNew++;
        }
      })();

      if (newEntries.length > 0) {
        log(`${sessionId}: +${newEntries.length} new messages`);
      }
    }

    if (totalNew > 0) {
      log(`Imported ${totalNew} new messages total.`);
    }

    // Poll succeeded — reset failure counter
    consecutiveFailures = 0;
    lastSuccessfulPoll = new Date();
    writeHeartbeat('ok');

  } catch (e) {
    consecutiveFailures++;
    logError(`Poll failed (attempt ${consecutiveFailures}/${MAX_CONSECUTIVE_FAILURES})`, e);
    writeHeartbeat('error');

    // If too many consecutive failures, force restart
    if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
      log(`🔄 ${MAX_CONSECUTIVE_FAILURES} consecutive failures detected. Restarting process...`);
      gracefulRestart();
    }
  }
}

// --- Graceful Restart ---
function gracefulRestart() {
  log('♻️  Performing graceful restart...');
  try {
    db.close();
  } catch (e) {
    // DB close failure is non-critical during restart
  }

  // Spawn a new tracker process and exit the current one
  const child = spawn(process.argv[0], [process.argv[1]], {
    cwd: __dirname,
    detached: true,
    stdio: ['ignore',
      fs.openSync(path.join(__dirname, 'tracker.log'), 'a'),
      fs.openSync(path.join(__dirname, 'tracker.log'), 'a')
    ],
  });
  child.unref();

  log(`♻️  New process spawned (PID: ${child.pid}). Old process (PID: ${process.pid}) exiting.`);
  process.exit(0);
}

// --- Start ---
log('TokenTracker V2 (Log-based + Self-Healing) starting...');
log(`Sessions dir: ${SESSIONS_DIR}`);
log(`PID: ${process.pid}`);
loadSeenIds();

// Run once immediately
pollLogs();

// Then every minute
cron.schedule('* * * * *', pollLogs);
log('⏱️  Polling every minute for new log entries...');

// Daily restart at 4:00 AM CST (UTC+8 = 20:00 UTC previous day)
cron.schedule('0 20 * * *', () => {
  log('🌅 Scheduled daily restart (4:00 AM CST). Restarting for freshness...');
  gracefulRestart();
});
log('🌅 Daily auto-restart scheduled at 4:00 AM CST.');

// Health check: log status every hour
cron.schedule('0 * * * *', () => {
  const uptimeHrs = (process.uptime() / 3600).toFixed(1);
  const memMB = (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(1);
  log(`💓 Health: uptime=${uptimeHrs}h, memory=${memMB}MB, seen=${seenMessageIds.size}, polls=${totalPollCount}, failures=${consecutiveFailures}`);
  writeHeartbeat('ok');
});
