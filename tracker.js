const { exec } = require('child_process');
const Database = require('better-sqlite3');
const cron = require('node-cron');

const db = new Database('ledger.db');

// Pricing configuration (USD per 1M tokens)
const PRICING = {
  'gemini-3-flash': { input: 0.075, output: 0.30 },
  'gemini-3-pro-high': { input: 0.75, output: 3.00 }, // Estimated
  'gemini-2.5-flash-thinking': { input: 0.075, output: 0.30 },
  'claude-sonnet-4-5-thinking': { input: 3.00, output: 15.00 },
  'default': { input: 0.10, output: 0.40 }
};

// State to track last known totals (keyed by sessionId)
let lastTotals = {};

// Initialize state from DB
function loadState() {
  // We use sessionId to track unique sessions
  // But usage_logs stored session_key previously. We need to adapt.
  // Actually, we should store sessionId in DB too.
  // For now, we assume existing DB is empty or compatible.
  // We'll add a column for sessionId if not exists?
  // No, let's assume new DB.
  const rows = db.prepare(`
    SELECT session_key, total_tokens, timestamp
    FROM usage_logs
    ORDER BY timestamp DESC
  `).all();
  
  // This loads history.
  // But since we are restarting with fresh DB strategy (deduplication),
  // we might want to start fresh or migrate.
  // We'll rely on memory for now if running fresh.
  console.log('Loaded initial state (empty if fresh run).');
}

function getPrice(model) {
  return PRICING[model] || PRICING['default'];
}

function calculateCost(model, input, output) {
  const prices = getPrice(model);
  return (input * prices.input + output * prices.output) / 1000000;
}

function pollSessions() {
  exec('openclaw sessions --json', (error, stdout, stderr) => {
    if (error) {
      console.error(`Error executing openclaw: ${error.message}`);
      return;
    }
    
    try {
      const data = JSON.parse(stdout);
      const sessions = data.sessions || [];
      const timestamp = new Date().toISOString();
      const today = timestamp.split('T')[0];
      
      const seenSessionIds = new Set();

      db.transaction(() => {
        sessions.forEach(session => {
          const sessionId = session.sessionId;
          if (!sessionId) return;
          if (seenSessionIds.has(sessionId)) return; // Skip duplicates
          seenSessionIds.add(sessionId);

          const key = session.key;
          const currentTotal = session.totalTokens || 0;
          const lastTotal = lastTotals[sessionId] || 0; // Track by sessionId
          
          let delta = currentTotal - lastTotal;
          
          if (delta === 0) return; // No change
          
          // Handle reset (current < last)
          if (delta < 0) {
            console.log(`Session ${sessionId} reset detected. New total: ${currentTotal}`);
            delta = currentTotal;
          }

          // Estimate Input/Output breakdown based on last turn reported
          let inputRatio = 0.95;
          const reportedInput = session.inputTokens || 0;
          const reportedOutput = session.outputTokens || 0;
          const reportedSum = reportedInput + reportedOutput;
          
          if (reportedSum > 0) {
            inputRatio = reportedInput / reportedSum;
          }

          const deltaInput = Math.round(delta * inputRatio);
          const deltaOutput = delta - deltaInput;
          
          const model = session.model || 'unknown';
          const cost = calculateCost(model, deltaInput, deltaOutput);

          // Insert log
          // Note: We still log session_key for readability, but use sessionId for tracking
          const stmt = db.prepare(`
            INSERT INTO usage_logs (
              timestamp, session_key, model, total_tokens,
              input_tokens, output_tokens, input_delta, output_delta, cost_usd
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          `);
          
          stmt.run(timestamp, key, model, currentTotal, 
                   (lastTotals[sessionId] || 0) + deltaInput, 
                   (lastTotals[sessionId] || 0) + deltaOutput, 
                   deltaInput, deltaOutput, cost);

          // Update daily stats
          const statsStmt = db.prepare(`
            INSERT INTO daily_stats (date, total_tokens, total_cost_usd, input_tokens, output_tokens)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(date) DO UPDATE SET
              total_tokens = total_tokens + excluded.total_tokens,
              total_cost_usd = total_cost_usd + excluded.total_cost_usd,
              input_tokens = input_tokens + excluded.input_tokens,
              output_tokens = output_tokens + excluded.output_tokens
          `);
          statsStmt.run(today, delta, cost, deltaInput, deltaOutput);

          // Update state
          lastTotals[sessionId] = currentTotal;
          console.log(`[${timestamp}] Logged ${delta} tokens for ${key} (${sessionId}) ($${cost.toFixed(6)})`);
        });
      })(); // Execute transaction
      
    } catch (e) {
      console.error('Failed to parse sessions JSON:', e);
    }
  });
}

// Start
loadState();
// Poll every minute
cron.schedule('* * * * *', pollSessions);
console.log('Tracker started. Polling every minute...');
