# 新加坡商品查价与网页恢复复测

2026-11-07，全量样本于北京时间 18:24:46 至 18:38:06 在 picolah.com 使用真实 Chrome 页面完成复测。沿用原来 30 款商品，六个品类各五款、相同输入和顺序、国家 SG、三路并发。每款新访客、新对话，只提交一次。用户界面必须实际显示商品标价及指向同一商家页面的链接。

| 测量 | 成功 | 说明 |
|---|---:|---|
| 优化前，公网聊天接口首次请求 | 16/30（53.3%） | 同一批商品，当时 30 个流都完成 |
| 商品字段、规格和补搜改进后 | 19/30（63.3%） | 30 个流完成，44/44 个返回条目额外重读确认同价 |
| 加入商家新地址处理后，公网聊天接口首次请求 | 14/30（46.7%） | 已收到的 33/33 条都核对通过。9 个流中断，按失败保留 |
| Chrome 首次提交后显示价格 | 19/30（63.3%） | 11 款没有取得价格 |
| Chrome 首次提交后显示正确报价 | **18/30（60.0%）** | 以真正显示的金额和链接计数，页面可读取本轮已保存回复 |
| Chrome 显示且另外重读商家确认同价 | 18/30（60.0%） | 按商品计数 |
| Chrome 可见报价中商品和明确规格匹配 | 51/52（98.1%） | 颜色、尺码和套装分别算条目 |
| Chrome 可见报价中另外重读确认同价 | 41/52（78.8%） | 来自 29 个详情页。10 条缺少可复核的同价证据，1 条起价标注错误 |

30 个浏览器请求均提交一次并收到终态答复。该批没有触发断流恢复。应用结果缓存命中 1/30。成功项从请求开始到最终答复显示的中位时间 68.7 秒。原接口的“首次价格到达时间”早于答复完成，是不同耗时指标。

本批相对优化前新增成功 Canon EOS R10、HCG Pregnancy Rapid Test。优化前成功的 16 款本轮均通过。直接排查的 Canon EOS R10、Dyson Airwrap HS05 和 HCG Pregnancy Rapid Test 为 2/3。其余 27 款由 16/27 变为 16/27。商家价格、可读性和网络状况会随时间变化，此处记录固定样本各次实际结果。

| 类别 | 优化前 | 最终网页 |
|---|---:|---:|
| 手机 | 4/5 | 4/5 |
| 电脑外设 | 2/5 | 2/5 |
| 相机游戏 | 4/5 | 5/5 |
| 音频穿戴 | 3/5 | 3/5 |
| 家电 | 0/5 | 0/5 |
| 日用品 | 3/5 | 4/5 |

