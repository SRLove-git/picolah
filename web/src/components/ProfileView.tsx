import { useCallback, useEffect, useState } from 'react';
import {
  ArrowRight,
  Clock3,
  Compass,
  Fingerprint,
  RefreshCw,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  Store,
  Tag,
  Trash2,
  TrendingUp,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type {
  CountryCode,
  ProfileDimension,
  ShoppingProfile,
} from '../../shared/types';
import { MARKETS } from '../../shared/types';
import { getProfile, resetProfile } from '../lib/api';
import { relativeTime } from '../lib/format';
import { PageHeader } from './PageHeader';
import { Capybara } from './PicolahMark';
import { VideoProfileCard } from './VideoProfileCard';

interface ProfileViewProps {
  onStart: () => void;
  onOpenSidebar: () => void;
  notify: (message: string) => void;
}

function dimensionPercent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function budgetFormatter(currency: string, language: string) {
  const noDecimals = currency === 'IDR' || currency === 'VND';
  return new Intl.NumberFormat(language === 'en' ? 'en-US' : 'zh-CN', {
    style: 'currency',
    currency,
    maximumFractionDigits: noDecimals ? 0 : 2,
    minimumFractionDigits: noDecimals ? 0 : 2,
  });
}

function DimensionList({
  title,
  icon,
  items,
  empty,
  english,
}: {
  title: string;
  icon: React.ReactNode;
  items: ProfileDimension[];
  empty: string;
  english: boolean;
}) {
  return (
    <div className="persona-dimension">
      <div className="persona-dimension-title">
        {icon}
        <span>{title}</span>
      </div>
      {items.length ? (
        <ul>
          {items.slice(0, 4).map((item) => (
            <li key={item.id}>
              <span className="persona-dimension-label">
                {english ? item.labelEn : item.labelZh}
              </span>
              <span className="persona-dimension-bar">
                <i style={{ width: `${Math.max(8, item.share * 100)}%` }} />
              </span>
              <b>{dimensionPercent(item.share)}</b>
            </li>
          ))}
        </ul>
      ) : (
        <p className="persona-dimension-empty">{empty}</p>
      )}
    </div>
  );
}

export function ProfileView({ onStart, onOpenSidebar, notify }: ProfileViewProps) {
  const { t, i18n } = useTranslation();
  const [profile, setProfile] = useState<ShoppingProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [resetting, setResetting] = useState(false);
  const isEnglish = i18n.language === 'en';

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setProfile(await getProfile());
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : t('profile.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    getProfile()
      .then((next) => {
        if (active) setProfile(next);
      })
      .catch((loadError: unknown) => {
        if (active) setError(loadError instanceof Error ? loadError.message : t('profile.loadFailed'));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [t]);

  async function handleReset() {
    if (!window.confirm(t('profile.resetConfirm'))) return;
    setResetting(true);
    try {
      await resetProfile();
      notify(t('profile.resetDone'));
      await load();
    } catch (resetError) {
      notify(resetError instanceof Error ? resetError.message : t('profile.loadFailed'));
    } finally {
      setResetting(false);
    }
  }

  const persona = profile?.persona;
  const hasData = Boolean(profile?.hasData && persona);
  const budget = profile?.budget;

  return (
    <section className="pc-page persona-page" aria-label={t('profile.title')}>
      <PageHeader
        eyebrow="SHOPPING DNA"
        title={t('profile.title')}
        description={t('profile.subtitle')}
        onOpenSidebar={onOpenSidebar}
      >
        {(hasData || profile?.video?.hasData) && (
          <button
            type="button"
            className="pc-outline-button"
            onClick={() => void load()}
            disabled={loading}
          >
            <RefreshCw size={14} />
            {t('profile.refresh')}
          </button>
        )}
      </PageHeader>

      <div className="pc-page-body persona-body">
        {!loading && !error && profile?.video?.hasData && (
          <VideoProfileCard profile={profile.video} onReset={() => void handleReset()} resetting={resetting} />
        )}
        {loading ? (
          <div className="persona-loading">
            <span className="persona-orbit" aria-hidden="true" />
            <p>{t('profile.loading')}</p>
          </div>
        ) : error ? (
          <div className="persona-empty persona-error">
            <Capybara size={94} />
            <h2>{t('profile.loadFailed')}</h2>
            <p>{error}</p>
            <button type="button" className="pc-primary-button" onClick={() => void load()}>
              <RefreshCw size={14} />
              {t('profile.retry')}
            </button>
          </div>
        ) : !hasData ? (profile?.video?.hasData ? null : (
          <div className="persona-empty">
            <div className="persona-empty-art">
              <Capybara size={132} />
            </div>
            <span className="pc-eyebrow">SHOPPING DNA</span>
            <h2>{t('profile.emptyTitle')}</h2>
            <p>{t('profile.emptyHint')}</p>
            <div className="persona-empty-actions">
              <button type="button" className="pc-primary-button" onClick={onStart}>
                <Sparkles size={14} />
                {t('profile.start')}
                <ArrowRight size={14} />
              </button>
            </div>
            <div className="persona-privacy-line">
              <ShieldCheck size={14} />
              {t('profile.emptyPrivacy')}
            </div>
          </div>
        )) : (
          <>
            <div className="persona-hero" style={{ '--persona-accent': persona?.accent } as React.CSSProperties}>
              <span className="persona-hero-glow" aria-hidden="true" />
              <div className="persona-hero-art">
                <Capybara size={150} />
                <span className="persona-emoji">{persona?.emoji}</span>
              </div>
              <div className="persona-hero-copy">
                <span className="pc-eyebrow">{t('profile.yourPersona')}</span>
                <h2>{isEnglish ? persona?.nameEn : persona?.nameZh}</h2>
                <p className="persona-tagline">{isEnglish ? persona?.taglineEn : persona?.taglineZh}</p>
                <p className="persona-description">
                  {isEnglish ? persona?.descriptionEn : persona?.descriptionZh}
                </p>
                <div className="persona-hero-meta">
                  <span><Clock3 size={13} /> {t('profile.activeDays', { count: profile?.user.activeDays || 0 })}</span>
                  <span><ShoppingBag size={13} /> {t('profile.comparisons', { count: profile?.totals.comparisons || 0 })}</span>
                  <span><Store size={13} /> {t('profile.clicks', { count: profile?.totals.clicks || 0 })}</span>
                </div>
              </div>
              <div className="persona-hero-stats">
                <div>
                  <strong>{profile?.totals.offersSeen || 0}</strong>
                  <span>{t('profile.offersSeen')}</span>
                </div>
                <div>
                  <strong>{profile?.totals.conversations || 0}</strong>
                  <span>{t('profile.conversations')}</span>
                </div>
              </div>
            </div>

            <div className="persona-grid">
              <section className="persona-card persona-traits-card">
                <header className="persona-card-head">
                  <span className="persona-card-icon tone-pink"><Fingerprint size={17} /></span>
                  <div>
                    <h3>{t('profile.traits')}</h3>
                    <p>{t('profile.traitsHint')}</p>
                  </div>
                </header>
                <div className="persona-traits">
                  {profile?.traits.map((trait) => (
                    <div className="persona-trait" key={trait.key}>
                      <div className="persona-trait-head">
                        <span>{isEnglish ? trait.labelEn : trait.labelZh}</span>
                        <strong>{trait.score}</strong>
                      </div>
                      <div className="persona-track">
                        <i style={{ width: `${trait.score}%` }} />
                      </div>
                      <p>{isEnglish ? trait.evidenceEn : trait.evidenceZh}</p>
                    </div>
                  ))}
                </div>
              </section>

              <section className="persona-card persona-budget-card">
                <header className="persona-card-head">
                  <span className="persona-card-icon tone-mint"><Tag size={17} /></span>
                  <div>
                    <h3>{t('profile.budget')}</h3>
                    <p>{t('profile.budgetHint')}</p>
                  </div>
                </header>
                {budget ? (
                  <div className="persona-budget">
                    <span>{t('profile.budgetRange')}</span>
                    <strong>
                      {budgetFormatter(budget.currency, i18n.language).format(budget.min)}
                      <em>–</em>
                      {budgetFormatter(budget.currency, i18n.language).format(budget.max)}
                    </strong>
                    <small>
                      {t('profile.budgetMedian')}{' '}
                      {budgetFormatter(budget.currency, i18n.language).format(budget.median)}
                    </small>
                  </div>
                ) : (
                  <p className="persona-muted">{t('profile.noBudget')}</p>
                )}
                <div className="persona-budget-tip">
                  <TrendingUp size={14} />
                  {t('profile.budgetTip')}
                </div>
              </section>

              <section className="persona-card persona-dimensions-card">
                <header className="persona-card-head">
                  <span className="persona-card-icon tone-lilac"><Compass size={17} /></span>
                  <div>
                    <h3>{t('profile.habits')}</h3>
                    <p>{t('profile.habitsHint')}</p>
                  </div>
                </header>
                <div className="persona-dimensions">
                  <DimensionList
                    title={t('profile.topMarkets')}
                    icon={<Store size={13} />}
                    items={profile?.markets || []}
                    empty={t('profile.notEnough')}
                    english={isEnglish}
                  />
                  <DimensionList
                    title={t('profile.topPlatforms')}
                    icon={<ShoppingBag size={13} />}
                    items={profile?.platforms || []}
                    empty={t('profile.notEnough')}
                    english={isEnglish}
                  />
                  <DimensionList
                    title={t('profile.topCategories')}
                    icon={<Sparkles size={13} />}
                    items={profile?.categories || []}
                    empty={t('profile.notEnough')}
                    english={isEnglish}
                  />
                  <DimensionList
                    title={t('profile.topBrands')}
                    icon={<Tag size={13} />}
                    items={profile?.brands || []}
                    empty={t('profile.notEnough')}
                    english={isEnglish}
                  />
                </div>
              </section>

              <section className="persona-card persona-recent-card">
                <header className="persona-card-head">
                  <span className="persona-card-icon tone-blue"><Clock3 size={17} /></span>
                  <div>
                    <h3>{t('profile.recent')}</h3>
                    <p>{t('profile.recentHint')}</p>
                  </div>
                </header>
                <ul className="persona-activity">
                  {(profile?.recent || []).map((activity) => {
                    const market = MARKETS[activity.market as CountryCode];
                    return (
                      <li key={activity.id}>
                        <span className={`persona-activity-dot is-${activity.type}`} />
                        <div>
                          <strong>{isEnglish ? activity.titleEn : activity.titleZh}</strong>
                          <small>
                            {market ? (isEnglish ? market.nameEn : market.nameZh) : activity.market}
                            {' · '}
                            {activity.type === 'offer_click' ? t('profile.clickEvent') : t('profile.compareEvent')}
                            {' · '}
                            {relativeTime(activity.createdAt)}
                          </small>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </section>

              <section className="persona-card persona-privacy-card">
                <header className="persona-card-head">
                  <span className="persona-card-icon tone-butter"><ShieldCheck size={17} /></span>
                  <div>
                    <h3>{t('profile.privacy')}</h3>
                    <p>{t('profile.privacyHint')}</p>
                  </div>
                </header>
                <p className="persona-privacy-copy">{t('profile.privacyCopy')}</p>
                <button
                  type="button"
                  className="persona-reset"
                  onClick={() => void handleReset()}
                  disabled={resetting}
                >
                  <Trash2 size={14} />
                  {resetting ? t('profile.resetting') : t('profile.reset')}
                </button>
              </section>
            </div>
          </>
        )}
      </div>
    </section>
  );
}

