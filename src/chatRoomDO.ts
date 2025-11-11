/**
 * ChatRoomDurableObject - Manages per-session conversation state
 *
 * This Durable Object stores the conversation history for each user session,
 * providing persistent memory across requests. Each session gets its own
 * isolated instance identified by the sessionId.
 */

export interface ConversationEntry {
  role: "user" | "assistant" | "system";
  content: string;
  type?: "url-summary" | "raw-summary" | "followup" | "question";
  url?: string;
  createdAt: string;
}

interface StoredState {
  entries: ConversationEntry[];
  createdAt: string;
  lastAccessedAt: string;
}

export class ChatRoomDurableObject {
  private state: DurableObjectState;
  private entries: ConversationEntry[] = [];
  private createdAt: string;
  private lastAccessedAt: string;

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.createdAt = new Date().toISOString();
    this.lastAccessedAt = this.createdAt;

    // Load existing state on initialization
    this.state.blockConcurrencyWhile(async () => {
      const stored = await this.state.storage.get<StoredState>("state");
      if (stored) {
        this.entries = stored.entries || [];
        this.createdAt = stored.createdAt || this.createdAt;
        this.lastAccessedAt = stored.lastAccessedAt || this.lastAccessedAt;
      }
    });
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    try {
      // Route requests to appropriate handlers
      switch (path) {
        case "/append":
          return await this.handleAppend(request);
        case "/recent":
          return await this.handleGetRecent(request);
        case "/clear":
          return await this.handleClear();
        case "/stats":
          return await this.handleGetStats();
        default:
          return new Response("Not found", { status: 404 });
      }
    } catch (error) {
      console.error("Error in ChatRoomDO:", error);
      return new Response(JSON.stringify({ error: "Internal server error" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }
  }

  /**
   * Append a new entry to the conversation history
   */
  private async handleAppend(request: Request): Promise<Response> {
    if (request.method !== "POST") {
      return new Response("Method not allowed", { status: 405 });
    }

    const entry = await request.json<ConversationEntry>();

    // Validate entry
    if (!entry.role || !entry.content) {
      return new Response(
        JSON.stringify({ error: "Invalid entry: role and content are required" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Add timestamp if not provided
    if (!entry.createdAt) {
      entry.createdAt = new Date().toISOString();
    }

    this.entries.push(entry);
    this.lastAccessedAt = new Date().toISOString();

    // Persist to storage
    await this.saveState();

    return new Response(
      JSON.stringify({ success: true, entryCount: this.entries.length }),
      { headers: { "Content-Type": "application/json" } }
    );
  }

  /**
   * Get the most recent N entries from the conversation
   */
  private async handleGetRecent(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const limit = parseInt(url.searchParams.get("limit") || "10", 10);

    this.lastAccessedAt = new Date().toISOString();
    await this.saveState();

    // Return the most recent entries up to the limit
    const recentEntries = this.entries.slice(-limit);

    return new Response(JSON.stringify({ entries: recentEntries }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  /**
   * Clear all conversation history
   */
  private async handleClear(): Promise<Response> {
    this.entries = [];
    this.lastAccessedAt = new Date().toISOString();
    await this.saveState();

    return new Response(JSON.stringify({ success: true, message: "Conversation cleared" }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  /**
   * Get statistics about this conversation
   */
  private async handleGetStats(): Promise<Response> {
    return new Response(
      JSON.stringify({
        entryCount: this.entries.length,
        createdAt: this.createdAt,
        lastAccessedAt: this.lastAccessedAt,
      }),
      { headers: { "Content-Type": "application/json" } }
    );
  }

  /**
   * Persist the current state to durable storage
   */
  private async saveState(): Promise<void> {
    const state: StoredState = {
      entries: this.entries,
      createdAt: this.createdAt,
      lastAccessedAt: this.lastAccessedAt,
    };
    await this.state.storage.put("state", state);
  }
}
