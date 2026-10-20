import { useEffect, useRef, useState } from 'react';
import {
  Check,
  ChevronDown,
  Copy,
  Database,
  Info,
  KeyRound,
  RefreshCw,
  ShieldCheck,
  X,
} from 'lucide-react';
import type { AppConfig } from '../../shared/types';
import { MARKETS } from '../../shared/types';
import { relativeTime } from '../lib/format';
import { CountryFlag } from './CountryFlag';

interface IngestDrawerProps {
  open: boolean;
  config: AppConfig | null;
  onClose: () => void;
  onRefresh: () => Promise<void>;
}

const SAMPLE_BATCH = `{
  "source": "shopee-my-crawler",
  "country": "MY",
  "products": [{
    "id": "sony-wh1000xm5",
    "name": "Sony WH-1000XM5 无线降噪耳机",
    "brand": "Sony",
    "category": "耳机",
    "visual": "headphones"
  }],
  "offers": [{
    "externalId": "shopee-my-8821",
    "productId": "sony-wh1000xm5",
    "platformId": "shopee",
    "seller": "Sony Official Store",
    "itemPrice": 1399,
    "shippingFee": 0,
    "discount": 100,
    "url": "https://shopee.com.my/product/8821",
    "isOfficial": true
  }]
}`;

export function IngestDrawer({ open, config, onClose, onRefresh }: IngestDrawerProps) {
  const panelRef = useRef<HTMLElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const [copied, setCopied] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState('');

  const endpoint = config?.gateway.endpoint || '/api/v1/ingest/offers';

  useEffect(() => {
    if (!open) return;
    previousFocusRef.current = document.activeElement as HTMLElement | null;
    const timer = window.setTimeout(() => closeRef.current?.focus(), 60);

    function handleKey(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onClose();
        return;
      }
      if (event.key !== 'Tab' || !panelRef.current) return;
      const focusable = panelRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], summary, input, textarea, [tabindex]:not([tabindex="-1"])',
      );
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener('keydown', handleKey);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('keydown', handleKey);
      previousFocusRef.current?.focus();
    };
  }, [open, onClose]);

  async function copyEndpoint() {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}${endpoint}`);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  }

  async function refresh() {
    setRefreshing(true);
    setRefreshError('');
    try {
      await onRefresh();
    } catch (error) {
      setRefreshError(error instanceof Error ? error.message : '刷新失败');
    } finally {
      setRefreshing(false);
    }
  }

  const gateway = config?.gateway;
  const runs = gateway?.runs || [];

  return (
    <div
      className={`drawer-layer ${open ? 'is-open' : ''}`}
      aria-hidden={!open}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <aside
        className="ingest-drawer"
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="ingest-title"
      >
        <div className="drawer-head">
          <div className="drawer-head-copy">
            <span className="drawer-kicker">
              <span className="status-dot" />
              CRAWLER GATEWAY
            </span>
            <h2 id="ingest-title">价格从这里进来。</h2>
          </div>
          <button className="drawer-close" onClick={onClose} aria-label="关闭数据接入面板" ref={closeRef}>
            <X size={18} />
          </button>
        </div>

        <div className="drawer-body">
          <div className="drawer-intro">
            <div>
              <span className="drawer-status">
                <span className="live-dot" />
                网关运行中
              </span>
              <p>
                这个网站不抓价。独立的爬虫 App 负责采集，把标准化批次推进来；
                Picolah 只做校验、幂等入库和展示。
              </p>
            </div>
            <span className="drawer-version">API v1</span>
          </div>

          <section className="endpoint-card">
            <div className="endpoint-head">
              <span className="endpoint-label">INGEST ENDPOINT</span>
              <button type="button" className="copy-button" onClick={copyEndpoint}>
                {copied ? <Check size={13} /> : <Copy size={13} />}
                {copied ? '已复制' : '复制地址'}
              </button>
            </div>
            <div className="endpoint-url">
              <span className="method-pill">POST</span>
              <code>{endpoint}</code>
            </div>
            <div className="endpoint-auth">
              <KeyRound size={13} />
              <code>Authorization: Bearer ••••••••••</code>
              <span>密钥仅存于服务端</span>
            </div>
          </section>

          <div className="gateway-stats">
            <div className="gateway-stat">
              <span className="stat-icon"><Database size={15} /></span>
              <strong>{gateway ? new Intl.NumberFormat('zh-CN').format(gateway.offers) : '—'}</strong>
              <span>在售报价</span>
            </div>
            <div className="gateway-stat">
              <span className="stat-icon"><ShieldCheck size={15} /></span>
              <strong>{gateway?.products ?? '—'}</strong>
              <span>商品</span>
            </div>
            <div className="gateway-stat">
              <span className="stat-icon"><span className="stat-globe">◎</span></span>
              <strong>{gateway?.markets ?? '—'}</strong>
              <span>市场</span>
            </div>
            <div className="gateway-stat">
              <span className="stat-icon"><RefreshCw size={15} /></span>
              <strong>{gateway?.todayOffers ?? '—'}</strong>
              <span>今日更新</span>
            </div>
          </div>

          <section className="drawer-section">
            <div className="drawer-section-head">
              <h3>最近入库</h3>
              <button
                className={`refresh-button ${refreshing ? 'is-spinning' : ''}`}
                type="button"
                onClick={refresh}
                disabled={refreshing}
              >
                <RefreshCw size={13} />
                刷新
              </button>
            </div>
            {refreshError && <div className="drawer-inline-error">{refreshError}</div>}
            {runs.length ? (
              <div className="run-list">
                {runs.map((run) => {
                  const market = MARKETS[run.country] || MARKETS.SG;
                  return (
                    <div className="run-row" key={run.id}>
                      <span className={`run-status ${run.status}`} aria-hidden="true" />
                      <div className="run-main">
                        <div className="run-source">
                          <code>{run.source}</code>
                          <span className="run-country">
                            <CountryFlag code={run.country} width={12} /> {market.code}
                          </span>
                        </div>
                        <div className="run-message">{run.message || '批次已处理'}</div>
                      </div>
                      <div className="run-side">
                        <span className="run-count">+{run.upserted}</span>
                        <span className="run-time">{relativeTime(run.createdAt)}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="runs-empty">
                <Database size={20} />
                <div>
                  <strong>还没有爬虫批次</strong>
                  <span>让爬虫 App 向这个地址推送第一批价格。</span>
                </div>
              </div>
            )}
          </section>

          <section className="drawer-section">
            <div className="drawer-section-head">
              <h3>数据契约</h3>
              <span className="contract-version">batch ≤ 100</span>
            </div>
            <ul className="contract-list">
              <li>
                <span className="contract-num">01</span>
                <div>
                  <strong>products[] · 商品</strong>
                  <p>按 id upsert。老商品可以省略，只传本次新发现的商品。</p>
                </div>
              </li>
              <li>
                <span className="contract-num">02</span>
                <div>
                  <strong>offers[] · 报价</strong>
                  <p>以 source + externalId 幂等去重，重复推送只会更新，不会产生重复行。</p>
                </div>
              </li>
              <li>
                <span className="contract-num">03</span>
                <div>
                  <strong>币种跟随市场</strong>
                  <p>MY→MYR、TH→THB、ID→IDR、PH→PHP、VN→VND、SG→SGD，单批只写一个市场。</p>
                </div>
              </li>
              <li>
                <span className="contract-num">04</span>
                <div>
                  <strong>整批校验 · 原子写入</strong>
                  <p>任何一条不合法，整批回滚并返回 422，不会留下半批脏数据。</p>
                </div>
              </li>
            </ul>

            <details className="code-details">
              <summary>
                <span>查看最小批次示例</span>
                <ChevronDown size={14} />
              </summary>
              <div className="code-block">
                <div className="code-block-head">
                  <span>batch.json</span>
                  <button
                    type="button"
                    onClick={() => navigator.clipboard?.writeText(SAMPLE_BATCH)}
                    aria-label="复制示例批次"
                  >
                    <Copy size={12} />
                  </button>
                </div>
                <pre>{SAMPLE_BATCH}</pre>
              </div>
            </details>

            <div className="curl-note">
              <code>
                curl -X POST &quot;$PICOLAH_API_BASE{endpoint}&quot; \<br />
                &nbsp;&nbsp;-H &quot;Authorization: Bearer $PICOLAH_INGEST_KEY&quot; \<br />
                &nbsp;&nbsp;-H &quot;Content-Type: application/json&quot; -d @batch.json
              </code>
            </div>
          </section>

          <div className="drawer-note">
            <Info size={15} />
            <span>
              网页不会读取或展示接入密钥。爬虫与网站完全解耦，可以独立部署、独立限速；
              价格导入失败不会影响网站浏览。
            </span>
          </div>
        </div>
      </aside>
    </div>
  );
}
