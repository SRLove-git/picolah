# 页面价格搜索成功率：40 项线上实测

测试时间（UTC）：2026-11-06T07:54:55.369Z 至 2026-11-06T08:16:41.564Z。

**页面价格成功率：32/40（80.0%）。** 原有 20 项：18/20（90.0%）；新增 20 项：14/20（70.0%）。

## 测试口径

通过正式网站 `https://picolah.com/api/chat` 发起 40 个预先固定的商品词，3 并发，每个词仅统计首次搜索，客户端最长等待 420 秒。测试使用独立访客身份；没有重启服务、清理公共缓存或在测试中修改生产代码。
成功指返回匹配商品的页面金额、币种及来源链接。缺货、预售、库存未知、起价、区间价都可计入，不要求有货或完整到手价。金额必须为正，来源标记为 product-page，核验时间符合现有 5 分钟缓存时效。每个成功商品至少选取一条返回报价，人工检查该报价的标题和来源 URL；并非每个商家页面都进行了第二次独立抓取，不代表已经验证结算、配送或全部报价金额的准确性。
首轮结果永久保留；本报告的失败项不会被后续重试替换。商品样本以电子产品和家电为主，不能直接推广为所有商品的成功率。

## 结果

- 原始返回价格：33/40；标题/来源复核后：32/40（80.0%）。
- 缓存命中：1 项；非缓存搜索成功率：31/39（79.5%）。
- 成功返回价格的中位耗时：86.48 秒；非缓存中位耗时：87.9 秒；P90：123.4 秒。
- 60/120/180 秒内成功：7/40、27/40、31/40。
- SSE 完整结束：40/40；返回报价共 142 条（含不同规格和颜色）；非缓存请求共读取 498 页。
- 测试会话清理后剩余：0。

| 类别 | 成功/样本 | 成功率 |
|---|---:|---:|
| 家电 | 5/9 | 55.6% |
| 音频 | 6/6 | 100.0% |
| 电脑/相机 | 9/11 | 81.8% |
| 玩具/鞋服/护肤 | 4/5 | 80.0% |
| 手机 | 4/4 | 100.0% |
| 穿戴/游戏 | 4/5 | 80.0% |

## 逐项结果

