const Database = require('better-sqlite3');
const fs = require('fs');

const db = new Database('ledger.db', { verbose: console.log });
const PRICING_FILE = 'pricing_config.json';
const pricingConfig = JSON.parse(fs.readFileSync(PRICING_FILE, 'utf8'));
const exchangeRate = pricingConfig.settings?.exchange_rate || 6.91;

console.log('--- DEBUG START ---');
console.log(`Exchange Rate: ${exchangeRate}`);

// Fetch one specific row to debug
const rowId = 37; // The one we analyzed
const log = db.prepare('SELECT rowid, model, input_delta, output_delta, cost_usd FROM usage_logs WHERE rowid = ?').get(rowId);

if (!log) {
    console.error(`Row ${rowId} not found!`);
    process.exit(1);
}

console.log('OLD ROW:', log);

const model = log.model.trim();
const price = pricingConfig[model] || pricingConfig['default'];
console.log(`Using pricing for model '${model}':`, price);

let cost = (log.input_delta * price.input + log.output_delta * price.output) / 1000000;
console.log(`Cost (USD base): ${cost}`);

if (price.currency === 'USD') {
    cost *= exchangeRate;
    console.log(`Cost (CNY converted): ${cost}`);
}

// Force Update
const info = db.prepare('UPDATE usage_logs SET cost_usd = ? WHERE rowid = ?').run(cost, rowId);
console.log('Update Info:', info);

// Verify Update
const newLog = db.prepare('SELECT cost_usd FROM usage_logs WHERE rowid = ?').get(rowId);
console.log('NEW ROW:', newLog);

console.log('--- DEBUG END ---');
