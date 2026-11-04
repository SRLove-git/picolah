import { useEffect, useMemo, useState } from 'react';
import { Download, ExternalLink, Sparkles, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useTryOn, type TryOnRequestInput } from '../lib/tryon';

interface TryOnStudioProps {
  open: boolean;
  request: TryOnRequestInput | null;
  onClose: () => void;
}

/** "Put this real product on the capybara" — progress, result and download. */
export function TryOnStudio({ open, request, onClose }: TryOnStudioProps) {
  const { t } = useTranslation();
  const [attempt, setAttempt] = useState(0);
  const input = useMemo(() => request, [request?.productId, request?.name, request?.brand, request?.category, request?.imageUrl, attempt]);
  const status = useTryOn(open ? input : null);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open || !request) return null;

  return (
    <div className="pc-tryon-scrim" role="presentation" onClick={onClose}>
      <div
        className="pc-tryon-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={t('tryon.title')}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="pc-tryon-head">
          <span className="pc-tryon-badge"><Sparkles size={15} aria-hidden="true" /></span>
          <div>
            <strong>{t('tryon.title')}</strong>
            <span>{request.name}</span>
          </div>
          <button type="button" className="pc-tryon-close" aria-label={t('auth.close')} onClick={onClose}>
            <X size={18} />
          </button>
        </header>

        <div className={`pc-tryon-stage is-${status.state}`}>
          {status.state === 'done' && status.record?.url ? (
            <img src={status.record.url} alt={t('tryon.resultAlt', { name: request.name })} />
          ) : (
            <div className="pc-tryon-pending" aria-live="polite">
              <span className="pc-tryon-capy" aria-hidden="true" />
              <p>{status.state === 'failed' ? (status.error || t('tryon.failed')) : t('tryon.generating')}</p>
              {status.state !== 'failed' && <span className="pc-tryon-dots" aria-hidden="true"><i /><i /><i /></span>}
              {status.state === 'failed' && (
                <button type="button" className="pc-tryon-retry" onClick={() => setAttempt((value) => value + 1)}>
                  {t('tryon.retry')}
                </button>
              )}
            </div>
          )}
        </div>

        <footer className="pc-tryon-foot">
          <p>{t('tryon.note')}</p>
          {status.state === 'done' && status.record?.url && (
            <div className="pc-tryon-actions">
              <a className="pc-tryon-action" href={status.record.url} download={`picolah-tryon-${status.record.id}.png`}>
                <Download size={15} />{t('tryon.download')}
              </a>
              <a className="pc-tryon-action" href={status.record.url} target="_blank" rel="noreferrer">
                <ExternalLink size={15} />{t('tryon.open')}
              </a>
            </div>
          )}
        </footer>
      </div>
    </div>
  );
}
