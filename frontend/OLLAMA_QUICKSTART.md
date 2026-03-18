# Quick Start: Ollama for AI Audit

## What Changed

✅ **Ollama integration added** - You can now use local LLM instead of Gemini
✅ **M1 MacBook Air optimized** - Resource limits to prevent system overload
✅ **Easy switching** - Toggle between Ollama and Gemini via env var
✅ **Health check endpoint** - Verify Ollama is working

## Quick Setup (3 Steps)

### 1. Install Ollama
```bash
# Visit https://ollama.com and download, or:
brew install ollama
```

### 2. Start Ollama & Pull Model
```bash
# Terminal 1: Start Ollama (keep running)
ollama serve

# Terminal 2: Pull a model (choose one)
ollama pull llama3.2:3b    # Recommended for M1 MacBook Air
# OR
ollama pull phi-3-mini      # Alternative
```

### 3. Configure `.env`
Add these lines to your `.env` file:
```env
AUDIT_PROVIDER=ollama
OLLAMA_URL=http://localhost:11434
OLLAMA_MODEL=llama3.2:3b
OLLAMA_MAX_CONCURRENT=1
OLLAMA_TIMEOUT_MS=120000
```

## Test It

1. **Check health**:
   ```bash
   curl http://localhost:3000/api/audit/health
   ```

2. **Start your app**:
   ```bash
   npm run dev
   ```

3. **Go to** `/ai-audit` and click "Start AI Audit"

## Recommended Models for M1 MacBook Air

| Model | RAM | Speed | Quality |
|-------|-----|-------|---------|
| **llama3.2:3b** ⭐ | ~2GB | Fast | Good |
| phi-3-mini | ~2.3GB | Fast | Good |
| llama3.2:1b | ~700MB | Very Fast | Basic |
| llama3.1:8b | ~4.7GB | Slow | Excellent |

**Recommendation**: Start with `llama3.2:3b` - best balance for M1 MacBook Air.

## Environment Variables

```env
# === Required ===
AUDIT_PROVIDER=ollama                    # "ollama" or "gemini"
OLLAMA_MODEL=llama3.2:3b                 # Model name

# === Optional (defaults shown) ===
OLLAMA_URL=http://localhost:11434        # Ollama server URL
OLLAMA_MAX_CONCURRENT=1                  # Max parallel requests (1 = safest)
OLLAMA_TIMEOUT_MS=120000                 # Request timeout (2 min)
```

## Safety Features for M1 MacBook Air

✅ **Concurrency limit**: Only 1 request at a time (prevents overload)
✅ **Timeout protection**: Requests timeout after 2 minutes
✅ **Memory optimization**: Uses `low_vram` mode
✅ **GPU acceleration**: Automatically uses Metal on M1

## Troubleshooting

**"Ollama not responding"**
- Make sure `ollama serve` is running
- Check: `curl http://localhost:11434/api/tags`

**"Model not found"**
- Pull it: `ollama pull llama3.2:3b`
- List models: `ollama list`

**System getting slow**
- Reduce `OLLAMA_MAX_CONCURRENT=1` (already set)
- Use smaller model: `llama3.2:1b`
- Close other apps

## Switch Back to Gemini

Just change in `.env`:
```env
AUDIT_PROVIDER=gemini
GEMINI_API_KEY=your_key_here
```

## Files Changed

- ✅ `src/lib/ollamaClient.ts` - New Ollama client
- ✅ `src/lib/auditRunner.ts` - Updated to support both providers
- ✅ `src/app/api/audit/health/route.ts` - Health check endpoint
- ✅ `OLLAMA_SETUP.md` - Detailed setup guide

## Need Help?

See `OLLAMA_SETUP.md` for detailed instructions and troubleshooting.
