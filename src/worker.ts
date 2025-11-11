/**
 * EdgeSummon 2.0 - Main Worker
 *
 * Cloudflare Worker that orchestrates the AI summarization workflow:
 * - Serves the frontend UI
 * - Handles chat API requests
 * - Coordinates URL fetching, text extraction, and LLM calls
 * - Manages per-session state via Durable Objects
 */

import { ChatRoomDurableObject, ConversationEntry } from "./chatRoomDO";
import { generateSummary, answerFollowup } from "./llmClient";
import {
  isURL,
  fetchAndExtractText,
  isLikelyContentToSummarize,
} from "./textExtraction";

// Export the Durable Object class so Wrangler can find it
export { ChatRoomDurableObject };

// Environment bindings
export interface Env {
  CHAT_ROOM_DO: DurableObjectNamespace;
  AI: Ai;
  __STATIC_CONTENT: KVNamespace;
}

/**
 * Main request handler
 */
export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    // Enable CORS for API requests
    if (request.method === "OPTIONS") {
      return handleCORS();
    }

    try {
      // Route requests
      if (url.pathname === "/api/chat") {
        return await handleChatAPI(request, env);
      } else if (url.pathname === "/api/health") {
        return new Response(JSON.stringify({ status: "ok", service: "EdgeSummon 2.0" }), {
          headers: { "Content-Type": "application/json" },
        });
      } else {
        // Serve static files
        return await handleStaticAsset(request, env);
      }
    } catch (error) {
      console.error("Error handling request:", error);
      return new Response(
        JSON.stringify({
          error: "Internal server error",
          message: error instanceof Error ? error.message : "Unknown error",
        }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        }
      );
    }
  },
};

/**
 * Handle CORS preflight requests
 */
function handleCORS(): Response {
  return new Response(null, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}

/**
 * Add CORS headers to a response
 */
function addCORSHeaders(response: Response): Response {
  const newHeaders = new Headers(response.headers);
  newHeaders.set("Access-Control-Allow-Origin", "*");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: newHeaders,
  });
}

/**
 * Handle the /api/chat endpoint
 */
async function handleChatAPI(request: Request, env: Env): Promise<Response> {
  if (request.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    // Parse request body
    const body = await request.json<{ sessionId: string; message: string }>();
    const { sessionId, message } = body;

    // Validate inputs
    if (!sessionId || !message) {
      return addCORSHeaders(
        new Response(
          JSON.stringify({ error: "Missing sessionId or message" }),
          { status: 400, headers: { "Content-Type": "application/json" } }
        )
      );
    }

    if (message.length > 100000) {
      return addCORSHeaders(
        new Response(
          JSON.stringify({ error: "Message too long (max 100,000 characters)" }),
          { status: 400, headers: { "Content-Type": "application/json" } }
        )
      );
    }

    // Get the Durable Object instance for this session
    const doId = env.CHAT_ROOM_DO.idFromName(sessionId);
    const doStub = env.CHAT_ROOM_DO.get(doId);

    // Process the message and generate a response
    const reply = await processMessage(message, doStub, env);

    // Return the reply
    return addCORSHeaders(
      new Response(JSON.stringify({ reply }), {
        headers: { "Content-Type": "application/json" },
      })
    );
  } catch (error) {
    console.error("Error in chat API:", error);
    const errorMessage = error instanceof Error ? error.message : "Failed to process message";
    return addCORSHeaders(
      new Response(JSON.stringify({ error: errorMessage }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      })
    );
  }
}

/**
 * Process a user message and generate an AI response
 * This is the core coordination logic
 */
