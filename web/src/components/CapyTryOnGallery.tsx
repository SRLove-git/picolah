import { useCallback, useEffect, useState } from 'react';
import { RefreshCw, Sparkles } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { recentTryOns, type TryOnRecord } from '../lib/tryon';

/** The capybara's AI fitting room: recent pictures generated from real products. */
export function CapyTryOnGallery() {
  const { t } = useTranslation();
  const [tryons, setTryons] = useState<TryOnRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setFailed(false);
    try {
      const { tryons: list } = await recentTryOns(18);
      setTryons(list);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <section className="pc-tryon-gallery" aria-label={t('tryon.galleryTitle')}>
      <header className="pc-tryon-gallery-head">
        <div>
          <h2>{t('tryon.galleryTitle')}</h2>
          <p>{t('tryon.galleryHint')}</p>
        </div>
        <button type="button" className="pc-tryon-refresh" onClick={() => void load()} disabled={loading}>
          <RefreshCw size={14} className={loading ? 'is-spinning' : undefined} />{t('tryon.refresh')}
        </button>
      </header>

      {failed ? (
        <div className="pc-tryon-gallery-empty">
          <p>{t('tryon.galleryFailed')}</p>
          <button type="button" onClick={() => void load()}>{t('reels.retry')}</button>
        </div>
      ) : loading && tryons.length === 0 ? (
        <div className="pc-tryon-gallery-grid" aria-busy="true">
          {Array.from({ length: 4 }, (_, index) => <span key={index} className="pc-tryon-skeleton" aria-hidden="true" />)}
        </div>
      ) : tryons.length === 0 ? (
        <div className="pc-tryon-gallery-empty">
          <Sparkles size={26} strokeWidth={1.6} aria-hidden="true" />
          <p>{t('tryon.galleryEmpty')}</p>
        </div>
      ) : (
        <ul className="pc-tryon-gallery-grid">
          {tryons.map((tryon) => (
            <li key={tryon.id}>
              <a href={tryon.url} target="_blank" rel="noreferrer" className="pc-tryon-gallery-item">
                {tryon.url && <img src={tryon.url} alt={tryon.name} loading="lazy" decoding="async" />}
                <span>{tryon.name}</span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