| 商品 | 优化前 | 网页可见示例 | 可见条目 / 复读确认 | 说明 |
|---|---|---|---:|---|
| 小米14 | 成功 | [SGD 669](https://www.1p.sg/products/xiaomi-14) | 3 / 3 | 返回的商品、来源、规格和金额与上轮已审条目相同，本轮重新核验页面价格。 |
| Logitech MX Master 3S | 成功 | [SGD 189](https://electromart.sg/products/logitech-mx-master-3s-wireless-bluetooth-mouse) | 2 / 2 | 返回的商品、来源、规格和金额与上轮已审条目相同，本轮重新核验页面价格。 |
| Canon EOS R10 | 未通过 | [SGD 1139](https://shop.sg.canon/products/eos-r10?variant=47896297177309) | 1 / 1 | Chrome 显示 Canon 官方新加坡机身版商品链接和 SGD 1,139，SKU 与选项金额吻合，标明缺货。 |
| Sony WH-CH720N | 未通过 | — | 0 / 0 | 检查 20 页，未取得本地标价。 |
| Dyson Airwrap HS05 | 未通过 | — | 0 / 0 | 检查 9 页，未取得本地标价。 |
| HCG Pregnancy Rapid Test | 未通过 | [SGD 4.8](https://www.pharmacaresinghealth.sg/buzud-hcg-pregnancy-rapid-test) | 1 / 1 | Chrome 显示 SingHealth 的 HCG 检测产品，金额和详情链接正确。 |
| Google Pixel 9 128GB | 成功 | [SGD 948](https://sg.etoren.com/products/google-pixel-9-5g-g2ybb-128gb-porcelain-12gb-ram) | 1 / 1 | 返回的商品、来源、规格和金额与上轮已审条目相同，本轮重新核验页面价格。 |
| Razer DeathAdder V3 | 成功 | [SGD 106](https://online.challenger.sg/products/razer-deathadder-v3-mse?variant=41843134201931) | 1 / 1 | 返回的商品、来源、规格和金额与上轮已审条目相同，本轮重新核验页面价格。 |
| Nikon Z50 II | 成功 | [SGD 1679](https://webtronic.sg/en/item/categoryitem/WEB23343-001) | 5 / 5 | 同型号的相机机身加镜头套装分开列价。 |
| Sennheiser Momentum 4 Wireless | 成功 | [SGD 349](https://online.challenger.sg/products/sennheiser-momentum-4-wireless-headphones-graphite) | 2 / 2 | 标准石墨色版和周年特别版分开，二者价格不按同规格比较。 |
| Philips AC1715/30 | 未通过 | — | 0 / 0 | 检查 0 页，未取得本地标价。 |
| LEGO 10328 | 成功 | [SGD 89.99](https://www.toysrus.com.sg/lego-botanical-bouquet-of-roses-10328-10009109.html) | 1 / 1 | 返回的商品、来源、规格和金额与上轮已审条目相同，本轮重新核验页面价格。 |
| iPhone 16 256GB | 成功 | [SGD 1455](https://sg.etoren.com/products/apple-iphone-16-5g-a3287-256gb-teal-nano-sim-+-esim) | 2 / 2 | 返回的商品、来源、规格和金额与上轮已审条目相同，本轮重新核验页面价格。 |
| Samsung 990 PRO 1TB | 未通过 | — | 0 / 0 | 检查 15 页，未取得本地标价。 |
| DJI Mini 4 Pro | 成功 | [SGD 799](https://online.challenger.sg/products/dji-mini-4-pro?variant=41678447378507) | 1 / 1 | 返回的商品、来源、规格和金额与上轮已审条目相同，本轮重新核验页面价格。 |
| Marshall Emberton II | 成功 | [SGD 169](https://www.carousell.sg/p/marshall-emberton-ii-bluetooth-speaker-new-gen-ii-1409005834/?t-id=01ZAi1Z36P_1768835024610&t-referrer_browse_type=search_results&t-referrer_context=category_slp&t-referrer_product_id=1369729571&t-referrer_request_id=ql4XhewNboIcqYAe&t-referrer_search_query=emberton+ii&t-referrer_source=interlink&t-tap_index=22) | 1 / 1 | 卖家刊登的 Marshall Emberton II，商品和页面价格匹配。 |
| Braun Series 9 Pro 9465cc | 未通过 | — | 0 / 0 | 检查 2 页，未取得本地标价。 |
| New Balance 2002R | 成功 | [SGD 200](https://fas-bee.com/en-sg/products/30715697) | 23 / 14 | New Balance 2002R 款式匹配，尺码和颜色各自有报价。共用页面不能按不同商家计数。 |
| Samsung Galaxy S24 256GB | 成功 | [SGD 984](https://sg.etoren.com/products/samsung-galaxy-s24-5g-sm-s921b-dual-sim-256gb-cobalt-violet-8gb-ram-dual-nano-sim-+-esim) | 2 / 1 | 返回的商品、来源、规格和金额与上轮已审条目相同，本轮重新核验页面价格。 |
| Crucial X9 Pro 1TB | 未通过 | — | 0 / 0 | 检查 7 页，未取得本地标价。 |
| Insta360 X4 | 成功 | [SGD 1610.53](https://directnine.sg/products/insta360-x4-waterproof-8k-360-action-helmet-camera-with-32gb-sd-card-4k-wideangle-video-invisible-selfie-stick-effect-lens-guards-135-min-battery-life-sports-content-travel-outdoor-creator-2120214129) | 2 / 2 | 返回的商品、来源、规格和金额与上轮已审条目相同，本轮重新核验页面价格。 |
| Beats Studio Pro | 未通过 | — | 1 / 0 | 同型号且页面出现 SGD 585，但商家标示为起价，网站按精确价展示；按严格口径不通过。 |
| Instant Pot Duo 6L | 未通过 | — | 0 / 0 | 检查 8 页，未取得本地标价。 |
| Owala FreeSip 24oz | 未通过 | — | 0 / 0 | 检查 12 页，未取得本地标价。 |
| OnePlus 12 256GB | 未通过 | — | 0 / 0 | 检查 7 页，未取得本地标价。 |
| ASUS Zenbook 14 UX3405MA | 未通过 | — | 0 / 0 | 检查 5 页，未取得本地标价。 |
| Nintendo Switch OLED | 成功 | [SGD 626](https://www.ubuy.com.sg/product/PSG0UFLCC-nintendo-switch-neon-white-black-edition-64gb-oled-console-international-version) | 1 / 1 | 返回的商品、来源、规格和金额与上轮已审条目相同，本轮重新核验页面价格。 |
| Garmin Forerunner 265 | 成功 | [SGD 469.9](https://www.squaredeals.sg/products/garmin-forerunner-265) | 1 / 1 | 返回的商品、来源、规格和金额与上轮已审条目相同，本轮重新核验页面价格。 |
| Oral-B iO 6 | 未通过 | — | 0 / 0 | 检查 1 页，未取得本地标价。 |
| CeraVe Moisturising Cream 454g | 成功 | [SGD 40.04](https://tanatasa.sg/shop/cerave-moisturising-cream-454g) | 1 / 1 | 返回的商品、来源、规格和金额与上轮已审条目相同，本轮重新核验页面价格。 |

## 商品页核对

SingHealth 的商品元数据和可见标价均为 SGD 4.80。Canon 新加坡机身 SKU 5331C005 标价 SGD 1,139 并标示缺货。E Nation 的旧 Dyson 地址只用于发现同商家的新链接，重新读取新详情页后确认铜镍版售价 SGD 379，原定价 SGD 400 未用作售价。[SingHealth](https://www.pharmacaresinghealth.sg/buzud-hcg-pregnancy-rapid-test) · [Canon Singapore](https://shop.sg.canon/products/eos-r10?variant=47896297177309) · [E Nation](https://www.enation.sg/product/dyson-airwrap-hs05-copper-nickel/)

按用户指定国家、产品和明确规格核对，不要求在库。二手、缺货、库存未知、套装和起价必须与对应商品一起标注。另行重读依据商家页面字段、商品选项及店面币种。多个价格条目可以共用商家 URL、金额和屏幕上的一个链接，不能据此断言每个尺码都被展开。一件商品在商品成功率里只计一次。

家电五款均未取得有效报价。Philips AC1715/30 没有找到可核验的本地商品页。Dyson Airwrap HS05、Braun Series 9 Pro 9465cc、Instant Pot Duo 6L 和 Oral-B iO 6 找到了候选页，但本轮未能确认相应商品的当地页面价。

## 断流和另测结果

原始接口的 9 个断流请求从第二个网络位置通过同一 HTTPS 站点单独复测，各测一次。9 个全部完成。6 个返回价格，5 个的商品、金额和价格条件均复核通过。Beats Studio Pro 的页面写明从 585 新币起，接口显示为精确价，因此没有计入严格的补测通过数。另 3 个（Crucial X9 Pro 1TB、Instant Pot Duo 6L、Owala FreeSip 24oz）没有取得有效报价。补测不替换原始请求。[Selfridges 商品页](https://www.selfridges.com/SG/en/product/beats-beats-studio-pro-wireless-headphones_R04226035/)

额外在 Chrome 对正式网站注入一次明确的断流。页面只收到真实会话编号，所有价格、文字及结束帧被截断。随后网页按本轮用户消息 ID 读取一次已保存的答复，恢复小米 14 的 SGD 669 缺货标价和原商品链接。该验证中只有一次 POST，且命中近期报价缓存。若服务端尚未保存或网络持续不可用，恢复仍可能失败。四个普通聊天及咨询回合另测为 4/4。

## 起价修正后的单项复测

全量测试结束后上线了起价识别修正。18:47 在正式网站用新访客提交一次 Beats Studio Pro，未命中报价缓存。Chrome 回复和商品标题均显示 **S$585 起，缺货**，链接指向 Selfridges 新加坡商品页。服务端独立重读也返回 SGD 585、起价、缺货。30 款整批保留原成绩 18/30。[Selfridges 商品页](https://www.selfridges.com/SG/en/product/beats-beats-studio-pro-wireless-headphones_R04226035/)

浏览器逐项证据位于本地 `.tmp/browser-price-rate-1107/`，接口首轮、断流补测及商家复读位于 `.tmp/recall-alias-benchmark-1107/`。测试访客的对话已清理。
