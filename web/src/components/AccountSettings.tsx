import { BadgeCheck, Check, ChevronDown, Download, Globe2, LogOut, Pencil, ShieldCheck, Sparkles, Trash2, Wallet } from 'lucide-react';
import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { CountryCode, PriceMode } from '../../shared/types';
import { COUNTRY_LIST, MARKETS } from '../../shared/types';
import { deleteAccount } from '../lib/api';
import { PRICE_MODES } from '../lib/format';
import { useSession } from '../lib/session';
import { CountryFlag } from './CountryFlag';

export interface AccountSettingsProps {
  market: CountryCode;
  priceMode: PriceMode;
  onMarketChange: (market: CountryCode) => void;
  onPriceModeChange: (mode: PriceMode) => void;
  notify: (message: string) => void;
}

const PRICE_ICONS = { landed: Wallet, item: Sparkles, shipping: Globe2, history: Sparkles } as const;

/** Account controls live one level below the profile, with native keyboard-accessible disclosure rows. */
export function AccountSettings({ market, priceMode, onMarketChange, onPriceModeChange, notify }: AccountSettingsProps) {
  const { t, i18n } = useTranslation();
  const { user, logout, loading } = useSession();
  const [deletePassword, setDeletePassword] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const passwordId = useId();
  const warningId = useId();
  const en = i18n.language.startsWith('en');
  const marketInfo = MARKETS[market];
  const guestLabel = en ? 'Guest' : '访客';
  const guestHint = en
    ? 'You are browsing as a guest. No account is signed in.'
    : '当前以访客身份浏览，尚未登录账号。';
  const privacyGuestHint = en
    ? 'Account export and deletion are available after signing in. You can clear your interest profile on the Profile page.'
    : '登录后可导出数据或删除账号；兴趣画像可前往画像页面清空。';

  const removeAccount = async () => {
    if (!user || !deletePassword || deleting) return;
    setDeleting(true);
    try {
      await deleteAccount(deletePassword);
      notify(t('account.deleteDone'));
      try {
        await logout();
      } catch {
        // Deletion already succeeded. A failed session refresh must not claim
        // that the account still exists or encourage another deletion attempt.
        notify(en ? 'Account deleted. Refresh the page to update your session.' : '账户已删除，请刷新页面更新登录状态。');
      }
    } catch (error) {
      notify(error instanceof Error ? error.message : t('account.deleteFailed'));
    } finally {
      setDeleting(false);
      setDeletePassword('');
    }
  };

  const signOut = async () => {
    if (!user || loggingOut) return;
    setLoggingOut(true);
    try {
      await logout();
      notify(t('account.logoutNotice'));
    } catch (error) {
      notify(error instanceof Error ? error.message : (en ? 'Could not sign out. Please try again.' : '退出登录失败，请重试。'));
    } finally {
      setLoggingOut(false);
    }
  };

  return (
    <div className="pc-account-settings">
      <details className="pc-profile-card pc-account-setting">
        <summary>
          <span className="pc-profile-card-icon tone-pink"><Globe2 size={18} /></span>
          <div><h3>{t('account.defaultMarket')}</h3><p>{t('account.defaultMarketHint')}</p></div>
          <span className="pc-account-setting-value">{en ? marketInfo.nameEn : marketInfo.nameZh}</span>
          <ChevronDown size={17} className="pc-collapse-chevron" />
        </summary>
        <div className="pc-market-chips">
          {COUNTRY_LIST.map((item) => (
            <button key={item.code} type="button" className={`pc-market-chip ${item.code === market ? 'is-active' : ''}`}
              aria-pressed={item.code === market} onClick={() => onMarketChange(item.code)}>
              <CountryFlag code={item.code} width={18} />
              <span><strong>{en ? item.nameEn : item.nameZh}</strong><small>{item.currency}</small></span>
              {item.code === market && <Check size={13} aria-hidden="true" />}
            </button>
          ))}
        </div>
      </details>

      <details className="pc-profile-card pc-account-setting">
        <summary>
          <span className="pc-profile-card-icon tone-mint"><Wallet size={18} /></span>
          <div><h3>{t('account.defaultPrice')}</h3><p>{t('account.defaultPriceHint')}</p></div>
          <span className="pc-account-setting-value">{t(`controls.${priceMode}.label`)}</span>
          <ChevronDown size={17} className="pc-collapse-chevron" />
        </summary>
        <div className="pc-price-options">
          {PRICE_MODES.map((item) => {
            const Icon = PRICE_ICONS[item.id];
            return (
              <button key={item.id} type="button" className={`pc-price-option ${item.id === priceMode ? 'is-active' : ''}`}
                aria-pressed={item.id === priceMode} onClick={() => onPriceModeChange(item.id)}>
                <span className="pc-price-option-icon"><Icon size={16} /></span>
                <span><strong>{t(`controls.${item.id}.label`)}</strong><small>{t(`controls.${item.id}.hint`)}</small></span>
                {item.id === priceMode && <Check size={15} aria-hidden="true" />}
              </button>
            );
          })}
        </div>
        <div className="pc-profile-note">{t('account.currencyNote', { currency: marketInfo.currency })}</div>
      </details>

      <details className="pc-profile-card pc-profile-account pc-account-setting">
        <summary>
          <span className="pc-profile-card-icon tone-lilac"><BadgeCheck size={18} /></span>
          <div><h3>{t('account.security')}</h3><p>{user ? t('account.securityHint') : guestHint}</p></div>
          <span className="pc-account-setting-value">{loading ? (en ? 'Loading…' : '读取中…') : user ? (en ? 'Signed in' : '已登录') : guestLabel}</span>
          <ChevronDown size={17} className="pc-collapse-chevron" />
        </summary>
        {user ? (
          <>
            <div className="pc-account-rows">
              <span><small>{t('account.username')}</small><strong>{user.displayName || user.email}</strong></span>
              <span><small>{t('account.loginMethod')}</small><strong>{t('account.emailPassword')}</strong></span>
              <span><small>{t('account.email')}</small><strong>{user.email}</strong></span>
            </div>
            <div className="pc-profile-card-actions">
              <button type="button" className="pc-outline-button" onClick={() => notify(t('account.passwordNotice'))}>
                <Pencil size={14} />{t('account.changePassword')}
              </button>
              <button type="button" className="pc-text-button is-danger" disabled={loggingOut || deleting} onClick={() => void signOut()}>
                <LogOut size={14} />{loggingOut ? (en ? 'Signing out…' : '正在退出…') : t('account.logout')}
              </button>
            </div>
          </>
        ) : <p className="pc-profile-note">{guestHint}</p>}
      </details>

      <details className="pc-profile-card pc-profile-privacy pc-account-setting">
        <summary>
          <span className="pc-profile-card-icon tone-mint"><ShieldCheck size={18} /></span>
          <div><h3>{t('account.privacy')}</h3><p>{t('account.privacyHint')}</p></div>
          <ChevronDown size={17} className="pc-collapse-chevron" />
        </summary>
        <div className="pc-privacy-actions">
          {user ? (
            <a className="pc-outline-button" href="/api/account/export" download><Download size={14} />{t('account.export')}</a>
          ) : (
            <>
              <p className="pc-profile-note">{privacyGuestHint}</p>
              <button type="button" className="pc-outline-button" disabled><Download size={14} />{t('account.export')}</button>
            </>
          )}
          <div className="pc-danger-zone">
            <label htmlFor={passwordId}>{t('account.deleteLabel')}</label>
            <div>
              <input id={passwordId} type="password" value={deletePassword} onChange={(event) => setDeletePassword(event.target.value)}
                placeholder={t('account.deletePlaceholder')} autoComplete="current-password" aria-describedby={warningId} disabled={!user || deleting} />
              <button type="button" className="pc-text-button is-danger" disabled={!user || !deletePassword || deleting || loggingOut} onClick={() => void removeAccount()}>
                <Trash2 size={14} />{deleting ? t('account.deleting') : t('account.delete')}
              </button>
            </div>
            <small id={warningId}>{t('account.deleteWarning')}</small>
          </div>
        </div>
      </details>
    </div>
  );
}
