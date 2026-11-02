import { marketName as localizedMarketName } from '../lib/market-language';
import { uiText } from '../lib/ui-copy';
import { Camera, Menu, RefreshCw, Settings2, Trash2, UserRound } from 'lucide-react';
import { useRef, useState, type ChangeEvent } from 'react';
import { useTranslation } from 'react-i18next';
import type { CountryCode, PriceMode } from '../../shared/types';
import { MARKETS } from '../../shared/types';
import { updateAvatar } from '../lib/api';
import { AVATAR_ACCEPT, prepareAvatar } from '../lib/avatar';
import { useSession } from '../lib/session';
import { AccountSettings } from './AccountSettings';
import { CountryFlag } from './CountryFlag';
import './account-center.css';

interface AccountViewProps {
  market: CountryCode;
  priceMode: PriceMode;
  onMarketChange: (market: CountryCode) => void;
  onPriceModeChange: (mode: PriceMode) => void;
  onOpenSidebar: () => void;
  notify: (message: string) => void;
}

export function AccountView({ market, priceMode, onMarketChange, onPriceModeChange,
  onOpenSidebar, notify }: AccountViewProps) {
  const { i18n } = useTranslation();
  const { user, refresh: refreshSession, promptLogin } = useSession();
  const english = !i18n.language.startsWith('zh');
  const copy = (zh: string, en: string) => english ? uiText(en) : zh;
  const [avatarSaving, setAvatarSaving] = useState(false);
  const settingsHeadingRef = useRef<HTMLHeadingElement>(null);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  const name = user?.displayName?.trim() || copy('访客', 'Guest');
  const marketName = localizedMarketName(market, i18n.language);

  function openAvatarPicker() {
    if (!user) {
      promptLogin('account');
      return;
    }
    avatarInputRef.current?.click();
  }

  async function chooseAvatar(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!user) {
      promptLogin('account');
      return;
    }
    setAvatarSaving(true);
    try {
      const avatar = await prepareAvatar(file);
      await updateAvatar(avatar);
      await refreshSession();
      notify(copy('头像已更新', 'Avatar updated'));
    } catch (avatarError) {
      notify(avatarError instanceof Error ? avatarError.message : copy('头像上传失败', 'Avatar upload failed'));
    } finally {
      setAvatarSaving(false);
    }
  }

  async function removeAvatar() {
    setAvatarSaving(true);
    try {
      await updateAvatar('');
      await refreshSession();
      notify(copy('已恢复默认头像', 'Default avatar restored'));
    } catch (avatarError) {
      notify(avatarError instanceof Error ? avatarError.message : copy('头像移除失败', 'Could not remove avatar'));
    } finally {
      setAvatarSaving(false);
    }
  }

  return <section className="pc-page pc-account-center" aria-label={copy('个人中心', 'Your space')}>
    <header className="account-toolbar">
      <button type="button" className="account-icon-button account-menu" aria-label={copy('打开导航', 'Open navigation')} onClick={onOpenSidebar}><Menu size={21} /></button>
      <h1>{copy('个人中心', 'Your space')}</h1>
    </header>

    <div className="account-content">
      <div className="account-identity">
        <div className="account-avatar-editor">
          <button
            type="button"
            className="account-avatar"
            disabled={avatarSaving}
            onClick={openAvatarPicker}
            aria-label={copy('上传自定义头像', 'Upload a custom avatar')}
          >
            {user?.avatar
              ? <img src={user.avatar} alt="" />
              : <UserRound className="account-avatar-default" strokeWidth={1.3} aria-hidden="true" />}
            <span className="account-avatar-edit" aria-hidden="true">
              {avatarSaving ? <RefreshCw size={16} className="account-avatar-spin" /> : <Camera size={16} />}
            </span>
          </button>
          <input
            ref={avatarInputRef}
            className="account-avatar-input"
            type="file"
            accept={AVATAR_ACCEPT}
            onChange={(event) => void chooseAvatar(event)}
            disabled={avatarSaving || !user}
          />
          <small>{avatarSaving ? copy('正在处理头像…', 'Preparing avatar…') : user ? copy('点击更换头像', 'Click to change avatar') : copy('登录后设置头像', 'Sign in to add a photo')}</small>
        </div>
        <div className="account-intro">
          <div className="account-name-row"><h2>{name}</h2><span className="account-member-label">{copy(user ? 'Picolah 成员' : '本机访客', user ? 'Picolah member' : 'Guest on this browser')}</span></div>
          {user?.email && <p className="account-email">{user.email}</p>}
          <div className="account-context"><CountryFlag code={market} width={18} /><span>{marketName} · {MARKETS[market].currency}</span></div>
          <div className="account-actions">
            <button className="account-button account-button-primary" type="button" onClick={() => settingsHeadingRef.current?.focus()}><Settings2 size={15} />{copy('偏好设置', 'Preferences')}</button>
            <button className="account-button" type="button" disabled={avatarSaving} onClick={openAvatarPicker}><Camera size={15} />{copy(user?.avatar ? '更换头像' : '上传头像', user?.avatar ? 'Change avatar' : 'Upload avatar')}</button>
            {user?.avatar ? <button className="account-button" type="button" disabled={avatarSaving} onClick={() => void removeAvatar()}><Trash2 size={15} />{copy('恢复默认头像', 'Restore default')}</button> : null}
          </div>
        </div>
      </div>

      <section className="account-panel" aria-labelledby="account-settings-heading">
        <h3 id="account-settings-heading" className="account-settings-heading" ref={settingsHeadingRef} tabIndex={-1}>
          <Settings2 size={17} aria-hidden="true" />{copy('设置', 'Settings')}
        </h3>
        <AccountSettings market={market} priceMode={priceMode} onMarketChange={onMarketChange} onPriceModeChange={onPriceModeChange} notify={notify} />
      </section>
    </div>
  </section>;
}
