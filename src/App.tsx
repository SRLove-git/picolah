import { useCallback, useEffect, useRef, useState } from 'react';
import { Sparkles } from 'lucide-react';
import type {
  AppConfig,
  ChatMessage as ChatMessageType,
  Comparison,
  ConversationSummary,
  CountryCode,
  PriceMode,
} from '../shared/types';
import { COUNTRY_CODES } from '../shared/types';
import { getConfig, getConversation, getConversations, streamChat } from './lib/api';
import { AppSidebar, type AppView } from './components/AppSidebar';
import { HomeView } from './components/HomeView';
import { ChatView } from './components/ChatView';
import { MessagesView } from './components/MessagesView';
import { ProfileView } from './components/ProfileView';
import { IngestDrawer } from './components/IngestDrawer';

const MARKET_KEY = 'picolah.market';
const PRICE_MODE_KEY = 'picolah.priceMode';

interface StreamState {
  status: string;
  text: string;
  comparison: Comparison | null;
  startedAt: number;
}

const PAGE_VIEWS: AppView[] = ['home', 'messages', 'profile'];

function readStorage(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // Storage can be unavailable in private browsing; the app still works in memory.
  }
}

function initialMarket(): CountryCode {
  const value = readStorage(MARKET_KEY);
  return (COUNTRY_CODES as readonly string[]).includes(value || '')
    ? (value as CountryCode)
    : 'SG';
}

function initialPriceMode(): PriceMode {
  const value = readStorage(PRICE_MODE_KEY);
  return value === 'landed' || value === 'item' || value === 'shipping' || value === 'history'
    ? value
    : 'landed';
}

function initialView(): AppView {
  if (typeof window === 'undefined') return 'home';
  const hash = window.location.hash.replace('#', '');
  return PAGE_VIEWS.includes(hash as AppView) ? (hash as AppView) : 'home';
}

