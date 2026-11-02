import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Check,
  ChevronDown,
  ChevronRight,
  SlidersHorizontal,
  UsersRound,
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
    requests: '新的朋友',
    all: '所有人',
    notAdded: '未添加',
    added: '已添加',
    filter: '筛选相似的人',
    filterEmpty: '暂时没有符合筛选条件的人',
    resetFilter: '查看所有人',
    matchNote: '根据你的消费偏好推荐',
    sharedEmpty: '发现你们的共同偏好',
    showRequest: '查看申请',
    retry: '重新加载',
    loadError: '暂时无法加载雷达',
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
    requests: 'New friends',
    all: 'Everyone',
    notAdded: 'Not added',
    added: 'Added',
    filter: 'Filter similar people',
    filterEmpty: 'No people match this filter',
    resetFilter: 'Show everyone',
    matchNote: 'Recommended from your shopping preferences',
    sharedEmpty: 'Discover what you have in common',
    showRequest: 'View request',
    retry: 'Try again',
    loadError: 'Radar is temporarily unavailable',
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
  const [filter, setFilter] = useState('all');
  const [requestsOpen, setRequestsOpen] = useState(false);
  const requestsRef = useRef<HTMLDetailsElement>(null);
  const activeChatRef = useRef<string | null>(null);
  const draftRef = useRef(draft);
  draftRef.current = draft;
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
          setMessages((current) => [...new Map([...current, ...list].map((message) => [message.id, message])).values()]);
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
    if (activeChatRef.current === friend.id) return;
    activeChatRef.current = friend.id;
    setSending(false);
    lastAtRef.current = '';
    setMessages([]);
    setDraft('');
    setChatWith(friend);
  }

  async function send() {
    const body = draft.trim();
    if (!body || !chatWith || sending) return;
    const recipientId = chatWith.id;
    setSending(true);
    try {
      const message = await postMessage(recipientId, body);
      if (activeChatRef.current !== recipientId) return;
      setMessages((current) => [...new Map([...current, message].map((item) => [item.id, item])).values()]);
      if (draftRef.current.trim() === body) setDraft('');
    } catch (sendError) {
      notify(sendError instanceof Error ? sendError.message : copy.loading);
    } finally {
      if (activeChatRef.current === recipientId) setSending(false);
    }
  }

  const self = data?.self ?? null;
  const candidates = data?.candidates ?? [];
  const visibleCandidates = candidates.filter((candidate) => filter === 'all' ||
    (filter === 'friends' ? candidate.relationship === 'friend' : candidate.relationship !== 'friend'));
  const incoming = data?.incoming ?? [];
  const friends = data?.friends ?? [];

  function showRequests() {
    setRequestsOpen(true);
    requestsRef.current?.scrollIntoView({ block: 'nearest' });
  }
  const preferenceTags: SharedPreference[] = self
    ? [...self.categories.slice(0, 2), ...self.brands.slice(0, 2)]
    : [];

  return (
    <section className="pc-page pc-radar-page" aria-label={copy.title}>
      <PageHeader
        eyebrow={copy.eyebrow}
        title={copy.title}
        onOpenSidebar={onOpenSidebar}
      >
        {user ? (
          <button type="button" className="radar-refresh" onClick={() => void load()} disabled={loading} aria-label={copy.refresh} title={copy.refresh}>
            <RefreshCw size={18} className={loading ? 'radar-spin' : undefined} />
          </button>
        ) : null}
      </PageHeader>

      <div className="radar-body">
        <div className="radar-directory">
          {!user ? (
            <div className="radar-guest">
              <span className="radar-guest-icon"><Radar size={42} strokeWidth={1.3} /></span>
              <h2>{copy.guestTitle}</h2>
              <p>{copy.guestBody}</p>
              <button type="button" className="radar-primary" onClick={() => promptLogin('radar')}>
                {copy.guestCta}
              </button>
            </div>
          ) : (
            <>
              {error ? (
                <div className="radar-error" role="alert">
                  <span>{error}</span>
                  <button type="button" onClick={() => void load()} disabled={loading}>{copy.retry}</button>
                </div>
              ) : null}
              {loading && !data ? (
                <div className="radar-state" role="status"><RefreshCw size={24} className="radar-spin" /><p>{copy.loading}</p></div>
              ) : !data ? (
                <div className="radar-state"><Radar size={36} strokeWidth={1.3} /><h2>{copy.loadError}</h2></div>
              ) : (
                <>
                  <div className="radar-intro"><Radar size={17} strokeWidth={1.6} /><span>{copy.description}</span></div>
                  <div className="radar-utilities">
                    <details className="radar-disclosure" ref={requestsRef} open={requestsOpen}
                      onToggle={(event) => setRequestsOpen(event.currentTarget.open)}>
                      <summary>
                        <span className="radar-utility-icon is-requests"><UserPlus size={20} /></span>
                        <strong>{copy.requests}</strong>
                        {incoming.length > 0 ? <span className="radar-unread">{incoming.length}</span> : null}
                        <ChevronRight className="radar-disclosure-arrow" size={17} />
                      </summary>
                      {incoming.length ? (
                        <ul className="radar-list radar-compact-list">
                          {incoming.map((request) => (
                            <li key={request.id}>
                              <span className="radar-avatar" style={{ background: tint(request.userId) }}>
                                {request.avatar ? <img src={request.avatar} alt="" /> : initial(request.displayName)}
                              </span>
                              <span className="radar-person"><strong>{request.displayName}</strong></span>
                              <span className="radar-request-actions">
                                <button type="button" className="radar-action" disabled={busyId === request.id}
                                  onClick={() => void respond(request, true)} aria-label={`${copy.accept} ${request.displayName}`}>
                                  <Check size={14} /><span>{copy.accept}</span>
                                </button>
                                <button type="button" className="radar-action is-ghost" disabled={busyId === request.id}
                                  onClick={() => void respond(request, false)} aria-label={`${copy.decline} ${request.displayName}`}>
                                  <X size={14} /><span>{copy.decline}</span>
                                </button>
                              </span>
                            </li>
                          ))}
                        </ul>
                      ) : <p className="radar-disclosure-empty">{copy.requestsEmpty}</p>}
                    </details>
                  </div>

                  {self?.hasData ? (
                    <section className="radar-people" aria-label={copy.people}>
                      <header className="radar-list-heading">
                        <h2>{copy.people}<span>{visibleCandidates.length}</span></h2>
                        <label className="radar-filter">
                          <select value={filter} onChange={(event) => setFilter(event.target.value)} aria-label={copy.filter}>
                            <option value="all">{copy.all}</option>
                            <option value="new">{copy.notAdded}</option>
                            <option value="friends">{copy.added}</option>
                          </select>
                          <ChevronDown size={13} aria-hidden="true" />
                        </label>
                      </header>
                      {visibleCandidates.length ? (
                        <ul className="radar-list radar-candidates" aria-busy={loading}>
                          {visibleCandidates.map((candidate) => (
                            <li key={candidate.id}>
                              <span className="radar-avatar" style={{ background: tint(candidate.id) }}>
                                {candidate.avatar ? <img src={candidate.avatar} alt="" /> : initial(candidate.displayName)}
                              </span>
                              <div className="radar-person">
                                <strong title={candidate.displayName}>{candidate.displayName}</strong>
                                <span className="radar-match">{copy.similarity} {candidate.similarity}%</span>
                                <small title={candidate.shared.map((tag) => en ? tag.en : tag.zh).join(' · ')}>
                                  {candidate.shared.length ? candidate.shared.map((tag) => en ? tag.en : tag.zh).join(' · ') : copy.sharedEmpty}
                                </small>
                              </div>
                              {candidate.relationship === 'friend' ? (
                                <button type="button" className="radar-action is-ghost"
                                  aria-label={`${copy.chat} ${candidate.displayName}`}
                                  onClick={() => {
                                    const friend = friends.find((item) => item.id === candidate.id);
                                    openChat(friend ?? { ...candidate, lastMessage: null, lastMessageAt: null, unread: 0 });
                                  }}>
                                  <MessagesSquare size={14} />{copy.chat}
                                </button>
                              ) : candidate.relationship === 'requested' ? (
                                <span className="radar-requested"><Check size={13} />{copy.requested}</span>
                              ) : candidate.relationship === 'incoming' ? (
                                <button type="button" className="radar-action is-ghost" onClick={showRequests}
                                  aria-label={`${copy.showRequest} ${candidate.displayName}`}>{copy.showRequest}</button>
                              ) : (
                                <button type="button" className="radar-action" disabled={busyId === candidate.id}
                                  onClick={() => void addFriend(candidate)} aria-label={`${copy.add} ${candidate.displayName}`}>
                                  <UserPlus size={14} />{copy.add}
                                </button>
                              )}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <div className="radar-state radar-list-empty">
                          <UsersRound size={32} strokeWidth={1.3} />
                          <p>{candidates.length ? copy.filterEmpty : copy.peopleEmpty}</p>
                          {filter !== 'all' ? <button type="button" className="radar-text-button" onClick={() => setFilter('all')}>{copy.resetFilter}</button> : null}
                        </div>
                      )}
                    </section>
                  ) : (
                    <div className="radar-guest radar-no-data">
                      <span className="radar-guest-icon"><Radar size={42} strokeWidth={1.3} /></span>
                      <h2>{copy.noDataTitle}</h2>
                      <p>{copy.noDataBody}</p>
                      <button type="button" className="radar-primary" onClick={onStart}>{copy.noDataCta}</button>
                    </div>
                  )}

                  <div className="radar-utilities radar-secondary">
                    <details className="radar-disclosure">
                      <summary>
                        <span className="radar-utility-icon"><SlidersHorizontal size={18} /></span>
                        <strong>{copy.mine}</strong>
                        <span className="radar-summary-note">{en ? self?.personaEn : self?.personaZh}</span>
                        <ChevronRight className="radar-disclosure-arrow" size={17} />
                      </summary>
                      <div className="radar-preferences">
                        <p>{en ? self?.taglineEn : self?.taglineZh}</p>
                        <div className="radar-tags">
                          {preferenceTags.length ? preferenceTags.map((tag) => <span key={`${tag.zh}-${tag.en}`}>{en ? tag.en : tag.zh}</span>) : <span>{copy.noPersona}</span>}
                        </div>
                        <dl>
                          <div><dt>{copy.budget}</dt><dd>{budgetLabel(self?.budget ?? null, en)}</dd></div>
                          <div><dt>{en ? 'Activity' : '消费足迹'}</dt><dd>{self?.comparisons ?? 0} {copy.comparisons} · {self?.clicks ?? 0} {copy.clicks}</dd></div>
                        </dl>
                      </div>
                    </details>
                    <details className="radar-disclosure">
                      <summary>
                        <span className="radar-utility-icon"><UsersRound size={19} /></span>
                        <strong>{copy.friends}</strong><span className="radar-summary-note">{friends.length}</span>
                        <ChevronRight className="radar-disclosure-arrow" size={17} />
                      </summary>
                      {friends.length ? (
                        <ul className="radar-list radar-compact-list">
                          {friends.map((friend) => (
                            <li key={friend.id}>
                              <span className="radar-avatar" style={{ background: tint(friend.id) }}>
                                {friend.avatar ? <img src={friend.avatar} alt="" /> : initial(friend.displayName)}
                              </span>
                              <span className="radar-person"><strong>{friend.displayName}</strong><small>{friend.lastMessage ?? copy.chatEmpty}</small></span>
                              {friend.unread > 0 ? <span className="radar-unread">{friend.unread > 99 ? '99+' : friend.unread}</span> : null}
                              <button type="button" className="radar-action is-ghost" onClick={() => openChat(friend)} aria-label={`${copy.chat} ${friend.displayName}`}>
                                <MessagesSquare size={14} />{copy.chat}
                              </button>
                            </li>
                          ))}
                        </ul>
                      ) : <p className="radar-disclosure-empty">{copy.friendsEmpty}</p>}
                    </details>
                  </div>
                  <p className="radar-footnote">{copy.matchNote}</p>
                </>
              )}
            </>
          )}
        </div>
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
                activeChatRef.current = null;
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
              aria-label={copy.messagePlaceholder}
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
