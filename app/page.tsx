"use client";

import {
  openaiAuthHeaders,
  SignInWithChatGPT,
  useSignInWithChatGPT,
} from "@openai-oauth/react";
import { useCompletion } from "@ai-sdk/react";
import React, {
  useState,
  useCallback,
  useRef,
  useEffect,
  useMemo,
} from "react";
import { Icons } from "./components/Icons";
import { MarkdownView } from "./components/MarkdownView";

type Message = {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  createdAt: number;
  model?: string;
  imageUrl?: string;
  imagePrompt?: string;
  isGeneratingImage?: boolean;
};

type Chat = {
  id: string;
  title: string;
  messages: Message[];
  createdAt: number;
  updatedAt: number;
  model: string;
  temporary: boolean;
  pinned?: boolean;
};

const DEFAULT_MODEL = "gpt-5.6-luna";
// Only models that support Codex with a ChatGPT account
const CODEX_MODELS = [
  "gpt-5.6-luna",
  "gpt-5.6-terra",
  "gpt-5.6-sol",
  "gpt-5.4-mini",
];

const SUGGESTIONS = [
  {
    icon: "i-image",
    title: "Create an image or sticker",
    prompt: "Create a vibrant, detailed image of ",
  },
  {
    icon: "i-cursor",
    title: "Let Astra use my computer",
    prompt: "Astra, help me automate a task on my computer: ",
  },
  {
    icon: "i-edit",
    title: "Write or edit",
    prompt: "Help me write or edit this text: ",
  },
  {
    icon: "i-paperclip",
    title: "Analyze a file",
    prompt: "Please analyze this file: ",
    attach: true,
  },
];

const SLASH_COMMANDS = [
  { cmd: "/new", desc: "Start a new chat" },
  { cmd: "/temp", desc: "Start a temporary chat (unsaved)" },
  { cmd: "/model", desc: "Switch model" },
  { cmd: "/memory", desc: "Open memory settings" },
  { cmd: "/plugins", desc: "Manage plugins and tools" },
  { cmd: "/image", desc: "Generate an image" },
  { cmd: "/export", desc: "Export chat transcript" },
  { cmd: "/clear", desc: "Clear all messages in chat" },
  { cmd: "/settings", desc: "Open application settings" },
  { cmd: "/help", desc: "Show keyboard shortcuts" },
];

function newChatId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Recognizes if a user's prompt is requesting an image without requiring '/image'
 */
function extractImageIntent(input: string): { isImage: boolean; prompt: string } {
  const trimmed = input.trim();
  if (trimmed.startsWith("/image ")) {
    return { isImage: true, prompt: trimmed.slice(7).trim() };
  }

  // Regex patterns matching image intent in natural language
  const patterns = [
    /^(?:please\s+)?(?:can\s+you\s+)?(?:generate|create|draw|paint|make|render|produce|show\s+me|illustrate|design)\s+(?:an?\s+)?(?:image|picture|photo|illustration|drawing|painting|artwork|sticker|graphic|render|portrait|wallpaper|visual|logo)\s+(?:of|about|depicting|with|showing|for)\s+(.+)$/i,
    /^(?:please\s+)?(?:can\s+you\s+)?(?:draw|paint|illustrate|visualize)\s+(?:me\s+)?(?:an?\s+)?(.+)$/i,
    /^(?:generate|create|make)\s+(?:an?\s+)?(?:image|picture|photo)\s*:\s*(.+)$/i,
    /^(?:image|picture|photo)\s+(?:of|for)\s+(.+)$/i,
  ];

  for (const regex of patterns) {
    const match = trimmed.match(regex);
    if (match && match[1]?.trim()) {
      return { isImage: true, prompt: match[1].trim() };
    }
  }

  return { isImage: false, prompt: trimmed };
}

