import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useSession } from '../lib/session';
import { Capybara } from './PicolahMark';

const COPY = {
  zh: {
    eyebrow: 'PICOLAH / 账户',
    title: '先 pico，再买。',
    body: '登录后，比价记录、购物画像和价格提醒会跟着你的账户走。',
    login: '登录',
    register: '注册',
    email: '邮箱',
    password: '密码',
    name: '昵称（可选）',
    submitLogin: '登录',
    submitRegister: '创建账户',
    switchToRegister: '还没有账户？注册一个',
    switchToLogin: '已有账户？直接登录',
    passwordHint: '至少 8 位',
    failed: '操作失败，请稍后再试。',
  },
  en: {
    eyebrow: 'PICOLAH / ACCOUNT',
    title: 'pico first. buy second.',
    body: 'Sign in to keep comparisons, your shopping profile, and price alerts with your account.',
    login: 'Sign in',
    register: 'Create account',
    email: 'Email',
    password: 'Password',
    name: 'Display name (optional)',
    submitLogin: 'Sign in',
    submitRegister: 'Create account',
    switchToRegister: 'No account yet? Create one',
    switchToLogin: 'Already have an account? Sign in',
    passwordHint: 'At least 8 characters',
    failed: 'Something went wrong. Try again.',
  },
} as const;

interface AuthCardProps {
  onSuccess?: () => void;
  compact?: boolean;
}

export function AuthCard({ onSuccess, compact = false }: AuthCardProps) {
  const { i18n } = useTranslation();
  const { login, register } = useSession();
  const text = i18n.language.startsWith('zh') ? COPY.zh : COPY.en;
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      if (mode === 'login') await login(email, password);
      else await register(email, password, displayName || undefined);
      onSuccess?.();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : text.failed);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className={`pc-auth-card ${compact ? 'is-compact' : ''}`}>
      <div className="pc-auth-mark">
        <Capybara size={compact ? 76 : 104} />
      </div>
      <p className="pc-eyebrow">{text.eyebrow}</p>
      <h1>{text.title}</h1>
      <p className="pc-auth-body">{text.body}</p>

      <div className="pc-auth-tabs" role="tablist">
        <button
          type="button"
          className={mode === 'login' ? 'is-active' : ''}
          onClick={() => {
            setMode('login');
            setError(null);
          }}
        >
          {text.login}
        </button>
        <button
          type="button"
          className={mode === 'register' ? 'is-active' : ''}
          onClick={() => {
            setMode('register');
            setError(null);
          }}
        >
          {text.register}
        </button>
      </div>

      <form onSubmit={submit} className="pc-auth-form">
        {mode === 'register' ? (
          <label>
            <span>{text.name}</span>
            <input
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              autoComplete="nickname"
              maxLength={60}
            />
          </label>
        ) : null}
        <label>
          <span>{text.email}</span>
          <input
            type="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoComplete="email"
            placeholder="you@example.com"
          />
        </label>
        <label>
          <span>{text.password}</span>
          <input
            type="password"
            required
            minLength={8}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            placeholder={text.passwordHint}
          />
        </label>
        {error ? <p className="pc-auth-error">{error}</p> : null}
        <button type="submit" className="pc-auth-submit" disabled={submitting}>
          {submitting ? '…' : mode === 'login' ? text.submitLogin : text.submitRegister}
        </button>
      </form>

      <button
        type="button"
        className="pc-auth-switch"
        onClick={() => {
          setMode(mode === 'login' ? 'register' : 'login');
          setError(null);
        }}
      >
        {mode === 'login' ? text.switchToRegister : text.switchToLogin}
      </button>
    </div>
  );
}

export function AuthView() {
  return (
    <main className="pc-auth">
      <div className="pc-auth-glow" aria-hidden="true" />
      <AuthCard />
    </main>
  );
}
