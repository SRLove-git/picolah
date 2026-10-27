import { useEffect, useState, type FormEvent } from 'react';
import { ChevronLeft } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { requestEmailCode, requestPasswordReset, resetPassword } from '../lib/api';
import { useSession } from '../lib/session';

const COPY = {
  zh: {
    eyebrow: 'PICOLAH',
    titleLogin: '登录',
    titleRegister: '创建账户',
    titleForgot: '找回密码',
    titleReset: '重置密码',
    bodyLogin: '登录后，比价记录与价格提醒会同步到你的账户。',
    bodyRegister: '使用邮箱注册，验证码 10 分钟内有效。',
    bodyForgot: '输入注册邮箱，我们会发送验证码。',
    bodyReset: '输入验证码，并设置一个新的密码。',
    login: '登录',
    register: '注册',
    email: '邮箱',
    password: '密码',
    newPassword: '新密码',
    name: '昵称（可选）',
    code: '验证码',
    sendCode: '获取验证码',
    resend: '重新发送',
    submitLogin: '登录',
    submitRegister: '创建账户',
    submitForgot: '发送验证码',
    submitReset: '重置密码',
    switchToRegister: '还没有账户？注册一个',
    switchToLogin: '已有账户？直接登录',
    forgot: '忘记密码？',
    back: '返回登录',
    passwordHint: '至少 8 位',
    codeHint: '6 位数字',
    codeSent: '验证码已发送，请查收邮箱。',
    resetDone: '密码已重置，请重新登录。',
    devCode: '本地调试验证码：{{code}}',
    emailRequired: '请先填写邮箱。',
    failed: '操作失败，请稍后再试。',
  },
  en: {
    eyebrow: 'PICOLAH',
    titleLogin: 'Sign in',
    titleRegister: 'Create account',
    titleForgot: 'Reset your password',
    titleReset: 'Set a new password',
    bodyLogin: 'Comparisons and price alerts stay with your account.',
    bodyRegister: 'Register with email. The code is valid for 10 minutes.',
    bodyForgot: 'Enter your account email and we will send a code.',
    bodyReset: 'Enter the code and choose a new password.',
    login: 'Sign in',
    register: 'Create account',
    email: 'Email',
    password: 'Password',
    newPassword: 'New password',
    name: 'Display name (optional)',
    code: 'Verification code',
    sendCode: 'Send code',
    resend: 'Resend',
    submitLogin: 'Sign in',
    submitRegister: 'Create account',
    submitForgot: 'Send code',
    submitReset: 'Reset password',
    switchToRegister: 'No account yet? Create one',
    switchToLogin: 'Already have an account? Sign in',
    forgot: 'Forgot password?',
    back: 'Back to sign in',
    passwordHint: 'At least 8 characters',
    codeHint: '6 digits',
    codeSent: 'Code sent. Check your inbox.',
    resetDone: 'Password updated. Please sign in again.',
    devCode: 'Local debug code: {{code}}',
    emailRequired: 'Enter your email first.',
    failed: 'Something went wrong. Try again.',
  },
} as const;

type Mode = 'login' | 'register' | 'forgot' | 'reset';

interface AuthCardProps {
  onSuccess?: () => void;
  compact?: boolean;
}

