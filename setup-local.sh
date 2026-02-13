#!/bin/bash

# Polymarket Local Hosting Setup Script

echo "🚀 Starting Polymarket Local Hosting Setup..."

# Function to check command existence
command_exists () {
    type "$1" &> /dev/null ;
}

# Check for Docker
if ! command_exists docker; then
    echo "❌ Docker is not installed or not in PATH."
    echo "   Please install Docker Desktop for Mac: https://www.docker.com/products/docker-desktop"
    exit 1
fi

# Check for Docker Compose
if ! docker compose version &> /dev/null; then
    echo "❌ Docker Compose plugin not found."
    exit 1
fi

# Check for .env file
if [ ! -f .env ]; then
    echo "❌ .env file not found!"
    echo "   Please create .env based on .env.example"
    exit 1
fi

# Check for TUNNEL_TOKEN
if grep -q "TUNNEL_TOKEN=" .env && ! grep -q "TUNNEL_TOKEN=." .env; then
    echo "⚠️  TUNNEL_TOKEN is empty in .env"
    echo "   Cloudflare Tunnel will not start without a valid token."
    echo "   Get a token from Cloudflare Zero Trust Dashboard -> Access -> Tunnels"
    read -p "   Do you want to proceed without the tunnel? (y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

echo "🧹 Cleaning up potential conflicting containers..."
docker rm -f ollama cloudflared 2>/dev/null || true
# Stop legacy 'docker' project containers if they exist
cd docker && docker compose -p docker down 2>/dev/null || true
cd ..

echo "📦 Building and starting services..."
cd docker
docker compose -p "polymarket-trader" -f docker-compose.local.yml up -d --build


if [ $? -ne 0 ]; then
    echo "❌ Failed to start services."
    exit 1
fi

echo "⏳ Waiting for Ollama to initialize..."
sleep 10

echo "🧠 Pulling Llama3 model (this may take a while)..."
docker exec ollama ollama pull llama3

echo "✅ Setup Complete!"
echo "   - Agent Service: http://localhost:3001"
echo "   - Risk Guardian: http://localhost:3002"
echo "   - Trade Executor: http://localhost:3003"
echo "   - Ollama: http://localhost:11434"
echo ""
echo "   To view logs:"
echo "   cd docker && docker compose -p "polymarket-trader" -f docker-compose.local.yml logs -f"
