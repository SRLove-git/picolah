import { ArrowDown, Menu, Plus, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type {
  AppConfig,
  ChatMessage as ChatMessageType,
  Comparison,
  CountryCode,
  PriceMode,
} from '../../shared/types';
import { ChatMessage, StreamingMessage } from './ChatMessage';
import { MarketPicker, PriceModeTabs } from './Controls';
import { PromptComposer } from './PromptComposer';

export interface StreamState {
  status: string;
  text: string;
  comparison: Comparison | null;
  startedAt: number;
}

interface ChatViewProps {
  title: string | null;
  market: CountryCode;
  priceMode: PriceMode;
  config: AppConfig | null;
  messages: ChatMessageType[];
  stream: StreamState | null;
  loading: boolean;
  chatError: string | null;
  nearBottom: boolean;
  busy: boolean;
  inputRef: React.RefObject<HTMLTextAreaElement | null>;
  scrollRef: React.RefObject<HTMLDivElement | null>;
  onScroll: () => void;
  onScrollToBottom: () => void;
  onDismissError: () => void;
  onSend: (message: string, image?: string) => void;
  onStop: () => void;
  onAsk: (query: string) => void;
  onMarketChange: (market: CountryCode) => void;
  onPriceModeChange: (mode: PriceMode) => void;
  onNew: () => void;
  onOpenSidebar: () => void;
}

function ChatSkeleton() {
  const { t } = useTranslation();
  return (
    <div className="pc-chat-skeleton" aria-label={t('chat.loading')}>
      <div className="pc-chat-skeleton-user" />
      <div className="pc-chat-skeleton-assistant">
        <span className="pc-chat-skeleton-avatar" />
        <div className="pc-chat-skeleton-lines">
          <i style={{ width: '34%' }} />
          <i style={{ width: '92%' }} />
          <i style={{ width: '74%' }} />
        </div>
      </div>
      <div className="pc-chat-skeleton-card">
        <span />
        <span />
        <span />
      </div>
    </div>
  );
}

export function ChatView({
  title,
  market,
  priceMode,
  config,
  messages,
  stream,
  loading,
  chatError,
  nearBottom,
  busy,
  inputRef,
  scrollRef,
  onScroll,
  onScrollToBottom,
  onDismissError,
  onSend,
  onStop,
  onAsk,
  onMarketChange,
  onPriceModeChange,
  onNew,
  onOpenSidebar,
}: ChatViewProps) {
  const { t } = useTranslation();
  return (
    <section className="pc-chat" aria-label={t('chat.label')}>
      <header className="pc-chat-head">
        <button
          type="button"
          className="pc-mobile-menu pc-page-menu"
          onClick={onOpenSidebar}
          aria-label={t('chat.openNav')}
        >
          <Menu size={19} />
        </button>
        <div className="pc-chat-heading">
          <span className="pc-eyebrow">{t('chat.eyebrow')}</span>
          <h1>{title || t('chat.newTitle')}</h1>
        </div>
        <div className="pc-chat-controls">
          <span className={`pc-live-pill pc-chat-live ${config ? 'is-live' : ''}`}>
            <i />
            {t(config ? 'chat.online' : 'chat.connecting')}
          </span>
          <MarketPicker
            market={market}
            onChange={onMarketChange}
            direction="down"
            tone="ghost"
          />
          <PriceModeTabs priceMode={priceMode} onChange={onPriceModeChange} />
          <button type="button" className="pc-primary-button pc-chat-new" onClick={onNew}>
            <Plus size={15} />
            {t('chat.new')}
          </button>
        </div>
      </header>

      <div className="pc-chat-stage">
        <div className="pc-chat-scroll" ref={scrollRef} onScroll={onScroll}>
          <div className="pc-chat-thread">
            {loading ? (
              <ChatSkeleton />
            ) : (
              <>
                {messages.map((message) => (
                  <ChatMessage
                    key={message.id}
                    message={message}
                    priceMode={priceMode}
                    market={market}
                    onAsk={onAsk}
                  />
                ))}
                {stream && (
                  <StreamingMessage
                    status={stream.status}
                    text={stream.text}
                    hasResults={Boolean(stream.comparison?.offers.length)}
                    offerCount={stream.comparison?.offers.length || 0}
                  />
                )}
              </>
            )}
          </div>
        </div>

        {!nearBottom && (
          <button
            type="button"
            className="pc-scroll-down"
            onClick={onScrollToBottom}
            aria-label={t('chat.bottom')}
          >
            <ArrowDown size={16} />
          </button>
        )}

        {chatError && (
          <div className="pc-chat-error" role="alert">
            <span>{chatError}</span>
            <button type="button" onClick={onDismissError} aria-label={t('chat.close')}>
              <X size={14} />
            </button>
          </div>
        )}

        <div className="pc-chat-composer">
          <PromptComposer
            variant="dock"
            market={market}
            priceMode={priceMode}
            config={config}
            busy={busy}
            loadingConversation={loading}
            inputRef={inputRef}
            onSend={onSend}
            onStop={onStop}
            onMarketChange={onMarketChange}
            onPriceModeChange={onPriceModeChange}
          />
        </div>
      </div>
    </section>
  );
}
