import { useEffect, useRef, useState } from 'react';
import {
  ArrowUp,
  ImagePlus,
  Loader2,
  Mic,
  Plus,
  Sparkles,
  Square,
  X,
} from 'lucide-react';
import type { AppConfig, CountryCode, PriceMode } from '../../shared/types';
import { MARKETS } from '../../shared/types';
import { prepareImage } from '../lib/image';
import { MarketPicker, PriceModePicker } from './Controls';

interface PromptComposerProps {
  market: CountryCode;
  priceMode: PriceMode;
  config: AppConfig | null;
  busy: boolean;
  loadingConversation?: boolean;
  inputRef: React.RefObject<HTMLTextAreaElement | null>;
  variant?: 'hero' | 'dock';
  onSend: (message: string, image?: string) => void;
  onStop: () => void;
  onMarketChange: (market: CountryCode) => void;
  onPriceModeChange: (mode: PriceMode) => void;
}

interface Attachment {
  dataUrl: string;
  name: string;
}

interface SpeechResultLike {
  0: { transcript: string };
  isFinal: boolean;
}

interface SpeechResultEventLike {
  resultIndex: number;
  results: {
    length: number;
    [index: number]: SpeechResultLike;
  };
}

interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((event: SpeechResultEventLike) => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
  onend: (() => void) | null;
}

type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

function readRecognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === 'undefined') return null;
  const scope = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return scope.SpeechRecognition || scope.webkitSpeechRecognition || null;
}

