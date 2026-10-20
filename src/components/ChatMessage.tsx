import { useState } from 'react';
import { Check, Copy, ThumbsDown, ThumbsUp } from 'lucide-react';
import type { ChatMessage as ChatMessageType, CountryCode, PriceMode } from '../../shared/types';
import { formatClock, relativeTime } from '../lib/format';
import { Logo } from './Logo';
import { MarkdownText } from './MarkdownText';
import { AlternativeGrid, ComparisonPanel } from './ComparisonPanel';

interface ChatMessageProps {
  message: ChatMessageType;
  priceMode: PriceMode;
  market: CountryCode;
  onAsk: (query: string) => void;
}

export function ChatMessage({ message, priceMode, market, onAsk }: ChatMessageProps) {
  const [copied, setCopied] = useState(false);
  const [feedback, setFeedback] = useState<'up' | 'down' | null>(null);

  async function copyAnswer() {
    try {
      await navigator.clipboard.writeText(message.content);
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
            alt="用户上传的商品图片"
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
          <Logo size={26} />
        </span>
        <span className="assistant-name">Picolah</span>
        <span className="assistant-role">AI 比价助手</span>
        <span className="assistant-time">{formatClock(message.createdAt)}</span>
      </header>

      <div className="assistant-body">
        <MarkdownText text={message.content} />

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
                  ? '根据你的需求挑的'
                  : comparison.product
                    ? '这个市场暂无报价，看看同类'
                    : '也可以从这些热门商品开始'
              }
            />
          )}

        <div className="assistant-actions">
          <button type="button" className="text-action" onClick={copyAnswer}>
            {copied ? <Check size={14} /> : <Copy size={14} />}
            {copied ? '已复制' : '复制建议'}
          </button>
          <span className="action-divider" />
          <button
            type="button"
            className={`icon-action ${feedback === 'up' ? 'is-selected' : ''}`}
            aria-label="有帮助"
            title="有帮助"
            onClick={() => setFeedback(feedback === 'up' ? null : 'up')}
          >
            <ThumbsUp size={14} />
          </button>
          <button
            type="button"
            className={`icon-action ${feedback === 'down' ? 'is-selected' : ''}`}
            aria-label="不太有帮助"
            title="不太有帮助"
            onClick={() => setFeedback(feedback === 'down' ? null : 'down')}
          >
            <ThumbsDown size={14} />
          </button>
          <span className="assistant-actions-meta">价格库 · {relativeTime(message.createdAt)}</span>
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
  return (
    <article className="message message-assistant is-streaming" aria-live="polite">
      <header className="assistant-head">
        <span className="assistant-avatar is-thinking">
          <Logo size={26} />
        </span>
        <span className="assistant-name">Picolah</span>
        <span className="assistant-role">正在比价</span>
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
                已找到 {offerCount} 条本市场报价，整理完建议后展开比价卡
              </div>
            )}
          </>
        ) : (
          <div className="thinking-panel">
            <div className="thinking-status-row">
              <span className="thinking-orb" aria-hidden="true">
                <span />
              </span>
              <span className="thinking-status">{status || '正在检索价格库…'}</span>
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
              <span>价格库</span>
              <span>运费</span>
              <span>券后价</span>
              <span>30 日走势</span>
            </div>
          </div>
        )}
      </div>
    </article>
  );
}
