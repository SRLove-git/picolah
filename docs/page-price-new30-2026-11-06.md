# 新一批 30 款商品页面价格测试

北京时间：2026-11-06 17:36:32 至 2026-11-06 17:55:20。

在正式网站 https://picolah.com 的 `/api/chat` 发起搜索。固定 30 个新商品，与之前 40 款样本零重叠；六组各五款、交错执行、并发 3。测试期间不更换商品，不用重试覆盖失败，不修改线上代码。

成功口径：至少一条与原始查询匹配的商品页面快照价格，含币种、金额、来源网址及商品页验证记录。缺货、预售、库存不明确、明确标注的区间价或起价均可计入；配件、错型号、分期金额、聚合页或导购页不计入。人工复核标题、规格及来源；未逐一独立访问所有商家的每条报价。

## 结果

- 原始价格返回：24/30（80.0%）。
- 复核后商品匹配：22/30（73.3%）。
- 应用结果缓存命中：0/30；完整结束：30/30。
- 成功项返回价格的中位耗时：104.17 秒。
- 测试使用独立访客身份，测试会话已清理，剩余 0。
- 22 个匹配结果中，Insta360 X4 仅有二手起价，且 Fetch 与独立网页版本存在价差；该项按页面快照口径计入。若另排除这一项，则为 21/30（70.0%），也不代表其余报价都已独立核实为当前成交价。

该结果只代表这批预先选定商品，不等同于全站或所有商品的成功率，也不与上次 13 款定向复测合并。

| 类别 | 原始价格返回 | 复核后成功 | 成功率 |
|---|---:|---:|---:|
| 手机 | 3/5 | 3/5 | 60.0% |
| 电脑外设 | 5/5 | 5/5 | 100.0% |
| 相机游戏 | 5/5 | 5/5 | 100.0% |
| 音频穿戴 | 5/5 | 4/5 | 80.0% |
| 家电 | 3/5 | 2/5 | 40.0% |
| 日用品 | 3/5 | 3/5 | 60.0% |

## 未通过项

- **Google Pixel 9 128GB**：本轮未取得通过商品页验证的 Pixel 9 128GB 报价；接口状态 `PRODUCT_PAGE_UNVERIFIED`，实际搜索词 `Google Pixel 9 128GB`。
- **LEGO 10328**：本轮未取得 LEGO 10328 的有效商品页报价；名称被归一化为 LEGO-10328；接口状态 `PRODUCT_PAGE_UNVERIFIED`，实际搜索词 `LEGO-10328`。
- **Braun Series 9 Pro 9465cc**：未取得有效报价；实际查询被解析为 PRO-9465CC Pro，未保留 Braun Series 9；接口状态 `PRODUCT_PAGE_UNVERIFIED`，实际搜索词 `PRO-9465CC Pro`。
- **Beats Studio Pro**：唯一返回 HKD 9999；二次 Fetch 正文仅见 $2799 参考价，且明确为 CASHBACK 跳转店，不计有效商品报价；接口状态 `PAGE_PRICE`，实际搜索词 `Beats Studio Pro`。
- **Instant Pot Duo 6L**：唯一报价为 Instant Pot Duo Crisp Air Fryer 6L，与查询的 Duo 基础款不同，排除；接口状态 `PAGE_PRICE`，实际搜索词 `Instant Pot Duo 6L`。
- **荣耀 Magic6 Pro 512GB**：中文荣耀 Magic6 Pro 512GB 查询未取得通过商品页验证的报价；接口状态 `PRODUCT_PAGE_UNVERIFIED`，实际搜索词 `荣耀 Magic6 Pro 512GB`。
- **Philips AC1715/30**：Philips AC1715/30 本轮未取得通过验证的对应完整型号页面价；接口状态 `PRODUCT_PAGE_UNVERIFIED`，实际搜索词 `Philips AC-1715/30`。
- **Estee Lauder Advanced Night Repair 50ml**：本轮未取得 Advanced Night Repair 50ml 的有效商品页价格；接口状态 `PRODUCT_PAGE_UNVERIFIED`，实际搜索词 `Estee Lauder Advanced Night Repair 50ml`。

## 通过项中的报价质量问题

