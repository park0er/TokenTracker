const Database = require('better-sqlite3');
const fs = require('fs');

const db = new Database('ledger.db');
const PRICING_FILE = 'pricing_config.json';
const pricingConfig = JSON.parse(fs.readFileSync(PRICING_FILE, 'utf8'));
const exchangeRate = pricingConfig.settings?.exchange_rate || 6.91;

console.log(`Using Exchange Rate: ${exchangeRate}`);

// 1. Update Usage Logs
const logs = db.prepare('SELECT rowid as rowid, model, total_tokens, input_delta, output_delta FROM usage_logs').all();
console.log(`Found ${logs.length} logs to recalculate...`);


const updateLog = db.prepare('UPDATE usage_logs SET cost_usd = ?, input_delta = ? WHERE rowid = ?');

db.transaction(() => {
    let count = 0;
    for (const log of logs) {
        let model = log.model.trim();
        const price = pricingConfig[model] || pricingConfig['default'];

        // --- Billing Logic Change (Feb 2026) ---
        // User verified that providers bill for the FULL CONTEXT (History + New).
        // So Billed Input = Total Session Size (log.total_tokens).
        // Billed Output = Output Delta.

        // Note: 'input_delta' in DB was previously storing just the delta.
        // For recalculation, we should use 'total_tokens' column if available?
        // Wait, the 'logs' query above only selected 'input_delta'.
        // We need to fetch 'total_tokens' from the row!

        // But wait, the previous `recalculate_costs.js` query was:
        // SELECT rowid, model, input_delta, output_delta FROM usage_logs
        // It didn't fetch total_tokens.
        // We need to fetch total_tokens.

        let billedInput = log.total_tokens;
        let billedOutput = log.output_delta;

        // Guard: If total_tokens is missing or 0 (old logs might call it something else?), fallback.
        if (!billedInput) billedInput = log.input_delta;

        let cost = (billedInput * price.input + billedOutput * price.output) / 1000000;

        // Also, we need to UPDATE the 'input_delta' column in the DB to reflect this massive number?
        // YES. If we don't, the daily stats sum(input_delta) will still be small.
        // We must update 'input_delta' = 'total_tokens'.

        // We need a separate update statement for input_delta.


        if (price.currency === 'USD') {
            cost *= exchangeRate;
        }

        db.prepare('UPDATE usage_logs SET cost_usd = ?, input_delta = ? WHERE rowid = ?').run(cost, billedInput, log.rowid);

        if (count < 3) { // Log first few for verification
            console.log(`[DEBUG] Row ${log.rowid} (${log.model}): Total ${billedInput} -> Cost ¥${cost.toFixed(4)}`);
        }
        count++;
    }
    console.log(`Updated ${count} usage logs.`);
})();

// 2. Rebuild Daily Stats
console.log('Rebuilding Daily Stats...');
db.prepare('DELETE FROM daily_stats').run();

const dailyData = db.prepare(`
    SELECT 
        date(datetime(timestamp, '+8 hours')) as date,
        SUM(input_delta) as input_tokens,
        SUM(output_delta) as output_tokens,
        SUM(input_delta + output_delta) as total_tokens,
        SUM(cost_usd) as total_cost_usd
    FROM usage_logs
    GROUP BY date
`).all();

const insertStat = db.prepare(`
    INSERT INTO daily_stats (date, total_tokens, total_cost_usd, input_tokens, output_tokens)
    VALUES (?, ?, ?, ?, ?)
`);

db.transaction(() => {
    for (const day of dailyData) {
        insertStat.run(day.date, day.total_tokens, day.total_cost_usd, day.input_tokens, day.output_tokens);
        console.log(`Rebuilt stats for ${day.date}: ¥${day.total_cost_usd.toFixed(4)}`);
    }
})();

console.log('Done!');
