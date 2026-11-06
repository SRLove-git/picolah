# 修复后固定 30 款商品线上测试

北京时间：2026-11-06 19:45:35 至 2026-11-06 20:03:27。

使用与修复前新一批 30 款测试完全相同的商品与原始搜索词，六类各五款，三路并发请求正式网站 `/api/chat`。不更换失败商品，不用重试覆盖失败，测试期间没有修改或部署生产代码。

成功口径：接口返回至少一个与查询匹配的商品页价格，具有有效金额、币种、来源链接与商品页验证记录；缺货、预售、库存未知、清楚标注的起价和区间价可计入，二手需标注。错型号、配件、分期额、返现占位价、批量总价和聚合页不计入。人工检查返回标题、规格、报价类型和来源域名；并非对全部商家的每条报价重新独立抓取核验。

## 本轮结果

- 原始价格返回：29/30（96.7%）。
- 复核后成功：29/30（96.7%）。
- 应用结果缓存命中：0/30；流式会话完整结束：30/30。
- 成功项返回价格中位耗时：102.9 秒；180 秒内复核通过：29/30。
- 使用独立测试访客，测试会话已清理，剩余 0。

“未命中应用缓存”不保证上游搜索或 Fetch 服务完全没有缓存。本轮是固定样本测试，不能代表所有商品的成功率。

## 同一清单的前后比较

| 指标 | 修复前 | 修复后 |
|---|---:|---:|
| 原始返回价格 | 24/30（80.0%） | 29/30（96.7%） |
| 复核后成功 | 22/30（73.3%） | 29/30（96.7%） |

修复前的 22 项中，Insta360 X4 按旧页面快照口径计入，但当时存在 Fetch 与 HTML 价差及二手标注问题；若排除该项，旧结果为 21/30（70.0%）。本轮以当前输出独立判定，旧原始记录不变。

| 类别 | 原始返回 | 复核通过 |
|---|---:|---:|
| 手机 | 4/5 | 4/5 |
| 电脑外设 | 5/5 | 5/5 |
| 相机游戏 | 5/5 | 5/5 |
| 音频穿戴 | 5/5 | 5/5 |
| 家电 | 5/5 | 5/5 |
| 日用品 | 5/5 | 5/5 |

## 变化与问题

由未通过转为通过：LEGO 10328、Braun Series 9 Pro 9465cc、Beats Studio Pro、Instant Pot Duo 6L、荣耀 Magic6 Pro 512GB、Philips AC1715/30、Estee Lauder Advanced Night Repair 50ml。
由通过转为未通过：无。

- **Google Pixel 9 128GB**：本轮 Pixel 9 128GB 在约 170 秒后返回 PRODUCT_PAGE_UNVERIFIED，未取得可用报价；保留失败，不用重试覆盖。 状态 `PRODUCT_PAGE_UNVERIFIED`。
- **Canon EOS R10** 的额外报价：RCE Foto 的 EUR 850 页面明确为二手、Like new，但返回报价没有二手标记；不采用这条报价作为成功依据。（原始报价索引 3）。
- **Nikon Z50 II** 的额外报价：MPB 的 GBP 704 为二手 Nikon Z50 II（Excellent），HTML 也声明 UsedCondition，但返回报价没有二手标记；不采用这条报价作为成功依据。（原始报价索引 2）。
- **Oral-B iO 6** 的额外报价：Galaxus 返回的 EUR 0.53 实际是 Climate contribution（碳排放补偿费），不是牙刷商品价；该额外报价错误。（原始报价索引 1）。
- **Huawei Watch GT 4** 的额外报价：Independent 新闻导购页被纳入商品报价；GBP 39.99 实际对应 Freebuds SE 2 耳机，手表为 GBP 229.99 起，不能组成手表的 GBP 39.99–229.99 区间。（原始报价索引 3）。

## 逐项结果

