import { useTranslation } from 'react-i18next';
import { PageHeader } from './PageHeader';

type LegalKind = 'privacy' | 'terms';

interface LegalViewProps {
  kind: LegalKind;
  onOpenSidebar: () => void;
}

const CONTENT = {
  privacy: {
    zh: [
      {
        title: '我们收集什么',
        body: '账户邮箱、密码哈希（不保存明文）、匿名浏览器标识、比价事件（商品、市场、平台、价格、点击）、短视频观看时长与互动（点赞、收藏、关注、分享、不感兴趣）、关注清单与价格提醒，以及你与比价助手的历史对话。画像事件保存在服务端，登录后会合并到账号。',
      },
      {
        title: '为什么收集',
        body: '用于生成你的购物与视频兴趣画像、调整短视频推荐、发送你主动设置的价格提醒、改进比价结果，以及防止滥用。我们不会出售你的个人信息。',
      },
      {
        title: '保存多久',
        body: '账户与画像数据保存在你删除账户为止；会话 cookie 默认 30 天；匿名事件最多保留 24 个月。删除账户会同时删除画像、关注清单和提醒。',
      },
      {
        title: '你的权利',
        body: '你可以在购物画像页重置购物与短视频记录，在账户页导出个人数据，或输入密码删除账户。删除后不可恢复。若需更正或投诉，请联系 privacy@picolah.com。',
      },
      {
        title: '第三方',
        body: '商品价格来自公开电商页面与 Bright Data 数据服务；点击“去购买”会跳转到第三方平台，并可能带有联盟跟踪参数。第三方平台的隐私政策独立适用。',
      },
    ],
    en: [
      {
        title: 'What we collect',
        body: 'Your account email, a password hash (never the plain password), an anonymous browser id, comparison events (product, market, platform, price, clicks), short-video watch time and interactions (likes, saves, follows, shares, not interested), watchlist and price alerts, and chat history. Profile events are stored on the server and merged into your account when you sign in.',
      },
      {
        title: 'Why we collect it',
        body: 'To build your shopping and video-interest profile, personalize your video feed, deliver alerts you asked for, improve comparisons, and prevent abuse. We do not sell your personal information.',
      },
      {
        title: 'How long we keep it',
        body: 'Account and profile data are kept until you delete your account. Session cookies last 30 days. Anonymous events are kept for up to 24 months. Deleting your account removes your profile, watchlist and alerts.',
      },
      {
        title: 'Your rights',
        body: 'You can reset shopping and video history from your profile, export personal data or delete your account from the account page. Deletion is permanent. For corrections or complaints, contact privacy@picolah.com.',
      },
      {
        title: 'Third parties',
        body: 'Prices come from public retailer pages and Bright Data services. “Go to store” links take you to third-party platforms and may include affiliate tracking. Those platforms have their own privacy policies.',
      },
    ],
  },
  terms: {
    zh: [
      {
        title: '服务说明',
        body: 'Picolah 聚合公开商品信息，帮助比较到手价、查看价格历史并设置提醒。我们不销售商品，也不处理支付或配送。',
      },
      {
        title: '价格与可用性',
        body: '价格、库存和促销可能随时变化，展示结果仅供参考；下单前请以商家页面为准。我们不对因价格差异造成的损失负责。',
      },
      {
        title: '联盟链接',
        body: '部分“去购买”链接是联盟链接。你通过链接购买时，我们可能获得佣金，但这不会改变你支付的价格，也不影响比价排序。',
      },
      {
        title: '合理使用',
        body: '不得用自动化手段大规模抓取本站、绕过访问限制、干扰服务或提交违法内容。我们可对滥用行为限流或停用账户。',
      },
      {
        title: '责任限制',
        body: '服务按“现状”提供。在法律允许范围内，我们不对间接损失、数据丢失或第三方平台行为承担责任。',
      },
    ],
    en: [
      {
        title: 'The service',
        body: 'Picolah aggregates public product listings to compare landed prices, show price history and send alerts. We do not sell products and do not handle payment or delivery.',
      },
      {
        title: 'Prices and availability',
        body: 'Prices, stock and promotions change frequently. Results are informational; always confirm on the retailer page before ordering. We are not liable for losses caused by price differences.',
      },
      {
        title: 'Affiliate links',
        body: 'Some “Go to store” links are affiliate links. We may earn a commission when you buy through them. This does not change the price you pay and does not affect ranking.',
      },
      {
        title: 'Acceptable use',
        body: 'Do not scrape the service at scale, bypass access controls, disrupt the service, or submit unlawful content. We may rate-limit or suspend abusive accounts.',
      },
      {
        title: 'Limitation of liability',
        body: 'The service is provided “as is”. To the extent permitted by law, we are not liable for indirect losses, data loss, or the acts of third-party platforms.',
      },
    ],
  },
} as const;

export function LegalView({ kind, onOpenSidebar }: LegalViewProps) {
  const { t, i18n } = useTranslation();
  const zh = i18n.language.startsWith('zh');
  const title = kind === 'privacy' ? t('legal.privacy') : t('legal.terms');
  const sections = CONTENT[kind][zh ? 'zh' : 'en'];

  return (
    <section className="pc-page pc-legal-page" aria-label={title}>
      <PageHeader eyebrow="LEGAL" title={title} onOpenSidebar={onOpenSidebar} />
      <div className="pc-page-body pc-legal-body">
        <p className="pc-legal-updated">{t('legal.updated')}</p>
        <div className="pc-legal-card">
          {sections.map((section) => (
            <article key={section.title}>
              <h2>{section.title}</h2>
              <p>{section.body}</p>
            </article>
          ))}
        </div>
        <p className="pc-legal-contact">
          {t('legal.contact')}{' '}
          <a href="mailto:privacy@picolah.com">privacy@picolah.com</a>
        </p>
      </div>
    </section>
  );
}