export function AuthCard({ onSuccess, compact = false }: AuthCardProps) {
  const { i18n } = useTranslation();
  const { login, register } = useSession();
  const text = i18n.language.startsWith('zh') ? COPY.zh : COPY.en;
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [sending, setSending] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [devCode, setDevCode] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = window.setTimeout(() => setCooldown((value) => value - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [cooldown]);

  function switchMode(next: Mode) {
    setMode(next);
    setError(null);
    setNotice(null);
    setDevCode(null);
    setCode('');
    setPassword('');
    setCooldown(0);
  }

  async function sendCode(purpose: 'register' | 'reset'): Promise<boolean> {
    if (!email.trim()) {
      setError(text.emailRequired);
      return false;
    }
    setSending(true);
    setError(null);
    try {
      if (purpose === 'register') {
        const result = await requestEmailCode(email.trim(), 'register');
        setDevCode(result.devCode ?? null);
      } else {
        const result = await requestPasswordReset(email.trim());
        setDevCode(result.devCode ?? null);
      }
      setCooldown(60);
      setNotice(text.codeSent);
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : text.failed);
      return false;
    } finally {
      setSending(false);
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      if (mode === 'login') {
        await login(email, password);
        onSuccess?.();
      } else if (mode === 'register') {
        await register(email, password, code, displayName || undefined);
        onSuccess?.();
      } else if (mode === 'forgot') {
        const sent = await sendCode('reset');
        if (sent) setMode('reset');
      } else {
        await resetPassword(email, code, password);
        setMode('login');
        setNotice(text.resetDone);
        setCode('');
        setPassword('');
        setCooldown(0);
        setDevCode(null);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : text.failed);
    } finally {
      setSubmitting(false);
    }
  }

  const title =
    mode === 'login'
      ? text.titleLogin
      : mode === 'register'
        ? text.titleRegister
        : mode === 'forgot'
          ? text.titleForgot
          : text.titleReset;
  const body =
    mode === 'login'
      ? text.bodyLogin
      : mode === 'register'
        ? text.bodyRegister
        : mode === 'forgot'
          ? text.bodyForgot
          : text.bodyReset;

  return (
    <div className={`pc-auth-card ${compact ? 'is-compact' : ''}`}>
      <p className="pc-eyebrow">{text.eyebrow}</p>
      <h1>{title}</h1>
      <p className="pc-auth-body">{body}</p>

      {mode === 'login' || mode === 'register' ? (
        <div className="pc-auth-tabs" role="tablist">
          <button
            type="button"
            className={mode === 'login' ? 'is-active' : ''}
            onClick={() => switchMode('login')}
          >
            {text.login}
          </button>
          <button
            type="button"
            className={mode === 'register' ? 'is-active' : ''}
            onClick={() => switchMode('register')}
          >
            {text.register}
          </button>
        </div>
      ) : null}

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
            readOnly={mode === 'reset'}
          />
        </label>

        {mode === 'register' || mode === 'reset' ? (
          <label>
            <span>{text.code}</span>
            <span className="pc-auth-code">
              <input
                inputMode="numeric"
                pattern="\d{6}"
                maxLength={6}
                required
                value={code}
                onChange={(event) => setCode(event.target.value.replace(/\D/g, ''))}
                autoComplete="one-time-code"
                placeholder={text.codeHint}
              />
              <button
                type="button"
                onClick={() => void sendCode(mode === 'register' ? 'register' : 'reset')}
                disabled={sending || cooldown > 0}
              >
                {cooldown > 0 ? `${text.resend} ${cooldown}s` : text.sendCode}
              </button>
            </span>
          </label>
        ) : null}

        {mode === 'login' || mode === 'register' || mode === 'reset' ? (
          <label>
            <span>{mode === 'reset' ? text.newPassword : text.password}</span>
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
        ) : null}

        {mode === 'login' ? (
          <button type="button" className="pc-auth-link" onClick={() => switchMode('forgot')}>
            {text.forgot}
          </button>
        ) : null}

        {devCode ? <p className="pc-auth-dev">{text.devCode.replace('{{code}}', devCode)}</p> : null}
        {notice && !error ? <p className="pc-auth-notice">{notice}</p> : null}
        {error ? <p className="pc-auth-error">{error}</p> : null}

        <button type="submit" className="pc-auth-submit" disabled={submitting}>
          {submitting
            ? '…'
            : mode === 'login'
              ? text.submitLogin
              : mode === 'register'
                ? text.submitRegister
                : mode === 'forgot'
                  ? text.submitForgot
                  : text.submitReset}
        </button>
      </form>

      {mode === 'login' ? (
        <button type="button" className="pc-auth-switch" onClick={() => switchMode('register')}>
          {text.switchToRegister}
        </button>
      ) : mode === 'register' ? (
        <button type="button" className="pc-auth-switch" onClick={() => switchMode('login')}>
          {text.switchToLogin}
        </button>
      ) : (
        <button type="button" className="pc-auth-back" onClick={() => switchMode('login')}>
          <ChevronLeft size={14} />
          {text.back}
        </button>
      )}
    </div>
  );
}

export function AuthView() {
  return (
    <main className="pc-auth">
      <AuthCard />
    </main>
  );
}
