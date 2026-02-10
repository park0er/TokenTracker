const Database = require('better-sqlite3');
const db = new Database('ledger.db');

// Create tables
db.exec(`
  CREATE TABLE IF NOT EXISTS usage_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    session_key TEXT,
    model TEXT,
    total_tokens INTEGER,
    input_tokens INTEGER,
    output_tokens INTEGER,
    input_delta INTEGER,
    output_delta INTEGER,
    cost_usd REAL,
    note TEXT
  );

  CREATE TABLE IF NOT EXISTS daily_stats (
    date TEXT PRIMARY KEY,
    total_tokens INTEGER,
    total_cost_usd REAL,
    input_tokens INTEGER,
    output_tokens INTEGER
  );
`);

console.log('Database initialized.');
db.close();
