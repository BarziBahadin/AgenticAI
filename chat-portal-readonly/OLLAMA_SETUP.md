# Ollama Setup Guide for M1 MacBook Air

This guide will help you set up Ollama for local AI audits on your M1 MacBook Air.

## Prerequisites

1. **Install Ollama**
   ```bash
   # Download and install from https://ollama.com
   # Or use Homebrew:
   brew install ollama
   ```

2. **Start Ollama Service**
   ```bash
   ollama serve
   ```
   Keep this running in a terminal. It will start on `http://localhost:11434` by default.

## Recommended Models for M1 MacBook Air

Your M1 MacBook Air has 8GB unified memory. Here are recommended models:

### Lightweight (Fast, Lower Quality)
- `llama3.2:1b` - ~700MB RAM, very fast
- `phi-3-mini` - ~2.3GB RAM, good quality

### Balanced (Recommended)
- `llama3.2:3b` - ~2.0GB RAM, good quality/speed balance ⭐ **RECOMMENDED**
- `qwen2.5:3b` - ~2.0GB RAM, good for structured output

### Heavier (Better Quality, Slower)
- `llama3.1:8b` - ~4.7GB RAM (may be slow)
- `mistral:7b` - ~4.1GB RAM (may be slow)

## Setup Steps

1. **Pull a model** (choose one based on your preference):
   ```bash
   # Recommended for M1 MacBook Air:
   ollama pull llama3.2:3b
   
   # Or for better quality (slower):
   ollama pull llama3.1:8b
   ```

2. **Verify the model is installed**:
   ```bash
   ollama list
   ```

3. **Test the model**:
   ```bash
   ollama run llama3.2:3b "Hello, can you output JSON?"
   ```

4. **Configure your `.env` file**:
   ```env
   # Choose AI provider: "ollama" or "gemini"
   AUDIT_PROVIDER=ollama

   # Ollama Configuration
   OLLAMA_URL=http://localhost:11434
   OLLAMA_MODEL=llama3.2:3b

   # Resource Management (M1 MacBook Air optimized)
   OLLAMA_MAX_CONCURRENT=1          # Only 1 request at a time (prevents overload)
   OLLAMA_TIMEOUT_MS=120000         # 2 minute timeout per request
   ```

## Environment Variables

Add these to your `.env` file:

```env
# === AI Audit Provider ===
# Options: "ollama" (local) or "gemini" (cloud)
AUDIT_PROVIDER=ollama

# === Ollama Configuration ===
OLLAMA_URL=http://localhost:11434
OLLAMA_MODEL=llama3.2:3b

# === Resource Management (M1 MacBook Air) ===
# Maximum concurrent Ollama requests (1 = safest, prevents overload)
OLLAMA_MAX_CONCURRENT=1

# Request timeout in milliseconds (2 minutes default)
OLLAMA_TIMEOUT_MS=120000

# === Audit Job Settings ===
AUDIT_MAX_CHATS=100              # Number of chats to audit
AUDIT_MAX_MESSAGES=80            # Max messages per chat
AUDIT_MAX_CHARS_PER_MSG=800      # Max chars per message
AUDIT_TEMPERATURE=0.1            # Lower = more deterministic
AUDIT_MAX_TOKENS=900             # Max output tokens
```

## Performance Tips for M1 MacBook Air

1. **Use smaller models**: `llama3.2:3b` is the sweet spot
2. **Keep `OLLAMA_MAX_CONCURRENT=1`**: Prevents memory overload
3. **Monitor system resources**: Use Activity Monitor to watch memory usage
4. **Close other apps**: Free up RAM before running large audits
5. **Start small**: Test with `AUDIT_MAX_CHATS=10` first

## Troubleshooting

### "Ollama not responding"
- Make sure `ollama serve` is running
- Check if Ollama is on a different port: `curl http://localhost:11434/api/tags`

### "Model not found"
- Pull the model: `ollama pull llama3.2:3b`
- Check available models: `ollama list`
- Verify model name matches `OLLAMA_MODEL` in `.env`

### "Out of memory" or system slowdown
- Reduce `OLLAMA_MAX_CONCURRENT` to 1
- Use a smaller model (e.g., `llama3.2:1b`)
- Reduce `AUDIT_MAX_CHATS` to process fewer at once
- Close other applications

### "Request timeout"
- Increase `OLLAMA_TIMEOUT_MS` (e.g., 180000 for 3 minutes)
- Use a faster model (smaller)
- Reduce `AUDIT_MAX_TOKENS`

## Switching Back to Gemini

If you want to use Gemini instead:

```env
AUDIT_PROVIDER=gemini
GEMINI_API_KEY=your_api_key_here
```

## Testing

After setup, test the connection:

1. Start your Next.js app: `npm run dev`
2. Go to `/ai-audit` page
3. Click "Start AI Audit"
4. Check the console for any errors

## Model Comparison

| Model | RAM Usage | Speed | Quality | Best For |
|-------|-----------|-------|---------|----------|
| llama3.2:1b | ~700MB | Very Fast | Basic | Quick tests |
| llama3.2:3b | ~2GB | Fast | Good | **Recommended** |
| llama3.1:8b | ~4.7GB | Slow | Excellent | Quality over speed |
| phi-3-mini | ~2.3GB | Fast | Good | Alternative to 3b |

Choose based on your priorities: speed vs quality vs system resources.
