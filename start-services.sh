#!/bin/bash

# Cleanup function
cleanup() {
    echo "Stopping all services..."
    kill $(jobs -p)
    exit
}

# Setup cleanup trap
trap cleanup SIGINT SIGTERM

echo "🚀 Starting Polymarket Agent Services..."

# Start Agent Service
echo "Starting Agent Service (Port 3001)..."
cd openclaw-agent-service && npm run dev &

# Start Risk Guardian
echo "Starting Risk Guardian (Port 3002)..."
cd risk-guardian-service && npm run dev &

# Start Trade Executor
echo "Starting Trade Executor (Port 3003)..."
cd trade-executor-service && npm run dev &

# Start Web Dashboard
echo "Starting Web Dashboard (Port 3000)..."
cd web-dashboard && npm run dev &

# Wait for services to initialize
sleep 5

echo "✅ All services running!"
echo "   - Web Dashboard: http://localhost:3000"
echo "   - Agent Service: http://localhost:3001"
echo "   - Risk Guardian: http://localhost:3002"
echo "   - Trade Executor: http://localhost:3003"
echo ""
echo "Press Ctrl+C to stop all services."

# Keep script running
wait
