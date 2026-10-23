import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, Copy, ThumbsDown, ThumbsUp } from 'lucide-react';
import type { ChatMessage as ChatMessageType, CountryCode, PriceMode } from '../../shared/types';
import { formatClock, relativeTime } from '../lib/format';
import { Capybara } from './PicolahMark';
import { MarkdownText } from './MarkdownText';
import { AlternativeGrid, ComparisonPanel } from './ComparisonPanel';

interface ChatMessageProps {
  message: ChatMessageType;
  priceMode: PriceMode;
  market: CountryCode;
  onAsk: (query: string) => void;
}

function stripPriceReminder(content: string) {
  return content
    .split('\n')
    .filter((line) => !/(?:下单前|去平台前).*(?:优惠券|券后价|券后到手价)/.test(line.trim()))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function ChatMessage({ message, priceMode, market, onAsk }: ChatMessageProps) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const [feedback, setFeedback] = useState<'up' | 'down' | null>(null);
  const displayContent =
    message.role === 'assistant' ? stripPriceReminder(message.content) : message.content;

  async function copyAnswer() {
    try {
      await navigator.clipboard.writeText(displayContent);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  }

  if (message.role === 'user') {
    return (
      <article className="message message-user">
        {message.image && (
          <img
            className="user-image"
            src={message.image}
            alt={t('chat.userImage')}
            loading="lazy"
          />
        )}
        <div className="user-bubble">{message.content}</div>
        <div className="user-meta">{formatClock(message.createdAt)}</div>
      </article>
    );
  }

  const comparison = message.comparison;
  const hasComparison =
    comparison?.product && comparison.offers.length > 0 && comparison.kind === 'comparison';

  return (
    <article className="message message-assistant">
      <header className="assistant-head">
        <span className="assistant-avatar">
          <Capybara variant="face" size={30} />
        </span>
        <span className="assistant-name">Picolah</span>
        <span className="assistant-time">{formatClock(message.createdAt)}</span>
      </header>

      <div className="assistant-body">
        <MarkdownText text={displayContent} />

        {hasComparison && <ComparisonPanel comparison={comparison} priceMode={priceMode} />}

        {comparison &&
          (!hasComparison ||
            comparison.kind === 'suggestions' ||
            comparison.kind === 'recommendation') &&
          comparison.alternatives.length > 0 && (
            <AlternativeGrid
              alternatives={comparison.alternatives}
              market={comparison.market}
              priceMode={priceMode}
              onAsk={onAsk}
              title={
                comparison.kind === 'recommendation'
                  ? t('chat.recommended')
                  : comparison.product
                    ? t('chat.noOffers')
                    : t('chat.popular')
              }
            />
          )}

        <div className="assistant-actions">
          <button type="button" className="text-action" onClick={copyAnswer}>
            {copied ? <Check size={14} /> : <Copy size={14} />}
            {t(copied ? 'chat.copied' : 'chat.copy')}
          </button>
          <span className="action-divider" />
          <button
            type="button"
            className={`icon-action ${feedback === 'up' ? 'is-selected' : ''}`}
            aria-label={t('chat.helpful')}
            title={t('chat.helpful')}
            onClick={() => setFeedback(feedback === 'up' ? null : 'up')}
          >
            <ThumbsUp size={14} />
          </button>
          <button
            type="button"
            className={`icon-action ${feedback === 'down' ? 'is-selected' : ''}`}
            aria-label={t('chat.unhelpful')}
            title={t('chat.unhelpful')}
            onClick={() => setFeedback(feedback === 'down' ? null : 'down')}
          >
            <ThumbsDown size={14} />
          </button>
          <span className="assistant-actions-meta">{t('chat.source')} · {relativeTime(message.createdAt)}</span>
        </div>
      </div>
    </article>
  );
}

export function StreamingMessage({
  status,
  text,
  hasResults,
  offerCount,
}: {
  status: string;
  text: string;
  hasResults: boolean;
  offerCount: number;
}) {
  const { t } = useTranslation();
  return (
    <article className="message message-assistant is-streaming" aria-live="polite">
      <header className="assistant-head">
        <span className="assistant-avatar is-thinking">
          <Capybara variant="face" size={30} />
        </span>
        <span className="assistant-name">Picolah</span>
        <span className="assistant-role">{t('chat.comparing')}</span>
        <span className="assistant-live">
          <i />
          LIVE
        </span>
      </header>

      <div className="assistant-body">
        {text ? (
          <>
            <MarkdownText text={text} />
            <span className="stream-caret" aria-hidden="true" />
            {hasResults && (
              <div className="stream-result-hint">
                <span className="status-dot" />
                {t('chat.found', { count: offerCount })}
              </div>
            )}
          </>
        ) : (
          <div className="thinking-panel">
            <div className="thinking-status-row">
              <span className="thinking-orb" aria-hidden="true">
                <span />
              </span>
              <span className="thinking-status">{status || t('chat.searching')}</span>
              <span className="thinking-dots" aria-hidden="true">
                <i />
                <i />
                <i />
              </span>
            </div>
            <div className="thinking-skeleton" aria-hidden="true">
              <span style={{ width: '92%' }} />
              <span style={{ width: '76%' }} />
              <span style={{ width: '58%' }} />
            </div>
            <div className="thinking-tools" aria-hidden="true">
              <span>{t('chat.source')}</span>
              <span>{t('chat.shipping')}</span>
              <span>{t('chat.coupon')}</span>
              <span>{t('chat.trend')}</span>
            </div>
          </div>
        )}
      </div>
    </article>
  );
}