async function processMessage(
  message: string,
  doStub: DurableObjectStub,
  env: Env
): Promise<string> {
  // Determine the type of message and how to handle it
  const messageType = determineMessageType(message);

  let reply: string;
  let userEntry: ConversationEntry;
  let assistantEntry: ConversationEntry;

  if (messageType === "url") {
    // Handle URL: fetch, extract, summarize
    const url = message.trim();

    // Store user's URL submission
    userEntry = {
      role: "user",
      content: `Submitted URL for summarization: ${url}`,
      type: "url-summary",
      url: url,
      createdAt: new Date().toISOString(),
    };

    await appendEntry(doStub, userEntry);

    try {
      // Fetch and extract text from the URL
      const extractedText = await fetchAndExtractText(url);

      if (!extractedText || extractedText.trim().length < 50) {
        throw new Error("Could not extract meaningful content from the URL");
      }

      // Generate summary using Workers AI
      reply = await generateSummary(env.AI, extractedText, url);

      // Store the assistant's summary
      assistantEntry = {
        role: "assistant",
        content: reply,
        type: "url-summary",
        url: url,
        createdAt: new Date().toISOString(),
      };
    } catch (error) {
      reply = `Sorry, I couldn't fetch or summarize that URL. ${error instanceof Error ? error.message : "Please check the URL and try again."}`;
      assistantEntry = {
        role: "assistant",
        content: reply,
        type: "url-summary",
        createdAt: new Date().toISOString(),
      };
    }
  } else if (messageType === "content") {
    // Handle raw text to summarize
    userEntry = {
      role: "user",
      content: message,
      type: "raw-summary",
      createdAt: new Date().toISOString(),
    };

    await appendEntry(doStub, userEntry);

    try {
      reply = await generateSummary(env.AI, message);

      assistantEntry = {
        role: "assistant",
        content: reply,
        type: "raw-summary",
        createdAt: new Date().toISOString(),
      };
    } catch (error) {
      reply = `Sorry, I couldn't generate a summary. ${error instanceof Error ? error.message : "Please try again."}`;
      assistantEntry = {
        role: "assistant",
        content: reply,
        createdAt: new Date().toISOString(),
      };
    }
  } else {
    // Handle follow-up question
    userEntry = {
      role: "user",
      content: message,
      type: "followup",
      createdAt: new Date().toISOString(),
    };

    await appendEntry(doStub, userEntry);

    try {
      // Get recent conversation context
      const context = await getRecentEntries(doStub, 10);

      if (context.length === 0) {
        reply =
          "I don't have any previous context to answer your question. Please provide a URL or text to summarize first.";
      } else {
        reply = await answerFollowup(env.AI, message, context);
      }

      assistantEntry = {
        role: "assistant",
        content: reply,
        type: "followup",
        createdAt: new Date().toISOString(),
      };
    } catch (error) {
      reply = `Sorry, I couldn't answer your question. ${error instanceof Error ? error.message : "Please try again."}`;
      assistantEntry = {
        role: "assistant",
        content: reply,
        createdAt: new Date().toISOString(),
      };
    }
  }

  // Store the assistant's response
  await appendEntry(doStub, assistantEntry);

  return reply;
}

/**
 * Determine the type of message (URL, content to summarize, or follow-up question)
 */
function determineMessageType(message: string): "url" | "content" | "followup" {
  if (isURL(message)) {
    return "url";
  } else if (isLikelyContentToSummarize(message)) {
    return "content";
  } else {
    return "followup";
  }
}

/**
 * Append an entry to the Durable Object
 */
async function appendEntry(
  doStub: DurableObjectStub,
  entry: ConversationEntry
): Promise<void> {
  const response = await doStub.fetch("http://do/append", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(entry),
  });

  if (!response.ok) {
    throw new Error("Failed to append entry to conversation");
  }
}

/**
 * Get recent entries from the Durable Object
 */
async function getRecentEntries(
  doStub: DurableObjectStub,
  limit: number
): Promise<ConversationEntry[]> {
  const response = await doStub.fetch(`http://do/recent?limit=${limit}`);

  if (!response.ok) {
    throw new Error("Failed to get recent entries");
  }

  const data = await response.json<{ entries: ConversationEntry[] }>();
  return data.entries;
}

/**
 * Serve static assets from the public directory
 */
async function handleStaticAsset(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  let path = url.pathname;

  // Default to index.html
  if (path === "/") {
    path = "/index.html";
  }

  try {
    // Try to get the asset from KV
    const asset = await env.__STATIC_CONTENT.get(path, "arrayBuffer");

    if (!asset) {
      return new Response("Not Found", { status: 404 });
    }

    // Determine content type
    const contentType = getContentType(path);

    return new Response(asset, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch (error) {
    console.error("Error serving static asset:", error);
    return new Response("Internal Server Error", { status: 500 });
  }
}

/**
 * Get content type based on file extension
 */
function getContentType(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase();

  const contentTypes: Record<string, string> = {
    html: "text/html; charset=utf-8",
    css: "text/css; charset=utf-8",
    js: "application/javascript; charset=utf-8",
    json: "application/json",
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    gif: "image/gif",
    svg: "image/svg+xml",
    ico: "image/x-icon",
  };

  return contentTypes[ext || ""] || "application/octet-stream";
}
