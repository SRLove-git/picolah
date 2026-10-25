import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

const resources = {
  zh: {
    translation: {
      app: { title: 'Picolah · 购物之前 PICO 一下', understanding: '正在理解问题…', generating: '正在生成比价结果…', loadFailed: '对话加载失败' },
      language: { switch: 'Switch to English', short: 'EN' },
      nav: { main: '主导航', home: '首页', search: '发现', watchlist: '关注', reels: '短视频', profile: '画像', messages: '消息', account: '账号', close: '关闭导航' },
      search: {
        label: '商品发现', title: '先逛逛，再 pico', body: '按品类浏览目录，或直接搜索商品和品牌。点“去比价”就会带着这个商品开始一次比价。',
        placeholder: '搜索商品、品牌或型号', clear: '清空搜索', categories: '品类', all: '全部',
        results: '{{count}} 件商品', loading: '正在搜索…', empty: '没有找到匹配的商品，换个词或品类试试。',
        error: '商品目录暂时加载失败，请稍后再试。', compare: '去比价',
      },
      home: {
        label: '首页', openNav: '打开导航', mascotAction: '和 Picolah 互动并开始比价',
        mascotHello: '先 pico，再买。', mascotReady: '告诉我想买什么吧。',
        taglineBefore: '购物之前，', taglineAfter: ' 一下', question: '今天想找什么好东西？',
      },
      composer: {
        homePlaceholder: '购物之前pico一下', followupPlaceholder: '继续问{{market}}的价格，或上传商品图…',
        inputLabel: '输入比价问题', imageReady: '图片已就绪', removeImage: '移除图片',
        upload: '上传图片搜同款', image: '图片', listening: '正在听你说… 说完会自动停', cancel: '取消',
        voice: '语音输入', stopVoice: '停止语音输入', stop: '停止', send: 'pico 一下',
        sendTitle: '发送 · Enter', stopGeneration: '停止生成', imageAlt: '待发送的商品图片', imageQuery: '帮我看看这张图里的商品，推荐一下',
        localSummary: '本地比价摘要', imageError: '图片处理失败，请换一张试试。',
        voiceUnsupported: '当前浏览器不支持语音输入，可以试试 Chrome 或 Edge。',
        micDenied: '麦克风权限被拒绝，请在浏览器地址栏重新允许。',
        notHeard: '没有听清，再试一次吧。', voiceFailed: '语音输入启动失败，请稍后再试。',
      },
      chat: {
        label: '比价对话', eyebrow: 'PICOLAH / 比价对话', newTitle: '新的比价', new: '新比价',
        online: '价格库在线', connecting: '连接中', openNav: '打开导航', bottom: '回到底部', close: '关闭提示',
        copy: '复制建议', copied: '已复制', helpful: '有帮助', unhelpful: '不太有帮助', source: '价格库',
        userImage: '用户上传的商品图片', recommended: '根据你的需求挑的', noOffers: '这个市场暂无报价，看看同类', popular: '也可以从这些热门商品开始',
        comparing: '正在比价', found: '已找到 {{count}} 条本市场报价，整理完建议后展开比价卡',
        searching: '正在检索价格库…', loading: '正在加载对话', shipping: '运费', coupon: '券后价', trend: '30 日走势',
      },
      messages: {
        label: '消息', description: '每一段对话，都是一次认真比过的价。', search: '搜索对话', clear: '清除搜索',
        new: '新比价', comparison: '价格库比价', noReply: '还没有回复', noMatch: '没有找到这段对话',
        empty: '还没有比价记录', tryAgain: '换个关键词试试，或者直接开始一段新的比价。',
        emptyHint: '说说想买什么，Picolah 会帮你把六个市场的价格摊开。', start: '开始比价',
        promptTitle: '想比点什么？', promptBody: '一句话、一张图，就能把六个市场的到手价一起看清。',
        launch: '发起新比价', media: '支持语音和图片', calculate: '自动算运费和券',
        online: '价格库在线', connecting: '正在连接价格库', marketOffers: '{{markets}} 个市场 · {{offers}} 条在售价',
        retry: '独立爬虫 · 稍后自动重试', today: '今天', yesterday: '昨天', earlier: '更早',
      },
      account: {
        label: '账号', workspace: 'Picolah 工作区', edit: '编辑资料', editNotice: '工作区资料暂存在本地，多设备同步还在路上',
        defaultMarket: '默认市场', defaultMarketHint: '新比价会默认从这个市场开始。', defaultPrice: '默认价格口径', defaultPriceHint: '决定比价卡先按哪种价格排序。',
        currencyNote: '价格按 {{currency}} 展示，不会自动换汇。', activity: '活动记录', activityHint: '集中查看浏览、观看、点赞和收藏记录。',
        watched: '看过的视频', watchedHint: '最近观看的商品测评短视频', browsing: '浏览记录', browsingHint: '最近打开过的商品和比价结果',
        likes: '点赞记录', likesHint: '你点过赞的视频和内容', saved: '收藏内容', savedHint: '保存过的商品、报价和视频', noActivity: '暂无{{label}}，后续记录会显示在这里',
        source: '爬虫数据源', sourceHint: '独立爬虫同步价格，网站只读价格库。', online: '在线', connecting: '连接中', endpoint: '同步接口', lastSync: '上次同步', waiting: '等待首批数据', latest: '最新一批', batch: '{{received}} 收到 / {{upserted}} 更新', today: '今日新增', offers: '{{count}} 条', manage: '管理数据源',
        security: '账号与安全', securityHint: '当前工作区的登录状态和安全设置。', username: '用户名', loginMethod: '登录方式', emailPassword: '邮箱 + 密码', emailCode: '邮箱验证码', email: '绑定邮箱', plan: '方案', free: '免费', recentLogin: '最近登录', localLogin: '刚刚 · 本机浏览器', changePassword: '修改密码', logout: '退出登录',
        privacy: '隐私与数据', privacyHint: '导出或删除你的个人数据。', export: '导出我的数据', deleteLabel: '删除账户', deletePlaceholder: '输入密码确认', deleteWarning: '删除后画像、关注和提醒会一并清除，且不可恢复。', delete: '永久删除', deleting: '删除中…', deleteDone: '账户已删除', deleteFailed: '删除失败，请检查密码后重试',
        passwordNotice: '修改密码功能尚未开放，请使用注册邮箱与当前密码登录', logoutNotice: '已退出登录',
      },
      profile: {
        title: '购物画像', subtitle: '从你的比价与点击里，慢慢读懂你的购物习惯。',
        refresh: '刷新', loading: '正在读取你的购物画像…', loadFailed: '画像加载失败', retry: '重试',
        emptyTitle: '你的购物 DNA 还在形成', emptyHint: '先 pico 一次，比较几件商品、点开几个报价，这里就会长出一张只属于你的购物画像。',
        start: '去 pico 一下', emptyPrivacy: '画像只保存在这台设备的匿名档案里，不会关联你的真实身份。',
        yourPersona: '你的购物人格', activeDays: '活跃 {{count}} 天', comparisons: '{{count}} 次比价', clicks: '{{count}} 次跳转',
        offersSeen: '看过的报价', conversations: '对话',
        traits: '购物性格', traitsHint: '根据你的比价与点击行为估算',
        budget: '常看价位', budgetHint: '你最常比较的到手价区间', budgetRange: '价格带', budgetMedian: '中位数',
        noBudget: '再多看几件商品，就能估算你的价格带。', budgetTip: '画像会随着你的比价慢慢更新。',
        habits: '偏好分布', habitsHint: '市场、平台、品类与品牌',
        topMarkets: '常逛市场', topPlatforms: '常用平台', topCategories: '常看品类', topBrands: '关注品牌',
        notEnough: '数据还不够',
        recent: '最近足迹', recentHint: '最近的比价和跳转', clickEvent: '打开报价', compareEvent: '发起比价',
        privacy: '隐私与数据', privacyHint: '画像只属于这台设备',
        privacyCopy: '我们用一个随机生成的本地 ID 记录匿名行为，不收集姓名、邮箱或账号。你可以随时清空。',
        reset: '清空画像', resetting: '正在清空…', resetDone: '画像已清空',
        resetConfirm: '清空后，购物画像和足迹会从这台设备删除，确定吗？',
      },
      watchlist: {
        label: '关注与提醒', eyebrow: 'WATCHLIST', title: '把想买的东西放进来',
        body: '降价时，Picolah 会在这里留一条提醒；点开就能回到最低报价。',
        items: '件商品', alerts: '价格提醒', markAll: '全部已读', targetHit: '到目标价', priceDrop: '价格下降',
        emptyTitle: '还没有关注任何商品', emptyBody: '在比价卡上点“关注”，或者在对话里让我帮你盯着一个商品。',
        target: '目标价', anyDrop: '任意降价', noOffer: '当前市场暂无在售报价', low30d: '30 日低',
        reached: '已到目标价', watching: '正在关注', remove: '取消关注', add: '关注',
      },
      legal: {
        privacy: '隐私政策',
        terms: '服务条款',
        updated: '最后更新：2026 年 10 月',
        contact: '隐私与数据问题请联系',
      },
      reels: {
        label: 'Reels 商品测评', progress: '短片进度', clip: '第 {{count}} 个短片', openNav: '打开导航', subtitle: '商品测评 · 好价短片', autoplay: '自动播放中', paused: '已暂停', pause: '暂停', play: '播放', soundOn: '打开声音', mute: '静音', prev: '上一个', next: '下一个', review: '测评', todayLow: '今日最低', worth: '值得 pico', like: '喜欢', comment: '评论', share: '分享', save: '收藏', following: '已关注', follow: '关注', currentDeal: '同款当前好价', compare: '去比价', currentMarket: '当前市场', demoPrice: '短片中的价格为演示数据', navigate: '上下滑动 / 点击箭头切换',
        linkCopied: 'Reels 链接已复制，去分享给朋友吧', linkFailed: '链接复制失败，可以手动分享页面地址', soundDemo: '已打开声音（演示短片暂无音轨）', muted: '已静音', comments: '这条短片有 {{count}} 条评论，先去看看同款价格吧',
      },
      comparison: { item: '商品', shipping: '运费', freeShipping: '包邮', coupon: '券', updated: '更新于', seller: '在售平台 / 店铺', trend: '近 30 天', official: '官方', best: '最低', reviews: '评价', low: '30日低', visit: '去平台', affiliate: '部分购买链接为联盟链接，我们可能获得佣金，不影响你的价格和排序。', unavailable: '{{market}}暂时没有在售报价', unavailableHint: '价格库还没有覆盖这个市场，或者报价刚刚下架。可以切换市场，或看看下面的同类选择。', currentMarket: '当前市场', noOffer: '暂无报价', seeAlso: '也可以看看', askCheapest: '{{product}} 在{{market}}哪里买最便宜？', chartTitle: '报价一眼对比', chartHint: '柱长显示本组相对差异', priceMetric: '价格', ratingMetric: '评分', reviewMetric: '评论数', lowerBetter: '越低越好', higherBetter: '越高越好' },
      controls: {
        changeMarket: '切换比价市场', selectMarket: '选择市场', market: '比价市场', localCurrency: '价格按本地货币展示，不自动换汇',
        priceBasis: '价格口径', fourTypes: '4 种',
        landed: { label: '到手价', hint: '商品价 + 运费 − 优惠券，实际要付的钱' },
        item: { label: '商品价', hint: '商品标价，不含运费和优惠' },
        shipping: { label: '含运费', hint: '商品价 + 运费，不扣优惠券' },
        history: { label: '30日低', hint: '该平台近 30 天出现过的最低价' },
      },
    },
  },
  en: {
    translation: {
      app: { title: 'Picolah · Pico before you buy', understanding: 'Understanding your request…', generating: 'Preparing the comparison…', loadFailed: 'Could not load the conversation' },
      language: { switch: '切换为中文', short: '中' },
      nav: { main: 'Main navigation', home: 'Home', search: 'Discover', watchlist: 'Watchlist', reels: 'Reels', profile: 'Profile', messages: 'Messages', account: 'Account', close: 'Close navigation' },
      search: {
        label: 'Product discovery', title: 'Browse first, pico next', body: 'Explore the catalog by category, or search for a product or brand. “Compare” starts a price comparison with that product.',
        placeholder: 'Search products, brands or models', clear: 'Clear search', categories: 'Categories', all: 'All',
        results: '{{count}} products', loading: 'Searching…', empty: 'No matching products. Try another word or category.',
        error: 'The catalog could not load. Please try again.', compare: 'Compare',
      },
      home: {
        label: 'Home', openNav: 'Open navigation', mascotAction: 'Interact with Picolah and start comparing',
        mascotHello: 'Pico before you buy.', mascotReady: 'Tell me what you want to buy.',
        taglineBefore: 'Before you shop, ', taglineAfter: '', question: 'What are you looking for today?',
      },
      composer: {
        homePlaceholder: 'Pico before you buy', followupPlaceholder: 'Ask about prices in {{market}}, or upload a product image…',
        inputLabel: 'Enter a price comparison question', imageReady: 'Image ready', removeImage: 'Remove image',
        upload: 'Upload an image to find a match', image: 'Image', listening: 'Listening… it will stop automatically', cancel: 'Cancel',
        voice: 'Voice input', stopVoice: 'Stop voice input', stop: 'Stop', send: 'Pico it',
        sendTitle: 'Send · Enter', stopGeneration: 'Stop generating', imageAlt: 'Product image ready to send', imageQuery: 'Identify this product and recommend the best offer',
        localSummary: 'Local price summary', imageError: 'Could not process the image. Please try another one.',
        voiceUnsupported: 'Voice input is not supported in this browser. Try Chrome or Edge.',
        micDenied: 'Microphone access was denied. Allow it from the browser address bar.',
        notHeard: 'I did not catch that. Please try again.', voiceFailed: 'Could not start voice input. Please try again later.',
      },
      chat: {
        label: 'Price comparison', eyebrow: 'PICOLAH / PRICE COMPARISON', newTitle: 'New comparison', new: 'New comparison',
        online: 'Price database online', connecting: 'Connecting', openNav: 'Open navigation', bottom: 'Back to bottom', close: 'Dismiss',
        copy: 'Copy advice', copied: 'Copied', helpful: 'Helpful', unhelpful: 'Not helpful', source: 'Price database',
        userImage: 'Product image uploaded by the user', recommended: 'Picked for your needs', noOffers: 'No offers in this market—try similar products', popular: 'Or start with these popular products',
        comparing: 'Comparing prices', found: '{{count}} local offers found. Preparing the comparison card…',
        searching: 'Searching the price database…', loading: 'Loading conversation', shipping: 'Shipping', coupon: 'After coupon', trend: '30-day trend',
      },
      messages: {
        label: 'Messages', description: 'Every conversation is a carefully checked comparison.', search: 'Search conversations', clear: 'Clear search',
        new: 'New comparison', comparison: 'Price comparison', noReply: 'No reply yet', noMatch: 'No conversation found',
        empty: 'No comparisons yet', tryAgain: 'Try another keyword or start a new comparison.',
        emptyHint: 'Tell Picolah what you want and compare prices across six markets.', start: 'Start comparing',
        promptTitle: 'What would you like to compare?', promptBody: 'Use a sentence or image to compare landed prices across six markets.',
        launch: 'Start a new comparison', media: 'Voice and images supported', calculate: 'Shipping and coupons included',
        online: 'Price database online', connecting: 'Connecting to price database', marketOffers: '{{markets}} markets · {{offers}} active offers',
        retry: 'Independent crawler · retrying shortly', today: 'Today', yesterday: 'Yesterday', earlier: 'Earlier',
      },
      account: {
        label: 'Account', workspace: 'Picolah Workspace', edit: 'Edit profile', editNotice: 'Workspace details are stored locally; multi-device sync is coming later',
        defaultMarket: 'Default market', defaultMarketHint: 'New comparisons start in this market.', defaultPrice: 'Default price basis', defaultPriceHint: 'Choose how comparison cards are sorted first.',
        currencyNote: 'Prices are shown in {{currency}} with no automatic conversion.', activity: 'Activity', activityHint: 'Review browsing, watched, liked, and saved items.',
        watched: 'Watched videos', watchedHint: 'Recently watched product reviews', browsing: 'Browsing history', browsingHint: 'Recently opened products and comparisons',
        likes: 'Likes', likesHint: 'Videos and content you liked', saved: 'Saved items', savedHint: 'Saved products, offers, and videos', noActivity: 'No {{label}} yet. Future activity will appear here.',
        source: 'Crawler data source', sourceHint: 'An independent crawler syncs prices; the site only reads the database.', online: 'Online', connecting: 'Connecting', endpoint: 'Sync endpoint', lastSync: 'Last sync', waiting: 'Waiting for first batch', latest: 'Latest batch', batch: '{{received}} received / {{upserted}} updated', today: 'Added today', offers: '{{count}} offers', manage: 'Manage data source',
        security: 'Account & security', securityHint: 'Login status and security settings for this workspace.', username: 'Username', loginMethod: 'Login method', emailPassword: 'Email + password', emailCode: 'Email verification code', email: 'Linked email', plan: 'Plan', free: 'Free', recentLogin: 'Recent login', localLogin: 'Just now · This browser', changePassword: 'Change password', logout: 'Log out',
        privacy: 'Privacy & data', privacyHint: 'Export or delete your personal data.', export: 'Export my data', deleteLabel: 'Delete account', deletePlaceholder: 'Enter your password', deleteWarning: 'Your profile, watchlist and alerts are removed permanently and cannot be recovered.', delete: 'Delete permanently', deleting: 'Deleting…', deleteDone: 'Account deleted', deleteFailed: 'Could not delete the account. Check your password.',
        passwordNotice: 'Password changes are not available yet. Sign in with your registered email and current password.', logoutNotice: 'Signed out',
      },
      profile: {
        title: 'Shopping DNA', subtitle: 'A profile that learns how you shop, one comparison at a time.',
        refresh: 'Refresh', loading: 'Reading your shopping profile…', loadFailed: 'Could not load your profile', retry: 'Try again',
        emptyTitle: 'Your shopping DNA is still forming', emptyHint: 'Pico a few products, compare offers, and open a few store links—your personal profile will grow here.',
        start: 'Start a comparison', emptyPrivacy: 'Your profile lives in an anonymous local archive on this device. It is not linked to your real identity.',
        yourPersona: 'Your shopping persona', activeDays: 'Active {{count}} days', comparisons: '{{count}} comparisons', clicks: '{{count}} store visits',
        offersSeen: 'Offers seen', conversations: 'Conversations',
        traits: 'Shopping traits', traitsHint: 'Estimated from your comparisons and clicks',
        budget: 'Typical budget', budgetHint: 'The landed-price range you compare most', budgetRange: 'Price range', budgetMedian: 'Median',
        noBudget: 'Compare a few more products to estimate your range.', budgetTip: 'Your profile updates as you keep comparing.',
        habits: 'Preference mix', habitsHint: 'Markets, platforms, categories and brands',
        topMarkets: 'Top markets', topPlatforms: 'Top platforms', topCategories: 'Top categories', topBrands: 'Brands you watch',
        notEnough: 'Not enough data yet',
        recent: 'Recent footprint', recentHint: 'Your latest comparisons and store visits', clickEvent: 'Opened an offer', compareEvent: 'Started a comparison',
        privacy: 'Privacy & data', privacyHint: 'Your profile belongs to this device',
        privacyCopy: 'We use a random local ID to record anonymous behavior. No name, email or account is collected. You can clear it anytime.',
        reset: 'Clear profile', resetting: 'Clearing…', resetDone: 'Profile cleared',
        resetConfirm: 'This removes your shopping profile and footprint from this device. Continue?',
      },
      watchlist: {
        label: 'Watchlist & alerts', eyebrow: 'WATCHLIST', title: 'Keep an eye on what you want',
        body: 'When the price drops, Picolah leaves an alert here with a link to the best offer.',
        items: 'items', alerts: 'Price alerts', markAll: 'Mark all read', targetHit: 'Target reached', priceDrop: 'Price dropped',
        emptyTitle: 'Nothing on your watchlist yet', emptyBody: 'Tap “Watch” on a comparison, or ask me to keep an eye on a product.',
        target: 'Target', anyDrop: 'Any drop', noOffer: 'No active offer in this market', low30d: '30-day low',
        reached: 'Target reached', watching: 'Watching', remove: 'Remove', add: 'Watch',
      },
      legal: {
        privacy: 'Privacy Policy',
        terms: 'Terms of Service',
        updated: 'Last updated: October 2026',
        contact: 'Privacy and data questions:',
      },
      reels: {
        label: 'Product review Reels', progress: 'Reel progress', clip: 'Reel {{count}}', openNav: 'Open navigation', subtitle: 'Product reviews · quick deals', autoplay: 'Autoplaying', paused: 'Paused', pause: 'Pause', play: 'Play', soundOn: 'Turn sound on', mute: 'Mute', prev: 'Previous', next: 'Next', review: 'Review', todayLow: "Today's low", worth: 'Worth a pico', like: 'Like', comment: 'Comment', share: 'Share', save: 'Save', following: 'Following', follow: 'Follow', currentDeal: 'Current deal for this item', compare: 'Compare', currentMarket: 'Current market', demoPrice: 'Prices in Reels are demo data', navigate: 'Swipe or use the arrows to switch',
        linkCopied: 'Reels link copied—share it with a friend', linkFailed: 'Could not copy the link. Share the page URL manually.', soundDemo: 'Sound is on (demo Reels have no audio track)', muted: 'Muted', comments: 'This Reel has {{count}} comments. Compare the product price next.',
      },
      comparison: { item: 'Item', shipping: 'Shipping', freeShipping: 'Free', coupon: 'Coupon', updated: 'Updated', seller: 'Platform / seller', trend: 'Last 30 days', official: 'Official', best: 'Best', reviews: 'reviews', low: '30-day low', visit: 'Visit store', affiliate: 'Some purchase links are affiliate links. We may earn a commission; your price and ranking are unaffected.', unavailable: 'No active offers in {{market}}', unavailableHint: 'This market is not covered yet, or its offers have just ended. Switch markets or try a similar product below.', currentMarket: 'Current market', noOffer: 'No offers', seeAlso: 'You may also like', askCheapest: 'Where is {{product}} cheapest in {{market}}?', chartTitle: 'Offers at a glance', chartHint: 'Bar lengths show relative differences in this group', priceMetric: 'Price', ratingMetric: 'Rating', reviewMetric: 'Reviews', lowerBetter: 'Lower is better', higherBetter: 'Higher is better' },
      controls: {
        changeMarket: 'Change comparison market', selectMarket: 'Select market', market: 'Comparison market', localCurrency: 'Prices use local currencies with no automatic conversion',
        priceBasis: 'Price basis', fourTypes: '4 types',
        landed: { label: 'Landed price', hint: 'Item + shipping − coupon: what you actually pay' },
        item: { label: 'Item price', hint: 'Listed item price before shipping and discounts' },
        shipping: { label: 'With shipping', hint: 'Item + shipping before coupons' },
        history: { label: '30-day low', hint: 'Lowest price seen on this platform in 30 days' },
      },
    },
  },
} as const;

const savedLanguage = (() => {
  try {
    return localStorage.getItem('picolah.language');
  } catch {
    return null;
  }
})();

void i18n.use(initReactI18next).init({
  resources,
  lng: savedLanguage === 'en' ? 'en' : 'zh',
  fallbackLng: 'zh',
  interpolation: { escapeValue: false },
});

i18n.on('languageChanged', (language) => {
  document.documentElement.lang = language;
  try {
    localStorage.setItem('picolah.language', language);
  } catch {
    // Keep language in memory when storage is unavailable.
  }
});

document.documentElement.lang = i18n.language;

export default i18n;