| 序号 | 搜索词 | 页面价 | 缓存 | 原始返回价格秒 | 说明 |
|---:|---|---|---|---:|---|
| 1 | 小米14 | 成功 | 是 | 3.3 | 匹配 12+512GB 商品页；缺货标价；本次为缓存 |
| 2 | Sony WH-CH720N | 成功 | 否 | 87.9 | 匹配型号，Sony 官方商品页 |
| 3 | 小米17 | 成功 | 否 | 111.5 | 匹配小米17，Galaxus 商品页 |
| 4 | Sony WH-1000XM5 | 成功 | 否 | 72.0 | 匹配型号，JB Hi-Fi 商品页 |
| 5 | iPhone 16 256GB | 成功 | 否 | 119.9 | 匹配 256GB，BT 商品页；未采用疑似分期区间报价 |
| 6 | AirPods Pro 2 | 成功 | 否 | 74.7 | 匹配 AirPods Pro 2，Walmart 商品页；缺货价 |
| 7 | Samsung Galaxy S24 256GB | 成功 | 否 | 83.3 | 匹配 S24 256GB，Selfridges 商品页；缺货价 |
| 8 | JBL Flip 6 | 成功 | 否 | 96.5 | 匹配 Flip 6，Flipkart 商品页 |
| 9 | Dyson V12 Detect Slim | 成功 | 否 | 73.9 | 匹配 V12 Detect Slim，明确为 Absolute 版本 |
| 10 | Logitech MX Master 3S | 成功 | 否 | 40.4 | 匹配 MX Master 3S，HKTVmall 商品页 |
| 11 | Philips HD9252/91 | 成功 | 否 | 97.3 | 匹配 HD9252/91，Lahore Centre 商品页 |
| 12 | Logitech G502 HERO | 成功 | 否 | 133.2 | 匹配 G502 HERO，DC3 商品页 |
| 13 | Joyoung DJ13E-Q7 | 失败 | 否 | — | 商品页读取或价格核验未成功，未返回报价 |
| 14 | Samsung 990 PRO 1TB | 成功 | 否 | 123.4 | 匹配 990 PRO 1TB，Shop 商品页；库存未知 |
| 15 | Tefal RK818A | 成功 | 否 | 81.7 | 匹配 RK818A，BIG W 商品页；库存未知 |
| 16 | Canon EOS R50 | 成功 | 否 | 56.7 | 匹配 EOS R50 双镜头套装，Ted's 商品页 |
| 17 | Nintendo Switch OLED | 成功 | 否 | 70.8 | 匹配 Switch OLED 主机，Kapruka 商品页 |
| 18 | Sony PlayStation 5 Slim | 成功 | 否 | 57.8 | 匹配 PS5 Slim，YOHO 光驱版商品页 |
| 19 | Apple Watch Series 10 | 失败 | 否 | — | 188 秒后结束，商品页读取或核验未取得报价 |
| 20 | Garmin Forerunner 265 | 成功 | 否 | 91.7 | 匹配 Forerunner 265，Decathlon 商品页 |
| 21 | iPad Air M2 11 128GB | 成功 | 否 | 187.9 | 匹配 M2、11 英寸、128GB；缺货页面价 |
| 22 | MacBook Air M3 13 256GB | 失败 | 否 | — | 商品页读取或价格核验未成功，未返回报价 |
| 23 | Lenovo ThinkPad X1 Carbon Gen 12 | 失败 | 否 | — | 商品页读取或价格核验未成功，未返回报价 |
| 24 | ASUS ROG Ally Z1 Extreme | 成功 | 否 | 100.9 | 匹配 Z1 Extreme，Play-Asia 商品页 |
| 25 | Sony ZV-E10 | 成功 | 否 | 93.2 | 匹配原代 ZV-E10，Camera Exchange 商品页 |
| 26 | Fujifilm Instax Mini 12 | 成功 | 否 | 85.1 | 匹配 Instax Mini 12，HKTVmall 商品页 |
| 27 | GoPro HERO12 Black | 成功 | 否 | 74.0 | 匹配 HERO12 Black，GoPro 官方商品页 |
| 28 | DJI Osmo Pocket 3 | 成功 | 否 | 83.1 | 匹配 Pocket 3 主机，Unique Photo 商品页 |
| 29 | Bose QuietComfort Ultra Headphones | 成功 | 否 | 42.0 | 匹配 QC Ultra 头戴耳机，HKTVmall 商品页 |
| 30 | Anker Soundcore Liberty 4 NC | 成功 | 否 | 54.9 | 匹配 Liberty 4 NC，HKTVmall 商品页 |
| 31 | Roborock S8 | 失败 | 否 | 30.0 | 只返回聚合/导购页；其中 SGD 149 实为页面其他商品金额，复核不计成功 |
| 32 | Panasonic EH-NA0J | 成功 | 否 | 112.6 | 匹配 EH-NA0J，Yahoo 日本商品页；P 为颜色后缀 |
| 33 | Philips Sonicare HX9911 | 失败 | 否 | — | 商品页读取或价格核验未成功，未返回报价 |
| 34 | DeLonghi EC685 | 失败 | 否 | — | EC-685 被型号长度校验拒绝，尚未进入页面抓取；已在生产代码复现 |
| 35 | Nespresso Essenza Mini | 成功 | 否 | 104.9 | 匹配 Essenza Mini，Ubuy 含奶泡机/胶囊套装页 |
| 36 | LEGO 10313 | 成功 | 否 | 131.0 | 匹配 LEGO 10313 野花花束套装 |
| 37 | Nike Air Force 1 '07 | 成功 | 否 | 122.7 | 匹配 Air Force 1 '07，eBay 黑色尺码 5 商品页 |
| 38 | Adidas Samba OG | 成功 | 否 | 88.0 | 匹配 Samba OG，SSENSE 商品页；颜色明确 |
| 39 | La Roche-Posay Cicaplast Baume B5+ 40ml | 成功 | 否 | 37.0 | 匹配 B5+ 40ml，Express Chemist 商品页 |
| 40 | SK-II Facial Treatment Essence 230ml | 失败 | 否 | — | 商品页读取或价格核验未成功，未返回 230ml 报价 |

## 未取得匹配页面价的商品

- **Joyoung DJ13E-Q7**：PRODUCT_PAGE_UNVERIFIED；商品页读取或价格核验未成功，未返回报价
- **Apple Watch Series 10**：PRODUCT_PAGE_UNVERIFIED；188 秒后结束，商品页读取或核验未取得报价
- **MacBook Air M3 13 256GB**：PRODUCT_PAGE_UNVERIFIED；商品页读取或价格核验未成功，未返回报价
- **Lenovo ThinkPad X1 Carbon Gen 12**：PRODUCT_PAGE_UNVERIFIED；商品页读取或价格核验未成功，未返回报价
- **Roborock S8**：PAGE_PRICE；只返回聚合/导购页；其中 SGD 149 实为页面其他商品金额，复核不计成功
- **Philips Sonicare HX9911**：PRODUCT_PAGE_UNVERIFIED；商品页读取或价格核验未成功，未返回报价
- **DeLonghi EC685**：failed；EC-685 被型号长度校验拒绝，尚未进入页面抓取；已在生产代码复现
- **SK-II Facial Treatment Essence 230ml**：PRODUCT_PAGE_UNVERIFIED；商品页读取或价格核验未成功，未返回 230ml 报价

