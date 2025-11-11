/**
 * Text Extraction - Utilities for extracting clean text from HTML
 *
 * Provides functions to fetch web pages and extract readable text content,
 * removing scripts, styles, and other non-content elements.
 */

// Maximum content length to extract (characters)
const MAX_CONTENT_LENGTH = 50000;

// Tags that typically don't contain readable content
const EXCLUDED_TAGS = [
  "script",
  "style",
  "noscript",
  "iframe",
  "svg",
  "canvas",
  "video",
  "audio",
  "head",
  "meta",
  "link",
];

/**
 * Fetch a URL and return the HTML content
 */
export async function fetchURL(url: string): Promise<string> {
  try {
    // Validate URL
    const parsedURL = new URL(url);
    if (!["http:", "https:"].includes(parsedURL.protocol)) {
      throw new Error("Invalid URL protocol. Only HTTP and HTTPS are supported.");
    }

    const response = await fetch(url, {
      headers: {
        "User-Agent": "EdgeSummon/2.0 (Cloudflare Workers)",
        Accept: "text/html,application/xhtml+xml",
      },
      // Set a reasonable timeout
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch URL: ${response.status} ${response.statusText}`);
    }

    const contentType = response.headers.get("content-type") || "";
    if (!contentType.includes("text/html") && !contentType.includes("application/xhtml")) {
      throw new Error("URL does not return HTML content");
    }

    return await response.text();
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Failed to fetch URL: ${error.message}`);
    }
    throw new Error("Failed to fetch URL: Unknown error");
  }
}

/**
 * Extract plain text from HTML content
 * Simple but effective approach for extracting readable text
 */
export function extractTextFromHTML(html: string): string {
  let text = html;

  // Remove excluded tags and their content
  for (const tag of EXCLUDED_TAGS) {
    const regex = new RegExp(`<${tag}[^>]*>.*?</${tag}>`, "gis");
    text = text.replace(regex, " ");
  }

  // Remove HTML comments
  text = text.replace(/<!--.*?-->/gs, " ");

  // Remove all remaining HTML tags
  text = text.replace(/<[^>]+>/g, " ");

  // Decode common HTML entities
  text = text.replace(/&nbsp;/g, " ");
  text = text.replace(/&amp;/g, "&");
  text = text.replace(/&lt;/g, "<");
  text = text.replace(/&gt;/g, ">");
  text = text.replace(/&quot;/g, '"');
  text = text.replace(/&#39;/g, "'");
  text = text.replace(/&apos;/g, "'");

  // Normalize whitespace
  text = text.replace(/\s+/g, " ");
  text = text.replace(/\n\s*\n/g, "\n\n");

  // Trim
  text = text.trim();

  // Truncate if too long
  if (text.length > MAX_CONTENT_LENGTH) {
    text = text.substring(0, MAX_CONTENT_LENGTH) + "\n\n[Content truncated due to length...]";
  }

  return text;
}

/**
 * Fetch a URL and extract its text content
 */
export async function fetchAndExtractText(url: string): Promise<string> {
  const html = await fetchURL(url);
  return extractTextFromHTML(html);
}

/**
 * Detect if a string looks like a URL
 */
export function isURL(text: string): boolean {
  // Simple but effective URL detection
  const urlPattern = /^https?:\/\//i;
  return urlPattern.test(text.trim());
}

/**
 * Determine if text is likely meant to be summarized vs a question
 * This is a heuristic - longer text is likely content to summarize
 */
export function isLikelyContentToSummarize(text: string): boolean {
  const trimmed = text.trim();

  // If it ends with a question mark, it's likely a question
  if (trimmed.endsWith("?")) {
    return false;
  }

  // If it's relatively long (>200 chars), likely content to summarize
  if (trimmed.length > 200) {
    return true;
  }

  // If it contains multiple sentences (rough heuristic)
  const sentenceEndings = (trimmed.match(/[.!?]/g) || []).length;
  if (sentenceEndings >= 3) {
    return true;
  }

  // Otherwise, treat as a question/followup
  return false;
}
