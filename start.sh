#!/bin/bash

# TokenTracker - One-Click Starter with Stale Process Detection
# This script starts the backend API, tracker daemon, and frontend dev server.
# It also detects stale/zombie processes and restarts them.

cd ~/Coding/TokenTracker

# --- Helper: check if a process is alive AND healthy ---
is_healthy() {
  local pattern="$1"
  local pid=$(pgrep -f "$pattern" | head -n 1)
  if [ -z "$pid" ]; then
    return 1  # Not running
  fi
  return 0  # Running
}

# --- Backend API (server.js on port 3300) ---
if is_healthy "node server.js"; then
  echo "Backend already running."
else
  echo "Starting Backend..."
  nohup node server.js > server.log 2>&1 &
fi

# --- Tracker Daemon (tracker.js) ---
if is_healthy "node tracker.js"; then
  # Extra check: is the heartbeat stale?
  HEARTBEAT_FILE=".tracker_heartbeat"
  if [ -f "$HEARTBEAT_FILE" ]; then
    HEARTBEAT_AGE=$(python3 -c "
import json, time, datetime
try:
    hb = json.load(open('$HEARTBEAT_FILE'))
    ts = datetime.datetime.fromisoformat(hb['timestamp'].replace('Z', '+00:00'))
    age = time.time() - ts.timestamp()
    print(int(age))
except:
    print(999999)
" 2>/dev/null)
    
    if [ "$HEARTBEAT_AGE" -gt 300 ]; then
      echo "⚠️  Tracker heartbeat stale (${HEARTBEAT_AGE}s old). Restarting..."
      kill $(pgrep -f "node tracker.js") 2>/dev/null
      sleep 1
      nohup node tracker.js > tracker.log 2>&1 &
    else
      echo "Tracker already running (heartbeat: ${HEARTBEAT_AGE}s ago)."
    fi
  else
    echo "Tracker already running (no heartbeat file yet)."
  fi
else
  echo "Starting Tracker..."
  nohup node tracker.js > tracker.log 2>&1 &
fi

# --- Frontend (Vite on port 5173) ---
cd ~/Coding/TokenTracker/client
if ! pgrep -f "port 5173" > /dev/null; then
  echo "Starting Frontend..."
  nohup npm run dev -- --host --port 5173 > client.log 2>&1 &
else
  echo "Frontend already running."
fi

echo "✅ System Operational!"
echo "📊 Dashboard: http://localhost:5173"
echo "🔌 API: http://localhost:3300"
echo "💓 Health: http://localhost:3300/api/health"