| # | 商品 | 复核 | 样例页面价 | 返回秒 | 说明 |
|---:|---|---|---|---:|---|
| 1 | Google Pixel 9 128GB | 未取得 | — | — | 本轮 Pixel 9 128GB 在约 170 秒后返回 PRODUCT_PAGE_UNVERIFIED，未取得可用报价；保留失败，不用重试覆盖。 |
| 2 | Dell XPS 13 9340 | 成功 | [JOD 1289](https://gds.jo/dell/dell-xps-13-9340-platinum-13-4-fhd-120hz-ips-intel-core-ultra-7-155h-16gb-lpddr5x-512gb-nvme-ssd-3-years-warranty?order=DESC&page=1&sort=p.price) | 102.9 | 9340 与 Core Ultra 7 155H 规格一致，原先 i7-1355U 冲突报价未返回。 |
| 3 | Canon EOS R10 | 成功 | [AED 4199](https://en.canon-me.com/store/canon-eos-r10-mirrorless-camera-body/5331C003/) | 106.6 | 选用 Canon 官方 R10 机身页面 AED 4199；另有套装区间价，单独标注。 |
| 4 | Sennheiser Momentum 4 Wireless | 成功 | [GBP 169](https://www.richersounds.com/sennheiser-momentum-4-wireless-white/) | 121.6 | Momentum 4 Wireless 白色耳机页面 GBP 169，型号及商品类型匹配。 |
| 5 | Dyson Airwrap HS05 | 成功 | [HKD 4480](https://www.hktvmall.com/hktv/en/main/Brilliant-Channel/s/H5039001/Home-Appliances/Home-Appliances/Health-%26-Personal-Care-Appliances/Hair-Dryer/Airwrap-multistyler-Complete-Long-HS05-Bright-nickel-and-rich-copper-Parallel-Import/p/H5039001_S_DYHS05AWCOLOC) | 65.0 | HS05 Complete Long 整机套装与查询匹配，HKTV 页面 HKD 4480；平行进口属性保留在标题中。 |
| 6 | LEGO 10328 | 成功 | [EUR 49.9](https://www.coolblue.de/en/product/972462/lego-botanicals-bouquet-of-roses-10328.html) | 86.3 | LEGO 10328 对应玫瑰花束套装，Coolblue 页面 EUR 49.90，完整名称保留。 |
| 7 | OnePlus 12 256GB | 成功 | [USD 639.99](https://www.cell2get.com/products/oneplus-12-12gb-ram-256gb-unlocked) | 127.9 | OnePlus 12、12GB RAM/256GB 存储匹配，页面 USD 639.99；另列缺货来源。 |
| 8 | ASUS Zenbook 14 UX3405MA | 成功 | [AED 5113.2](https://neotech.ae/products/4-315) | 76.8 | UX3405MA-OLEDU7B 属于所查 UX3405MA 型号，AED 5113.20，明确标注缺货页面价。 |
| 9 | Nikon Z50 II | 成功 | [USD 1346.95](https://www.camerax.com/product/nikon-z50-ii-mirrorless-camera-with-16-50mm-50-250mm-lenses/) | 80.2 | Z50 II 加 16–50mm、50–250mm 双镜套装，页面 USD 1346.95；套装内容保留在标题。 |
| 10 | Marshall Emberton II | 成功 | [HKD 988](https://estore.vertexhk.com/en/product/marshall-emberton-ii-portable-bluetooth-speaker-black-mhp-96234/) | 92.8 | Emberton II 第二代整机页面 HKD 988，未混入第三代或配件。 |
| 11 | Braun Series 9 Pro 9465cc | 成功 | [AED 3269](https://ae.tejar.com/braun-series-9-pro-9465cc-electric-shaver) | 103.0 | Braun Series 9 Pro 9465cc 完整名称及型号匹配，三家来源取价成功。 |
| 12 | New Balance 2002R | 成功 | [GBP 140](https://www.prodirectsport.com/products/new-balance-2002r-grey-trainers-mens-shoes-1014647/) | 91.3 | 选择 Pro:Direct 的 New Balance 2002R Grey 页面 GBP 140；部分报价按具体尺码展示。 |
| 13 | Nothing Phone 2a 256GB | 成功 | [INR 27999](https://www.flipkart.com/nothing-phone-2a-5g-blue-256-gb/p/itm85c6bca5edadc) | 59.9 | Nothing Phone (2a) 256GB 对应商品页 INR 27999；没有替换为 Plus 或其他容量。 |
| 14 | Kingston NV2 1TB | 成功 | [AUD 229](https://www.umart.com.au/product/kingston-nv2-1tb-pcie-4-0-m-2-2280-nvme-ssd-snv2s-1000g-65928) | 113.8 | Kingston NV2 1TB（SNV2S/1000G）页面 AUD 229，明确标注缺货。 |
| 15 | DJI Mini 4 Pro | 成功 | [EUR 679](https://store.dji.com/it/product/dji-mini-4-pro?from=site-nav&sc_eh=cbf2dcc5729a4c761&sc_lid=507711009&sc_llid=421069&sc_src=email_7283092&sc_uid=QDFq47GSPf&set_region=IT&vid=148581) | 42.6 | DJI 官方 Mini 4 Pro（RC-N2）页面 EUR 679，明确标注缺货页面价。 |
| 16 | Beats Studio Pro | 成功 | [CAD 318.97](https://www.walmart.ca/en/ip/Beats-Studio-Pro-Wireless-Headphones/6000206769973) | 124.6 | Walmart Canada 的 Beats Studio Pro 页面 CAD 318.97；未再返回 HKTV CASHBACK 的 9999 占位价。 |
| 17 | Oral-B iO 6 | 成功 | [GBP 110.99](https://www.robertdyas.co.uk/oral-45-b-io-series-6-electric-toothbrush-45-black-lava) | 58.6 | 采用 Robert Dyas 的 Oral-B iO6 Black Lava 页面 GBP 110.99；另有 Galaxus 碳排放补偿费误识别，已单独记录。 |
| 18 | Owala FreeSip 24oz | 成功 | [USD 29.99](https://www.gliks.com/products/owala-freesip-24oz-stainless-steel-water-bottle-in-blue-oasis-c05951-blueoasis) | 150.6 | FreeSip 24oz 单瓶 USD 29.99；未出现 Twist 版本或定制批量总价。 |
| 19 | 华为 Pura 70 256GB | 成功 | [SGD 1425](https://sg.etoren.com/products/huawei-pura-70-5g-ady-al00-dual-sim-256gb-white-12gb-ram-china-version) | 46.2 | 中文华为查询保留 Pura 70 256GB；Etoren 对应机型页面 SGD 1425，地区版本保留在标题中。 |
| 20 | Crucial X9 Pro 1TB | 成功 | [GBP 124.99](https://www.laptopoutlet.co.uk/crucial-x9-pro-1tb-ct1000x9prossd9.html?awc=111534_1788062925_1a55d93eb498fede00b6fcde53572acd&sv1=affiliate&sv_campaign_id=176013) | 112.6 | Crucial X9 Pro 1TB（CT1000X9PROSSD9）页面 GBP 124.99，标注缺货。 |
| 21 | Insta360 X4 | 成功 | [HKD 3399](https://store.insta360.com/HK/product/x4) | 95.0 | 官方 X4 页面 HKD 3399；MPB 额外报价已正确显示 GBP 234–279 二手区间。 |
| 22 | Fitbit Charge 6 | 成功 | [CAD 219](https://www.walmart.ca/en/ip/Google-Fitbit-Charge-6-Advanced-Fitness-and-Health-Tracker/6000207097819?athancid=6000200764646&athcgid=null&athcpid=6000207097819&athena=true&athguid=BSO0fMTPCLw1-EiELFOrbaU2x5Vez-oPhGv3&athieid=v0&athpgid=AthenaItempage&athstid=CS020&athznid=ci) | 138.0 | Fitbit Charge 6 本体页面 CAD 219；Amazon UK 也返回 GBP 99.99 的对应型号价格。 |
| 23 | Instant Pot Duo 6L | 成功 | [ZAR 2399](https://kloppers.co.za/product/instant-pot-duo-cooker/) | 81.6 | Duo 7-in-1 6L 基础款页面 ZAR 2399，标注缺货；未返回 Crisp 或 Easy 版本。 |
| 24 | CeraVe Moisturising Cream 454g | 成功 | [EUR 20.13](https://www.cultbeauty.com/p/cerave-moisturising-cream-pot-with-ceramides-for-dry-to-very-dry-skin-454g/11798691/) | 119.1 | 搜索词完整保留 CeraVe 与 454g，Cult Beauty 页面 EUR 20.13。 |
| 25 | 荣耀 Magic6 Pro 512GB | 成功 | [SAR 3499](https://gcc.luluhypermarket.com/en-sa/honor-magic6-pro-dual-sim-5g-smartphone-12-gb-ram-512-gb-storage-epi-green/p/2252645/) | 106.3 | 荣耀转写 Honor 后匹配 Magic6 Pro 512GB，SAR 3499，标注缺货页面价。 |
| 26 | Razer DeathAdder V3 | 成功 | [EUR 84.99](https://www.currys.ie/products/razer-deathadder-v3-optical-gaming-mouse-black-10246917.html) | 54.2 | 基础款 DeathAdder V3 页面 EUR 84.99；未再混入 HyperSpeed 无线版本。 |
| 27 | Nintendo Switch Lite | 成功 | [QAR 799 起](https://qatarmobile.qa/nintendo-switch-lite/) | 129.3 | Switch Lite 本体页面 QAR 799 起，起价已标注；其他颜色及套装标题保留。 |
| 28 | Huawei Watch GT 4 | 成功 | [EUR 214.16](https://www.fnac.com/Montre-connectee-Huawei-Watch-GT-4-46-mm-Active-Noir/a18601160/w-4) | 78.2 | 采用 FNAC 的 Watch GT 4 46mm Active 页面 EUR 214.16；另有新闻导购与耳机价混入，已单独记录。 |
| 29 | Philips AC1715/30 | 成功 | [GBP 198.44](https://www.amazon.co.uk/dp/B09JGD91TS) | 115.2 | AC1715/30 完整型号匹配，Amazon UK 页面 GBP 198.44，本轮未命中应用缓存。 |
| 30 | Estee Lauder Advanced Night Repair 50ml | 成功 | [USD 62.17](https://business.walmart.com/ip/Estee-Lauder-Advanced-Night-Repair-Synchronized-Multi-Recovery-Complex-50ml-1-7oz/604998590) | 116.0 | Walmart 50ml 页面 USD 62.17；修复后的 Repair/重音品牌匹配正常，Goxip 聚合来源未再返回。 |

## 版本与证据

运行前后记录部署镜像、容器身份和公网健康检查，保存于 `.tmp/page-price-postrepair30-20261106/`；同目录包含固定清单、计划、原始结果、SSE 和人工复核。修复前记录在 `.tmp/page-price-new30-20261106/`，没有覆盖。报告中的商家链接移除了购物车等动作参数，原始 URL 仍保存在测试证据中。

## 附加报价来源核查

以下为主测试结束后对五个可疑来源的独立抓取，不计入 30 个测试样本，不替换失败结果或价格返回耗时。成功标准是每个查询至少有一条合格页面价，**29/30 不表示全部返回报价均正确**。

| 来源 | 抓取证据 | 判定 |
|---|---|---|
| [RCE Foto / Canon R10](https://www.rcefoto.com/en/store/milano-lainate/product/008DMLCN0000413527/) | EUR 850，正文明确 used、Like new | 二手标记遗漏；另有 Canon 官方页面价，查询仍通过 |
| [MPB / Nikon Z50 II](https://www.mpb.com/en-uk/product/nikon-z50-ii/sku-4239208) | SKU 4239208 的 GBP 704，成色 Excellent；HTML 声明 UsedCondition | 二手标记遗漏；另有 Camera Exchange 套装页面价，查询仍通过 |
| [Galaxus / Oral-B iO6](https://www.galaxus.nl/en/s6/product/oral-b-io-series-6-electric-toothbrush-21402074?imageIndex=2) | EUR 0.53 对应 Climate contribution，而非牙刷售价 | 错误报价；Robert Dyas 页面价可用 |
| [Independent / Huawei Watch GT 4](https://www.independent.co.uk/life-style/go-fashion-forward-with-the-huawei-watch-gt-4-b2410592.html) | 导购正文中 GBP 39.99 对应 Freebuds SE 2 耳机，手表 GBP 229.99 起 | 导购页与其他商品价格混入区间；FNAC 页面价可用 |
| [Selfridges / New Balance 2002R](https://www.selfridges.com/US/en/product/new-balance-2002r-suede-and-mesh-low-top-trainers_R03836952/) | HTML 商品正文确有 from USD 17.00、缺货，JSON-LD 也有 USD 17；另一 Fetch 版本显示 USD 77/93.32/145 | 上游页面版本价格不一致；不能仅因低价判为解析错误。本轮选用 Pro:Direct GBP 140 作为成功依据 |

前四项为已确认问题，涉及四个查询的额外报价。此次仅测试、记录，未部署新的修复。Selfridges 的差异单列为来源版本差异，不计为已确认错误。原始抓取保存在 `audit/`，各提供方状态保存在 `audit/*-result.json`。

## 线上状态核验

测试期间生产版本为 `new30-fetch-20261106T113545Z`。运行前后容器 ID、镜像 ID、启动时间完全一致，网页与抓取容器均健康。结束后公网健康接口 HTTP 200，SQLite 正常，LLM 已配置；测试会话清理后剩余 0。

