# 新商品批次搜索修复与线上定向复测

首轮复测时间（北京时间）：2026-11-06 19:07:16 至 2026-11-06 19:16:11。

## 修复内容

- 查询保留完整品牌、系列和规格；不再把 LEGO 10328、Pro 9465cc、Cream 454g、Insta360 误建为型号，荣耀等中文品牌转为可搜索名称。
- 空气净化器的 Air、护肤品的 Repair/Skin 不再触发不相关的型号或维修配件过滤；支持品牌重音字符与繁体名称。
- 区分 Instant Pot Duo / Duo Crisp、Owala FreeSip / Twist、Razer DeathAdder V3 / HyperSpeed / Pro；排除 XPS 9340 与旧 Core i 处理器相互矛盾的标题。
- 拦截明确声明仅供参考的 CASHBACK 跳转店价格、按批量定制的总价；保留普通返现促销和真实高价商品。
- MPB 类页面从绑定主商品标题的可见库存段落提取最新二手区间价；标注二手、价格范围，避免相关商品与旧 Fetch 快照覆盖可用的 HTML 价格。

## 部署与验证

生产修复版本：`new30-repair-20261106T110553Z`。只部署相关源码差异，环境变量、数据挂载及无关运行文件均经过校验保持一致，保留回滚镜像。

- 生产候选镜像：抓取测试 215/215、服务端相关测试 68/68；两端类型检查通过。
- 合并到本地现有工作后：抓取测试 245/245、查询相关测试 44/44。
- 候选及生产报价渲染检查通过；网站与抓取服务健康。

## 首轮复测口径与结果

固定选取上一批 30 个商品中的 13 个受影响查询，使用完全相同的原始搜索词，从线上 `/api/chat` 重新搜索；并发 3，独立访客身份，不用重试覆盖失败。缺货、预售、库存未知、明确标注的起价或区间价可计入；错型号、配件、分期、占位价、聚合页不计入。

- 原始返回价格：12/13（92.3%）。
- 复核通过：12/13（92.3%）。
- 应用结果缓存命中：0/13；完整结束：13/13。
- 成功项价格返回中位耗时：107.35 秒。
- 测试会话已清理，剩余 0。

这是已知问题的定向复测，不能替换上一轮 30 款商品的成功率，更不等同于全站成功率。复核依据是接口商品页验证记录、标题规格及来源；对已发现的异常来源另做快照回放和页面核查，并未独立检查所有商家的每条报价。