export default function App() {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [title, setTitle] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessageType[]>([]);
  const [market, setMarket] = useState<CountryCode>(initialMarket);
  const [priceMode, setPriceMode] = useState<PriceMode>(initialPriceMode);
  const [stream, setStream] = useState<StreamState | null>(null);
  const [chatError, setChatError] = useState<string | null>(null);
  const [conversationLoading, setConversationLoading] = useState(false);
  const [booting, setBooting] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [gatewayOpen, setGatewayOpen] = useState(false);
  const [nearBottom, setNearBottom] = useState(true);
  const [view, setView] = useState<AppView>(initialView);
  const [toast, setToast] = useState<string | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const streamTokenRef = useRef(0);
  const loadTokenRef = useRef(0);
  const activeIdRef = useRef(activeId);
  const streamRef = useRef<StreamState | null>(null);
  const nearBottomRef = useRef(true);
  const scrollFrameRef = useRef<number | null>(null);
  const toastTimerRef = useRef<number | null>(null);

  useEffect(() => {
    activeIdRef.current = activeId;
  }, [activeId]);

  useEffect(() => {
    streamRef.current = stream;
  }, [stream]);

  const notify = useCallback((message: string) => {
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    setToast(message);
    toastTimerRef.current = window.setTimeout(() => {
      setToast(null);
      toastTimerRef.current = null;
    }, 2800);
  }, []);

  const refreshConversations = useCallback(async () => {
    try {
      setConversations(await getConversations());
    } catch {
      // Keep the current list when a background refresh fails.
    }
  }, []);

  const refreshConfig = useCallback(async () => {
    setConfig(await getConfig());
  }, []);

  const applyConversation = useCallback(
    (conversation: Awaited<ReturnType<typeof getConversation>>) => {
      activeIdRef.current = conversation.id;
      setActiveId(conversation.id);
      setTitle(conversation.title);
      setMessages(conversation.messages);
      setMarket(conversation.market);
      writeStorage(MARKET_KEY, conversation.market);
      nearBottomRef.current = true;
      setNearBottom(true);
      setView('chat');
    },
    [],
  );

  useEffect(() => {
    let cancelled = false;

    async function boot() {
      const [configResult, listResult] = await Promise.allSettled([
        getConfig(),
        getConversations(),
      ]);
      if (cancelled) return;
      if (configResult.status === 'fulfilled') setConfig(configResult.value);
      if (listResult.status === 'fulfilled') setConversations(listResult.value);
      if (!cancelled) setBooting(false);
    }

    void boot();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    document.title = title ? `${title} · Picolah` : 'Picolah · 购物之前 PICO 一下';
  }, [title]);

  useEffect(() => {
    const hash = view === 'chat' ? '' : `#${view}`;
    const next = `${window.location.pathname}${window.location.search}${hash}`;
    if (`${window.location.pathname}${window.location.search}${window.location.hash}` !== next) {
      window.history.replaceState(null, '', next);
    }
  }, [view]);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    };
  }, []);

  const scheduleScroll = useCallback(() => {
    if (!nearBottomRef.current || scrollFrameRef.current !== null) return;
    scrollFrameRef.current = window.requestAnimationFrame(() => {
      scrollFrameRef.current = null;
      const element = scrollRef.current;
      if (element) element.scrollTop = element.scrollHeight;
    });
  }, []);

  useEffect(() => {
    if (view !== 'chat') return;
    if (messages.length || stream || conversationLoading) {
      scheduleScroll();
    }
  }, [view, messages.length, stream?.text, stream?.status, conversationLoading, scheduleScroll, stream]);

  useEffect(() => {
    if (view !== 'chat' || conversationLoading || messages.length || stream) return;
    nearBottomRef.current = true;
    setNearBottom(true);
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
  }, [view, conversationLoading, messages.length, stream]);

  const handleScroll = useCallback(() => {
    const element = scrollRef.current;
    if (!element) return;
    const distance = element.scrollHeight - element.scrollTop - element.clientHeight;
    nearBottomRef.current = distance < 140;
    setNearBottom(distance < 320);
  }, []);

  const scrollToBottom = useCallback(() => {
    nearBottomRef.current = true;
    setNearBottom(true);
    const element = scrollRef.current;
    if (element) {
      element.scrollTo({ top: element.scrollHeight, behavior: 'smooth' });
    }
  }, []);

  const cancelStream = useCallback((preservePartial: boolean) => {
    const active = abortRef.current;
    if (active) {
      streamTokenRef.current += 1;
      active.abort();
      abortRef.current = null;
    }
    if (preservePartial) {
      const current = streamRef.current;
      if (current && current.text.trim()) {
        const partial: ChatMessageType = {
          id: `stopped-${Date.now()}`,
          role: 'assistant',
          content: `${current.text.trim()}\n\n（已停止生成）`,
          createdAt: new Date().toISOString(),
          comparison: current.comparison || undefined,
        };
        setMessages((previous) => [...previous, partial]);
      }
    }
    setStream(null);
  }, []);

  const handleNewChat = useCallback(() => {
    cancelStream(false);
    loadTokenRef.current += 1;
    activeIdRef.current = null;
    setActiveId(null);
    setTitle(null);
    setMessages([]);
    setChatError(null);
    setConversationLoading(false);
    setSidebarOpen(false);
    setView('home');
    window.requestAnimationFrame(() => {
      if (window.matchMedia('(min-width: 821px)').matches) composerRef.current?.focus();
    });
  }, [cancelStream]);

  const navigate = useCallback(
    (next: AppView) => {
      setSidebarOpen(false);
      if (next === 'home') {
        if (view === 'home' && !messages.length) {
          if (window.matchMedia('(min-width: 821px)').matches) composerRef.current?.focus();
          return;
        }
        handleNewChat();
        return;
      }
      setView(next);
    },
    [handleNewChat, messages.length, view],
  );

  const loadConversation = useCallback(
    async (id: string) => {
      if (activeIdRef.current === id && !conversationLoading && !streamRef.current) {
        setSidebarOpen(false);
        setView('chat');
        return;
      }
      cancelStream(false);
      const token = loadTokenRef.current + 1;
      loadTokenRef.current = token;
      activeIdRef.current = id;
      setActiveId(id);
      setConversationLoading(true);
      setChatError(null);
      setSidebarOpen(false);
      setView('chat');
      nearBottomRef.current = true;

      try {
        const conversation = await getConversation(id);
        if (loadTokenRef.current !== token) return;
        applyConversation(conversation);
      } catch (error) {
        if (loadTokenRef.current !== token) return;
        setChatError(error instanceof Error ? error.message : '对话加载失败');
        setActiveId(null);
        setTitle(null);
        setMessages([]);
      } finally {
        if (loadTokenRef.current === token) setConversationLoading(false);
      }
    },
    [applyConversation, cancelStream, conversationLoading],
  );

  const deepLinkRef = useRef(false);
  useEffect(() => {
    if (deepLinkRef.current) return;
    deepLinkRef.current = true;
    const requested = new URLSearchParams(window.location.search).get('conversation');
    if (requested) void loadConversation(requested);
  }, [loadConversation]);

  const sendMessage = useCallback(
    async (rawMessage: string, image?: string) => {
      const message = rawMessage.trim();
      if ((!message && !image) || abortRef.current || conversationLoading) return;

      const startingId = activeIdRef.current;
      const controller = new AbortController();
      abortRef.current = controller;
      const token = streamTokenRef.current + 1;
      streamTokenRef.current = token;

      const optimisticUser: ChatMessageType = {
        id: `local-user-${Date.now()}`,
        role: 'user',
        content: message || '帮我看看这张图里的商品，推荐一下',
        createdAt: new Date().toISOString(),
        image,
      };

      setMessages((previous) => [...previous, optimisticUser]);
      setStream({ status: '正在理解问题…', text: '', comparison: null, startedAt: Date.now() });
      setChatError(null);
      setSidebarOpen(false);
      setView('chat');
      nearBottomRef.current = true;
      setNearBottom(true);

      let collected = '';
      let comparison: Comparison | null = null;
      let settled = false;
      let conversationId = startingId || '';

      const finalize = (content: string, messageId: string, errorNote?: string) => {
        if (streamTokenRef.current !== token) return;
        setMessages((previous) => [
          ...previous,
          {
            id: messageId,
            role: 'assistant',
            content: errorNote ? `${content}\n\n${errorNote}` : content,
            createdAt: new Date().toISOString(),
            comparison: comparison || undefined,
          },
        ]);
        setStream(null);
      };

      try {
        await streamChat(
          {
            message: message || '帮我看看这张图里的商品，推荐一下',
            market,
            conversationId: startingId,
            image,
          },
          {
            onMeta: (meta) => {
              if (streamTokenRef.current !== token) return;
              conversationId = meta.conversationId;
              setActiveId(meta.conversationId);
              activeIdRef.current = meta.conversationId;
              setTitle(meta.title);
              setMarket(meta.market);
              writeStorage(MARKET_KEY, meta.market);
              setConversations((previous) => {
                const exists = previous.some((item) => item.id === meta.conversationId);
                const now = new Date().toISOString();
                if (exists) {
                  return previous.map((item) =>
                    item.id === meta.conversationId
                      ? { ...item, title: meta.title, market: meta.market, updatedAt: now }
                      : item,
                  );
                }
                return [
                  {
                    id: meta.conversationId,
                    title: meta.title,
                    market: meta.market,
                    preview: '正在生成比价结果…',
                    createdAt: now,
                    updatedAt: now,
                  },
                  ...previous,
                ];
              });
            },
            onStatus: (label) => {
              if (streamTokenRef.current !== token) return;
              setStream((previous) => (previous ? { ...previous, status: label } : previous));
            },
            onResults: (results) => {
              if (streamTokenRef.current !== token) return;
              comparison = results;
              setStream((previous) =>
                previous ? { ...previous, comparison: results } : previous,
              );
            },
            onDelta: (delta) => {
              if (streamTokenRef.current !== token) return;
              collected += delta;
              setStream((previous) =>
                previous ? { ...previous, text: previous.text + delta } : previous,
              );
            },
            onDone: (payload) => {
              if (streamTokenRef.current !== token) return;
              settled = true;
              const content = collected.trim();
              if (content) {
                finalize(content, payload.messageId);
              } else {
                setStream(null);
              }
              abortRef.current = null;
            },
            onServerError: (errorMessage) => {
              if (streamTokenRef.current !== token) return;
              settled = true;
              setChatError(errorMessage);
              if (collected.trim()) {
                finalize(
                  collected.trim(),
                  `error-${Date.now()}`,
                  '（生成中断，以上为已生成的部分建议。）',
                );
              } else {
                setStream(null);
              }
              abortRef.current = null;
            },
          },
          controller.signal,
        );

        if (!settled && !controller.signal.aborted && streamTokenRef.current === token) {
          setChatError('连接提前结束，请再问一次。');
          if (collected.trim()) {
            finalize(collected.trim(), `incomplete-${Date.now()}`, '（回答可能不完整。）');
          } else {
            setStream(null);
          }
        }
      } catch (error) {
        if (controller.signal.aborted || streamTokenRef.current !== token) return;
        const messageText = error instanceof Error ? error.message : '网络连接失败';
        setChatError(messageText);
        if (collected.trim()) {
          finalize(collected.trim(), `error-${Date.now()}`, '（回答生成中断。）');
        } else {
          setStream(null);
        }
      } finally {
        if (streamTokenRef.current === token) {
          abortRef.current = null;
          void refreshConversations();
          if (conversationId) {
            activeIdRef.current = conversationId;
          }
        }
      }
    },
    [conversationLoading, market, refreshConversations],
  );

  const handleMarketChange = useCallback((next: CountryCode) => {
    setMarket(next);
    writeStorage(MARKET_KEY, next);
  }, []);

  const handlePriceModeChange = useCallback((next: PriceMode) => {
    setPriceMode(next);
    writeStorage(PRICE_MODE_KEY, next);
  }, []);

  useEffect(() => {
    function handleKey(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        handleNewChat();
      }
      if (event.key === 'Escape') {
        setSidebarOpen(false);
      }
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [handleNewChat]);

  const busy = Boolean(stream);

  return (
    <div className={`pc-app ${sidebarOpen ? 'is-sidebar-open' : ''}`}>
      <div
        className={`pc-sidebar-scrim ${sidebarOpen ? 'is-open' : ''}`}
        onClick={() => setSidebarOpen(false)}
        aria-hidden="true"
      />
      <AppSidebar
        view={view}
        conversations={conversations}
        open={sidebarOpen}
        config={config}
        onNavigate={navigate}
        onOpenGateway={() => {
          setSidebarOpen(false);
          setGatewayOpen(true);
        }}
        onClose={() => setSidebarOpen(false)}
      />

      <main className="pc-main">
        {view === 'home' && (
          <HomeView
            market={market}
            priceMode={priceMode}
            config={config}
            busy={busy}
            inputRef={composerRef}
            onSend={(message, image) => void sendMessage(message, image)}
            onStop={() => cancelStream(true)}
            onAsk={(query) => void sendMessage(query)}
            onMarketChange={handleMarketChange}
            onPriceModeChange={handlePriceModeChange}
            onOpenSidebar={() => setSidebarOpen(true)}
          />
        )}

        {view === 'chat' && (
          <ChatView
            title={title}
            market={market}
            priceMode={priceMode}
            config={config}
            messages={messages}
            stream={stream}
            loading={conversationLoading}
            chatError={chatError}
            nearBottom={nearBottom}
            busy={busy}
            inputRef={composerRef}
            scrollRef={scrollRef}
            onScroll={handleScroll}
            onScrollToBottom={scrollToBottom}
            onDismissError={() => setChatError(null)}
            onSend={(message, image) => void sendMessage(message, image)}
            onStop={() => cancelStream(true)}
            onAsk={(query) => void sendMessage(query)}
            onMarketChange={handleMarketChange}
            onPriceModeChange={handlePriceModeChange}
            onNew={handleNewChat}
            onOpenSidebar={() => setSidebarOpen(true)}
          />
        )}

        {view === 'messages' && (
          <MessagesView
            conversations={conversations}
            loading={booting}
            config={config}
            onSelect={(id) => void loadConversation(id)}
            onNew={handleNewChat}
            onOpenGateway={() => setGatewayOpen(true)}
            onOpenSidebar={() => setSidebarOpen(true)}
          />
        )}

        {view === 'profile' && (
          <ProfileView
            config={config}
            market={market}
            priceMode={priceMode}
            conversationCount={conversations.length}
            onMarketChange={handleMarketChange}
            onPriceModeChange={handlePriceModeChange}
            onOpenGateway={() => setGatewayOpen(true)}
            onOpenSidebar={() => setSidebarOpen(true)}
            notify={notify}
          />
        )}
      </main>

      {toast && (
        <div className="pc-toast" role="status">
          <Sparkles size={14} />
          <span>{toast}</span>
        </div>
      )}

      <IngestDrawer
        open={gatewayOpen}
        config={config}
        onClose={() => setGatewayOpen(false)}
        onRefresh={refreshConfig}
      />
    </div>
  );
}
