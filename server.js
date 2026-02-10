const express = require('express');
const Database = require('better-sqlite3');
const cors = require('cors');
const path = require('path');

const app = express();
const dbPath = path.join(__dirname, 'ledger.db');
const db = new Database(dbPath);
const PORT = 3300;

app.use(cors());
app.use(express.json());

// API: Daily Stats (Default 365 days for client-side flex)
app.get('/api/stats/daily', (req, res) => {
  try {
    const limit = req.query.limit || 365;
    const stmt = db.prepare(`
      SELECT * FROM daily_stats 
      ORDER BY date DESC 
      LIMIT ?
    `);
    res.json(stmt.all(limit));
  } catch (error) {
    console.error('Database Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// API: Heatmap Data (Full Year)
app.get('/api/stats/heatmap', (req, res) => {
  try {
    const stmt = db.prepare(`
      SELECT date, total_tokens as count 
      FROM daily_stats 
      WHERE date >= date('now', '-1 year')
    `);
    res.json(stmt.all());
  } catch (error) {
    console.error('Database Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// API: Recent Logs
app.get('/api/logs', (req, res) => {
  try {
    const limit = req.query.limit || 50;
    const stmt = db.prepare(`
      SELECT * FROM usage_logs 
      ORDER BY timestamp DESC 
      LIMIT ?
    `);
    res.json(stmt.all(limit));
  } catch (error) {
    console.error('Database Error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`Using database at: ${dbPath}`);
});
