/**
 * EdgeSummon 2.0 - Frontend Application
 *
 * Handles:
 * - Session management (localStorage)
 * - Message sending and receiving
 * - UI updates and interactions
 * - Chat history display
 */

// ===== State Management =====
let sessionId = null;
const API_ENDPOINT = "/api/chat";

// ===== DOM Elements =====
const messagesContainer = document.getElementById("messages");
const chatForm = document.getElementById("chat-form");
const messageInput = document.getElementById("message-input");
const sendButton = document.getElementById("send-button");
const loadingOverlay = document.getElementById("loading-overlay");

// ===== Initialization =====
function init() {
  // Get or create session ID
  sessionId = getOrCreateSessionId();

  // Set up event listeners
  chatForm.addEventListener("submit", handleSubmit);

  // Handle Enter key (send) vs Shift+Enter (new line)
  messageInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      chatForm.dispatchEvent(new Event("submit"));
    }
  });

  // Auto-resize textarea
  messageInput.addEventListener("input", autoResizeTextarea);

  console.log("EdgeSummon initialized with session:", sessionId);
}

// ===== Session Management =====
function getOrCreateSessionId() {
  let id = localStorage.getItem("edgesummon_session_id");

  if (!id) {
    // Generate a random session ID
    id = `session_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
    localStorage.setItem("edgesummon_session_id", id);
  }

  return id;
}

// ===== Form Handling =====
async function handleSubmit(e) {
  e.preventDefault();

  const message = messageInput.value.trim();

  if (!message) {
    return;
  }

  // Disable input while processing
  setInputDisabled(true);

  // Add user message to chat
  addMessage("user", message);

  // Clear input
  messageInput.value = "";
  autoResizeTextarea();

  try {
    // Send to API
    const reply = await sendMessage(message);

    // Add assistant reply to chat
    addMessage("assistant", reply);
  } catch (error) {
    console.error("Error sending message:", error);
    addMessage("assistant", `Sorry, an error occurred: ${error.message}`, true);
  } finally {
    // Re-enable input
    setInputDisabled(false);
    messageInput.focus();
  }
}

// ===== API Communication =====
async function sendMessage(message) {
  showLoading(true);

  try {
    const response = await fetch(API_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        sessionId: sessionId,
        message: message,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `Server error: ${response.status}`);
    }

    const data = await response.json();

    if (!data.reply) {
      throw new Error("Invalid response from server");
    }

    return data.reply;
  } finally {
    showLoading(false);
  }
}

// ===== UI Updates =====
function addMessage(role, content, isError = false) {
  const messageDiv = document.createElement("div");
  messageDiv.className = `message ${role}-message`;

  const avatar = document.createElement("div");
  avatar.className = "message-avatar";
  avatar.textContent = role === "user" ? "👤" : "🤖";

  const messageContent = document.createElement("div");
  messageContent.className = "message-content";

  const messageText = document.createElement("div");
  messageText.className = `message-text ${isError ? "error-message" : ""}`;

  // Format content with basic markdown-like parsing
  messageText.innerHTML = formatMessage(content);

  const messageTime = document.createElement("div");
  messageTime.className = "message-time";
  messageTime.textContent = formatTime(new Date());

  messageContent.appendChild(messageText);
  messageContent.appendChild(messageTime);

  messageDiv.appendChild(avatar);
  messageDiv.appendChild(messageContent);

  messagesContainer.appendChild(messageDiv);

  // Scroll to bottom
  scrollToBottom();
}

function formatMessage(text) {
  // Basic formatting - convert newlines to <br>, preserve structure
  let formatted = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  // Convert **bold** to <strong>
  formatted = formatted.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");

  // Convert bullet points
  formatted = formatted.replace(/^- (.+)$/gm, "<li>$1</li>");
  formatted = formatted.replace(/(<li>.*<\/li>\n?)+/g, "<ul>$&</ul>");

  // Convert numbered lists
  formatted = formatted.replace(/^\d+\. (.+)$/gm, "<li>$1</li>");

  // Convert newlines to paragraphs
  const paragraphs = formatted.split("\n\n");
  formatted = paragraphs
    .map((p) => {
      p = p.trim();
      if (p.startsWith("<ul>") || p.startsWith("<ol>")) {
        return p;
      }
      return p ? `<p>${p.replace(/\n/g, "<br>")}</p>` : "";
    })
    .join("");

  return formatted;
}

function formatTime(date) {
  const hours = date.getHours().toString().padStart(2, "0");
  const minutes = date.getMinutes().toString().padStart(2, "0");
  return `${hours}:${minutes}`;
}

function scrollToBottom() {
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

function setInputDisabled(disabled) {
  messageInput.disabled = disabled;
  sendButton.disabled = disabled;
}

function showLoading(show) {
  if (show) {
    loadingOverlay.classList.remove("hidden");
  } else {
    loadingOverlay.classList.add("hidden");
  }
}

function autoResizeTextarea() {
  messageInput.style.height = "auto";
  messageInput.style.height = Math.min(messageInput.scrollHeight, 200) + "px";
}

// ===== Error Handling =====
window.addEventListener("error", (e) => {
  console.error("Global error:", e.error);
});

window.addEventListener("unhandledrejection", (e) => {
  console.error("Unhandled promise rejection:", e.reason);
});

// ===== Initialize on page load =====
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
