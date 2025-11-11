/**
 * LLM Client - Wrapper for Workers AI interactions
 *
 * Provides a clean interface for calling Llama 3.x models via Workers AI,
 * handling prompt construction, context management, and response parsing.
 */

import type { ConversationEntry } from "./chatRoomDO";

// Llama 3.x instruct model - easily changeable
export const DEFAULT_MODEL = "@cf/meta/llama-3.1-8b-instruct";

// Maximum tokens to use from context to avoid exceeding model limits
const MAX_CONTEXT_LENGTH = 3000;

export interface LLMOptions {
  mode: "summary" | "followup";
  conversationContext?: ConversationEntry[];
  maxTokens?: number;
  temperature?: number;
}

/**
 * Build a prompt for summarization tasks
 */
function buildSummaryPrompt(text: string, url?: string): string {
  const urlContext = url ? `Source URL: ${url}\n\n` : "";
  return `You are EdgeSummon, an AI assistant that summarizes web content and documents.

Task: Provide a clear, concise summary of the following content.

${urlContext}Content to summarize:
${text}

Provide a well-structured summary with key points. Use bullet points or short paragraphs as appropriate.`;
}

/**
 * Build a prompt for follow-up questions using conversation context
 */
function buildFollowupPrompt(
  question: string,
  context: ConversationEntry[]
): string {
  // Build conversation history from context
  let contextText = "";

  // Limit context to avoid exceeding token limits
  const recentContext = context.slice(-5); // Last 5 entries

  for (const entry of recentContext) {
    if (entry.role === "user") {
      if (entry.type === "url-summary" && entry.url) {
        contextText += `User submitted URL: ${entry.url}\n`;
      } else {
        contextText += `User: ${entry.content.substring(0, 200)}${entry.content.length > 200 ? "..." : ""}\n`;
      }
    } else if (entry.role === "assistant") {
      contextText += `Assistant: ${entry.content.substring(0, 300)}${entry.content.length > 300 ? "..." : ""}\n`;
    }
  }

  return `You are EdgeSummon, an AI assistant that helps users understand and discuss content from web pages and documents.

Previous conversation context:
${contextText}

Current question: ${question}

Provide a helpful, accurate answer based on the conversation context. If the question cannot be answered from the context, say so clearly.`;
}

/**
 * Truncate text to fit within token limits (rough estimation)
 */
function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) {
    return text;
  }
  return text.substring(0, maxLength) + "\n\n[Content truncated due to length...]";
}

/**
 * Call Workers AI to generate a summary
 */
export async function generateSummary(
  ai: Ai,
  text: string,
  url?: string
): Promise<string> {
  const truncatedText = truncateText(text, MAX_CONTEXT_LENGTH);
  const prompt = buildSummaryPrompt(truncatedText, url);

  try {
    const response = await ai.run(DEFAULT_MODEL, {
      prompt: prompt,
      max_tokens: 512,
      temperature: 0.7,
    });

    // Workers AI returns response in different formats depending on model
    if (typeof response === "string") {
      return response.trim();
    } else if (response && typeof response === "object" && "response" in response) {
      return (response as { response: string }).response.trim();
    } else {
      throw new Error("Unexpected response format from Workers AI");
    }
  } catch (error) {
    console.error("Error calling Workers AI:", error);
    throw new Error("Failed to generate summary. Please try again.");
  }
}

/**
 * Call Workers AI to answer a follow-up question
 */
export async function answerFollowup(
  ai: Ai,
  question: string,
  context: ConversationEntry[]
): Promise<string> {
  const prompt = buildFollowupPrompt(question, context);

  try {
    const response = await ai.run(DEFAULT_MODEL, {
      prompt: prompt,
      max_tokens: 512,
      temperature: 0.8,
    });

    if (typeof response === "string") {
      return response.trim();
    } else if (response && typeof response === "object" && "response" in response) {
      return (response as { response: string }).response.trim();
    } else {
      throw new Error("Unexpected response format from Workers AI");
    }
  } catch (error) {
    console.error("Error calling Workers AI:", error);
    throw new Error("Failed to answer question. Please try again.");
  }
}

/**
 * Generic LLM call with custom options
 */
export async function callLLM(
  ai: Ai,
  userMessage: string,
  options: LLMOptions
): Promise<string> {
  if (options.mode === "summary") {
    return await generateSummary(ai, userMessage);
  } else {
    return await answerFollowup(
      ai,
      userMessage,
      options.conversationContext || []
    );
  }
}
