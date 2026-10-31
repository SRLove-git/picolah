import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Check,
  MessagesSquare,
  Radar,
  RefreshCw,
  Send,
  UserPlus,
  X,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useSession } from '../lib/session';
import {
  getMessages,
  getRadar,
  postMessage,
  respondFriendRequest,
  sendFriendRequest,
  type FriendRequestView,
  type FriendView,
  type RadarCandidate,
  type RadarData,
  type SharedPreference,
  type SocialMessage,
} from '../lib/social';
import { PageHeader } from './PageHeader';
import './radar.css';

const COPY = {
  zh: {
    eyebrow: 'RADAR',
    title: '雷达',
    description: '根据消费偏好，找到和你相似的人。',
    guestTitle: '登录后开启雷达',
    guestBody: '雷达会用你的比价偏好匹配相似的人，登录后即可开始。',
    guestCta: '登录 / 注册',
    noDataTitle: '先比几次价，雷达才能读懂你',
    noDataBody: '搜索或比价几件商品后，雷达会从品类、品牌、平台和预算里找出和你相近的人。',
    noDataCta: '去发现商品',
    mine: '我的消费偏好',
    noPersona: '还在形成中',
    comparisons: '次比价',
    clicks: '次跳转',
    budget: '常看价位',
    people: '相似的人',
    peopleEmpty: '还没有找到相近的人，等更多人积累比价记录后再看看。',
    similarity: '相似度',
    shared: '共同偏好',
    myTags: '偏好标签',
    refresh: '刷新',
    add: '加好友',
    requested: '已申请',
    incoming: '待你处理',
    accept: '接受',
    decline: '拒绝',
    chat: '聊天',
    requests: '好友请求',
    requestsEmpty: '暂无新的好友请求',
    friends: '好友',
    friendsEmpty: '还没有好友，先添加一个吧。',
    messagePlaceholder: '说点什么…',
    send: '发送',
    chatEmpty: '打个招呼吧。',
    close: '关闭',
    sentRequest: '好友请求已发送',
    friendAdded: '已添加好友',
    you: '我',
    loading: '正在匹配…',
  },
  en: {
    eyebrow: 'RADAR',
    title: 'Radar',
    description: 'Meet people whose shopping preferences look like yours.',
    guestTitle: 'Sign in to use Radar',
    guestBody: 'Radar matches people by their comparison habits. Sign in to start.',
    guestCta: 'Sign in / Sign up',
    noDataTitle: 'Compare a few products first',
    noDataBody: 'Once you compare a few items, Radar can match you on categories, brands, platforms and budget.',
    noDataCta: 'Discover products',
    mine: 'My shopping preferences',
    noPersona: 'Still forming',
    comparisons: 'comparisons',
    clicks: 'clicks',
    budget: 'Budget',
    people: 'Similar people',
    peopleEmpty: 'No one close yet. Check back as more people compare products.',
    similarity: 'Similarity',
    shared: 'In common',
    myTags: 'Preferences',
    refresh: 'Refresh',
    add: 'Add friend',
    requested: 'Requested',
    incoming: 'Respond',
    accept: 'Accept',
    decline: 'Decline',
    chat: 'Chat',
    requests: 'Friend requests',
    requestsEmpty: 'No new requests',
    friends: 'Friends',
    friendsEmpty: 'No friends yet — add someone first.',
    messagePlaceholder: 'Say something…',
    send: 'Send',
    chatEmpty: 'Say hello.',
    close: 'Close',
    sentRequest: 'Friend request sent',
    friendAdded: 'Friend added',
    you: 'Me',
    loading: 'Matching…',
  },
} as const;

