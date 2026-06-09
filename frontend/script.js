const API_BASE_URL = "http://localhost:5000/api";

const chatList = document.getElementById("chatList");
const messagesEl = document.getElementById("messages");
const chatForm = document.getElementById("chatForm");
const messageInput = document.getElementById("messageInput");
const sendBtn = document.getElementById("sendBtn");
const clearBtn = document.getElementById("clearBtn");
const newChatBtn = document.getElementById("newChatBtn");
const statusPill = document.getElementById("statusPill");
const statusText = document.getElementById("statusText");
const modelLabel = document.getElementById("modelLabel");
const menuBtn = document.getElementById("menuBtn");
const sidebar = document.getElementById("sidebar");

let chats = [];
let activeChatId = null;
let isGenerating = false;

function createChat() {
  const chat = {
    id: crypto.randomUUID(),
    title: "New chat",
    messages: [],
  };

  chats.unshift(chat);
  activeChatId = chat.id;
  renderChatList();
  renderMessages();
  resetServerConversation();
}

function getActiveChat() {
  return chats.find((chat) => chat.id === activeChatId);
}

function renderChatList() {
  chatList.innerHTML = "";

  chats.forEach((chat) => {
    const button = document.createElement("button");
    button.className = `chat-item ${chat.id === activeChatId ? "active" : ""}`;
    button.textContent = chat.title;
    button.addEventListener("click", () => {
      activeChatId = chat.id;
      renderChatList();
      renderMessages();
      sidebar.classList.remove("open");
    });
    chatList.appendChild(button);
  });
}

function renderMessages() {
  const chat = getActiveChat();
  messagesEl.innerHTML = "";

  if (!chat || chat.messages.length === 0) {
    messagesEl.innerHTML = `
      <div class="welcome">
        <div class="orb"></div>
        <h3>Ask anything. Your chat stays on this machine.</h3>
        <p>Connects to a local Ollama model through a lightweight Flask API.</p>
      </div>
    `;
    return;
  }

  chat.messages.forEach((message) => {
    addMessageToDOM(message.role, message.content, message.isError);
  });
}

function addMessageToDOM(role, content = "", isError = false) {
  const message = document.createElement("div");
  message.className = `message ${role}`;

  const bubble = document.createElement("div");
  bubble.className = `bubble ${isError ? "error" : ""}`;
  bubble.textContent = content;

  message.appendChild(bubble);
  messagesEl.appendChild(message);
  scrollToBottom();
  return bubble;
}

function addLoadingBubble() {
  const message = document.createElement("div");
  message.className = "message assistant";
  message.innerHTML = `
    <div class="bubble">
      <span class="typing"><span></span><span></span><span></span></span>
    </div>
  `;
  messagesEl.appendChild(message);
  scrollToBottom();
  return message.querySelector(".bubble");
}

function scrollToBottom() {
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function autoResizeInput() {
  messageInput.style.height = "auto";
  messageInput.style.height = `${messageInput.scrollHeight}px`;
}

async function checkOllamaStatus() {
  try {
    const response = await fetch(`${API_BASE_URL}/health`);
    const data = await response.json();

    if (!response.ok || data.ollama !== "online") {
      throw new Error(data.message || "Ollama is offline");
    }

    statusPill.className = "status-pill online";
    statusText.textContent = data.model_available ? "Ollama online" : "Model missing";
    modelLabel.textContent = `Model: ${data.model}`;
  } catch (error) {
    statusPill.className = "status-pill offline";
    statusText.textContent = "Ollama offline";
    modelLabel.textContent = "Model: unavailable";
  }
}

async function resetServerConversation() {
  try {
    await fetch(`${API_BASE_URL}/clear`, { method: "POST" });
  } catch (error) {
    // The health indicator will show if the backend is unavailable.
  }
}

async function sendMessage(userText) {
  const chat = getActiveChat();
  if (!chat || isGenerating) return;

  isGenerating = true;
  sendBtn.disabled = true;
  messageInput.disabled = true;

  chat.messages.push({ role: "user", content: userText });
  const contextMessages = chat.messages.map(({ role, content }) => ({ role, content }));
  if (chat.title === "New chat") {
    chat.title = userText.slice(0, 38) || "New chat";
  }

  renderChatList();
  renderMessages();
  const assistantBubble = addLoadingBubble();

  try {
    const response = await fetch(`${API_BASE_URL}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: userText, messages: contextMessages }),
    });

    if (!response.ok || !response.body) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || "The AI service could not respond.");
    }

    assistantBubble.textContent = "";
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let assistantText = "";

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      assistantText += chunk;
      assistantBubble.textContent = assistantText;
      scrollToBottom();
    }

    const isError = assistantText.includes("[Error]");
    assistantBubble.classList.toggle("error", isError);
    chat.messages.push({ role: "assistant", content: assistantText, isError });
  } catch (error) {
    const friendlyMessage =
      "Could not connect to the local AI. Make sure Flask and Ollama are running.";
    assistantBubble.textContent = friendlyMessage;
    assistantBubble.classList.add("error");
    chat.messages.push({ role: "assistant", content: friendlyMessage, isError: true });
  } finally {
    isGenerating = false;
    sendBtn.disabled = false;
    messageInput.disabled = false;
    messageInput.focus();
    checkOllamaStatus();
  }
}

chatForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const text = messageInput.value.trim();
  if (!text) return;

  messageInput.value = "";
  autoResizeInput();
  sendMessage(text);
});

messageInput.addEventListener("input", autoResizeInput);
messageInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    chatForm.requestSubmit();
  }
});

clearBtn.addEventListener("click", async () => {
  const chat = getActiveChat();
  if (!chat) return;

  chat.messages = [];
  chat.title = "New chat";
  renderChatList();
  renderMessages();
  await resetServerConversation();
});

newChatBtn.addEventListener("click", createChat);
menuBtn.addEventListener("click", () => sidebar.classList.toggle("open"));

createChat();
checkOllamaStatus();
setInterval(checkOllamaStatus, 15000);
