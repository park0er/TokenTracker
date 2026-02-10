#!/bin/bash

# Start Backend
cd ~/Coding/TokenTracker
if ! pgrep -f "node server.js" > /dev/null; then
  echo "Starting Backend..."
  nohup node server.js > server.log 2>&1 &
else
  echo "Backend already running."
fi

# Start Tracker
if ! pgrep -f "node tracker.js" > /dev/null; then
  echo "Starting Tracker..."
  nohup node tracker.js > tracker.log 2>&1 &
else
  echo "Tracker already running."
fi

# Start Frontend
cd ~/Coding/TokenTracker/client
if ! pgrep -f "vite" > /dev/null; then
  echo "Starting Frontend..."
  nohup npm run dev -- --host --port 5173 > client.log 2>&1 &
else
  echo "Frontend already running."
fi

echo "✅ System Operational!"
echo "📊 Dashboard: http://localhost:5173"
echo "🔌 API: http://localhost:3300"
