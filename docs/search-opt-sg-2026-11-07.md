# 新加坡商品页检索：提示词与工具优化复测

2026-11-07，正式网站 `https://picolah.com/api/chat`。从此前固定的 30 款中预选 12 款：包含 4 个混入错误报价的案例、3 个仅有跨境本币页面的案例、3 个查价失败案例，以及小米 14 和 LEGO 10328 两个对照。原始商品名、国家 SG、并发 3，每项新开会话，保留首次结果。定向复测不能外推成全部商品成功率。

按同一口径，旧版明确新加坡站点 6/12（50.0%），本轮复核 7/12（58.3%）。本轮接口原始返回价格 7/12（58.3%），流式完成 12/12，应用结果缓存命中 1/12。成功项返回报价中位时间 79.5 秒。

复核要求：目标国家站点或地区专区、请求的产品及明确规格匹配、正数 SGD 页面价、带详情页链接和核验时间。缺货或库存未知可以有页面标价。没有取得报价不等于没有在售。检查基于接口的商品页核验记录和返回标题/链接；除额外注明外没有另行独立重抓每个商家。

| 商品 | 上轮明确 SG | 本轮示例页面价 | 说明 |
|---|---|---|---|
| 小米14 | 是 | [SGD 669](https://www.1p.sg/products/xiaomi-14) | 1P 新加坡的 512GB/12GB，显示缺货。此请求命中上线验收产生的缓存；独立重读 HTML 核实相同页面价。 |
| Sony WH-CH720N | 否 | — | 17 个候选页均未核验出可用价格；上轮是 Shop.app 通用站点的 SGD 页面。 |
| Razer DeathAdder V3 | 否 | [SGD 106](https://online.challenger.sg/products/razer-deathadder-v3-mse?variant=41843134201931) | Challenger 新加坡，有线标准版，没有换成 HyperSpeed 或 Pro。独立重读 Markdown 确认同价；库存未明确。 |
| Nikon Z50 II | 是 | [SGD 1679](https://webtronic.sg/en/item/categoryitem/WEB23343-001) | Webtronic 新加坡的 Z50 II 双镜套装，直接重读 HTML 核实同价。五条均为相机套装，无上轮摄影指南。 |
| Sennheiser Momentum 4 Wireless | 是 | [SGD 349](https://online.challenger.sg/products/sennheiser-momentum-4-wireless-headphones-graphite) | Challenger 的标准石墨色耳机；另列周年特别版，不能作同规格比较。未返回上轮 HardwareZone 新闻页。 |
| Philips AC1715/30 | 否 | — | 两轮发现后没有可查的本地候选；未用 /10 等其他地区型号替代 /30。 |
| LEGO 10328 | 是 | [SGD 89.99](https://www.toysrus.com.sg/lego-botanical-bouquet-of-roses-10328-10009109.html) | Toys“R”Us 新加坡玫瑰花束，编号 10328；直接重读 HTML 核实同价。 |
| Samsung 990 PRO 1TB | 否 | — | 核验了 15 个页面，没有取得有效的本地 1TB 报价；上轮只返回跨境页面。 |
| Braun Series 9 Pro 9465cc | 否 | — | 发现并查了 2 个本地页面，没有核验出 9465cc 的有效价格。 |
| Insta360 X4 | 是 | [SGD 628](https://store.insta360.com/sg/product/x4) | 品牌官方新加坡专区的 X4；另一条为附 32GB 卡的商品。没有上轮的新闻发布价。 |
| Nintendo Switch OLED | 是 | [SGD 626](https://www.ubuy.com.sg/product/PSG0UFLCC-nintendo-switch-neon-white-black-edition-64gb-oled-console-international-version) | Ubuy 新加坡站的 OLED 64GB 国际版，库存未明确；是地区站报价，不证明本地仓发货。没有上轮把 Lite 混入的分类页区间。 |
| Oral-B iO 6 | 否 | — | 本次核验了 1 个候选，没有取得有效标价。上轮通用跨境页面不能作为明确 SG 证据。 |

验证环境：发布 local-product-evidence-20261107T063714Z；本地抓取 244 个测试、Web 309 个测试通过，Web 构建和抓取类型检查通过。候选与正式服务均通过真实查价、普通写作、查价后“换一个呢”不调用查价工具的检查。独立测试访客会话已清理。

与上轮逐款对照：新增 Razer DeathAdder V3；此前有明确 SG 站点的 6 款这次都保留。上轮单纯看接口返回是 9/12，本轮是 7/12；差异包含原先仅有跨境本币页面的 3 款。此次应用缓存只命中小米 14，另 6 款成功在该请求重新核验。上轮混入的摄影指南、两篇新闻和 OLED/Lite 混合分类页此次均未出现在返回报价中。

额外核验：从商家重新读取 HTML 或 Markdown，复核了小米、Razer、Nikon 和 LEGO 表内示例的相同金额；不同读取方式有时返回限流或超时，不作成功证据。真实 Chrome 在 picolah.com 先写乔迁祝福再要求缩短，两次回答均显示，均未返回商品卡，测试访客会话清理为 0。

原始流、报价和逐项复核记录位于本地 `.tmp/search-opt-retest-1107/`。
