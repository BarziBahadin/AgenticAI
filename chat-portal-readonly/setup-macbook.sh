#!/bin/bash

echo "🚀 Setting up AI Audit for M1 MacBook Air"
echo ""

# Check if Ollama is installed
if ! command -v ollama &> /dev/null; then
    echo "❌ Ollama not found. Install it first:"
    echo "   brew install ollama"
    echo "   OR visit: https://ollama.com"
    exit 1
fi

echo "✅ Ollama is installed"

# Start Ollama if not running
echo "🔄 Starting Ollama..."
ollama serve &
sleep 3

# Pull the recommended model
echo "📥 Pulling recommended model for MacBook Air..."
ollama pull llama3.2:3b

echo ""
echo "✅ Setup complete!"
echo ""
echo "📝 Add this to your .env file:"
echo ""
echo "AUDIT_PROVIDER=ollama"
echo "OLLAMA_MODEL=llama3.2:3b"
echo "OLLAMA_MAX_CONCURRENT=1"
echo "OLLAMA_TIMEOUT_MS=60000"
echo "AUDIT_MAX_CHATS=5"
echo ""
echo "🎯 Test with: curl http://localhost:3000/api/audit/debug"
echo "🚀 Run audit: npm run dev && visit /ai-audit"