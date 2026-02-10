const Database = require('better-sqlite3');
const db = new Database('ledger.db');

// Legacy Data: 66.8k tokens
// Breakdown estimate: 65.5k Input, 1.3k Output
// Cost estimate: Input $0.075/1M, Output $0.30/1M
// 65500 * 0.075 / 1000000 = $0.0049
// 1300 * 0.30 / 1000000 = $0.00039
// Total: ~$0.0053 USD

const legacyData = {
  timestamp: new Date().toISOString(),
  session_key: 'legacy_import',
  model: 'mixed',
  total_tokens: 66800,
  input_tokens: 65500,
  output_tokens: 1300,
  input_delta: 65500,
  output_delta: 1300,
  cost_usd: 0.0053,
  note: 'Legacy import from manual estimation'
};

const stmt = db.prepare(`
  INSERT INTO usage_logs (
    timestamp, session_key, model, total_tokens,
    input_tokens, output_tokens, input_delta, output_delta, cost_usd, note
  ) VALUES (
    @timestamp, @session_key, @model, @total_tokens,
    @input_tokens, @output_tokens, @input_delta, @output_delta, @cost_usd, @note
  )
`);

stmt.run(legacyData);

// Update daily stats for today
const today = new Date().toISOString().split('T')[0];
const statsStmt = db.prepare(`
  INSERT INTO daily_stats (date, total_tokens, total_cost_usd, input_tokens, output_tokens)
  VALUES (?, ?, ?, ?, ?)
  ON CONFLICT(date) DO UPDATE SET
    total_tokens = total_tokens + excluded.total_tokens,
    total_cost_usd = total_cost_usd + excluded.total_cost_usd,
    input_tokens = input_tokens + excluded.input_tokens,
    output_tokens = output_tokens + excluded.output_tokens
`);

statsStmt.run(today, legacyData.total_tokens, legacyData.cost_usd, legacyData.input_tokens, legacyData.output_tokens);

console.log('Legacy data imported successfully.');
db.close();
