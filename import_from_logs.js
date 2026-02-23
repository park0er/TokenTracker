/**
 * import_from_logs.js
 * 
 * Reads all OpenClaw session transcript .jsonl files and imports
 * per-message usage data into the TokenTracker database.
 * This replaces the inaccurate polling-based data with precise,
 * per-request billing data that matches provider invoices.
 * 
 * Usage: node import_from_logs.js
 */

const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

const db = new Database('ledger.db');
const PRICING_FILE = 'pricing_config.json';
const SESSIONS_DIR = path.join(
    process.env.HOME || '/Users/park0er',
    '.openclaw', 'agents', 'main', 'sessions'
);

// Load pricing
const pricingConfig = JSON.parse(fs.readFileSync(PRICING_FILE, 'utf8'));
const exchangeRate = pricingConfig.settings?.exchange_rate || 6.91;

console.log(`Sessions dir: ${SESSIONS_DIR}`);
console.log(`Exchange rate: ${exchangeRate}`);

// Helper: calculate cost in CNY
function calculateCostCNY(model, input, output, cacheRead, cacheWrite) {
    const price = pricingConfig[model] || pricingConfig['default'];
    const cacheReadRate = price.cacheRead ?? price.input;
    const inputIncludesCache = price.inputIncludesCache ?? false;

    // If inputIncludesCache is true, `input` is total prompt size, so non-cached = input - cacheRead.
    // If false, `input` is already strictly non-cached tokens.
    const nonCachedInput = inputIncludesCache ? Math.max(0, input - (cacheRead || 0)) : input;

    let cost = ((nonCachedInput + (cacheWrite || 0)) * price.input
        + (cacheRead || 0) * cacheReadRate
        + output * price.output) / 1000000;

    if (price.currency === 'USD') {
        cost *= exchangeRate;
    }
    return cost;
}

// Parse a single JSONL file and extract usage entries
async function parseSessionFile(filePath) {
    const entries = [];
    const fileStream = fs.createReadStream(filePath, { encoding: 'utf-8' });
    const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

    let sessionModel = 'unknown';

    for await (const line of rl) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        try {
            const entry = JSON.parse(trimmed);

            // Track model changes
            if (entry.type === 'model_change' && entry.modelId) {
                sessionModel = entry.modelId;
            }

            // We only care about assistant messages with usage data
            if (entry.type !== 'message') continue;
            const msg = entry.message;
            if (!msg || msg.role !== 'assistant') continue;

            const usage = msg.usage;
            if (!usage) continue;

            const input = usage.input || usage.inputTokens || usage.input_tokens || usage.promptTokens || 0;
            const output = usage.output || usage.outputTokens || usage.output_tokens || usage.completionTokens || 0;
            const cacheRead = usage.cacheRead || usage.cache_read || usage.cache_read_input_tokens || 0;
            const cacheWrite = usage.cacheWrite || usage.cache_write || usage.cache_creation_input_tokens || 0;
            const totalTokens = usage.totalTokens || usage.total_tokens || usage.total || (input + output + cacheRead + cacheWrite);

            // Extract cost if provider reported it
            let providerCost = null;
            if (usage.cost && typeof usage.cost === 'object') {
                providerCost = usage.cost.total;
            }

            const model = msg.model || sessionModel;
            const timestamp = entry.timestamp || new Date().toISOString();
            const messageId = entry.id || null;
            const sessionKey = ''; // Will be filled from filename

            entries.push({
                timestamp,
                messageId,
                model,
                input,
                output,
                cacheRead,
                cacheWrite,
                totalTokens,
                providerCost,
            });
        } catch (e) {
            // Skip unparseable lines
        }
    }

    return entries;
}

async function main() {
    // 1. Clear old polling-based data
    console.log('Clearing old polling-based usage_logs...');
    const oldCount = db.prepare('SELECT COUNT(*) as c FROM usage_logs').get().c;
    console.log(`Old records: ${oldCount}`);
    db.prepare('DELETE FROM usage_logs').run();
    db.prepare('DELETE FROM daily_stats').run();
    console.log('Cleared.');

    // 2. Scan all .jsonl files (including archived .deleted. and .reset. ones)
    const files = fs.readdirSync(SESSIONS_DIR)
        .filter(f => f.includes('.jsonl'))
        .map(f => path.join(SESSIONS_DIR, f));

    console.log(`Found ${files.length} session files to process.`);

    const insertLog = db.prepare(`
    INSERT INTO usage_logs (
      timestamp, session_key, model, total_tokens,
      input_tokens, output_tokens, input_delta, output_delta, 
      cost_usd, message_id, cache_read
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

    let totalImported = 0;
    let totalTokensAll = 0;
    let totalCostAll = 0;

    for (const filePath of files) {
        const sessionId = path.basename(filePath, '.jsonl');
        const entries = await parseSessionFile(filePath);

        if (entries.length === 0) continue;

        db.transaction(() => {
            for (const e of entries) {
                const costCNY = calculateCostCNY(e.model, e.input, e.output, e.cacheRead, e.cacheWrite);

                // Standardize token counts
                const price = pricingConfig[e.model] || pricingConfig['default'];
                const inputIncludesCache = price.inputIncludesCache ?? false;

                // For OpenAI (false): input is non-cached, so total context = input + cacheRead
                // For Gemini/MiMo (true): input is total context
                const totalInputTokens = inputIncludesCache ? e.input : (e.input + e.cacheRead);
                const providerTotal = totalInputTokens + e.output;

                insertLog.run(
                    e.timestamp,
                    `session:${sessionId}`,
                    e.model,
                    providerTotal,    // total_tokens
                    totalInputTokens, // input_tokens: total input (cached + non-cached)
                    e.output,         // output_tokens
                    totalInputTokens, // input_delta
                    e.output,         // output_delta
                    costCNY,          // cost_usd (actually CNY)
                    e.messageId,
                    e.cacheRead
                );

                totalImported++;
                totalTokensAll += providerTotal;
                totalCostAll += costCNY;
            }
        })();

        console.log(`  ${sessionId}: ${entries.length} messages imported`);
    }

    console.log(`\nTotal imported: ${totalImported} messages`);
    console.log(`Total tokens (sum of all requests): ${totalTokensAll.toLocaleString()}`);
    console.log(`Total estimated cost: ¥${totalCostAll.toFixed(4)}`);

    // 3. Rebuild daily stats
    console.log('\nRebuilding daily stats...');
    const dailyData = db.prepare(`
    SELECT 
      date(datetime(timestamp, '+8 hours')) as date,
      SUM(input_delta) as input_tokens,
      SUM(output_delta) as output_tokens,
      SUM(total_tokens) as total_tokens,
      SUM(cost_usd) as total_cost_usd,
      SUM(cache_read) as cache_read
    FROM usage_logs
    GROUP BY date
  `).all();

    const insertStat = db.prepare(`
    INSERT INTO daily_stats (date, total_tokens, total_cost_usd, input_tokens, output_tokens, cache_read)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

    db.transaction(() => {
        for (const day of dailyData) {
            insertStat.run(
                day.date,
                day.total_tokens,
                day.total_cost_usd,
                day.input_tokens,
                day.output_tokens,
                day.cache_read
            );
            console.log(`  ${day.date}: ${day.total_tokens?.toLocaleString()} tokens, ¥${day.total_cost_usd?.toFixed(4)}`);
        }
    })();

    console.log('\nDone! Data now matches per-request billing from OpenClaw logs.');
}

main().catch(e => {
    console.error('Fatal error:', e);
    process.exit(1);
});
