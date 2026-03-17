# M1 MacBook Air Configuration

## Best Models for Your MacBook Air

### ⚡ Ultra Fast (Testing Only)
```bash
ollama pull llama3.2:1b    # 700MB RAM, very fast, basic quality
```

### ✅ Recommended (Production)
```bash
ollama pull llama3.2:3b    # 2GB RAM, good quality/speed balance
```

### ❌ Too Big for MacBook Air
- `gpt-oss-120b` - 500GB+ RAM needed (impossible)
- `llama3.1:70b` - 40GB+ RAM needed
- `mixtral:8x7b` - 50GB+ RAM needed

## Optimal .env Configuration

```env
# === Provider ===
AUDIT_PROVIDER=ollama

# === Ollama (MacBook Air Optimized) ===
OLLAMA_URL=http://localhost:11434
OLLAMA_MODEL=llama3.2:3b
OLLAMA_MAX_CONCURRENT=1
OLLAMA_TIMEOUT_MS=60000

# === Audit Settings (Conservative) ===
AUDIT_MAX_CHATS=5
AUDIT_MAX_MESSAGES=50
AUDIT_MAX_CHARS_PER_MSG=500
AUDIT_TEMPERATURE=0.1
AUDIT_MAX_TOKENS=500
AUDIT_MAX_CONCURRENT_JOBS=1
```

## Performance Tips

1. **Start Small**: Begin with `AUDIT_MAX_CHATS=1` to test
2. **Use Smallest Model**: `llama3.2:1b` for fastest testing
3. **Monitor RAM**: Keep Activity Monitor open
4. **Close Apps**: Free up memory before running
5. **Short Timeouts**: Set `OLLAMA_TIMEOUT_MS=30000` (30 seconds)

## If You Need Better Quality

For production use with larger models, consider:

1. **Cloud Options**:
   - **Together AI**: Affordable hosted Ollama
   - **Replicate**: Easy API access
   - **Hugging Face**: Inference endpoints

2. **Local Alternatives**:
   - **Ollama with external GPU**: Use a more powerful machine
   - **LM Studio**: Local GUI with model management
   - **Text generation webui**: More control over models

## Quick Test

```bash
# Test your current setup
curl http://localhost:3000/api/audit/debug

# Start small audit
# Set AUDIT_MAX_CHATS=1 in .env first
```

## Hardware Reality Check

Your M1 MacBook Air (8GB RAM) can handle:
- ✅ Small models (1B-3B parameters)
- ❌ Large models (70B-120B parameters)
- ❌ Multiple concurrent requests

Choose models that fit your hardware! 🚀