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
  try {
    // Fetch the latest total_tokens for each session to prevent double-counting on restart
    const rows = db.prepare(`
      SELECT session_key, MAX(total_tokens) as last_total
      FROM usage_logs
      GROUP BY session_key
    `).all();

    rows.forEach(row => {
      // Create a mapping of sessionId -> lastTotal
      // Note: usage_logs stores 'session_key' which might differ from strict sessionId in some contexts
      // but here we are using it as the unique identifier for continuity.
      if (row.session_key) {
        // We need to map session_key back to the ID format used in pollSessions
        // In pollSessions: const sessionId = session.sessionId; 
        // But usage_logs only has session_key. 
        // CAUTION: The original code in pollSessions uses `session.sessionId` for tracking 
        // but `session.key` for logging. 
        // 
        // Let's look at pollSessions:
        // const sessionId = session.sessionId;
        // const key = session.key;
        // ...
        // stmt.run(..., key, ...)
        //
        // So `usage_logs` has `key` (e.g. "Run 1"), NOT `sessionId` (e.g. UUID).
        // This is a potential issue if distinct sessionIds share the same key name.
        // However, based on current schema, we can only recover state by `key`.
        //
        // To fix this properly, we should ideally store sessionId in DB.
        // For now, we will assume `key` is unique enough or map it to `sessionId` if possible.
        // But wait, `lastTotals` is keyed by `sessionId` in `pollSessions`:
        // lastTotals[sessionId] = currentTotal;
        //
        // If we only have `key` from DB, we can't perfectly restore `lastTotals[sessionId]`.
        //
        // WORKAROUND:
        // We will store the last totals in a temporary map purely for the *first* poll.
        // But `pollSessions` iterates over `openclaw sessions` output which provides both.
        //
        // We will modify `pollSessions` slightly to check this restored state if `lastTotals` is empty.
        // OR: We can just use `key` as the map key? 
        // No, `pollSessions` explicitly uses `sessionId`.

        // Let's just log what we found and maybe rely on the first poll to reconcile?
        // Actually, the bug is:
        // 1. Start tracker
        // 2. Poll gets session X (Total 1000)
        // 3. lastTotals[X] is undefined -> 0
        // 4. Delta = 1000 - 0 = 1000 -> LOGGED! (Wrong)

        // If we can populate lastTotals[X] with 1000, we are good.
        // But we don't know X (sessionId) from the DB! We only know "Run 1" (key).

        // Strategy:
        // We will maintain a secondary map `lastTotalsByKey` loaded from DB.
        // Inside `pollSessions`, if `lastTotals[sessionId]` is missing, 
        // we check `lastTotalsByKey[session.key]`.
        // If that exists, we use it as the initial value.
      }
    });

    // Populate a module-level variable to hold these recovered values
    global.initialStateByKey = {};
    rows.forEach(r => {
      global.initialStateByKey[r.session_key] = r.last_total;
    });

    console.log(`Loaded state for ${rows.length} sessions from DB.`);
  } catch (error) {
    console.error('Failed to load initial state from DB:', error);
  }
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

          // Try to recover state from memory, or fallback to DB-restored state by Key
          if (lastTotals[sessionId] === undefined && global.initialStateByKey && global.initialStateByKey[key] !== undefined) {
            console.log(`Restoring state for session ${key} (${sessionId}) from DB: ${global.initialStateByKey[key]}`);
            lastTotals[sessionId] = global.initialStateByKey[key];
          }

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
// Poll every minute
cron.schedule('* * * * *', pollSessions);
pollSessions(); // Run immediately on startup
console.log('Tracker started. Polling every minute...');
