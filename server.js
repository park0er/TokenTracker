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

// API: Get Pricing Config
app.get('/api/config/pricing', (req, res) => {
  const fs = require('fs');
  const path = require('path');
  const configPath = path.join(__dirname, 'pricing_config.json');
  if (fs.existsSync(configPath)) {
    res.json(JSON.parse(fs.readFileSync(configPath, 'utf8')));
  } else {
    res.json({});
  }
});

// API: Model Daily Stats (for filtering)
app.get('/api/stats/model-daily', (req, res) => {
  try {
    // Aggregate from usage_logs. 
    // Note: This might be slow if logs are huge, but accurate for model breakdown.
    // We use SQLite's strftime to group by day in 'Asia/Shanghai' if possible, 
    // or just assume the server time/UTC for now and let frontend handle offsets?
    // Actually simpler: The timestamp in DB is ISO string (UTC).
    // We can just group by substring(timestamp, 0, 10) which is UTC day.
    // Ideally we want Shanghai day. 
    // SQLite: datetime(timestamp, 'localtime') might depend on server system time.
    // Let's use the 'start of day' logic in JS or just fetch enough raw data?
    // Aggregation in SQL is better.
    // We will group by UTC date for simplicity, as bridging 'Asia/Shanghai' inside SQLite is tricky without extensions.
    // ERROR in assumption: if user consumes at 1AM CN (5PM UTC previous day), it goes to previous day bucket.
    // For personal usage, this "UTC day" error might be acceptable for the "Model Breakdown".
    // OR we can try `datetime(timestamp, '+8 hours')` manually since we know it's CN.
    const stmt = db.prepare(`
      SELECT 
        date(datetime(timestamp, '+8 hours')) as date,
        model,
        SUM(input_delta) as input_tokens,
        SUM(output_delta) as output_tokens,
        SUM(cost_usd) as total_cost_usd
      FROM usage_logs
      WHERE timestamp >= date('now', '-1 year')
      GROUP BY date, model
      ORDER BY date ASC
    `);

    // Transform to array
    const rows = stmt.all();
    const result = rows.map(r => ({
      date: r.date,
      model: r.model,
      total_tokens: r.input_tokens + r.output_tokens,
      input_tokens: r.input_tokens,
      output_tokens: r.output_tokens,
      total_cost_usd: r.total_cost_usd
    }));

    res.json(result);
  } catch (error) {
    console.error('Database Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// API: Update Pricing Config
app.post('/api/config/pricing', (req, res) => {
  const fs = require('fs');
  const path = require('path');
  const configPath = path.join(__dirname, 'pricing_config.json');
  try {
    fs.writeFileSync(configPath, JSON.stringify(req.body, null, 2));
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`Using database at: ${dbPath}`);
});