- **Dell XPS 13 9340**：另一个商家标题把 XPS 9340 与 i7-1355U 并列，规格存在疑点，未用该报价判定成功。（原始报价索引 0）
- **Owala FreeSip 24oz**：额外报价为 FreeSip Twist 款，与原始 FreeSip 查询存在款式差异，且金额 USD 959.76–5182.56 未说明件数。（原始报价索引 2）
- **Owala FreeSip 24oz**：同款的额外报价为 USD 959.76–5182.56，疑似批量金额，未核对包装数量，未用于成功判定。（原始报价索引 3）
- **Insta360 X4**：来自二手商品页，API 展示未标注二手；Fetch 快照起价 229，独立网页版本起价 234，价格时效有差异。按本轮页面快照价格口径计入，不作为实时可下单价格。（原始报价索引 0）
- **Razer DeathAdder V3**：额外混入 DeathAdder V3 HyperSpeed 无线款，与 V3 基础款不同，未用于成功判定。（原始报价索引 1）

附加核查依据：

- Dell 官方列出的 XPS 9340 CPU 为 Core Ultra 125H/155H/165H，不包含 i7-1355U。 [来源](https://www.dell.com/support/manuals/en-us/xps-13-9340-laptop/xps-13-9340_owners_manual/processor?guid=guid-b426df85-6237-4365-b1fc-c3bb6e190257&lang=en-us)
- 抓取正文标注 CASHBACK Store、商品信息仅供参考及跳转 Apple 完成订单；仅见 $2799 参考价，未见返回的 9999。原文保存在 beats-audit.json。 [来源](https://www.hktvmall.com/hktv/en/main/Apple-Online-Store/s/D0004001/Gadgets-%26-Electronics/Gadgets-%26-Electronics/Headphone-%26-Earphone/Bluetooth-Earphone/Beats-Studio-Pro-Wireless-Headphones-Sandstone/p/D0004001_S_MQTR3PA_A)
- MPB 页面明确为二手 Insta360 X4；独立网页版本显示 234–279 GBP，而另存的 DeepSeek Fetch 正文显示 229–279 GBP。 [来源](https://www.mpb.com/en-uk/product/insta360-x4)

## 逐项结果

| # | 商品 | 类别 | 复核 | 样例页面价 | 返回秒 | 说明 |
|---:|---|---|---|---|---:|---|
| 1 | Google Pixel 9 128GB | 手机 | 未取得 | — | — | 本轮未取得通过商品页验证的 Pixel 9 128GB 报价。 |
| 2 | Dell XPS 13 9340 | 电脑外设 | 成功 | [JOD 1289](https://gds.jo/dell/dell-xps-13-9340-platinum-13-4-fhd-120hz-ips-intel-core-ultra-7-155h-16gb-lpddr5x-512gb-nvme-ssd-3-years-warranty?order=DESC&page=1&sort=p.price) | 91.7 | XPS 13 9340、Core Ultra 7 155H，页面 JOD 1289；选用规格一致的来源。 |
| 3 | Canon EOS R10 | 相机游戏 | 成功 | [AED 4199](https://en.canon-me.com/store/canon-eos-r10-mirrorless-camera-body/5331C003/) | 89.5 | Canon 官方 EOS R10 机身商品页 AED 4199，库存未明确。 |
| 4 | Sennheiser Momentum 4 Wireless | 音频穿戴 | 成功 | [GBP 169](https://www.richersounds.com/sennheiser-momentum-4-wireless-white/) | 103.8 | Momentum 4 Wireless 完整耳机，Richer Sounds 商品页 GBP 169。 |
| 5 | Dyson Airwrap HS05 | 家电 | 成功 | [HKD 4480](https://www.hktvmall.com/hktv/en/main/Brilliant-Channel/s/H5039001/Home-Appliances/Home-Appliances/Health-%26-Personal-Care-Appliances/Hair-Dryer/Airwrap-multistyler-Complete-Long-HS05-Bright-nickel-and-rich-copper-Parallel-Import/p/H5039001_S_DYHS05AWCOLOC) | 137.4 | Dyson Airwrap HS05 Complete Long 整机套装，页面 HKD 4480。 |
| 6 | LEGO 10328 | 日用品 | 未取得 | — | — | 本轮未取得 LEGO 10328 的有效商品页报价；名称被归一化为 LEGO-10328。 |
| 7 | OnePlus 12 256GB | 手机 | 成功 | [INR 64990](https://www.flipkart.com/oneplus-12-glacial-white-256-gb/p/itm7069fb212f1f2?lid=LSTMOBHFHKFG7MEZJH3USQGKO&marketplace=FLIPKART&pid=MOBHFHKFG7MEZJH3&q=oneplus+) | 109.9 | OnePlus 12 256GB，Flipkart 页面 INR 64990；缺货页面价仍计入。 |
| 8 | ASUS Zenbook 14 UX3405MA | 电脑外设 | 成功 | [AED 5113.2](https://neotech.ae/products/4-315) | 85.0 | UX3405MA-OLEDU7B 属于所查 UX3405MA 型号，商品页 AED 5113.2。 |
| 9 | Nikon Z50 II | 相机游戏 | 成功 | [USD 1346.95](https://www.camerax.com/product/nikon-z50-ii-mirrorless-camera-with-16-50mm-50-250mm-lenses/) | 60.1 | Nikon Z50 II 机身加 16–50mm、50–250mm 双镜套装，页面 USD 1346.95。 |
| 10 | Marshall Emberton II | 音频穿戴 | 成功 | [HKD 988](https://estore.vertexhk.com/en/product/marshall-emberton-ii-portable-bluetooth-speaker-black-mhp-96234/) | 104.6 | Marshall Emberton II 第二代整机，页面 HKD 988。 |
| 11 | Braun Series 9 Pro 9465cc | 家电 | 未取得 | — | — | 未取得有效报价；实际查询被解析为 PRO-9465CC Pro，未保留 Braun Series 9。 |
| 12 | New Balance 2002R | 日用品 | 成功 | [THB 3300](https://www.supersports.co.th/en/products/new-balance-casual-shoes-sneaker-ne081sh537evth-u20025i9) | 108.2 | New Balance 2002R，棕色 US 4 商品页 THB 3300。 |
| 13 | Nothing Phone 2a 256GB | 手机 | 成功 | [INR 27999](https://www.flipkart.com/nothing-phone-2a-5g-blue-256-gb/p/itm85c6bca5edadc) | 56.4 | Nothing Phone (2a) 256GB，Flipkart 页面 INR 27999。 |
| 14 | Kingston NV2 1TB | 电脑外设 | 成功 | [AUD 229](https://www.umart.com.au/product/kingston-nv2-1tb-pcie-4-0-m-2-2280-nvme-ssd-snv2s-1000g-65928) | 133.6 | Kingston NV2 1TB 完整型号 SNV2S/1000G，页面 AUD 229；缺货页面价。 |
| 15 | DJI Mini 4 Pro | 相机游戏 | 成功 | [EUR 679](https://store.dji.com/it/product/dji-mini-4-pro?from=site-nav&sc_eh=cbf2dcc5729a4c761&sc_lid=507711009&sc_llid=421069&sc_src=email_7283092&sc_uid=QDFq47GSPf&set_region=IT&vid=148581) | 109.0 | DJI 官方 Mini 4 Pro（RC-N2）商品页 EUR 679；缺货页面价。 |
| 16 | Beats Studio Pro | 音频穿戴 | 未取得 | — | 109.5 | 唯一返回 HKD 9999；二次 Fetch 正文仅见 $2799 参考价，且明确为 CASHBACK 跳转店，不计有效商品报价。 |
| 17 | Oral-B iO 6 | 家电 | 成功 | [EUR 126.43](https://www.galaxus.nl/en/s6/product/oral-b-io-series-6-electric-toothbrush-21402074) | 62.8 | Oral-B iO Series 6 整机商品页 EUR 126.43。 |
| 18 | Owala FreeSip 24oz | 日用品 | 成功 | [USD 29.99](https://www.gliks.com/products/owala-freesip-24oz-stainless-steel-water-bottle-in-blue-oasis-c05951-blueoasis) | 149.6 | Owala FreeSip 24oz Blue Oasis 单瓶商品页 USD 29.99。 |
| 19 | 华为 Pura 70 256GB | 手机 | 成功 | [SGD 1425](https://sg.etoren.com/products/huawei-pura-70-5g-ady-al00-dual-sim-256gb-white-12gb-ram-china-version) | 65.4 | 中文华为查询保留 Pura 70 256GB，Etoren 对应商品页 SGD 1425。 |
| 20 | Crucial X9 Pro 1TB | 电脑外设 | 成功 | [GBP 124.99](https://www.laptopoutlet.co.uk/crucial-x9-pro-1tb-ct1000x9prossd9.html?awc=111534_1788062925_1a55d93eb498fede00b6fcde53572acd&sv1=affiliate&sv_campaign_id=176013) | 121.1 | Crucial X9 Pro 1TB 型号 CT1000X9PROSSD9，页面 GBP 124.99；缺货页面价。 |
| 21 | Insta360 X4 | 相机游戏 | 成功 | [GBP 229 起](https://www.mpb.com/en-uk/product/insta360-x4) | 57.0 | MPB 二手 X4；Fetch 原文为 GBP 229–279，本轮返回 GBP 229 起。独立网页读取的起价为 234，存在快照差异。 |
| 22 | Fitbit Charge 6 | 音频穿戴 | 成功 | [CAD 219](https://www.walmart.ca/en/ip/Google-Fitbit-Charge-6-Advanced-Fitness-and-Health-Tracker/6000207097819?athancid=6000200764646&athcgid=null&athcpid=6000207097819&athena=true&athguid=BSO0fMTPCLw1-EiELFOrbaU2x5Vez-oPhGv3&athieid=v0&athpgid=AthenaItempage&athstid=CS020&athznid=ci) | 124.3 | Fitbit Charge 6 本体，Walmart Canada 商品页 CAD 219。 |
| 23 | Instant Pot Duo 6L | 家电 | 未取得 | — | 69.7 | 唯一报价为 Instant Pot Duo Crisp Air Fryer 6L，与查询的 Duo 基础款不同，排除。 |
| 24 | CeraVe Moisturising Cream 454g | 日用品 | 成功 | [MYR 130.9](https://estore.caring2u.com/products/cerave-moisturising-cream-454g) | 180.6 | CeraVe Moisturising Cream 454g 页面 MYR 130.90；虽然查询被缩成 CREAM-454G，返回商品品牌和规格仍匹配。 |
| 25 | 荣耀 Magic6 Pro 512GB | 手机 | 未取得 | — | — | 中文荣耀 Magic6 Pro 512GB 查询未取得通过商品页验证的报价。 |
| 26 | Razer DeathAdder V3 | 电脑外设 | 成功 | [EUR 84.99](https://www.currys.ie/products/razer-deathadder-v3-optical-gaming-mouse-black-10246917.html) | 111.1 | DeathAdder V3 基础款，Currys 商品页 EUR 84.99。 |
| 27 | Nintendo Switch Lite | 相机游戏 | 成功 | [QAR 799 起](https://qatarmobile.qa/nintendo-switch-lite/) | 82.8 | Nintendo Switch Lite 商品页 QAR 799 起，未指定颜色。 |
| 28 | Huawei Watch GT 4 | 音频穿戴 | 成功 | [EUR 214.16](https://www.fnac.com/Montre-connectee-Huawei-Watch-GT-4-46-mm-Active-Noir/a18601160/w-4) | 52.3 | Huawei Watch GT 4 46mm Active，Fnac 商品页 EUR 214.16。 |
| 29 | Philips AC1715/30 | 家电 | 未取得 | — | — | Philips AC1715/30 本轮未取得通过验证的对应完整型号页面价。 |
| 30 | Estee Lauder Advanced Night Repair 50ml | 日用品 | 未取得 | — | — | 本轮未取得 Advanced Night Repair 50ml 的有效商品页价格。 |

## 原始证据

`.tmp/page-price-new30-20261106/` 保存固定样本、运行计划、原始接口结果、逐项 SSE 记录、人工复核、健康检查和汇总。原始失败记录保留，可直接按相同清单重复测试。异常报价的额外抓取仅用于复核，没有替换原始搜索结果或计为新增样本。
