# Cloud AI Setup Guide

Run your AI audits in the cloud instead of locally! Perfect for MacBook Air users.

## 🎯 Recommended: Together AI (Easiest)

### 1. Sign Up
- Visit: https://together.ai
- Create account (free tier available)
- Get your API key from dashboard

### 2. Configure Your App
Add to your `.env` file:
```env
AUDIT_PROVIDER=together
TOGETHER_API_KEY=your_api_key_here
TOGETHER_MODEL=meta-llama/Llama-3.1-8B-Instruct-Turbo
```

### 3. Test Connection
```bash
curl http://localhost:3000/api/audit/debug
```

### 4. Run Audit
Go to `/ai-audit` and click "Start AI Audit"

---

## 🚀 Other Cloud Options

### Replicate (Good for Large Models)

```env
AUDIT_PROVIDER=replicate
REPLICATE_API_TOKEN=your_token_here
```

Get token: https://replicate.com/account/api-tokens

### OpenRouter (Many Models)

```env
AUDIT_PROVIDER=openrouter
OPENROUTER_API_KEY=your_key_here
```

Get key: https://openrouter.ai/keys

### Gemini (Google)

```env
AUDIT_PROVIDER=gemini
GEMINI_API_KEY=your_key_here
```

---

## 📊 Model Recommendations

### Together AI Models (Best Price/Performance)
| Model | Quality | Speed | Cost | Use Case |
|-------|---------|-------|------|----------|
| **meta-llama/Llama-3.1-8B-Instruct-Turbo** ⭐ | Excellent | Fast | $0.18/1M tokens | **Recommended** |
| meta-llama/Llama-3.1-70B-Instruct-Turbo | Best | Medium | $0.88/1M tokens | High quality |
| meta-llama/Llama-3.1-405B-Instruct-Turbo | Best | Slow | $5.00/1M tokens | Maximum quality |

### Pricing Comparison (per 1M tokens)
- Together AI: $0.18 - $5.00
- OpenAI GPT-4: $30.00
- Anthropic Claude: $15.00

---

## ⚙️ Advanced Configuration

### Resource Management
```env
# Concurrent requests (cloud can handle more)
TOGETHER_MAX_CONCURRENT=3
TOGETHER_TIMEOUT_MS=180000  # 3 minutes

# Audit settings
AUDIT_MAX_CHATS=50         # Process more chats
AUDIT_MAX_TOKENS=1000      # Longer responses
```

### Model-Specific Settings
```env
# For better quality (slower)
TOGETHER_MODEL=meta-llama/Llama-3.1-70B-Instruct-Turbo
AUDIT_TEMPERATURE=0.1

# For faster processing
TOGETHER_MODEL=meta-llama/Llama-3.1-8B-Instruct-Turbo
AUDIT_TEMPERATURE=0.0
```

---

## 🧪 Testing Your Setup

### 1. Check Configuration
```bash
curl http://localhost:3000/api/audit/debug
```
Should show:
```json
{
  "provider": "together",
  "env": {
    "TOGETHER_API_KEY": "set",
    "TOGETHER_MODEL": "meta-llama/Llama-3.1-8B-Instruct-Turbo"
  },
  "together": {
    "available": true,
    "model": "meta-llama/Llama-3.1-8B-Instruct-Turbo"
  }
}
```

### 2. Test Small Audit
Set `AUDIT_MAX_CHATS=1` in `.env`, then run audit.

### 3. Scale Up
Increase `AUDIT_MAX_CHATS` and `TOGETHER_MAX_CONCURRENT` as needed.

---

## 🔧 Troubleshooting

### "API key not set"
- Check your `.env` file
- Make sure variable name matches (TOGETHER_API_KEY)
- Restart your Next.js server

### "Request timeout"
- Increase `TOGETHER_TIMEOUT_MS` to 180000
- Reduce `AUDIT_MAX_CHATS` to 10
- Use faster model

### "Rate limit exceeded"
- Reduce `TOGETHER_MAX_CONCURRENT` to 1
- Add delays between requests (if needed)
- Check Together AI dashboard for limits

### "Model not found"
- Verify model name in Together AI documentation
- Check if model requires special access

---

## 💰 Cost Estimation

For 100 chats with 50 messages each:
- **8B Model**: ~$0.50
- **70B Model**: ~$2.50
- **405B Model**: ~$15.00

Very affordable compared to other providers!

---

## 🚀 Quick Start Script

```bash
# 1. Get Together AI key
echo "Get your key from: https://together.ai"

# 2. Create .env
cat > .env << EOF
AUDIT_PROVIDER=together
TOGETHER_API_KEY=your_key_here
TOGETHER_MODEL=meta-llama/Llama-3.1-8B-Instruct-Turbo
AUDIT_MAX_CHATS=5
EOF

# 3. Test
npm run dev
curl http://localhost:3000/api/audit/debug
```

---

## 🎯 Why Together AI?

✅ **Ollama-compatible API** - Familiar if you used local Ollama
✅ **Excellent pricing** - Cheaper than OpenAI/Claude
✅ **Fast models** - Turbo versions optimized for speed
✅ **Reliable** - Good uptime and support
✅ **Easy setup** - Just API key needed

Perfect for production AI audit systems! 🚀