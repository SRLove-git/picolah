import { localizeCopy } from '../lib/ui-copy';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  Bell,
  Check,
  Plus,
  MessageCircle,
  RefreshCw,
  Search,
  Send,
  UserPlus,
  UsersRound,
  X,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useSession } from '../lib/session';
import {
  getMessages,
  getRadar,
  postMessage,
  respondFriendRequest,
  type FriendRequestView,
  type FriendView,
  type RadarData,
  type SocialMessage,
} from '../lib/social';
import { PageHeader } from './PageHeader';
import './friends.css';

const COPY = {
  zh: {
    eyebrow: 'FRIENDS',
    title: '好友',
    description: '查看好友，和懂你消费偏好的人继续聊天。',
    selectChat: '选择一位好友，开始聊天',
    back: '返回好友列表',
    clearSearch: '清除搜索',
    draft: '[草稿]',
    sendHint: 'Enter 发送 · Shift + Enter 换行',
    loadingMessages: '正在加载消息…',
    retry: '重试',
    yesterday: '昨天',
    refresh: '刷新',
    guestTitle: '登录后查看好友',
    guestBody: '好友请求、未读消息和聊天记录都会安全地保存在你的账户中。',
    guestCta: '登录 / 注册',
    friends: '好友',
    requests: '好友请求',
    unread: '未读消息',
    notifications: '通知',
    notificationEmpty: '暂时没有新通知',
    notificationSummaryOne: '条新动态',
    notificationSummary: '条新动态',
    messageTitle: '未读消息',
    requestTitle: '待处理请求',
    requestEmpty: '暂无新的好友请求',
    friendTitle: '我的好友',
    friendEmpty: '还没有好友，去雷达发现与你偏好相近的人。',
    searchFriends: '搜索好友',
    searchEmpty: '没有找到匹配的好友',
    contacts: '位联系人',
    openRadar: '去雷达找好友',
    accept: '接受',
    decline: '拒绝',
    chat: '聊天',
    noMessage: '还没有消息，打个招呼吧。',
    messagePlaceholder: '说点什么…',
    send: '发送',
    close: '关闭',
    chatEmpty: '打个招呼吧。',
    friendAdded: '已添加好友',
    loading: '正在加载好友…',
  },
  en: {
    eyebrow: 'FRIENDS',
    title: 'Friends',
    description: 'See your friends and keep chatting with people who get your shopping taste.',
    selectChat: 'Choose a friend to start chatting',
    back: 'Back to friends',
    clearSearch: 'Clear search',
    draft: '[Draft]',
    sendHint: 'Enter to send · Shift + Enter for a new line',
    loadingMessages: 'Loading messages…',
    retry: 'Retry',
    yesterday: 'Yesterday',
    refresh: 'Refresh',
    guestTitle: 'Sign in to see friends',
    guestBody: 'Friend requests, unread messages and conversations stay safely with your account.',
    guestCta: 'Sign in / Sign up',
    friends: 'Friends',
    requests: 'Requests',
    unread: 'Unread',
    notifications: 'Notifications',
    notificationEmpty: 'You are all caught up',
    notificationSummaryOne: 'new update',
    notificationSummary: 'new updates',
    messageTitle: 'Unread messages',
    requestTitle: 'Pending requests',
    requestEmpty: 'No new friend requests',
    friendTitle: 'My friends',
    friendEmpty: 'No friends yet. Use Radar to find people with similar taste.',
    searchFriends: 'Search friends',
    searchEmpty: 'No matching friends',
    contacts: 'contacts',
    openRadar: 'Find friends on Radar',
    accept: 'Accept',
    decline: 'Decline',
    chat: 'Chat',
    noMessage: 'No messages yet — say hello.',
    messagePlaceholder: 'Say something…',
    send: 'Send',
    close: 'Close',
    chatEmpty: 'Say hello.',
    friendAdded: 'Friend added',
    loading: 'Loading friends…',
  },
} as const;

interface FriendsViewProps {
  onOpenSidebar: () => void;
  onOpenRadar: () => void;
  notify: (message: string) => void;
}

function initial(name: string): string {
  return (name || '?').slice(0, 1).toUpperCase();
}

function tint(seed: string): string {
  let value = 0;
  for (let index = 0; index < seed.length; index += 1) value = (value * 31 + seed.charCodeAt(index)) % 360;
  return `hsl(${value} 62% 92%)`;
}