export function PromptComposer({
  market,
  priceMode,
  config,
  busy,
  loadingConversation = false,
  inputRef,
  variant = 'dock',
  onSend,
  onStop,
  onMarketChange,
  onPriceModeChange,
}: PromptComposerProps) {
  const [value, setValue] = useState('');
  const [attachment, setAttachment] = useState<Attachment | null>(null);
  const [imageBusy, setImageBusy] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);
  const [listening, setListening] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const composingRef = useRef(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const baseTextRef = useRef('');
  const marketInfo = MARKETS[market];

  useEffect(() => {
    const element = inputRef.current;
    if (!element) return;
    element.style.height = 'auto';
    element.style.height = `${Math.min(element.scrollHeight, 176)}px`;
  }, [value, inputRef]);

  useEffect(() => {
    return () => {
      recognitionRef.current?.abort();
    };
  }, []);

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
    if (listening) {
      recognitionRef.current?.stop();
      setListening(false);
    }
    onSend(text, attachment?.dataUrl);
    setValue('');
    setAttachment(null);
    setImageError(null);
    setVoiceError(null);
    if (inputRef.current) {
      inputRef.current.style.height = 'auto';
    }
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (
      event.key === 'Enter' &&
      !event.shiftKey &&
      !event.nativeEvent.isComposing &&
      !composingRef.current
    ) {
      event.preventDefault();
      submit();
    }
  }

  function toggleVoice() {
    setVoiceError(null);
    if (listening) {
      recognitionRef.current?.stop();
      setListening(false);
      return;
    }
    const Ctor = readRecognitionCtor();
    if (!Ctor) {
      setVoiceError('当前浏览器不支持语音输入，可以试试 Chrome 或 Edge。');
      return;
    }
    try {
      const recognition = new Ctor();
      recognition.lang = 'zh-CN';
      recognition.continuous = false;
      recognition.interimResults = true;
      baseTextRef.current = value.trim();
      recognition.onresult = (event) => {
        let transcript = '';
        for (let index = 0; index < event.results.length; index += 1) {
          transcript += event.results[index][0]?.transcript || '';
        }
        const merged = `${baseTextRef.current} ${transcript}`.trim();
        setValue(merged);
      };
      recognition.onerror = (event) => {
        const denied = event?.error === 'not-allowed' || event?.error === 'service-not-allowed';
        setVoiceError(
          denied
            ? '麦克风权限被拒绝，请在浏览器地址栏重新允许。'
            : '没有听清，再试一次吧。',
        );
        setListening(false);
      };
      recognition.onend = () => {
        setListening(false);
      };
      recognition.start();
      recognitionRef.current = recognition;
      setListening(true);
    } catch {
      setVoiceError('语音输入启动失败，请稍后再试。');
      setListening(false);
    }
  }

  const canSend =
    Boolean(value.trim() || attachment) && !busy && !loadingConversation && !imageBusy;
  const modelLabel = config?.llmConfigured
    ? config.llmProvider === 'DeepSeek'
      ? 'DeepSeek'
      : config.llmProvider
    : 'Picolah AI';

  return (
    <div className={`pc-composer pc-composer-${variant}`}>
      <form
        className={`pc-composer-card ${busy ? 'is-busy' : ''} ${listening ? 'is-listening' : ''}`}
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
          className="pc-file-input"
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

        {attachment && (
          <div className="pc-attachment">
            <img src={attachment.dataUrl} alt="待发送的商品图片" />
            <span className="pc-attachment-copy">
              <strong>图片已就绪</strong>
              <span>{attachment.name}</span>
            </span>
            <button
              type="button"
              className="pc-attachment-remove"
              onClick={() => {
                setAttachment(null);
                setImageError(null);
              }}
              aria-label="移除图片"
            >
              <X size={14} />
            </button>
          </div>
        )}

        {imageError && <div className="pc-composer-error">{imageError}</div>}
        {voiceError && <div className="pc-composer-error">{voiceError}</div>}

        <div className="pc-composer-input">
          <textarea
            ref={inputRef}
            rows={1}
            maxLength={1200}
            value={value}
            placeholder={
              variant === 'hero'
                ? '搜商品、品牌或型号，比如 Sony XM5…'
                : `继续问${marketInfo.nameZh}的价格，或上传商品图…`
            }
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

        {listening && (
          <div className="pc-listening" aria-live="polite">
            <span className="pc-wave" aria-hidden="true">
              <i />
              <i />
              <i />
              <i />
              <i />
            </span>
            <span>正在听你说… 说完会自动停</span>
            <button type="button" onClick={toggleVoice}>
              取消
            </button>
          </div>
        )}

        <div className="pc-composer-foot">
          <div className="pc-composer-tools">
            <button
              type="button"
              className="pc-round-tool"
              onClick={() => fileRef.current?.click()}
              disabled={busy || imageBusy || loadingConversation}
              aria-label="上传图片搜同款"
              title="上传图片搜同款"
            >
              {imageBusy ? <Loader2 size={18} className="pc-spin" /> : <Plus size={19} />}
            </button>
            <button
              type="button"
              className="pc-image-tool"
              onClick={() => fileRef.current?.click()}
              disabled={busy || imageBusy || loadingConversation}
              aria-label="图片搜索"
              title="图片搜索"
            >
              <ImagePlus size={16} />
              <span>图片</span>
            </button>
            <MarketPicker market={market} onChange={onMarketChange} compact />
            <PriceModePicker priceMode={priceMode} onChange={onPriceModeChange} />
          </div>

          <div className="pc-composer-actions">
            <span
              className="pc-model-pill"
              title={
                config?.llmConfigured
                  ? `${config.llmProvider} · ${config.llmModel}`
                  : '本地比价摘要'
              }
            >
              <Sparkles size={13} />
              <span>{modelLabel}</span>
            </span>
            <button
              type="button"
              className={`pc-mic ${listening ? 'is-listening' : ''}`}
              onClick={toggleVoice}
              aria-label={listening ? '停止语音输入' : '语音输入'}
              title={listening ? '停止语音输入' : '语音输入'}
            >
              <Mic size={18} />
            </button>
            {busy ? (
              <button
                type="button"
                className="pc-send is-stop"
                onClick={onStop}
                aria-label="停止生成"
                title="停止生成"
              >
                <Square size={13} fill="currentColor" />
                <span className="pc-send-label">停止</span>
              </button>
            ) : (
              <button
                type="submit"
                className="pc-send"
                disabled={!canSend}
                aria-label="发送"
                title="发送 · Enter"
              >
                <span className="pc-send-label">pico 一下</span>
                <ArrowUp size={17} strokeWidth={2.4} />
              </button>
            )}
          </div>
        </div>
      </form>

      <div className="pc-composer-hint">
        <span>Picolah 只读价格库的数据 · 支持语音和图片搜索</span>
        <span className="pc-shortcuts">
          <kbd>Enter</kbd> 发送
          <i />
          <kbd>Shift</kbd> + <kbd>Enter</kbd> 换行
        </span>
      </div>
    </div>
  );
}
