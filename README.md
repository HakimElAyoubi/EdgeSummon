# EdgeSummon 2.0

> AI-powered summarization assistant running entirely on Cloudflare's edge infrastructure

[![Built with Cloudflare Workers](https://img.shields.io/badge/Built%20with-Cloudflare%20Workers-F6821F?style=flat-square)](https://workers.cloudflare.com/)

EdgeSummon is a production-quality web application that demonstrates the power of Cloudflare's serverless platform. It combines **Workers**, **Durable Objects**, and **Workers AI** to create an intelligent summarization assistant that can:

- 📄 Summarize web pages from URLs
- 📝 Summarize raw text content
- 💬 Answer follow-up questions using conversation context
- 🧠 Maintain per-session memory across requests
- ⚡ Run entirely at the edge with low latency

## Architecture

```
┌─────────────────┐
│   Frontend UI   │  (HTML/CSS/JS)
│  (Static Site)  │
└────────┬────────┘
         │
         ↓
┌─────────────────┐
│ Cloudflare      │  (Request routing, coordination)
│ Worker          │  (URL detection, AI orchestration)
└────────┬────────┘
         │
         ├──────→ ┌─────────────────┐
         │        │ Durable Object  │  (Conversation memory)
         │        │  (Per-session)  │  (State persistence)
         │        └─────────────────┘
         │
         └──────→ ┌─────────────────┐
                  │  Workers AI     │  (Llama 3.1-8B Instruct)
                  │  (LLM calls)    │  (Summarization & Q&A)
                  └─────────────────┘
```

### Key Components

1. **Worker (`src/worker.ts`)**: Main entry point that handles routing, orchestrates the workflow, and coordinates between different services.

2. **Durable Object (`src/chatRoomDO.ts`)**: Provides stateful, per-session memory storage. Each user session gets its own DO instance identified by a `sessionId`.

3. **LLM Client (`src/llmClient.ts`)**: Wrapper for Workers AI that handles prompt construction, context management, and response parsing.

4. **Text Extraction (`src/textExtraction.ts`)**: Utilities for fetching URLs and extracting clean text from HTML.

5. **Frontend (`public/`)**: Clean, responsive chat UI built with vanilla HTML, CSS, and JavaScript.

## Project Structure

```
EdgeSummon/
├── src/
│   ├── worker.ts              # Main Worker entry point
│   ├── chatRoomDO.ts          # Durable Object for conversation state
│   ├── llmClient.ts           # Workers AI wrapper
│   └── textExtraction.ts      # HTML text extraction utilities
├── public/
│   ├── index.html             # Chat UI
│   ├── styles.css             # Styling
│   └── app.js                 # Frontend logic
├── wrangler.toml              # Cloudflare Workers configuration
├── package.json               # Dependencies
├── tsconfig.json              # TypeScript configuration
└── README.md                  # This file
```

## Prerequisites

- [Node.js](https://nodejs.org/) (v18 or later)
- [Cloudflare account](https://dash.cloudflare.com/sign-up) (free tier works!)
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/install-and-update/)

## Setup & Installation

### 1. Install Dependencies

```bash
npm install
```

This installs:
- `wrangler` - Cloudflare Workers CLI
- `typescript` - TypeScript compiler
- `@cloudflare/workers-types` - Type definitions

### 2. Authenticate with Cloudflare

```bash
npx wrangler login
```

This opens your browser to authenticate with your Cloudflare account.

### 3. Enable Workers AI

Workers AI needs to be enabled on your Cloudflare account:

1. Go to [Cloudflare Dashboard](https://dash.cloudflare.com/)
2. Navigate to **Workers & Pages** → **Overview**
3. Click on **Workers AI** in the sidebar
4. Accept the terms and enable Workers AI

> **Note**: Workers AI is available on the free tier with generous limits for development and testing.

## Development

### Run Locally

```bash
npm run dev
# or
npx wrangler dev
```

This starts a local development server at `http://localhost:8787`. The server includes:
- Hot reloading for code changes
- Local Durable Objects storage
- Workers AI integration (calls real AI models)

### Test the Application

1. Open `http://localhost:8787` in your browser
2. Try these examples:
   - **URL Summary**: Paste `https://blog.cloudflare.com/workers-ai`
   - **Text Summary**: Paste a long article or document
   - **Follow-up**: Ask "What are the key points?" or "Tell me more about..."

## Deployment

### Deploy to Cloudflare

```bash
npm run deploy
# or
npx wrangler deploy
```

This deploys your Worker to Cloudflare's global network. You'll see output like:

```
Published edgesummon (X.XX sec)
  https://edgesummon.<your-subdomain>.workers.dev
```

Your application is now live at the edge! 🎉

### Configure Custom Domain (Optional)

1. Go to your [Cloudflare Dashboard](https://dash.cloudflare.com/)
2. Navigate to **Workers & Pages** → **edgesummon**
3. Go to **Settings** → **Domains & Routes**
4. Click **Add Custom Domain**
5. Enter your domain (e.g., `edgesummon.yourdomain.com`)

## Configuration

### Change the LLM Model

Edit `src/llmClient.ts`:

```typescript
// Use a different Llama model or other Workers AI models
export const DEFAULT_MODEL = "@cf/meta/llama-3.1-8b-instruct";
```

Available models:
- `@cf/meta/llama-3.1-8b-instruct` (default, fast)
- `@cf/meta/llama-3.1-70b-instruct` (more capable, slower)
- See [Workers AI Models](https://developers.cloudflare.com/workers-ai/models/)

### Adjust Context Limits

Edit `src/llmClient.ts`:

```typescript
// Maximum tokens from context (adjust based on model limits)
const MAX_CONTEXT_LENGTH = 3000;
```

### Modify Session Storage

The Durable Object automatically persists conversation state. To add features like session expiration or archiving to KV, extend `src/chatRoomDO.ts`.

## Usage Examples

### Summarize a Web Page

```
User: https://www.cloudflare.com/learning/ai/what-is-artificial-intelligence/
Assistant: [Provides structured summary of the AI learning page]
```

### Summarize Text

```
User: [Pastes long article text]
Assistant: [Provides key points and summary]
```

### Ask Follow-up Questions

```
User: https://blog.cloudflare.com/workers-ai
Assistant: [Summary of Workers AI announcement]
User: What are the pricing details?
Assistant: [Extracts pricing info from the previous summary context]
```

## Monitoring & Debugging

### View Logs

```bash
npm run tail
# or
npx wrangler tail
```

This streams real-time logs from your deployed Worker.

### Check Durable Objects

```bash
npx wrangler durable-objects list
```

### Inspect Storage

```bash
npx wrangler durable-objects get <object-id>
```

## Cost & Limits

EdgeSummon runs on Cloudflare's **free tier** for development:

| Resource | Free Tier Limit | EdgeSummon Usage |
|----------|----------------|------------------|
| Worker Requests | 100,000/day | 1 per message |
| Durable Objects | 1M requests/day | 2-3 per message |
| Workers AI | 10,000 neurons/day | ~100-500 per summary |

> **Note**: Free tier is generous for testing. For production, consider [Workers Paid plan](https://developers.cloudflare.com/workers/platform/pricing/).

## Future Extensions

Here are some ideas to extend EdgeSummon and impress reviewers:

### 1. **Streaming Responses**
Implement real-time streaming of AI responses using Server-Sent Events (SSE):
```typescript
// Stream tokens as they're generated from Workers AI
return new Response(stream, {
  headers: { 'Content-Type': 'text/event-stream' }
});
```

### 2. **Vector Search with Vectorize**
Add semantic search over past summaries using [Cloudflare Vectorize](https://developers.cloudflare.com/vectorize/):
```typescript
// Store embeddings of summaries
await env.VECTORIZE.insert({
  id: summaryId,
  values: await generateEmbedding(summary),
  metadata: { url, timestamp }
});

// Search similar content
const results = await env.VECTORIZE.query(queryEmbedding, { topK: 5 });
```

### 3. **Long-term Storage with KV**
Archive older conversations to KV for cost efficiency:
```typescript
// After 100 messages, move old entries to KV
if (entries.length > 100) {
  const archived = entries.slice(0, 50);
  await env.KV.put(`session:${sessionId}:archive`, JSON.stringify(archived));
}
```

### 4. **Multi-modal Support**
Extend to support image analysis using Workers AI vision models:
```typescript
// Analyze images from URLs
const result = await env.AI.run('@cf/llava-hf/llava-1.5-7b-hf', {
  image: imageData,
  prompt: "Describe this image"
});
```

### 5. **Rate Limiting with Durable Objects**
Implement per-user rate limiting:
```typescript
class RateLimiterDO {
  async checkLimit(userId: string): Promise<boolean> {
    const count = await this.state.storage.get(userId) || 0;
    if (count > MAX_REQUESTS_PER_HOUR) return false;
    await this.state.storage.put(userId, count + 1, { expirationTtl: 3600 });
    return true;
  }
}
```

### 6. **Analytics Dashboard**
Track usage metrics using Workers Analytics Engine:
```typescript
ctx.waitUntil(
  env.ANALYTICS.writeDataPoint({
    blobs: [sessionId, messageType],
    doubles: [processingTime],
    indexes: [timestamp]
  })
);
```

## Troubleshooting

### "Module not found" errors
Make sure all dependencies are installed:
```bash
npm install
```

### "Durable Object not found"
Ensure migrations are applied. Redeploy:
```bash
npx wrangler deploy
```

### Workers AI rate limits
The free tier resets daily. For higher limits, upgrade to Workers Paid.

### CORS issues during development
Add your local dev URL to CORS headers in `worker.ts` if testing from a different origin.

## Contributing

This is a demonstration project, but ideas for improvements are welcome! Consider:

- Better error handling and retry logic
- Markdown rendering in chat
- Export conversation history
- Multi-language support
- Conversation branching

## License

MIT License - feel free to use this project as a foundation for your own applications!

## Resources

- [Cloudflare Workers Documentation](https://developers.cloudflare.com/workers/)
- [Durable Objects Guide](https://developers.cloudflare.com/durable-objects/)
- [Workers AI Documentation](https://developers.cloudflare.com/workers-ai/)
- [Wrangler CLI Reference](https://developers.cloudflare.com/workers/wrangler/)

---

**Built with ⚡ by the edge**

*EdgeSummon demonstrates modern serverless architecture using Cloudflare's platform. It's designed as a learning resource and foundation for production applications.*