interface RadarViewProps {
  onOpenSidebar: () => void;
  onStart: () => void;
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

function budgetLabel(budget: RadarData['self']['budget'], en: boolean): string {
  if (!budget) return '—';
  try {
    const format = new Intl.NumberFormat(en ? 'en-US' : 'zh-CN', {
      style: 'currency',
      currency: budget.currency,
      maximumFractionDigits: 0,
    });
    return `${format.format(budget.min)} – ${format.format(budget.max)}`;
  } catch {
    return `${Math.round(budget.min)} – ${Math.round(budget.max)}`;
  }
}

export function RadarView({ onOpenSidebar, onStart, notify }: RadarViewProps) {
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
  const [sending, setSending] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
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

  async function addFriend(candidate: RadarCandidate) {
    setBusyId(candidate.id);
    try {
      const result = await sendFriendRequest(candidate.id);
      notify(result.status === 'accepted' ? copy.friendAdded : copy.sentRequest);
      await load();
    } catch (friendError) {
      notify(friendError instanceof Error ? friendError.message : copy.loading);
    } finally {
      setBusyId('');
    }
  }

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

  const self = data?.self ?? null;
  const candidates = data?.candidates ?? [];
  const blips = candidates.slice(0, 6);
  const preferenceTags: SharedPreference[] = self
    ? [...self.categories.slice(0, 2), ...self.brands.slice(0, 2)]
    : [];

  return (
    <section className="pc-page pc-radar-page" aria-label={copy.title}>
      <PageHeader
        eyebrow={copy.eyebrow}
        title={copy.title}
        description={copy.description}
        onOpenSidebar={onOpenSidebar}
      >
        {user && self?.hasData ? (
          <button type="button" className="pc-outline-button" onClick={() => void load()} disabled={loading}>
            <RefreshCw size={14} />
            {copy.refresh}
          </button>
        ) : null}
      </PageHeader>

      <div className="pc-page-body radar-body">
        {!user ? (
          <div className="radar-guest">
            <span className="radar-guest-icon"><Radar size={30} strokeWidth={1.6} /></span>
            <h2>{copy.guestTitle}</h2>
            <p>{copy.guestBody}</p>
            <button type="button" className="pc-primary-button" onClick={() => promptLogin('radar')}>
              {copy.guestCta}
            </button>
          </div>
        ) : !self?.hasData ? (
          <div className="radar-guest">
            <span className="radar-guest-icon"><Radar size={30} strokeWidth={1.6} /></span>
            <h2>{copy.noDataTitle}</h2>
            <p>{copy.noDataBody}</p>
            <button type="button" className="pc-primary-button" onClick={onStart}>
              {copy.noDataCta}
            </button>
          </div>
        ) : (
          <>
            <section className="radar-self-card">
              <div className="radar-self-head">
                <span className="radar-self-mark">{copy.you}</span>
                <div>
                  <h2>{en ? self.personaEn || copy.noPersona : self.personaZh || copy.noPersona}</h2>
                  <p>{en ? self.taglineEn : self.taglineZh}</p>
                </div>
                <span className="radar-self-stats">
                  <b>{self.comparisons}</b>{copy.comparisons}
                  <i />
                  <b>{self.clicks}</b>{copy.clicks}
                </span>
              </div>
              <div className="radar-self-meta">
                <span className="radar-self-label">{copy.myTags}</span>
                {preferenceTags.length === 0 ? (
                  <span className="radar-tag">{copy.noPersona}</span>
                ) : (
                  preferenceTags.map((tag) => (
                    <span className="radar-tag" key={`${tag.zh}-${tag.en}`}>{en ? tag.en : tag.zh}</span>
                  ))
                )}
                <span className="radar-self-budget">
                  {copy.budget} {budgetLabel(self.budget, en)}
                </span>
              </div>
            </section>

            <div className="radar-stage">
              <span className="radar-ring radar-ring-1" aria-hidden="true" />
              <span className="radar-ring radar-ring-2" aria-hidden="true" />
              <span className="radar-ring radar-ring-3" aria-hidden="true" />
              <span className="radar-sweep" aria-hidden="true" />
              <span className="radar-self" style={{ background: tint(user.id) }}>{copy.you}</span>
              {blips.map((candidate, index) => {
                const angle = (index / Math.max(blips.length, 1)) * Math.PI * 2 - Math.PI / 2;
                const radius = 33 + (index % 2) * 9;
                return (
                  <span
                    className="radar-blip"
                    key={candidate.id}
                    style={{
                      left: `${50 + Math.cos(angle) * radius}%`,
                      top: `${50 + Math.sin(angle) * radius}%`,
                    }}
                  >
                    <span style={{ background: tint(candidate.id) }}>{initial(candidate.displayName)}</span>
                    <i>{candidate.similarity}%</i>
                  </span>
                );
              })}
              <span className="radar-stage-meta">
                {copy.people} {candidates.length} · {copy.friends} {data?.friends.length ?? 0}
              </span>
            </div>

            <div className="radar-grid">
              <section className="radar-panel radar-people">
                <header className="radar-panel-head">
                  <h3>{copy.people}</h3>
                  {loading ? <RefreshCw size={13} className="radar-spin" /> : null}
                </header>
                {candidates.length === 0 && !loading ? (
                  <p className="radar-empty">{copy.peopleEmpty}</p>
                ) : (
                  <ul className="radar-list">
                    {candidates.map((candidate) => (
                      <li key={candidate.id}>
                        <span className="radar-avatar" style={{ background: tint(candidate.id) }}>
                          {initial(candidate.displayName)}
                        </span>
                        <span className="radar-person">
                          <strong>{candidate.displayName}</strong>
                          <small>
                            {copy.similarity} {candidate.similarity}%
                            {candidate.shared.length ? ` · ${copy.shared} ${candidate.shared.map((tag) => (en ? tag.en : tag.zh)).join(' / ')}` : ''}
                          </small>
                        </span>
                        {candidate.relationship === 'friend' ? (
                          <button
                            type="button"
                            className="radar-action is-ghost"
                            onClick={() => {
                              const friend = data?.friends.find((item) => item.id === candidate.id);
                              if (friend) openChat(friend);
                            }}
                          >
                            <MessagesSquare size={13} />
                            {copy.chat}
                          </button>
                        ) : candidate.relationship === 'requested' ? (
                          <span className="radar-tag">{copy.requested}</span>
                        ) : candidate.relationship === 'incoming' ? (
                          <span className="radar-tag">{copy.incoming}</span>
                        ) : (
                          <button
                            type="button"
                            className="radar-action"
                            disabled={busyId === candidate.id}
                            onClick={() => void addFriend(candidate)}
                          >
                            <UserPlus size={13} />
                            {copy.add}
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <div className="radar-side">
                <section className="radar-panel">
                  <header className="radar-panel-head">
                    <h3>{copy.requests}</h3>
                    <span className="radar-count">{data?.incoming.length ?? 0}</span>
                  </header>
                  {data?.incoming.length ? (
                    <ul className="radar-list">
                      {data.incoming.map((request) => (
                        <li key={request.id}>
                          <span className="radar-avatar" style={{ background: tint(request.userId) }}>
                            {initial(request.displayName)}
                          </span>
                          <span className="radar-person">
                            <strong>{request.displayName}</strong>
                          </span>
                          <span className="radar-request-actions">
                            <button
                              type="button"
                              className="radar-action"
                              disabled={busyId === request.id}
                              onClick={() => void respond(request, true)}
                            >
                              <Check size={13} />
                              {copy.accept}
                            </button>
                            <button
                              type="button"
                              className="radar-action is-ghost"
                              disabled={busyId === request.id}
                              onClick={() => void respond(request, false)}
                            >
                              <X size={13} />
                              {copy.decline}
                            </button>
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="radar-empty">{copy.requestsEmpty}</p>
                  )}
                </section>

                <section className="radar-panel">
                  <header className="radar-panel-head">
                    <h3>{copy.friends}</h3>
                    <span className="radar-count">{data?.friends.length ?? 0}</span>
                  </header>
                  {data?.friends.length ? (
                    <ul className="radar-list">
                      {data.friends.map((friend) => (
                        <li key={friend.id}>
                          <span className="radar-avatar" style={{ background: tint(friend.id) }}>
                            {initial(friend.displayName)}
                          </span>
                          <span className="radar-person">
                            <strong>{friend.displayName}</strong>
                            <small>{friend.lastMessage ?? copy.chatEmpty}</small>
                          </span>
                          {friend.unread > 0 ? <span className="radar-unread">{friend.unread}</span> : null}
                          <button
                            type="button"
                            className="radar-action is-ghost"
                            onClick={() => openChat(friend)}
                          >
                            <MessagesSquare size={13} />
                            {copy.chat}
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="radar-empty">{copy.friendsEmpty}</p>
                  )}
                </section>
              </div>
            </div>

            {error ? <p className="radar-error">{error}</p> : null}
          </>
        )}
      </div>

      {chatWith ? (
        <div className="radar-chat" role="dialog" aria-label={copy.chat}>
          <header className="radar-chat-head">
            <span className="radar-avatar" style={{ background: tint(chatWith.id) }}>
              {initial(chatWith.displayName)}
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