export function FriendsView({ onOpenSidebar, onOpenRadar, notify }: FriendsViewProps) {
  const { i18n } = useTranslation();
  const en = !i18n.language.startsWith('zh');
  const copy = en ? localizeCopy(COPY.en) : COPY.zh;
  const { user, promptLogin } = useSession();
  const [data, setData] = useState<RadarData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState('');
  const [chatWith, setChatWith] = useState<FriendView | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [friendQuery, setFriendQuery] = useState('');
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const notificationsRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError('');
    try {
      setData(await getRadar());
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : copy.loading);
    } finally {
      setLoading(false);
    }
  }, [user, copy.loading]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!notificationsOpen) return;

    function closeOnOutsideClick(event: PointerEvent) {
      if (!notificationsRef.current?.contains(event.target as Node)) setNotificationsOpen(false);
    }

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') setNotificationsOpen(false);
    }

    document.addEventListener('pointerdown', closeOnOutsideClick);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsideClick);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [notificationsOpen]);

  async function respond(request: FriendRequestView, accept: boolean) {
    setBusyId(request.id);
    try {
      await respondFriendRequest(request.id, accept);
      if (accept) notify(copy.friendAdded);
      await load();
    } catch (requestError) {
      notify(requestError instanceof Error ? requestError.message : copy.loading);
    } finally {
      setBusyId('');
    }
  }

  function openChat(friend: FriendView) {
    setNotificationsOpen(false);
    setChatWith(friend);
  }

  const updateConversation = useCallback((friendId: string, latest?: SocialMessage) => {
    setData((current) => current ? {
      ...current,
      friends: current.friends.map((friend) => friend.id === friendId ? {
        ...friend,
        unread: 0,
        ...(latest && (!friend.lastMessageAt || latest.createdAt >= friend.lastMessageAt)
          ? { lastMessage: latest.body, lastMessageAt: latest.createdAt } : {}),
      } : friend),
    } : current);
  }, []);

  const friends = data?.friends ?? [];
  const incoming = data?.incoming ?? [];
  const unread = friends.reduce((total, friend) => total + friend.unread, 0);
  const unreadFriends = friends.filter((friend) => friend.unread > 0);
  const notificationCount = incoming.length + unread;
  const visibleFriends = useMemo(() => {
    const query = friendQuery.trim().toLocaleLowerCase();
    const collator = new Intl.Collator(i18n.language, { sensitivity: 'base' });
    return friends
      .slice()
      .filter((friend) => !query || friend.displayName.toLocaleLowerCase().includes(query))
      .sort((left, right) => {
        const recent = (Date.parse(right.lastMessageAt ?? '') || 0) - (Date.parse(left.lastMessageAt ?? '') || 0);
        return recent || collator.compare(left.displayName, right.displayName);
      });
  }, [en, friendQuery, friends]);

  return (
    <section className={`pc-page pc-friends-page ${chatWith ? 'has-conversation' : ''}`} aria-label={copy.title}>
      <PageHeader
        eyebrow={copy.eyebrow}
        title={copy.title}
        onOpenSidebar={onOpenSidebar}
      >
        {user ? (
          <div className="friends-head-actions">
            <div className="friends-notification-anchor" ref={notificationsRef}>
              <button
                type="button"
                className={`friends-bell ${notificationsOpen ? 'is-active' : ''}`}
                aria-label={copy.notifications}
                aria-haspopup="dialog"
                aria-expanded={notificationsOpen}
                aria-controls="friends-notifications"
                onClick={() => setNotificationsOpen((open) => !open)}
              >
                <Bell size={17} />
                {notificationCount > 0 ? (
                  <span>{notificationCount > 99 ? '99+' : notificationCount}</span>
                ) : null}
              </button>

              {notificationsOpen ? (
                <aside
                  id="friends-notifications"
                  className="friends-notifications"
                  role="dialog"
                  aria-label={copy.notifications}
                >
                  <header className="friends-notifications-head">
                    <div>
                      <strong>{copy.notifications}</strong>
                      <small>
                        {notificationCount > 0
                          ? `${notificationCount} ${notificationCount === 1 ? copy.notificationSummaryOne : copy.notificationSummary}`
                          : copy.notificationEmpty}
                      </small>
                    </div>
                    <button type="button" onClick={() => setNotificationsOpen(false)} aria-label={copy.close}>
                      <X size={15} />
                    </button>
                  </header>

                  {notificationCount === 0 ? (
                    <div className="friends-notifications-empty">
                      <span><Bell size={20} /></span>
                      <p>{copy.notificationEmpty}</p>
                    </div>
                  ) : (
                    <div className="friends-notifications-content">
                      {incoming.length > 0 ? (
                        <section className="friends-notification-section">
                          <header>
                            <h3><UserPlus size={14} />{copy.requestTitle}</h3>
                            <span>{incoming.length}</span>
                          </header>
                          <ul>
                            {incoming.map((request) => (
                              <li key={request.id}>
                                <span className="friends-contact-avatar" style={{ background: tint(request.userId) }}>
                                  {request.avatar ? <img src={request.avatar} alt="" /> : initial(request.displayName)}
                                </span>
                                <span className="friends-notification-person">
                                  <strong>{request.displayName}</strong>
                                  <small>{copy.requests}</small>
                                </span>
                                <span className="friends-notification-actions">
                                  <button
                                    type="button"
                                    className="is-accept"
                                    disabled={busyId === request.id}
                                    onClick={() => void respond(request, true)}
                                    aria-label={`${copy.accept} ${request.displayName}`}
                                  >
                                    <Check size={14} />
                                  </button>
                                  <button
                                    type="button"
                                    disabled={busyId === request.id}
                                    onClick={() => void respond(request, false)}
                                    aria-label={`${copy.decline} ${request.displayName}`}
                                  >
                                    <X size={14} />
                                  </button>
                                </span>
                              </li>
                            ))}
                          </ul>
                        </section>
                      ) : null}

                      {unreadFriends.length > 0 ? (
                        <section className="friends-notification-section">
                          <header>
                            <h3><MessageCircle size={14} />{copy.messageTitle}</h3>
                            <span>{unread}</span>
                          </header>
                          <ul>
                            {unreadFriends.map((friend) => (
                              <li key={friend.id} className="friends-message-notification-item">
                                <button type="button" className="friends-message-notification" onClick={() => openChat(friend)}>
                                  <span className="friends-contact-avatar" style={{ background: tint(friend.id) }}>
                                    {friend.avatar ? <img src={friend.avatar} alt="" /> : initial(friend.displayName)}
                                  </span>
                                  <span className="friends-notification-person">
                                    <strong>{friend.displayName}</strong>
                                    <small>{friend.lastMessage ?? copy.noMessage}</small>
                                  </span>
                                  <span className="friends-notification-count">{friend.unread}</span>
                                </button>
                              </li>
                            ))}
                          </ul>
                        </section>
                      ) : null}
                    </div>
                  )}
                </aside>
              ) : null}
            </div>

            <button type="button" className="friends-icon-button" title={copy.refresh} aria-label={copy.refresh} onClick={() => void load()} disabled={loading}>
              <RefreshCw size={14} className={loading ? 'friends-spin' : undefined} />
            </button>
          </div>
        ) : null}
      </PageHeader>

      <div className="friends-body">
        {!user ? (
          <div className="friends-guest">
            <MessageCircle size={54} strokeWidth={1.2} />
            <h2>{copy.guestTitle}</h2>
            <p>{copy.guestBody}</p>
            <button type="button" className="friends-primary" onClick={() => promptLogin('friends')}>
              {copy.guestCta}
            </button>
          </div>
        ) : (
          <>
            <aside className="friends-list-panel" aria-label={copy.friendTitle}>
              <div className="friends-list-toolbar">
                <label className="friends-search">
                  <Search size={15} aria-hidden="true" />
                  <input type="search" value={friendQuery} onChange={(event) => setFriendQuery(event.target.value)}
                    placeholder={copy.searchFriends} aria-label={copy.searchFriends} />
                  {friendQuery ? (
                    <button type="button" onClick={() => setFriendQuery('')} aria-label={copy.clearSearch}>
                      <X size={13} />
                    </button>
                  ) : null}
                </label>
                <button type="button" className="friends-icon-button friends-add" onClick={onOpenRadar}
                  title={copy.openRadar} aria-label={copy.openRadar}><Plus size={20} /></button>
              </div>
              {error ? <div className="friends-error" role="alert">{error}</div> : null}
              <div className="friends-contacts-scroll" aria-busy={loading}>
                {loading && !data ? <p className="friends-status" role="status">{copy.loading}</p> : friends.length ? (
                  visibleFriends.length ? (
                    <ul className="friends-contacts">
                      {visibleFriends.map((friend) => (
                        <li key={friend.id}>
                          <button type="button"
                            className={`friends-contact-row ${chatWith?.id === friend.id ? 'is-selected' : ''}`}
                            onClick={() => openChat(friend)} aria-label={`${copy.chat} ${friend.displayName}`}
                            aria-pressed={chatWith?.id === friend.id}>
                            <span className="friends-avatar-wrap">
                              <span className="friends-contact-avatar" style={{ background: tint(friend.id) }}>
                                {friend.avatar ? <img src={friend.avatar} alt="" /> : initial(friend.displayName)}
                              </span>
                              {friend.unread > 0 ? <span className="friends-unread" aria-label={`${copy.unread}: ${friend.unread}`}>
                                {friend.unread > 99 ? '99+' : friend.unread}
                              </span> : null}
                            </span>
                            <span className="friends-contact-copy">
                              <span className="friends-contact-top"><strong>{friend.displayName}</strong>
                                {friend.lastMessageAt ? <time dateTime={friend.lastMessageAt}>{formatTime(friend.lastMessageAt, en)}</time> : null}
                              </span>
                              <span className="friends-contact-preview">
                                {drafts[friend.id]?.trim() ? <><em>{copy.draft}</em> {drafts[friend.id]}</> : friend.lastMessage || copy.noMessage}
                              </span>
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : <div className="friends-empty"><Search size={26} /><p>{copy.searchEmpty}</p></div>
                ) : !error ? (
                  <div className="friends-empty">
                    <UsersRound size={32} strokeWidth={1.4} /><p>{copy.friendEmpty}</p>
                    <button type="button" className="friends-text-button" onClick={onOpenRadar}>{copy.openRadar}</button>
                  </div>
                ) : null}
              </div>
              <footer className="friends-contact-total"><UsersRound size={13} />{friends.length} {copy.contacts}</footer>
            </aside>
            {chatWith ? (
              <FriendConversation key={chatWith.id} friend={chatWith} userId={user.id} userName={user.displayName}
                userAvatar={user.avatar} en={en} draft={drafts[chatWith.id] ?? ''}
                onDraftChange={(value, expected) => setDrafts((current) => expected !== undefined && current[chatWith.id] !== expected
                  ? current : { ...current, [chatWith.id]: value })}
                onClose={() => setChatWith(null)} onUpdate={updateConversation} notify={notify} />
            ) : (
              <div className="friends-conversation-placeholder">
                <MessageCircle size={76} strokeWidth={1} aria-hidden="true" />
                <span>Picolah</span><p>{copy.selectChat}</p>
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
}

function formatTime(value: string, en: boolean, full = false): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const locale = document.documentElement.lang || 'en';
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const clock = date.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit', hour12: false });
  if (date.toDateString() === today.toDateString()) return clock;
  if (date.toDateString() === yesterday.toDateString()) return `${en ? localizeCopy(COPY.en).yesterday : COPY.zh.yesterday}${full ? ` ${clock}` : ''}`;
  return `${date.toLocaleDateString(locale, { ...(date.getFullYear() !== today.getFullYear() ? { year: 'numeric' } : {}), month: 'numeric', day: 'numeric' })}${full ? ` ${clock}` : ''}`;
}

function FriendConversation({ friend, userId, userName, userAvatar, en, draft, onDraftChange, onClose, onUpdate, notify }: {
  friend: FriendView;
  userId: string;
  userName: string;
  userAvatar: string;
  en: boolean;
  draft: string;
  onDraftChange: (value: string, expected?: string) => void;
  onClose: () => void;
  onUpdate: (friendId: string, latest?: SocialMessage) => void;
  notify: (message: string) => void;
}) {
  const copy = en ? localizeCopy(COPY.en) : COPY.zh;
  const [messages, setMessages] = useState<SocialMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);
  const [retry, setRetry] = useState(0);
  const lastAtRef = useRef('');
  const listRef = useRef<HTMLDivElement>(null);
  const nearBottomRef = useRef(true);
  const sendingRef = useRef(false);
  const draftRef = useRef(draft);
  draftRef.current = draft;

  useEffect(() => {
    let active = true;
    let timer = 0;
    async function poll() {
      try {
        const list = await getMessages(friend.id, lastAtRef.current);
        if (!active) return;
        if (list.length) {
          lastAtRef.current = list[list.length - 1].createdAt;
          setMessages((current) => [...new Map([...current, ...list].map((message) => [message.id, message])).values()]
            .sort((a, b) => a.createdAt.localeCompare(b.createdAt)));
        }
        onUpdate(friend.id, list.at(-1));
        setError('');
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : copy.loadingMessages);
      } finally {
        if (active) {
          setLoading(false);
          timer = window.setTimeout(poll, 3000);
        }
      }
    }
    void poll();
    return () => { active = false; window.clearTimeout(timer); };
  }, [friend.id, onUpdate, copy.loadingMessages, retry]);

  useEffect(() => {
    if (nearBottomRef.current && listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [messages]);

  async function send() {
    const body = draft.trim();
    if (!body || sendingRef.current) return;
    sendingRef.current = true;
    setSending(true);
    try {
      const message = await postMessage(friend.id, body);
      nearBottomRef.current = true;
      setMessages((current) => [...new Map([...current, message].map((item) => [item.id, item])).values()]
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt)));
      onUpdate(friend.id, message);
      if (draftRef.current.trim() === body) onDraftChange('', draft);
    } catch (cause) {
      notify(cause instanceof Error ? cause.message : copy.loadingMessages);
    } finally {
      sendingRef.current = false;
      setSending(false);
    }
  }

  return (
    <section className="friends-conversation" aria-label={`${copy.chat} ${friend.displayName}`}>
      <header className="friends-conversation-head">
        <button type="button" className="friends-icon-button friends-back" onClick={onClose} aria-label={copy.back}><ArrowLeft size={21} /></button>
        <div><h2>{friend.displayName}</h2><span>{copy.friends}</span></div>
        <button type="button" className="friends-icon-button friends-close" onClick={onClose} aria-label={copy.close}><X size={18} /></button>
      </header>
      {error ? <div className="friends-error" role="alert">{error}<button type="button" onClick={() => setRetry((value) => value + 1)}>{copy.retry}</button></div> : null}
      <div className="friends-message-list" ref={listRef} role="log" aria-label={copy.chat} aria-busy={loading}
        onScroll={(event) => { const element = event.currentTarget; nearBottomRef.current = element.scrollHeight - element.scrollTop - element.clientHeight < 80; }}>
        {loading ? <p className="friends-status">{copy.loadingMessages}</p> : messages.length === 0 && !error ? <p className="friends-status">{copy.chatEmpty}</p> : null}
        {messages.map((message, index) => {
          const mine = message.fromUser === userId;
          const previous = messages[index - 1];
          const showTime = !previous || Date.parse(message.createdAt) - Date.parse(previous.createdAt) > 5 * 60 * 1000;
          const avatar = mine ? userAvatar : friend.avatar;
          return (
            <div className="friends-message-group" key={message.id}>
              {showTime ? <time className="friends-message-time" dateTime={message.createdAt}>{formatTime(message.createdAt, en, true)}</time> : null}
              <div className={`friends-message ${mine ? 'is-mine' : ''}`}>
                <span className="friends-contact-avatar" style={{ background: tint(mine ? userId : friend.id) }}>
                  {avatar ? <img src={avatar} alt="" /> : initial(mine ? userName : friend.displayName)}
                </span>
                <div className="friends-bubble">{message.body}</div>
              </div>
            </div>
          );
        })}
      </div>
      <form className="friends-composer" onSubmit={(event) => { event.preventDefault(); void send(); }}>
        <textarea value={draft} onChange={(event) => onDraftChange(event.target.value)} placeholder={copy.messagePlaceholder}
          aria-label={copy.messagePlaceholder} maxLength={1000} rows={3}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing && event.keyCode !== 229) {
              event.preventDefault(); void send();
            }
          }} />
        <div className="friends-composer-footer"><span>{copy.sendHint}</span>
          <button type="submit" className="friends-primary" disabled={sending || !draft.trim()}><Send size={14} />{copy.send}</button>
        </div>
      </form>
    </section>
  );
}