| # | 原搜索词 | 复核 | 样例页面价 | 秒 | 说明 |
|---:|---|---|---|---:|---|
| 1 | Google Pixel 9 128GB | 成功 | [USD 284.61](https://www.ebay.com/p/10071478529?iid=147589529892) | 93.5 | Pixel 9 128GB 型号容量匹配；eBay 页面返回多条同款报价，样例 USD 284.61。 |
| 2 | Dell XPS 13 9340 | 成功 | [JOD 1289](https://gds.jo/dell/dell-xps-13-9340-platinum-13-4-fhd-120hz-ips-intel-core-ultra-7-155h-16gb-lpddr5x-512gb-nvme-ssd-3-years-warranty?order=DESC&page=1&sort=p.price) | 108.3 | 保留 Core Ultra 7 155H 的 9340 报价；原先 i7-1355U 规格冲突来源已排除。 |
| 6 | LEGO 10328 | 成功 | [EUR 49.9](https://www.coolblue.de/en/product/972462/lego-botanicals-bouquet-of-roses-10328.html) | 135.5 | LEGO 10328 已按完整名称搜索，Coolblue 等三个商品页面返回对应套装价格。 |
| 11 | Braun Series 9 Pro 9465cc | 成功 | [AED 3269](https://ae.tejar.com/braun-series-9-pro-9465cc-electric-shaver) | 106.4 | 完整保留 Braun Series 9 Pro 9465cc；三家商店匹配该型号，缺货项已标注。 |
| 16 | Beats Studio Pro | 成功 | [USD 199.99](https://www.bestbuy.com/product/beats-studio-pro-wireless-noise-cancelling-over-the-ear-headphones-duotone-gray/JJGCQP9KV8?condition=excellent&intl=nosplash) | 114.9 | HKTV CASHBACK 的 9999 占位价已排除；Best Buy 商品页提供 USD 199.99 新品和另列的二手报价。 |
| 18 | Owala FreeSip 24oz | 成功 | [USD 29.99](https://www.gliks.com/products/owala-freesip-24oz-stainless-steel-water-bottle-in-blue-oasis-c05951-blueoasis) | 166.7 | 只返回 FreeSip 24oz 单瓶 USD 29.99；Twist 版本和定制批量总价已消失。 |
| 21 | Insta360 X4 | 成功 | [HKD 3399](https://store.insta360.com/HK/product/x4) | 112.9 | 官方 X4 页面 HKD 3399；MPB 正确返回 GBP 234–279 并标注二手。额外低价来源正文型号规格与 X4 一致，2.7K 是受支持模式，不按标题误判；未核验商家履约。 |
| 23 | Instant Pot Duo 6L | 成功 | [ZAR 2399](https://kloppers.co.za/product/instant-pot-duo-cooker/) | 72.6 | 返回 Duo 7-in-1 6L 基础款，标注缺货页面价；Duo Crisp 已排除。 |
| 24 | CeraVe Moisturising Cream 454g | 成功 | [EUR 20.13](https://www.cultbeauty.com/p/cerave-moisturising-cream-pot-with-ceramides-for-dry-to-very-dry-skin-454g/11798691/) | 102.0 | 实际搜索保留 CeraVe 品牌与 454g；返回 Cult Beauty 和 Lookfantastic 对应商品页。 |
| 25 | 荣耀 Magic6 Pro 512GB | 成功 | [SAR 3499](https://gcc.luluhypermarket.com/en-sa/honor-magic6-pro-dual-sim-5g-smartphone-12-gb-ram-512-gb-storage-epi-green/p/2252645/) | 100.8 | 中文荣耀已转换为 Honor，返回两个 Magic6 Pro 512GB 页面价格并标注缺货。 |
| 26 | Razer DeathAdder V3 | 成功 | [EUR 84.99](https://www.currys.ie/products/razer-deathadder-v3-optical-gaming-mouse-black-10246917.html) | 71.5 | 只返回基础款 DeathAdder V3；HyperSpeed 无线版本已排除。 |
| 29 | Philips AC1715/30 | 未取得 | — | — | 本轮仍未获得完整 AC1715/30 型号的有效页面价格；保留失败结果，继续诊断候选与抓取。 |
| 30 | Estee Lauder Advanced Night Repair 50ml | 成功 | [USD 62.17](https://business.walmart.com/ip/Estee-Lauder-Advanced-Night-Repair-Synchronized-Multi-Recovery-Complex-50ml-1-7oz/604998590) | 111.9 | 修复 Repair 和重音品牌匹配后，Walmart 返回 50ml 的 USD 62.17；额外 Goxip 聚合来源已准备单独过滤。 |

## 原始证据

上次原始记录保持不变：`docs/page-price-new30-2026-11-06.md`。本次 `.tmp/new30-repair-20261106/` 保存生产镜像快照、源码差异、部署结果、测试日志、抓取回放；`retest/` 保存固定清单、SSE、原始结果与复核。

## 第二轮补修与复测

第二轮生产版本：`new30-complete-20261106T112429Z`。

首轮飞利浦 AC1715/30 的失败记录保留。进一步抓取发现完整型号位于 Amazon 主商品副标题，旧解析器未读取；英国站展示新版购买框且没有美元站点所用的币种字段。补修支持 UK 英镑符号、移动端商品链接和主商品副标题，并将价格绑定到已选新品购买框，避免重复的二手或隐藏价格区块。真实页面快照成功解析 GBP 198.44，型号匹配。

同时排除 Goxip 聚合来源及 Duo Easy 版本；不会用聚合页替代商家商品页，也不会把不同 Duo 版本混入基础款。Goxip 的平台性质参见其[官方介绍](https://www.goxip.com/sg/en/about)。

第二轮候选镜像：抓取测试 217/217、服务端相关测试 68/68、两端类型检查通过。合并到本地现有工作后的抓取测试为 247/247。候选与生产检查通过，环境变量、数据挂载和无关运行文件保持一致。

在第二轮生产版重新搜索 3 个受影响原查询：原始返回 2/3，复核通过 2/3，应用缓存命中 0/3；测试会话清理后剩余 0。这是追加复测，没有替换首轮的 12/13，也不代表完整 30 款商品或全站成功率。

| 商品 | 第二轮复核 | 页面价 | 说明 |
|---|---|---|---|
| Instant Pot Duo 6L | 成功 | [ZAR 2399](https://kloppers.co.za/product/instant-pot-duo-cooker/) | 保留明确标注 Duo 7-in-1 6L 的页面价；Crisp/Easy 版本未混入，另有 6QT/5.7L 地区标注来源，规格原样展示。 |
| Philips AC1715/30 | 未取得 | — | 第二轮仍未成功，保留 PRODUCT_PAGE_UNVERIFIED；继续补修 Fetch 的主标题和副标题区块读取。 |
| Estee Lauder Advanced Night Repair 50ml | 成功 | [USD 62.17](https://business.walmart.com/ip/Estee-Lauder-Advanced-Night-Repair-Synchronized-Multi-Recovery-Complex-50ml-1-7oz/604998590) | Walmart 50ml 页面 USD 62.17 正常；Goxip 聚合来源已从最终结果排除。 |

X4 的某候选标题含 2.7K，但正文参数吻合；[官方规格](https://www.insta360.com/specs/x4)明确支持该拍摄模式，因此没有基于单个分辨率词误拦截该来源。样例优先采用官方商品页，页面价格核验不代表商家履约验证。

第二轮原始证据保存在 `.tmp/new30-repair-20261106/final-retest/`；第二轮发布证据在 `complete/deployment.json`。两轮失败与成功均独立保留。

## 最终 Fetch 补修与第三轮复测

当前生产版本：`new30-fetch-20261106T113545Z`。最终抓取测试 219/219、服务端相关测试 68/68、两端类型检查及候选/生产检查通过；本地合并后抓取测试 249/249。

第二轮飞利浦仍失败，Fetch 把 About this item 等栏目当成多个一级标题，导致商品区块无法解析。补修仅对 Amazon UK 商品链接定位与页面标题一致的唯一主标题，保留紧随其后的型号副标题和价格区块，截止于下一个栏目；不会从相关商品或参数推荐中取价。HTML 若缺少型号而同页 Fetch 的主标题和型号副标题能够相互印证，可保留 Fetch 页面价并标注库存未知；HTML 中明确矛盾的型号仍拒绝。

第三轮仅重测飞利浦 AC1715/30：复核 通过，缓存命中 0/1，测试会话剩余 0。 本次返回 [GBP 198.44](https://www.amazon.co.uk/dp/B09JGD91TS)，完整 AC1715/30 型号来自主商品副标题，Amazon UK 页面价 GBP 198.44，最终返回来源为 HTML，缓存未命中。

三轮必须分别解读：首轮固定 13 项为 12/13；第二轮三个相关项为 2/3；第三轮飞利浦单项为 1/1。原始失败未被删除或覆盖，没有重新执行完整 30 款样本，因此不能将这些定向重测合成全站成功率。

第三轮证据在 `.tmp/new30-repair-20261106/philips-retest/`；最终部署及回滚信息在 `fallback/deployment.json`。

发布校验范围：服务端类型检查覆盖 server/shared/mock，沿用既有配置排除了已知存在问题的 `server/chat-content.test.ts`；上述测试数为本次抓取全套及服务端相关用例，不代表全仓库或真实浏览器验收。最终公网健康接口 HTTP 200，两个容器 healthy，三轮测试访客会话均清理为 0。
