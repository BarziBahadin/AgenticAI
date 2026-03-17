#!/bin/bash

echo "🚀 Setting up AI Audit with Together AI (Cloud)"
echo ""

# Check if .env exists
if [ ! -f .env ]; then
    echo "❌ No .env file found. Create one first:"
    echo "   cp .env.example .env"
    echo "   # Then edit with your settings"
    exit 1
fi

echo "📝 Please get your Together AI API key from: https://together.ai"
echo "   1. Sign up for account"
echo "   2. Go to API Keys section"
echo "   3. Copy your API key"
echo ""

read -p "Enter your Together AI API key: " api_key

if [ -z "$api_key" ]; then
    echo "❌ No API key provided. Exiting."
    exit 1
fi

# Update .env file
echo "📝 Updating .env file..."

# Remove any existing Together AI settings
sed -i '' '/^TOGETHER_/d' .env
sed -i '' '/^AUDIT_PROVIDER=/d' .env

# Add new settings
cat >> .env << EOF

# === Cloud AI Audit (Together AI) ===
AUDIT_PROVIDER=together
TOGETHER_API_KEY=$api_key
TOGETHER_MODEL=meta-llama/Llama-3.1-8B-Instruct-Turbo
TOGETHER_MAX_CONCURRENT=2
TOGETHER_TIMEOUT_MS=120000

# === Audit Settings ===
AUDIT_MAX_CHATS=10
AUDIT_MAX_MESSAGES=50
AUDIT_MAX_CHARS_PER_MSG=500
AUDIT_TEMPERATURE=0.1
AUDIT_MAX_TOKENS=800
AUDIT_MAX_CONCURRENT_JOBS=1
EOF

echo ""
echo "✅ Configuration updated!"
echo ""
echo "🔍 Testing connection..."
echo "   curl http://localhost:3000/api/audit/debug"
echo ""
echo "🚀 Run your app:"
echo "   npm run dev"
echo "   Visit: http://localhost:3000/ai-audit"
echo ""
echo "💡 Model: meta-llama/Llama-3.1-8B-Instruct-Turbo (~$0.18 per 1M tokens)"
echo "💰 For 100 chats: ~$0.50"