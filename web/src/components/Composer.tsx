import { useEffect, useRef, useState } from 'react';
import {
  ArrowUp,
  Camera,
  CircleDollarSign,
  ImagePlus,
  Loader2,
  Sparkles,
  Square,
  X,
} from 'lucide-react';
import type { AppConfig, CountryCode, PriceMode } from '../../shared/types';
import { MARKETS } from '../../shared/types';
import { prepareImage } from '../lib/image';
import { priceModeMeta } from '../lib/format';
import { CountryFlag } from './CountryFlag';

interface ComposerProps {
  market: CountryCode;
  priceMode: PriceMode;
  config: AppConfig | null;
  busy: boolean;
  loadingConversation: boolean;
  inputRef: React.RefObject<HTMLTextAreaElement | null>;
  onSend: (message: string, image?: string) => void;
  onStop: () => void;
}

interface Attachment {
  dataUrl: string;
  name: string;
}

export function Composer({
  market,
  priceMode,
  config,
  busy,
  loadingConversation,
  inputRef,
  onSend,
  onStop,
}: ComposerProps) {
  const [value, setValue] = useState('');
  const [attachment, setAttachment] = useState<Attachment | null>(null);
  const [imageBusy, setImageBusy] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);
  const composingRef = useRef(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const marketInfo = MARKETS[market];
  const mode = priceModeMeta(priceMode);

  useEffect(() => {
    const element = inputRef.current;
    if (!element) return;
    element.style.height = 'auto';
    element.style.height = `${Math.min(element.scrollHeight, 156)}px`;
  }, [value, inputRef]);

  async function handleFile(file: File | null | undefined) {
    if (!file || busy || loadingConversation) return;
    setImageError(null);
    setImageBusy(true);
    try {
      const dataUrl = await prepareImage(file);
      setAttachment({ dataUrl, name: file.name });
    } catch (error) {
      setImageError(error instanceof Error ? error.message : '图片处理失败，请换一张试试。');
    } finally {
      setImageBusy(false);
    }
  }

  function submit() {
    const text = value.trim() || (attachment ? '帮我看看这张图里的商品，推荐一下' : '');
    if (!text || busy || loadingConversation || imageBusy) return;
    onSend(text, attachment?.dataUrl);
    setValue('');
    setAttachment(null);
    setImageError(null);
    if (inputRef.current) {
      inputRef.current.style.height = 'auto';
    }
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing && !composingRef.current) {
      event.preventDefault();
      submit();
    }
  }

  const canSend =
    Boolean(value.trim() || attachment) && !busy && !loadingConversation && !imageBusy;

  return (
    <div className="composer-dock">
      <form
        className={`composer ${busy ? 'is-busy' : ''}`}
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
        onDragOver={(event) => {
          if (event.dataTransfer.types.includes('Files')) event.preventDefault();
        }}
        onDrop={(event) => {
          const file = event.dataTransfer.files?.[0];
          if (!file) return;
          event.preventDefault();
          void handleFile(file);
        }}
      >
        <input
          ref={fileRef}
          className="composer-file-input"
          type="file"
          accept="image/*"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = '';
            void handleFile(file);
          }}
          tabIndex={-1}
          aria-hidden="true"
        />
        <input
          ref={cameraRef}
          className="composer-file-input"
          type="file"
          accept="image/*"
          capture="environment"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = '';
            void handleFile(file);
          }}
          tabIndex={-1}
          aria-hidden="true"
        />

        {attachment && (
          <div className="composer-attachment">
            <img src={attachment.dataUrl} alt="待发送的商品图片" />
            <span className="composer-attachment-copy">
              <strong>图片已就绪</strong>
              <span>{attachment.name}</span>
            </span>
            <button
              type="button"
              className="composer-attachment-remove"
              onClick={() => {
                setAttachment(null);
                setImageError(null);
              }}
              aria-label="移除图片"
              title="移除图片"
            >
              <X size={14} />
            </button>
          </div>
        )}

        {imageError && <div className="composer-image-error">{imageError}</div>}

        <div className="composer-main">
          <span className="composer-spark" aria-hidden="true">
            <Sparkles size={16} />
          </span>
          <textarea
            ref={inputRef}
            rows={1}
            maxLength={1200}
            value={value}
            placeholder={`问问${marketInfo.nameZh}的价格，或上传/拍摄商品图片…`}
            aria-label="输入比价问题"
            onChange={(event) => setValue(event.target.value)}
            onKeyDown={handleKeyDown}
            onCompositionStart={() => {
              composingRef.current = true;
            }}
            onCompositionEnd={() => {
              composingRef.current = false;
            }}
            onPaste={(event) => {
              const file = Array.from(event.clipboardData.files).find((item) =>
                item.type.startsWith('image/'),
              );
              if (!file) return;
              event.preventDefault();
              void handleFile(file);
            }}
          />
        </div>

        <div className="composer-foot">
          <div className="composer-context">
            <button
              type="button"
              className="composer-attach"
              onClick={() => fileRef.current?.click()}
              disabled={busy || imageBusy || loadingConversation}
              aria-label="上传商品图片"
              title="上传商品图片"
            >
              {imageBusy ? <Loader2 size={15} className="composer-spin" /> : <ImagePlus size={15} />}
            </button>
            <button
              type="button"
              className="composer-attach"
              onClick={() => cameraRef.current?.click()}
              disabled={busy || imageBusy || loadingConversation}
              aria-label="拍照识别商品"
              title="拍照识别商品"
            >
              <Camera size={15} />
            </button>
            <span className="context-chip context-market">
              <CountryFlag code={market} width={13} />
              {marketInfo.nameZh}
              <span className="context-muted">{marketInfo.currency}</span>
            </span>
            <span className="context-chip">
              <CircleDollarSign size={13} />
              {mode.label}
            </span>
            <span className="composer-data-note">
              <span className="live-dot" />
              价格库 · {config?.gateway.markets ?? 6} 个市场
            </span>
          </div>

          <div className="composer-actions">
            <span
              className="composer-model"
              title={config?.llmConfigured ? `${config.llmProvider} · ${config.llmModel}` : '未配置大模型，使用本地比价摘要'}
            >
              <span className={`model-pulse ${config?.llmConfigured ? 'is-live' : ''}`} />
              {config?.llmConfigured ? config.llmProvider : 'Picolah AI'}
            </span>
            {busy ? (
              <button
                type="button"
                className="send-button stop-button"
                onClick={onStop}
                aria-label="停止生成"
                title="停止生成"
              >
                <Square size={12} fill="currentColor" />
                <span>停止</span>
              </button>
            ) : (
              <button
                type="submit"
                className="send-button"
                disabled={!canSend}
                aria-label="发送"
                title="发送 · Enter"
              >
                <span>发送</span>
                <ArrowUp size={15} strokeWidth={2.2} />
              </button>
            )}
          </div>
        </div>
      </form>
      <div className="composer-caption">
        <span>Picolah 只展示价格库中的数据；也可以上传商品图片帮你找同款。</span>
        <span className="composer-shortcut">
          <kbd>Enter</kbd> 发送
          <span className="caption-dot" />
          <kbd>Shift</kbd> + <kbd>Enter</kbd> 换行
        </span>
      </div>
    </div>
  );
}