## 候选报价中另外发现的问题

- iPhone 16 256GB：区间下限 35.999 与上限 431.992 约为 1:12，疑似月供；不作成功证据。该商品另有匹配报价，所以不影响商品层面的成功判定。候选来源：[页面](https://bahrain.sharafdg.com/product/apple-iphone-16-5g-256gb-pink-dual-sim-smartphone/?promo=446144)
- Canon EOS R50：PhotoPrice 比价聚合页面，USD 1 不能作为商品页面价格成功证据。该商品另有匹配报价，所以不影响商品层面的成功判定。候选来源：[页面](https://www.photoprice.ca/product/07798/Canon-EOS-R50-price.html)
- Sony ZV-E10：ZV-E10 II 为第二代，不能作为原代 ZV-E10 的匹配报价。该商品另有匹配报价，所以不影响商品层面的成功判定。候选来源：[页面](https://www.camerax.com/product/sony-zv-e10-ii-mirrorless-camera-black/)
- Sony ZV-E10：ZV-E10 II 套装为第二代，不能作为原代 ZV-E10 的匹配报价。该商品另有匹配报价，所以不影响商品层面的成功判定。候选来源：[页面](https://www.camerax.com/product/sony-zv-e10-ii-mirrorless-camera-with-16-50mm-lens-black/)
- Sony ZV-E10：GBP 4.58–457.99 区间下限疑似奖励或付款条件金额，未作成功证据；需独立核对原页。该商品另有匹配报价，所以不影响商品层面的成功判定。候选来源：[页面](https://www.onbuy.com/gb/p/sony-zv-e10-mirrorless-camera-with-16-50mm-lens-white~p55728437/)
- DJI Osmo Pocket 3：Battery Handle 是电池手柄配件，不能作为 Pocket 3 主机报价。该商品另有匹配报价，所以不影响商品层面的成功判定。候选来源：[页面](https://www.uniquephoto.com/product/dji-osmo-pocket-3-battery-handle)
- Anker Soundcore Liberty 4 NC：Bigshopper 为比价来源，未采用为商家页面价证据。该商品另有匹配报价，所以不影响商品层面的成功判定。候选来源：[页面](https://bigshopper.ie/product/soundcore-by-anker-liberty-4-nc-wireless-noise-cancelling-earbuds-98-5-reduction-adaptive-to-ears-and-environment-hi-res-sound-50h-battery-charging-pastel-pink-1793247462.htm)
- Roborock S8：BigGo 价格聚合页，未核实对应商家商品页。该商品没有其他可接受的报价，复核计为失败。候选来源：[页面](https://biggo.com.tw/gp/tw_Roborock_S8)
- Roborock S8：原页 149–199 对应 eufy RoboVac 11S，Roborock 标示 749–999；返回金额错配，币种也缺少依据。该商品没有其他可接受的报价，复核计为失败。候选来源：[页面](https://smartpicksguides.com/p/roborock-s8)
- La Roche-Posay Cicaplast Baume B5+ 40ml：Cosmetify 比价来源，标题未明确 B5+，未采用为成功证据。该商品另有匹配报价，所以不影响商品层面的成功判定。候选来源：[页面](https://www.cosmetify.com/la-roche-posay-cicaplast-baume-b5-ultra-repairing-soothing-balm/?awc=29993_1786679017_73c543eef1d076df80a1a39861d68e3d&sv1=affiliate&sv_campaign_id=176013&vf=5280719)

这些问题记录在本轮结果中，测试期间未修改生产逻辑。成功率表示每个商品至少返回一条匹配页面价，不表示所有返回报价均准确。

## 证据

本轮生产版本为 `page-price-20261106T074912Z`，开始及结束镜像相同。生产版本在开始及结束分别记录于 `.tmp/page-price-rate-20261106/release-before.txt`、`release-after.txt`；健康记录为 `health-before.json`、`health-after.json`。
固定清单、原始响应、逐项 SSE 记录、标题/来源复核、汇总：`.tmp/page-price-rate-20261106/plan.json`、`results.json`、`*-frames.json`、`review.json`、`summary.json`。
补充诊断：`ec685-validation.jsonl` 记录生产型号校验复现；`roborock-smartpicks.html` 保存直接读取的导购页原文，149–199 对应 eufy 商品，Roborock 显示的是 749–999。
对应 CSV：`docs/page-price-success-rate-2026-11-06.csv`。本次只做测量和结果整理，不修改线上搜索逻辑。
