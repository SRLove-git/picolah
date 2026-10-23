import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

const resources = {
  zh: {
    translation: {
      app: { title: 'Picolah · 购物之前 PICO 一下', understanding: '正在理解问题…', generating: '正在生成比价结果…', loadFailed: '对话加载失败' },
      language: { switch: 'Switch to English', short: 'EN' },
      nav: { main: '主导航', home: '首页', reels: '短视频', messages: '消息', account: '账号', close: '关闭导航' },
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
        security: '账号与安全', securityHint: '当前工作区的登录状态和安全设置。', username: '用户名', loginMethod: '登录方式', emailCode: '邮箱验证码', email: '绑定邮箱', plan: '方案', free: '免费', recentLogin: '最近登录', localLogin: '刚刚 · 本机浏览器', changePassword: '修改密码', logout: '退出登录',
        passwordNotice: '演示工作区：验证码登录和改密还没有接后端', logoutNotice: '这是本地演示工作区，退出登录暂未启用',
      },
      reels: {
        label: 'Reels 商品测评', progress: '短片进度', clip: '第 {{count}} 个短片', openNav: '打开导航', subtitle: '商品测评 · 好价短片', autoplay: '自动播放中', paused: '已暂停', pause: '暂停', play: '播放', soundOn: '打开声音', mute: '静音', prev: '上一个', next: '下一个', review: '测评', todayLow: '今日最低', worth: '值得 pico', like: '喜欢', comment: '评论', share: '分享', save: '收藏', following: '已关注', follow: '关注', currentDeal: '同款当前好价', compare: '去比价', currentMarket: '当前市场', demoPrice: '短片中的价格为演示数据', navigate: '上下滑动 / 点击箭头切换',
        linkCopied: 'Reels 链接已复制，去分享给朋友吧', linkFailed: '链接复制失败，可以手动分享页面地址', soundDemo: '已打开声音（演示短片暂无音轨）', muted: '已静音', comments: '这条短片有 {{count}} 条评论，先去看看同款价格吧',
      },
      comparison: { item: '商品', shipping: '运费', freeShipping: '包邮', coupon: '券', updated: '更新于', seller: '在售平台 / 店铺', trend: '近 30 天', official: '官方', best: '最低', reviews: '评价', low: '30日低', visit: '去平台', unavailable: '{{market}}暂时没有在售报价', unavailableHint: '价格库还没有覆盖这个市场，或者报价刚刚下架。可以切换市场，或看看下面的同类选择。', currentMarket: '当前市场', noOffer: '暂无报价', seeAlso: '也可以看看', askCheapest: '{{product}} 在{{market}}哪里买最便宜？', chartTitle: '报价一眼对比', chartHint: '柱长显示本组相对差异', priceMetric: '价格', ratingMetric: '评分', reviewMetric: '评论数', lowerBetter: '越低越好', higherBetter: '越高越好' },
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
      nav: { main: 'Main navigation', home: 'Home', reels: 'Reels', messages: 'Messages', account: 'Account', close: 'Close navigation' },
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
        security: 'Account & security', securityHint: 'Login status and security settings for this workspace.', username: 'Username', loginMethod: 'Login method', emailCode: 'Email verification code', email: 'Linked email', plan: 'Plan', free: 'Free', recentLogin: 'Recent login', localLogin: 'Just now · This browser', changePassword: 'Change password', logout: 'Log out',
        passwordNotice: 'Demo workspace: login and password changes are not connected to a backend', logoutNotice: 'This is a local demo workspace; logout is not enabled',
      },
      reels: {
        label: 'Product review Reels', progress: 'Reel progress', clip: 'Reel {{count}}', openNav: 'Open navigation', subtitle: 'Product reviews · quick deals', autoplay: 'Autoplaying', paused: 'Paused', pause: 'Pause', play: 'Play', soundOn: 'Turn sound on', mute: 'Mute', prev: 'Previous', next: 'Next', review: 'Review', todayLow: "Today's low", worth: 'Worth a pico', like: 'Like', comment: 'Comment', share: 'Share', save: 'Save', following: 'Following', follow: 'Follow', currentDeal: 'Current deal for this item', compare: 'Compare', currentMarket: 'Current market', demoPrice: 'Prices in Reels are demo data', navigate: 'Swipe or use the arrows to switch',
        linkCopied: 'Reels link copied—share it with a friend', linkFailed: 'Could not copy the link. Share the page URL manually.', soundDemo: 'Sound is on (demo Reels have no audio track)', muted: 'Muted', comments: 'This Reel has {{count}} comments. Compare the product price next.',
      },
      comparison: { item: 'Item', shipping: 'Shipping', freeShipping: 'Free', coupon: 'Coupon', updated: 'Updated', seller: 'Platform / seller', trend: 'Last 30 days', official: 'Official', best: 'Best', reviews: 'reviews', low: '30-day low', visit: 'Visit store', unavailable: 'No active offers in {{market}}', unavailableHint: 'This market is not covered yet, or its offers have just ended. Switch markets or try a similar product below.', currentMarket: 'Current market', noOffer: 'No offers', seeAlso: 'You may also like', askCheapest: 'Where is {{product}} cheapest in {{market}}?', chartTitle: 'Offers at a glance', chartHint: 'Bar lengths show relative differences in this group', priceMetric: 'Price', ratingMetric: 'Rating', reviewMetric: 'Reviews', lowerBetter: 'Lower is better', higherBetter: 'Higher is better' },
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