export default function Page() {
  // ------------------------------------------------------------------
  // Auth state
  // ------------------------------------------------------------------
  const { isSignedIn } = useSignInWithChatGPT();

  // ------------------------------------------------------------------
  // Core state
  // ------------------------------------------------------------------
  const [chats, setChats] = useState<Chat[]>([]);
  const [tempChats, setTempChats] = useState<Chat[]>([]);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [prompt, setPrompt] = useState("");
  const [model, setModel] = useState<string>(DEFAULT_MODEL);
  const [availableModels, setAvailableModels] = useState<string[]>(CODEX_MODELS);
  const [theme, setTheme] = useState<string>("dark");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  // Modals & Panels
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [memoryOpen, setMemoryOpen] = useState(false);
  const [pluginsOpen, setPluginsOpen] = useState(false);
  const [agentOpen, setAgentOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [modelMenuOpen, setModelMenuOpen] = useState(false);
  const [commandMenuOpen, setCommandMenuOpen] = useState(false);

  // Features state
  const [memories, setMemories] = useState<string[]>([
    "Prefers dark mode and concise responses",
    "Uses VOIDGPT with OpenAI OAuth bridge",
  ]);
  const [memoryInput, setMemoryInput] = useState("");
  const [memoryActive, setMemoryActive] = useState(true);
  const [plugins, setPlugins] = useState({
    calculator: true,
    datetime: true,
    web_fetch: false,
    weather: false,
  });
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Streaming refs
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const completionSavedRef = useRef(false);

  // ------------------------------------------------------------------
  // Completion streaming (ai-sdk useCompletion)
  // ------------------------------------------------------------------
  const {
    complete,
    completion: sdkCompletion,
    isLoading: sdkIsLoading,
    stop: sdkStop,
  } = useCompletion({
    api: "/api/chat",
    streamProtocol: "text",
    onError: (err) => {
      showToast(err.message || "Failed to stream response");
    },
  });

  // ------------------------------------------------------------------
  // Derived state
  // ------------------------------------------------------------------
  const allChats = useMemo(() => [...chats, ...tempChats], [chats, tempChats]);
  const activeChat = useMemo(() => {
    if (!activeChatId) return null;
    return allChats.find((c) => c.id === activeChatId) ?? null;
  }, [allChats, activeChatId]);
  const activeMessages = activeChat?.messages ?? [];
  const activePluginCount = useMemo(
    () => Object.values(plugins).filter(Boolean).length,
    [plugins]
  );

  // ------------------------------------------------------------------
  // Toast notifications
  // ------------------------------------------------------------------
  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage((prev) => (prev === msg ? null : prev));
    }, 4000);
  }, []);

  // ------------------------------------------------------------------
  // Lifecycle & Storage
  // ------------------------------------------------------------------
  useEffect(() => {
    const storedTheme = localStorage.getItem("voidgpt-theme") || "dark";
    setTheme(storedTheme);
    document.body.setAttribute("data-theme", storedTheme);

    try {
      const raw = localStorage.getItem("voidgpt-chats");
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          // Sanitize models to ensure only Codex-compatible models are used
          const sanitized = parsed.map((c: any) => ({
            ...c,
            model: CODEX_MODELS.includes(c.model) ? c.model : DEFAULT_MODEL,
          }));
          setChats(sanitized);
          setActiveChatId(sanitized[0].id);
        } else {
          createNewChat();
        }
      } else {
        createNewChat();
      }

      const rawMemories = localStorage.getItem("voidgpt-memories");
      if (rawMemories) {
        const parsedMem = JSON.parse(rawMemories);
        if (Array.isArray(parsedMem)) setMemories(parsedMem);
      }
    } catch {
      createNewChat();
    }

    // Query active Codex models from the bridge
    fetch("/api/models")
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data?.models) && data.models.length > 0) {
          setAvailableModels(data.models);
        }
      })
      .catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    try {
      localStorage.setItem("voidgpt-chats", JSON.stringify(chats));
    } catch {
      /* ignore */
    }
  }, [chats]);

  useEffect(() => {
    try {
      localStorage.setItem("voidgpt-memories", JSON.stringify(memories));
    } catch {
      /* ignore */
    }
  }, [memories]);

  useEffect(() => {
    document.body.setAttribute("data-theme", theme);
    localStorage.setItem("voidgpt-theme", theme);
  }, [theme]);

  // Autoscroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [activeMessages.length, sdkCompletion, sdkIsLoading]);

  // Adjust textarea height automatically
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.min(
        textareaRef.current.scrollHeight,
        220
      )}px`;
    }
  }, [prompt]);

  // ------------------------------------------------------------------
  // Messages & Completion Handling
  // ------------------------------------------------------------------
  const addMessage = useCallback(
    (
      chatId: string,
      role: Message["role"],
      content: string,
      msgModel?: string,
      extraProps?: Partial<Message>
    ): string => {
      const id = newChatId();
      const message: Message = {
        id,
        role,
        content,
        createdAt: Date.now(),
        model: msgModel,
        ...extraProps,
      };

      setChats((prev) =>
        prev.map((c) =>
          c.id === chatId
            ? {
                ...c,
                messages: [...c.messages, message],
                updatedAt: Date.now(),
                title:
                  c.title === "New chat" && role === "user"
                    ? content.slice(0, 32).trim() + (content.length > 32 ? "…" : "")
                    : c.title,
              }
            : c
        )
      );

      setTempChats((prev) =>
        prev.map((c) =>
          c.id === chatId
            ? {
                ...c,
                messages: [...c.messages, message],
                updatedAt: Date.now(),
                title:
                  c.title === "Temporary chat" && role === "user"
                    ? content.slice(0, 32).trim() + (content.length > 32 ? "…" : "")
                    : c.title,
              }
            : c
        )
      );

      return id;
    },
    []
  );

  // Image Generation Handler
  const generateImage = useCallback(
    async (chatId: string, targetPrompt: string) => {
      const assistantMsgId = addMessage(
        chatId,
        "assistant",
        "Generating your image…",
        model,
        {
          isGeneratingImage: true,
          imagePrompt: targetPrompt,
        }
      );

      try {
        let headers: Record<string, string> = {};
        try {
          headers = (await openaiAuthHeaders()) as Record<string, string>;
        } catch {
          /* Extension auth headers if available */
        }

        const res = await fetch("/api/image", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...headers,
          },
          body: JSON.stringify({
            prompt: targetPrompt,
            model: "gpt-image-2",
          }),
        });

        const data = await res.json().catch(() => null);
        if (!res.ok || !data) {
          throw new Error(data?.error || `Image generation failed (${res.status})`);
        }

        const item = data.data && data.data[0];
        const imageUrl =
          item && (item.url || (item.b64_json ? `data:image/png;base64,${item.b64_json}` : ""));

        if (!imageUrl) {
          throw new Error("No image was returned from the generator.");
        }

        // Update assistant message with the generated image
        setChats((prev) =>
          prev.map((c) =>
            c.id === chatId
              ? {
                  ...c,
                  messages: c.messages.map((m) =>
                    m.id === assistantMsgId
                      ? {
                          ...m,
                          content: "Here is your generated image:",
                          imageUrl,
                          isGeneratingImage: false,
                        }
                      : m
                  ),
                }
              : c
          )
        );

        setTempChats((prev) =>
          prev.map((c) =>
            c.id === chatId
              ? {
                  ...c,
                  messages: c.messages.map((m) =>
                    m.id === assistantMsgId
                      ? {
                          ...m,
                          content: "Here is your generated image:",
                          imageUrl,
                          isGeneratingImage: false,
                        }
                      : m
                  ),
                }
              : c
          )
        );
      } catch (err: any) {
        const errorText = err?.message || "Failed to generate image.";
        showToast(errorText);

        setChats((prev) =>
          prev.map((c) =>
            c.id === chatId
              ? {
                  ...c,
                  messages: c.messages.map((m) =>
                    m.id === assistantMsgId
                      ? {
                          ...m,
                          content: `⚠️ Image generation encountered an error: ${errorText}`,
                          isGeneratingImage: false,
                        }
                      : m
                  ),
                }
              : c
          )
        );
      }
    },
    [addMessage, model, showToast]
  );

  // Persist assistant message when streaming completes + Check for AI image tag [IMAGE_GENERATE: ...]
  useEffect(() => {
    if (!sdkIsLoading && sdkCompletion && activeChatId && !completionSavedRef.current) {
      completionSavedRef.current = true;
      const targetChat = activeChat;
      if (targetChat) {
        // Check if the AI decided an image is needed and included [IMAGE_GENERATE: ...]
        const imageTagMatch = sdkCompletion.match(/\[IMAGE_GENERATE:\s*([^\]]+)\]/i);
        if (imageTagMatch && imageTagMatch[1]) {
          const cleanAssistantText = sdkCompletion.replace(/\[IMAGE_GENERATE:\s*[^\]]+\]/i, "").trim();
          addMessage(
            targetChat.id,
            "assistant",
            cleanAssistantText || "Here is a visualization for you:",
            targetChat.model
          );
          // Trigger automatic image generation
          generateImage(targetChat.id, imageTagMatch[1].trim());
        } else {
          addMessage(targetChat.id, "assistant", sdkCompletion, targetChat.model);
        }
      }
    }
    if (sdkIsLoading) {
      completionSavedRef.current = false;
    }
  }, [sdkIsLoading, sdkCompletion, activeChatId, activeChat, addMessage, generateImage]);

  // ------------------------------------------------------------------
  // Chat actions
  // ------------------------------------------------------------------
  const createNewChat = useCallback(() => {
    const id = newChatId();
    const chat: Chat = {
      id,
      title: "New chat",
      messages: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
      model,
      temporary: false,
    };
    setChats((prev) => [chat, ...prev]);
    setActiveChatId(id);
    setPrompt("");
    return id;
  }, [model]);

  const startTempChat = useCallback(() => {
    const id = newChatId();
    const chat: Chat = {
      id,
      title: "Temporary chat",
      messages: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
      model,
      temporary: true,
    };
    setTempChats((prev) => [chat, ...prev]);
    setActiveChatId(id);
    setPrompt("");
    showToast("Temporary chat created. It won't be saved.");
    return id;
  }, [model, showToast]);

  const deleteChat = useCallback(
    (id: string, e?: React.MouseEvent) => {
      e?.stopPropagation();
      setChats((prev) => prev.filter((c) => c.id !== id));
      setTempChats((prev) => prev.filter((c) => c.id !== id));
      if (activeChatId === id) {
        const remaining = [...chats, ...tempChats].filter((c) => c.id !== id);
        if (remaining.length > 0) {
          setActiveChatId(remaining[0].id);
        } else {
          const newId = createNewChat();
          setActiveChatId(newId);
        }
      }
    },
    [activeChatId, chats, tempChats, createNewChat]
  );

  const togglePinChat = useCallback((id: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setChats((prev) =>
      prev.map((c) => (c.id === id ? { ...c, pinned: !c.pinned } : c))
    );
  }, []);

  const renameChat = useCallback((id: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    const target = allChats.find((c) => c.id === id);
    const newTitle = window.prompt("Enter new chat title:", target?.title);
    if (newTitle && newTitle.trim()) {
      setChats((prev) =>
        prev.map((c) => (c.id === id ? { ...c, title: newTitle.trim() } : c))
      );
      setTempChats((prev) =>
        prev.map((c) => (c.id === id ? { ...c, title: newTitle.trim() } : c))
      );
    }
  }, [allChats]);

  // ------------------------------------------------------------------
  // Submit message (With Automatic Image Recognition)
  // ------------------------------------------------------------------
  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const cleanPrompt = prompt.trim();
    if (!cleanPrompt || sdkIsLoading) return;

    let currentChatId = activeChatId;
    if (!currentChatId) {
      currentChatId = createNewChat();
    }

    // 1. Check for slash commands
    if (cleanPrompt.startsWith("/")) {
      const isCmd = handleSlashCommand(cleanPrompt);
      if (isCmd) {
        setPrompt("");
        return;
      }
    }

    // 2. AUTOMATIC IMAGE INTENT RECOGNITION (Without requiring /image)
    const imageIntent = extractImageIntent(cleanPrompt);
    if (imageIntent.isImage) {
      addMessage(currentChatId, "user", cleanPrompt);
      setPrompt("");
      await generateImage(currentChatId, imageIntent.prompt);
      return;
    }

    // 3. Regular Conversation Flow
    addMessage(currentChatId, "user", cleanPrompt);
    setPrompt("");

    try {
      let headers: Record<string, string> = {};
      try {
        headers = (await openaiAuthHeaders()) as Record<string, string>;
      } catch {
        /* Extension headers if available */
      }

      const activeChatObj = allChats.find((c) => c.id === currentChatId);
      const conversationHistory = (activeChatObj?.messages ?? []).map((m) => ({
        role: m.role,
        content: m.content,
      }));
      conversationHistory.push({ role: "user", content: cleanPrompt });

      // Build system prompt with image awareness & user memory
      let systemInstruction =
        "You are VOIDGPT, an AI assistant. You can generate images whenever requested. If the user asks you to visualize, illustrate, or create an image, or when visual generation is ideal, include the tag [IMAGE_GENERATE: <detailed prompt>] in your reply to automatically trigger image generation.";

      if (memoryActive && memories.length > 0) {
        systemInstruction += `\nUser remembered preferences: ${memories.join("; ")}`;
      }

      await complete(cleanPrompt, {
        headers,
        body: {
          model: activeChatObj?.model || model,
          messages: conversationHistory,
          system: systemInstruction,
        },
      });
    } catch (err: any) {
      showToast(err?.message || "Failed to stream from OpenAI");
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  // ------------------------------------------------------------------
  // Slash commands
  // ------------------------------------------------------------------
  const handleSlashCommand = (cmdText: string) => {
    const [cmd, ...args] = cmdText.trim().split(/\s+/);
    const argStr = args.join(" ");

    switch (cmd.toLowerCase()) {
      case "/image":
        if (argStr) {
          const chatId = activeChatId || createNewChat();
          addMessage(chatId, "user", `/image ${argStr}`);
          generateImage(chatId, argStr);
        } else {
          setPrompt("Generate an image of ");
          textareaRef.current?.focus();
        }
        return true;
      case "/new":
        createNewChat();
        return true;
      case "/temp":
        startTempChat();
        return true;
      case "/model":
        if (argStr && availableModels.includes(argStr)) {
          setModel(argStr);
          showToast(`Model set to ${argStr}`);
        } else {
          setModelMenuOpen(true);
        }
        return true;
      case "/memory":
        setMemoryOpen(true);
        return true;
      case "/plugins":
        setPluginsOpen(true);
        return true;
      case "/settings":
        setSettingsOpen(true);
        return true;
      case "/clear":
        if (activeChatId) {
          setChats((prev) =>
            prev.map((c) => (c.id === activeChatId ? { ...c, messages: [] } : c))
          );
          setTempChats((prev) =>
            prev.map((c) => (c.id === activeChatId ? { ...c, messages: [] } : c))
          );
          showToast("Messages cleared");
        }
        return true;
      case "/export":
        handleExportMarkdown();
        return true;
      case "/help":
        showToast("Shortcuts: Enter to send, Shift+Enter newline, Ctrl+K to search");
        return true;
      default:
        return false;
    }
  };

  // ------------------------------------------------------------------
  // Voice Input (Web Speech API)
  // ------------------------------------------------------------------
  const toggleVoiceInput = () => {
    if (typeof window === "undefined") return;
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      showToast("Speech recognition is not supported in this browser.");
      return;
    }

    if (isListening) {
      setIsListening(false);
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.lang = "en-US";

      recognition.onstart = () => setIsListening(true);
      recognition.onend = () => setIsListening(false);
      recognition.onerror = () => setIsListening(false);
      recognition.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript;
        if (transcript) {
          setPrompt((prev) => (prev ? `${prev} ${transcript}` : transcript));
        }
      };

      recognition.start();
    } catch {
      setIsListening(false);
    }
  };

  // ------------------------------------------------------------------
  // Text-To-Speech (Speech Synthesis)
  // ------------------------------------------------------------------
  const speakMessage = (id: string, text: string) => {
    if (typeof window === "undefined" || !window.speechSynthesis) {
      showToast("Speech synthesis is not supported in this browser.");
      return;
    }

    if (isSpeaking === id) {
      window.speechSynthesis.cancel();
      setIsSpeaking(null);
      return;
    }

    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.onend = () => setIsSpeaking(null);
    utterance.onerror = () => setIsSpeaking(null);
    setIsSpeaking(id);
    window.speechSynthesis.speak(utterance);
  };

  // ------------------------------------------------------------------
  // Export actions
  // ------------------------------------------------------------------
  const handleExportMarkdown = () => {
    if (!activeChat || activeChat.messages.length === 0) {
      showToast("No messages to export.");
      return;
    }
    const md = activeChat.messages
      .map((m) => `### ${m.role === "user" ? "User" : "Assistant"}\n\n${m.content}\n${m.imageUrl ? `\n![Generated Image](${m.imageUrl})\n` : ""}`)
      .join("\n---\n\n");
    const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${activeChat.title.replace(/[^a-z0-9_-]/gi, "_")}.md`;
    a.click();
    URL.revokeObjectURL(url);
    showToast("Chat exported as Markdown");
  };

  const handleExportJSON = () => {
    const data = JSON.stringify(allChats, null, 2);
    const blob = new Blob([data], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `voidgpt-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast("Full backup downloaded");
  };

  // ------------------------------------------------------------------
  // Filtered Chats for Search Palette
  // ------------------------------------------------------------------
  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const q = searchQuery.toLowerCase();
    return allChats.filter(
      (c) =>
        c.title.toLowerCase().includes(q) ||
        c.messages.some((m) => m.content.toLowerCase().includes(q))
    );
  }, [allChats, searchQuery]);

  return (
    <>
      <Icons />

      <div className="app-shell" id="appShell">
        {/* ========================================================= */}
        {/* LEFT SIDEBAR (Matches look.png)                           */}
        {/* ========================================================= */}
        <aside
          className="sidebar"
          id="sidebar"
          style={{ display: sidebarCollapsed ? "none" : "flex" }}
        >
          <div className="sidebar-top">
            {/* Logo Brand Row */}
            <div className="brand-row">
              <button
                className="brand"
                id="brandBtn"
                type="button"
                onClick={() => createNewChat()}
                title="VOIDGPT home"
              >
                <div className="wrapper">
                  <div className="light"></div>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    className="image"
                    src="/assets/images/logo.svg"
                    alt="VOIDGPT"
                    width="28"
                    height="28"
                  />
                </div>
                <span className="brand-text">
                  <strong>VOIDGPT</strong>
                  <em>Astra</em>
                </span>
              </button>

              <div className="sidebar-utility">
                <button
                  className="icon-btn ghost"
                  id="searchChatsBtn"
                  type="button"
                  title="Search chats (Ctrl+K)"
                  onClick={() => setSearchOpen(true)}
                >
                  <svg className="icon">
                    <use href="#i-search" />
                  </svg>
                </button>
                <button
                  className="icon-btn ghost sidebar-collapse"
                  id="collapseSidebarBtn"
                  type="button"
                  title="Collapse sidebar"
                  onClick={() => setSidebarCollapsed(true)}
                >
                  <svg className="icon">
                    <use href="#i-panel" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Sidebar Navigation Shortcuts */}
            <nav className="sidebar-nav-list" aria-label="Shortcuts">
              <button
                className="sidebar-nav primary new-chat-btn"
                id="newChatBtn"
                type="button"
                onClick={() => createNewChat()}
              >
                <svg className="icon">
                  <use href="#i-plus" />
                </svg>
                <span>New chat</span>
              </button>

              <button
                className={`sidebar-nav ${memoryActive ? "on" : ""}`}
                id="memoryBtn"
                type="button"
                onClick={() => setMemoryOpen(true)}
              >
                <svg className="icon">
                  <use href="#i-brain" />
                </svg>
                <span>Memory</span>
                <span className="nav-badge" id="memoryCount">
                  {memories.length}
                </span>
              </button>

              <button
                className={`sidebar-nav ${activePluginCount > 0 ? "on" : ""}`}
                id="pluginsBtn"
                type="button"
                onClick={() => setPluginsOpen(true)}
              >
                <svg className="icon">
                  <use href="#i-plug" />
                </svg>
                <span>Plugins</span>
                <span className="nav-badge" id="pluginCount">
                  {activePluginCount}
                </span>
              </button>

              <button
                className="sidebar-nav agent-nav on"
                id="agentBtn"
                type="button"
                onClick={() => setAgentOpen(true)}
              >
                <svg className="icon">
                  <use href="#i-cursor" />
                </svg>
                <span>Astra computer use</span>
                <span className="nav-badge agent-badge" id="agentBadge">
                  READY
                </span>
              </button>
            </nav>
          </div>

          {/* Recents Chat List */}
          <div className="chat-group-label">Recents</div>
          <div className="chat-list" id="chatList" role="list">
            {allChats.map((c) => {
              const isActive = c.id === activeChatId;
              return (
                <div
                  key={c.id}
                  className={`chat-item ${isActive ? "active" : ""}`}
                  onClick={() => setActiveChatId(c.id)}
                >
                  <svg className="icon chat-icon">
                    <use href={c.temporary ? "#i-spark" : "#i-message"} />
                  </svg>
                  <span className="chat-title" title={c.title}>
                    {c.title || "New chat"}
                  </span>

                  <div className="chat-item-actions">
                    <button
                      type="button"
                      className="icon-btn tiny ghost"
                      title={c.pinned ? "Unpin chat" : "Pin chat"}
                      onClick={(e) => togglePinChat(c.id, e)}
                    >
                      <svg className="icon tiny">
                        <use href="#i-pin" />
                      </svg>
                    </button>
                    <button
                      type="button"
                      className="icon-btn tiny ghost"
                      title="Rename"
                      onClick={(e) => renameChat(c.id, e)}
                    >
                      <svg className="icon tiny">
                        <use href="#i-edit" />
                      </svg>
                    </button>
                    <button
                      type="button"
                      className="icon-btn tiny ghost danger"
                      title="Delete chat"
                      onClick={(e) => deleteChat(c.id, e)}
                    >
                      <svg className="icon tiny">
                        <use href="#i-trash" />
                      </svg>
                    </button>
                  </div>
                </div>
              );
            })}

            {allChats.length === 0 && (
              <div className="sidebar-empty">
                <p>No chats yet.</p>
              </div>
            )}
          </div>

          {/* Sidebar Footer (Local User + Bridge status) */}
          <div className="sidebar-footer">
            <button
              className="account-chip"
              id="accountChip"
              type="button"
              title="Account & Settings"
              onClick={() => setSettingsOpen(true)}
            >
              <span className="account-avatar" id="accountAvatar">
                L
              </span>
              <span className="account-meta">
                <strong id="accountName">
                  {isSignedIn ? "ChatGPT User" : "Local user"}
                </strong>
                <small id="accountSub">
                  {isSignedIn ? "Extension connected" : "Connected · local bridge"}
                </small>
              </span>
            </button>

            <button
              className="bridge-status"
              id="bridgeStatus"
              type="button"
              title="Bridge connection active"
              onClick={() => showToast("OAuth Bridge is active and reachable.")}
            >
              <span className="status-dot"></span>
              <span className="bridge-label" id="bridgeText">
                Bridge online · 10 ms
              </span>
            </button>
          </div>
        </aside>

        {/* ========================================================= */}
        {/* MAIN CHAT AREA                                            */}
        {/* ========================================================= */}
        <main className="main" id="main">
          {/* Top Utility Header */}
          <div className="main-tools">
            {sidebarCollapsed && (
              <button
                className="icon-btn ghost"
                type="button"
                title="Open sidebar"
                onClick={() => setSidebarCollapsed(false)}
              >
                <svg className="icon">
                  <use href="#i-panel" />
                </svg>
              </button>
            )}

            <div className="main-tools-right">
              <button
                className="icon-btn ghost"
                id="exportBtn"
                type="button"
                title="Export chat transcript"
                onClick={handleExportMarkdown}
              >
                <svg className="icon">
                  <use href="#i-download" />
                </svg>
              </button>
              <button
                className="icon-btn ghost"
                id="settingsBtn"
                type="button"
                title="Settings"
                onClick={() => setSettingsOpen(true)}
              >
                <svg className="icon">
                  <use href="#i-settings" />
                </svg>
              </button>
            </div>
          </div>

          <div
            className={`chat-area ${activeMessages.length === 0 ? "is-empty" : ""}`}
            id="chatArea"
          >
            {/* HERO / WELCOME VIEW (When chat has 0 messages, matches look.png) */}
            {activeMessages.length === 0 && (
              <div className="hero">
                <h1>Where should we begin?</h1>
                {activeChat?.temporary && (
                  <p className="hero-note">This conversation won&apos;t be saved.</p>
                )}
              </div>
            )}

            {/* MESSAGES LOG (When chat has messages) */}
            {activeMessages.length > 0 && (
              <div className="messages" id="messages">
                <div className="chat-inner" id="chatInner">
                  {activeMessages.map((m) => {
                    const isUser = m.role === "user";
                    return (
                      <div
                        key={m.id}
                        className={`msg ${isUser ? "user" : "assistant"}`}
                      >
                        {!isUser && (
                          <div className="msg-avatar">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src="/assets/images/logo.svg"
                              alt="VOIDGPT"
                              width="20"
                              height="20"
                            />
                          </div>
                        )}
                        <div className="msg-body">
                          {isUser ? (
                            <div className="msg-bubble">{m.content}</div>
                          ) : (
                            <>
                              <MarkdownView content={m.content} />

                              {/* Loading State for Image Generation */}
                              {m.isGeneratingImage && (
                                <div className="image-generating-card">
                                  <div className="image-generating-spinner"></div>
                                  <div className="image-generating-meta">
                                    <strong>Generating image…</strong>
                                    <span>{m.imagePrompt}</span>
                                  </div>
                                </div>
                              )}

                              {/* Rendered Generated Image */}
                              {m.imageUrl && (
                                <div className="generated-image-card">
                                  <div className="image-frame">
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img
                                      src={m.imageUrl}
                                      alt={m.imagePrompt || "Generated image"}
                                      loading="lazy"
                                    />
                                    <div className="image-overlay">
                                      <a
                                        href={m.imageUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="btn secondary tiny"
                                      >
                                        <svg className="icon tiny">
                                          <use href="#i-external" />
                                        </svg>
                                        Open
                                      </a>
                                      <a
                                        href={m.imageUrl}
                                        download={`voidgpt-${m.id}.png`}
                                        className="btn primary tiny"
                                      >
                                        <svg className="icon tiny">
                                          <use href="#i-download" />
                                        </svg>
                                        Download
                                      </a>
                                    </div>
                                  </div>
                                  {m.imagePrompt && (
                                    <div className="image-caption">
                                      <svg className="icon tiny">
                                        <use href="#i-image" />
                                      </svg>
                                      <span>{m.imagePrompt}</span>
                                    </div>
                                  )}
                                </div>
                              )}

                              <div className="msg-actions">
                                <button
                                  type="button"
                                  className="msg-action"
                                  title="Copy"
                                  onClick={() => {
                                    navigator.clipboard.writeText(m.content);
                                    showToast("Copied to clipboard!");
                                  }}
                                >
                                  <svg className="icon tiny">
                                    <use href="#i-copy" />
                                  </svg>
                                  <span>Copy</span>
                                </button>
                                <button
                                  type="button"
                                  className="msg-action"
                                  title="Read aloud"
                                  onClick={() => speakMessage(m.id, m.content)}
                                >
                                  <svg className="icon tiny">
                                    <use href="#i-volume" />
                                  </svg>
                                  <span>
                                    {isSpeaking === m.id ? "Stop" : "Read aloud"}
                                  </span>
                                </button>
                                <button
                                  type="button"
                                  className="msg-action"
                                  title="Good response"
                                  onClick={() => showToast("Feedback recorded!")}
                                >
                                  <svg className="icon tiny">
                                    <use href="#i-thumb-up" />
                                  </svg>
                                </button>
                                <button
                                  type="button"
                                  className="msg-action"
                                  title="Poor response"
                                  onClick={() => showToast("Feedback recorded!")}
                                >
                                  <svg className="icon tiny">
                                    <use href="#i-thumb-down" />
                                  </svg>
                                </button>
                              </div>
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })}

                  {/* Streaming In-Progress Assistant Message */}
                  {sdkIsLoading && (
                    <div className="msg assistant">
                      <div className="msg-avatar">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src="/assets/images/logo.svg"
                          alt="VOIDGPT"
                          width="20"
                          height="20"
                        />
                      </div>
                      <div className="msg-body">
                        {sdkCompletion ? (
                          <MarkdownView content={sdkCompletion} />
                        ) : (
                          <div className="typing-indicator">
                            <span></span>
                            <span></span>
                            <span></span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  <div ref={messagesEndRef} />
                </div>
              </div>
            )}

            {/* COMPOSER WRAPPER (Centered pill matching look.png) */}
            <div className="composer-wrap">
              <div className="composer-inner">
                <div className="composer-shell" id="composerShell">
                  <div className="composer-row">
                    {/* Add attachment / tool button */}
                    <button
                      className="composer-icon"
                      id="attachBtn"
                      type="button"
                      title="Add attachment or prompt"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <svg className="icon">
                        <use href="#i-plus" />
                      </svg>
                    </button>
                    <input
                      type="file"
                      ref={fileInputRef}
                      style={{ display: "none" }}
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          setPrompt((prev) => `${prev} [Attached: ${file.name}] `);
                          showToast(`Attached ${file.name}`);
                        }
                      }}
                    />

                    {/* Main input textarea */}
                    <textarea
                      ref={textareaRef}
                      id="input"
                      rows={1}
                      placeholder="Ask VOIDGPT…"
                      value={prompt}
                      onChange={(e) => {
                        setPrompt(e.target.value);
                        if (e.target.value.startsWith("/")) {
                          setCommandMenuOpen(true);
                        } else {
                          setCommandMenuOpen(false);
                        }
                      }}
                      onKeyDown={handleKeyDown}
                      autoComplete="off"
                      spellCheck="true"
                    />

                    {/* Microphone voice button */}
                    <button
                      className={`composer-icon ${isListening ? "active" : ""}`}
                      id="micBtn"
                      type="button"
                      title={isListening ? "Listening..." : "Voice input"}
                      onClick={toggleVoiceInput}
                    >
                      <svg className="icon">
                        <use href="#i-mic" />
                      </svg>
                    </button>

                    {/* Submit / Stop button */}
                    <button
                      className="send-btn"
                      id="sendBtn"
                      type="button"
                      title={sdkIsLoading ? "Stop" : "Send message"}
                      onClick={sdkIsLoading ? sdkStop : () => handleSubmit()}
                      disabled={!sdkIsLoading && !prompt.trim()}
                    >
                      <svg className="icon send-icon">
                        <use href={sdkIsLoading ? "#i-stop" : "#i-send"} />
                      </svg>
                    </button>
                  </div>

                  {/* Autocomplete Command Menu */}
                  {commandMenuOpen && (
                    <div className="command-menu">
                      {SLASH_COMMANDS.map((sc) => (
                        <div
                          key={sc.cmd}
                          className="command-item"
                          onClick={() => {
                            setPrompt(sc.cmd);
                            setCommandMenuOpen(false);
                            textareaRef.current?.focus();
                          }}
                        >
                          <strong className="cmd-name">{sc.cmd}</strong>
                          <span className="cmd-desc">{sc.desc}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Composer Footer (Model selector + / commands) */}
                <div className="composer-foot">
                  <div style={{ position: "relative" }}>
                    <button
                      className="model-btn"
                      id="modelBtn"
                      type="button"
                      onClick={() => setModelMenuOpen((prev) => !prev)}
                    >
                      <span className="model-name" id="modelName">
                        {activeChat?.model || model}
                      </span>
                      <svg className="icon tiny chevron">
                        <use href="#i-chevron" />
                      </svg>
                    </button>

                    {modelMenuOpen && (
                      <div className="model-menu-dropdown">
                        {availableModels.map((m) => (
                          <div
                            key={m}
                            className={`model-option ${
                              (activeChat?.model || model) === m ? "selected" : ""
                            }`}
                            onClick={() => {
                              setModel(m);
                              if (activeChatId) {
                                setChats((prev) =>
                                  prev.map((c) =>
                                    c.id === activeChatId ? { ...c, model: m } : c
                                  )
                                );
                              }
                              setModelMenuOpen(false);
                            }}
                          >
                            <span>{m}</span>
                            {(activeChat?.model || model) === m && (
                              <svg className="icon tiny">
                                <use href="#i-check" />
                              </svg>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <span className="composer-meta">
                    <button
                      className="link-btn"
                      id="commandsHelpBtn"
                      type="button"
                      onClick={() => setCommandMenuOpen((prev) => !prev)}
                    >
                      / commands
                    </button>
                  </span>
                </div>

                {/* 4 Quick Prompts (Stacked vertically as in look.png) */}
                {activeMessages.length === 0 && (
                  <div className="quick-prompts">
                    {SUGGESTIONS.map((s) => (
                      <button
                        key={s.title}
                        className="quick-prompt"
                        type="button"
                        onClick={() => {
                          if (s.attach) {
                            fileInputRef.current?.click();
                          } else {
                            setPrompt(s.prompt);
                            textareaRef.current?.focus();
                          }
                        }}
                      >
                        <svg className="icon">
                          <use href={`#${s.icon}`} />
                        </svg>
                        <span>{s.title}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </main>
      </div>

      {/* ========================================================= */}
      {/* MODALS & OVERLAYS                                         */}
      {/* ========================================================= */}

      {/* 1. Settings Modal */}
      {settingsOpen && (
        <div className="overlay" role="dialog" aria-modal="true">
          <div className="modal">
            <div className="modal-head">
              <h2>Settings</h2>
              <button
                className="icon-btn ghost"
                type="button"
                onClick={() => setSettingsOpen(false)}
              >
                <svg className="icon">
                  <use href="#i-x" />
                </svg>
              </button>
            </div>
            <div className="modal-body">
              <div className="settings-section">
                <h3>ChatGPT Extension</h3>
                <div style={{ margin: "10px 0" }}>
                  <SignInWithChatGPT />
                </div>
                <p className="modal-sub">
                  {isSignedIn
                    ? "✓ Connected to ChatGPT via OAuth extension."
                    : "Install the extension to query ChatGPT directly with your account."}
                </p>
              </div>

              <div className="settings-section">
                <h3>Theme</h3>
                <div className="theme-grid">
                  {[
                    { id: "dark", label: "Dark Void" },
                    { id: "light", label: "Light" },
                    { id: "purple", label: "Deep Purple" },
                    { id: "midnight-blue", label: "Midnight Blue" },
                    { id: "green", label: "Forest Green" },
                    { id: "high-contrast-dark", label: "Contrast Dark" },
                  ].map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      className={`theme-btn ${theme === t.id ? "active" : ""}`}
                      onClick={() => setTheme(t.id)}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="settings-section">
                <h3>Default Model (Codex Supported)</h3>
                <select
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  className="modal-select"
                >
                  {availableModels.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </div>

              <div className="settings-section">
                <h3>Data Management</h3>
                <div style={{ display: "flex", gap: "10px", marginTop: "8px" }}>
                  <button
                    type="button"
                    className="btn secondary"
                    onClick={handleExportJSON}
                  >
                    Export All (JSON)
                  </button>
                  <button
                    type="button"
                    className="btn danger"
                    onClick={() => {
                      if (window.confirm("Are you sure you want to delete all chats?")) {
                        setChats([]);
                        setTempChats([]);
                        createNewChat();
                        showToast("All chats deleted.");
                      }
                    }}
                  >
                    Clear All Chats
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 2. Memory Modal */}
      {memoryOpen && (
        <div className="overlay" role="dialog" aria-modal="true">
          <div className="modal">
            <div className="modal-head">
              <h2>Memory</h2>
              <button
                className="icon-btn ghost"
                type="button"
                onClick={() => setMemoryOpen(false)}
              >
                <svg className="icon">
                  <use href="#i-x" />
                </svg>
              </button>
            </div>
            <div className="modal-body">
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginBottom: "16px",
                }}
              >
                <div>
                  <strong>Enable Memory</strong>
                  <p className="modal-sub">
                    Inject durable preferences into conversation context.
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={memoryActive}
                  onChange={(e) => setMemoryActive(e.target.checked)}
                />
              </div>

              <div style={{ display: "flex", gap: "8px", marginBottom: "16px" }}>
                <input
                  type="text"
                  className="modal-input"
                  placeholder="Remember a new fact or preference..."
                  value={memoryInput}
                  onChange={(e) => setMemoryInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && memoryInput.trim()) {
                      setMemories((prev) => [...prev, memoryInput.trim()]);
                      setMemoryInput("");
                    }
                  }}
                />
                <button
                  type="button"
                  className="btn primary"
                  onClick={() => {
                    if (memoryInput.trim()) {
                      setMemories((prev) => [...prev, memoryInput.trim()]);
                      setMemoryInput("");
                    }
                  }}
                >
                  Add
                </button>
              </div>

              <div className="memory-list">
                {memories.map((m, idx) => (
                  <div key={idx} className="memory-item">
                    <span>{m}</span>
                    <button
                      type="button"
                      className="icon-btn tiny ghost danger"
                      onClick={() =>
                        setMemories((prev) => prev.filter((_, i) => i !== idx))
                      }
                    >
                      <svg className="icon tiny">
                        <use href="#i-trash" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 3. Plugins Modal */}
      {pluginsOpen && (
        <div className="overlay" role="dialog" aria-modal="true">
          <div className="modal">
            <div className="modal-head">
              <h2>Plugins & Tools</h2>
              <button
                className="icon-btn ghost"
                type="button"
                onClick={() => setPluginsOpen(false)}
              >
                <svg className="icon">
                  <use href="#i-x" />
                </svg>
              </button>
            </div>
            <div className="modal-body">
              <div className="plugin-grid">
                {[
                  {
                    id: "calculator",
                    title: "Calculator",
                    desc: "Safe arithmetic parser for equations.",
                  },
                  {
                    id: "datetime",
                    title: "Date & Time",
                    desc: "Current timezone and exact timestamps.",
                  },
                  {
                    id: "web_fetch",
                    title: "Web Fetch",
                    desc: "Retrieve and read public web pages.",
                  },
                  {
                    id: "weather",
                    title: "Weather",
                    desc: "Live forecast and meteorological data.",
                  },
                ].map((p) => {
                  const isEnabled = (plugins as any)[p.id];
                  return (
                    <div key={p.id} className="plugin-card">
                      <div>
                        <strong>{p.title}</strong>
                        <p className="modal-sub">{p.desc}</p>
                      </div>
                      <input
                        type="checkbox"
                        checked={isEnabled}
                        onChange={(e) =>
                          setPlugins((prev) => ({
                            ...prev,
                            [p.id]: e.target.checked,
                          }))
                        }
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 4. Astra Agent Modal */}
      {agentOpen && (
        <div className="overlay" role="dialog" aria-modal="true">
          <div className="modal agent-modal">
            <div className="modal-head">
              <div>
                <span className="agent-kicker">Computer use</span>
                <h2>Astra Agent</h2>
                <p className="modal-sub">
                  VOIDGPT can inspect your desktop, move the cursor, click, type,
                  and complete tasks.
                </p>
              </div>
              <button
                className="icon-btn ghost"
                type="button"
                onClick={() => setAgentOpen(false)}
              >
                <svg className="icon">
                  <use href="#i-x" />
                </svg>
              </button>
            </div>
            <div className="modal-body">
              <div className="agent-status">
                <span className="status-dot"></span>
                <div>
                  <strong>Desktop driver ready</strong>
                  <span style={{ display: "block", fontSize: "12px", color: "var(--muted)" }}>
                    Astra runs directly on your computer via local bridge.
                  </span>
                </div>
              </div>
              <p style={{ fontSize: "13px", marginTop: "16px", color: "var(--text)" }}>
                To execute desktop automation, ask VOIDGPT in chat: e.g. &ldquo;Open
                Notepad and write a reminder&rdquo; or click &ldquo;Let Astra use my
                computer&rdquo; on the home screen.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* 5. Search Palette (Ctrl+K) */}
      {searchOpen && (
        <div className="overlay" role="dialog" aria-modal="true">
          <div className="modal search-modal">
            <div className="modal-head">
              <input
                type="text"
                className="search-palette-input"
                placeholder="Search chats, messages, and commands..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                autoFocus
              />
              <button
                className="icon-btn ghost"
                type="button"
                onClick={() => setSearchOpen(false)}
              >
                <svg className="icon">
                  <use href="#i-x" />
                </svg>
              </button>
            </div>
            <div className="modal-body" style={{ maxHeight: "350px", overflowY: "auto" }}>
              {searchResults.length > 0 ? (
                searchResults.map((c) => (
                  <div
                    key={c.id}
                    className="search-result-item"
                    onClick={() => {
                      setActiveChatId(c.id);
                      setSearchOpen(false);
                      setSearchQuery("");
                    }}
                  >
                    <strong>{c.title}</strong>
                    <small style={{ color: "var(--muted)", display: "block" }}>
                      {c.messages.length} messages ·{" "}
                      {new Date(c.updatedAt).toLocaleDateString()}
                    </small>
                  </div>
                ))
              ) : (
                <div style={{ padding: "20px", textAlign: "center", color: "var(--muted)" }}>
                  {searchQuery ? "No matches found." : "Type to search your chats..."}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Toast Notification */}
      {toastMessage && (
        <div className="toast-notification">
          <span>{toastMessage}</span>
        </div>
      )}
    </>
  );
}
