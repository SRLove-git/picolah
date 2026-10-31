import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Bell,
  Check,
  ChevronRight,
  MessageCircle,
  Radar,
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
import './radar.css';
import './friends.css';

const COPY = {
  zh: {
    eyebrow: 'FRIENDS',
    title: '好友',
    description: '查看好友，和懂你消费偏好的人继续聊天。',
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
  const en = i18n.language.startsWith('en');
  const copy = en ? COPY.en : COPY.zh;
  const { user, promptLogin } = useSession();
  const [data, setData] = useState<RadarData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState('');
  const [chatWith, setChatWith] = useState<FriendView | null>(null);
  const [messages, setMessages] = useState<SocialMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [friendQuery, setFriendQuery] = useState('');
  const [sending, setSending] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const notificationsRef = useRef<HTMLDivElement>(null);
  const lastAtRef = useRef('');

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
    if (!chatWith) return;
    let active = true;
    let timer = 0;

    async function poll() {
      try {
        const list = await getMessages(chatWith!.id, lastAtRef.current);
        if (!active) return;
        if (list.length) {
          lastAtRef.current = list[list.length - 1].createdAt;
          setMessages((current) => [...current, ...list]);
        }
      } catch {
        // Polling is best-effort; the next tick retries.
      } finally {
        if (active) timer = window.setTimeout(poll, 3000);
      }
    }

    void poll();
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [chatWith]);

  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [messages]);

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
    lastAtRef.current = '';
    setMessages([]);
    setDraft('');
    setChatWith(friend);
  }

  async function send() {
    const body = draft.trim();
    if (!body || !chatWith || sending) return;
    setSending(true);
    try {
      const message = await postMessage(chatWith.id, body);
      setMessages((current) => [...current, message]);
      lastAtRef.current = message.createdAt;
      setDraft('');
    } catch (sendError) {
      notify(sendError instanceof Error ? sendError.message : copy.loading);
    } finally {
      setSending(false);
    }
  }

  const friends = data?.friends ?? [];
  const incoming = data?.incoming ?? [];
  const unread = friends.reduce((total, friend) => total + friend.unread, 0);
  const unreadFriends = friends.filter((friend) => friend.unread > 0);
  const notificationCount = incoming.length + unread;
  const visibleFriends = useMemo(() => {
    const query = friendQuery.trim().toLocaleLowerCase();
    const collator = new Intl.Collator(en ? 'en' : 'zh-CN', { sensitivity: 'base' });
    return friends
      .slice()
      .filter((friend) => !query || friend.displayName.toLocaleLowerCase().includes(query))
      .sort((left, right) => collator.compare(left.displayName, right.displayName));
  }, [en, friendQuery, friends]);

  return (
    <section className="pc-page pc-friends-page" aria-label={copy.title}>
      <PageHeader
        eyebrow={copy.eyebrow}
        title={copy.title}
        description={copy.description}
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
                                <span className="radar-avatar" style={{ background: tint(request.userId) }}>
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
                                  <span className="radar-avatar" style={{ background: tint(friend.id) }}>
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

            <button type="button" className="pc-outline-button" onClick={() => void load()} disabled={loading}>
              <RefreshCw size={14} className={loading ? 'radar-spin' : undefined} />
              {copy.refresh}
            </button>
          </div>
        ) : null}
      </PageHeader>

      <div className="pc-page-body friends-body">
        {!user ? (
          <div className="radar-guest">
            <span className="radar-guest-icon"><UsersRound size={30} strokeWidth={1.6} /></span>
            <h2>{copy.guestTitle}</h2>
            <p>{copy.guestBody}</p>
            <button type="button" className="pc-primary-button" onClick={() => promptLogin('friends')}>
              {copy.guestCta}
            </button>
          </div>
        ) : (
          <>
            <section className="radar-panel friends-panel friends-list-panel">
              <header className="radar-panel-head">
                <h3>{copy.friendTitle}</h3>
                <span className="radar-count">{friends.length}</span>
              </header>
              {friends.length ? (
                <div className="friends-contacts-shell">
                  <label className="friends-search">
                    <Search size={15} />
                    <input
                      type="search"
                      value={friendQuery}
                      onChange={(event) => setFriendQuery(event.target.value)}
                      placeholder={copy.searchFriends}
                      aria-label={copy.searchFriends}
                    />
                    {friendQuery ? (
                      <button type="button" onClick={() => setFriendQuery('')} aria-label={copy.close}>
                        <X size={13} />
                      </button>
                    ) : null}
                  </label>

                  {visibleFriends.length ? (
                    <ul className="friends-contacts">
                      {visibleFriends.map((friend) => (
                        <li key={friend.id}>
                          <button
                            type="button"
                            className="friends-contact-row"
                            onClick={() => openChat(friend)}
                            aria-label={`${copy.chat} ${friend.displayName}`}
                          >
                            <span className="friends-contact-avatar" style={{ background: tint(friend.id) }}>
                              {friend.avatar ? <img src={friend.avatar} alt="" /> : initial(friend.displayName)}
                            </span>
                            <strong>{friend.displayName}</strong>
                            <ChevronRight size={16} />
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <div className="friends-search-empty">
                      <UsersRound size={22} />
                      <p>{copy.searchEmpty}</p>
                    </div>
                  )}

                  <p className="friends-contact-total">{friends.length} {copy.contacts}</p>
                </div>
              ) : (
                <div className="friends-empty">
                  <span><Radar size={24} /></span>
                  <p>{copy.friendEmpty}</p>
                  <button type="button" className="radar-action" onClick={onOpenRadar}>
                    <Radar size={13} />{copy.openRadar}
                  </button>
                </div>
              )}
            </section>

            {error ? <p className="radar-error">{error}</p> : null}
          </>
        )}
      </div>

      {chatWith ? (
        <div className="radar-chat" role="dialog" aria-label={copy.chat}>
          <header className="radar-chat-head">
            <span className="radar-avatar" style={{ background: tint(chatWith.id) }}>
              {chatWith.avatar ? <img src={chatWith.avatar} alt="" /> : initial(chatWith.displayName)}
            </span>
            <strong>{chatWith.displayName}</strong>
            <button
              type="button"
              onClick={() => {
                setChatWith(null);
                void load();
              }}
              aria-label={copy.close}
            >
              <X size={16} />
            </button>
          </header>
          <div className="radar-chat-list" ref={listRef}>
            {messages.length === 0 ? (
              <p className="radar-empty">{copy.chatEmpty}</p>
            ) : (
              messages.map((message) => (
                <div
                  key={message.id}
                  className={`radar-bubble ${message.fromUser === user?.id ? 'is-mine' : ''}`}
                >
                  {message.body}
                </div>
              ))
            )}
          </div>
          <form
            className="radar-chat-form"
            onSubmit={(event) => {
              event.preventDefault();
              void send();
            }}
          >
            <input
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder={copy.messagePlaceholder}
              maxLength={1000}
            />
            <button type="submit" disabled={sending || !draft.trim()} aria-label={copy.send}>
              <Send size={15} />
            </button>
          </form>
        </div>
      ) : null}
    </section>
  );
}
