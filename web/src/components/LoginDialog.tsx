import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react';
import { useSession } from '../lib/session';
import { AuthCard } from './AuthView';

const REASONS = {
  watchlist: {
    zh: '登录后就能关注商品，并在降价时收到提醒。',
    en: 'Sign in to watch products and get price alerts.',
  },
  account: {
    zh: '登录后即可管理账号、隐私与数据。',
    en: 'Sign in to manage your account, privacy and data.',
  },
  default: {
    zh: '登录后，比价记录、购物画像和价格提醒会跟着你的账户走。',
    en: 'Sign in to keep comparisons, your profile and alerts with your account.',
  },
} as const;

export function LoginDialog() {
  const { i18n } = useTranslation();
  const { loginPrompt, closeLoginPrompt } = useSession();
  const en = i18n.language.startsWith('en');

  useEffect(() => {
    if (!loginPrompt) return;
    function handleKey(event: KeyboardEvent) {
      if (event.key === 'Escape') closeLoginPrompt();
    }
    document.addEventListener('keydown', handleKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [loginPrompt, closeLoginPrompt]);

  if (!loginPrompt) return null;
  const reason = REASONS[loginPrompt.reason as keyof typeof REASONS] ?? REASONS.default;

  return (
    <div
      className="pc-login-scrim"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) closeLoginPrompt();
      }}
    >
      <div
        className="pc-login-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={en ? 'Sign in to Picolah' : '登录 Picolah'}
      >
        <button
          type="button"
          className="pc-login-close"
          onClick={closeLoginPrompt}
          aria-label={en ? 'Close' : '关闭'}
        >
          <X size={18} />
        </button>
        <p className="pc-login-reason">{en ? reason.en : reason.zh}</p>
        <AuthCard compact onSuccess={closeLoginPrompt} />
      </div>
    </div>
  );
}
