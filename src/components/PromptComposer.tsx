import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
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
  const { t, i18n } = useTranslation();
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
      setImageError(error instanceof Error ? error.message : t('composer.imageError'));
    } finally {
      setImageBusy(false);
    }
  }

  function submit() {
    const text = value.trim() || (attachment ? t('composer.imageQuery') : '');
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
      setVoiceError(t('composer.voiceUnsupported'));
      return;
    }
    try {
      const recognition = new Ctor();
      recognition.lang = i18n.language === 'en' ? 'en-US' : 'zh-CN';
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
            ? t('composer.micDenied')
            : t('composer.notHeard'),
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
      setVoiceError(t('composer.voiceFailed'));
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
            <img src={attachment.dataUrl} alt={t('composer.imageAlt')} />
            <span className="pc-attachment-copy">
              <strong>{t('composer.imageReady')}</strong>
              <span>{attachment.name}</span>
            </span>
            <button
              type="button"
              className="pc-attachment-remove"
              onClick={() => {
                setAttachment(null);
                setImageError(null);
              }}
              aria-label={t('composer.removeImage')}
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
                ? t('composer.homePlaceholder')
                : t('composer.followupPlaceholder', {
                    market: i18n.language === 'en' ? marketInfo.nameEn : marketInfo.nameZh,
                  })
            }
            aria-label={t('composer.inputLabel')}
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
            <span>{t('composer.listening')}</span>
            <button type="button" onClick={toggleVoice}>
              {t('composer.cancel')}
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
              aria-label={t('composer.upload')}
              title={t('composer.upload')}
            >
              {imageBusy ? <Loader2 size={18} className="pc-spin" /> : <Plus size={19} />}
            </button>
            <button
              type="button"
              className="pc-image-tool"
              onClick={() => fileRef.current?.click()}
              disabled={busy || imageBusy || loadingConversation}
              aria-label={t('composer.upload')}
              title={t('composer.upload')}
            >
              <ImagePlus size={16} />
              <span>{t('composer.image')}</span>
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
                  : t('composer.localSummary')
              }
            >
              <Sparkles size={13} />
              <span>{modelLabel}</span>
            </span>
            <button
              type="button"
              className={`pc-mic ${listening ? 'is-listening' : ''}`}
              onClick={toggleVoice}
              aria-label={t(listening ? 'composer.stopVoice' : 'composer.voice')}
              title={t(listening ? 'composer.stopVoice' : 'composer.voice')}
            >
              <Mic size={18} />
            </button>
            {busy ? (
              <button
                type="button"
                className="pc-send is-stop"
                onClick={onStop}
                aria-label={t('composer.stopGeneration')}
                title={t('composer.stopGeneration')}
              >
                <Square size={13} fill="currentColor" />
                <span className="pc-send-label">{t('composer.stop')}</span>
              </button>
            ) : (
              <button
                type="submit"
                className="pc-send"
                disabled={!canSend}
                aria-label={t('composer.send')}
                title={t('composer.sendTitle')}
              >
                <span className="pc-send-label">{t('composer.send')}</span>
                <ArrowUp size={17} strokeWidth={2.4} />
              </button>
            )}
          </div>
        </div>
      </form>

    </div>
  );
}
