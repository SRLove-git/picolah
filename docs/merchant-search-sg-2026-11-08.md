# 新加坡商品检索优化与正式网站实测

2026-11-08 在 picolah.com 使用 Chrome 做端到端查询。每个商品用独立新访客对话提交一次，每批三路并发。网页实际显示商家商品页的正数新币价格，商品、明确规格和价格条件另经商家页核对通过，才计入核对通过数。查询按商品、按是否显示金额及按复读确认分别统计。金额视图将链接保留在后台证据中。一款商品在成功率中只计一次。

| 样本 | 显示商品页价格 | 核对通过 | 成功项耗时中位数 | 报价缓存命中 |
|---|---:|---:|---:|---:|
| 固定 30 款 · 上线前 | 19/30（63.3%） | **19/30（63.3%）** | 79 秒 | 0/30 |
| 固定 30 款 · 接入商家搜索后 | 23/30（76.7%） | **23/30（76.7%）** | 79 秒 | 0/30 |
| 固定 30 款 · 拼写和配件修正后，金额视图上线前 | 23/30（76.7%） | **23/30（76.7%）** | 88 秒 | 0/30 |
| 另选 12 款 · 上线前 | 6/12（50.0%） | **6/12（50.0%）** | 109 秒 | 0/12 |
| 另选 12 款 · 接入商家搜索后 | 7/12（58.3%） | **6/12（50.0%）** | 99 秒 | 0/12 |
| 同一批 12 款 · 最终版重复验证 | 6/12（50.0%） | **6/12（50.0%）** | 93 秒 | 0/12 |
| 另外固定的 6 款 · 金额视图首次搜索 | 3/6（50.0%） | **3/6（50.0%）** | 83 秒 | 0/6 |

| 最终版逐条报价 | 可见条目 | 型号与规格错配 | 型号匹配且重新读到同价 |
|---|---:|---:|---:|
| 固定 30 款 | 66 | 2 | 63 |
| 重复的 12 款 | 17 | 0 | 17 |
| 另外 6 款 | 19 | 5 | 14 |

金额视图会合并同价。逐条报价按来源与规格计数，多个条目可以只在屏幕上显示一个金额。

## 固定样本的变化（金额视图上线前）

- 最终版相对上线前新增：Marshall Emberton II、Owala FreeSip 24oz、Samsung 990 PRO 1TB、Sony WH-CH720N。
- 上线前通过但最终版未通过：无。
- 最终版未核实到价格：Philips AC1715/30、Braun Series 9 Pro 9465cc、Crucial X9 Pro 1TB、Instant Pot Duo 6L、OnePlus 12 256GB、ASUS Zenbook 14 UX3405MA、Oral-B iO 6。

在原始访问中，最终版固定样本收到结果并通过核对 23/30，30 款实际提交搜索。上线前曾有一款在打开网页时超时，重新打开后首次实际提交成功；表中上线前数据按 30 款各自的首次实际搜索计算。

| 类别 | 上线前 | 最终版 |
|---|---:|---:|
| 手机 | 4/5 | 4/5 |
| 电脑外设 | 2/5 | 3/5 |
| 相机游戏 | 5/5 | 5/5 |
| 音频穿戴 | 3/5 | 5/5 |
| 家电 | 1/5 | 1/5 |
| 日用品 | 4/5 | 5/5 |

## 网站和判定条件的调整

- 新加坡商家站内搜索提供候选商品链接。本次接入 Challenger 和 Owala 新加坡店。报价需重新读取商家商品页，并通过市场、型号、币种及规格检查。
- 商品页位置按国家、检索词与型号保存在持久化 SQLite 中，保留 30 天；每次复用位置仍按当次预算及筛选条件重新读价。单独的短期报价缓存按原配置运行。初次启用时从两个历史实测批次导入 20 个搜索词的 30 个已核验公开链接，固定样本包含这些商品。
- Owala 多规格页核对选中的购物车 variant ID、SKU、币种、页面主价格及规格记录。普通版和配件、后缀带 Pro 的型号以及不同代次按身份区分。页面展示区得到的卡片也计入审核，即使正文没有引用错误卡片。
- 网站默认查价只显示金额。重复金额合并，起价和区间保留。要链接、比较、库存或建议时按该问题作答；后端继续存储当次已核验页面信息。
- 商家检索词保留用户输入的型号拼写，如 AC1715/30、UX3405MA；内部匹配仍使用标准化字段。用户明确指定的地区后缀优先于意图模型改写的后缀。

## 两批新增商品

12 款在第一次改动前固定。第一次对照中发现了 Space One 和 Space One Pro 的差异，以及 Bose 第一代和第二代混入同一列表的问题。最终版对这 12 款的重复验证属于回归检查，其链接已可能被之前搜索记录。另有 6 款在金额视图评估前固定，没有做上线前的同款测试。表中保留其首次测量结果。

### 固定 30 款（金额视图上线前测量）

| 商品 | 上线前 | 最终版 | 本次可核对的商品页示例 |
|---|---|---|---|
| 小米14 | 通过 | 通过 | [S$669.00，缺货](https://www.1p.sg/products/xiaomi-14) |
| Logitech MX Master 3S | 通过 | 通过 | [S$189.00](https://electromart.sg/products/logitech-mx-master-3s-wireless-bluetooth-mouse) |
| Canon EOS R10 | 通过 | 通过 | [S$1,139.00，缺货](https://shop.sg.canon/products/eos-r10?variant=47896297177309) |
| Sony WH-CH720N | 候选页未核实价格 | 通过 | [S$129.00](https://online.challenger.sg/products/sony-wh-ch720n-bluetooth-headphones-pink) |
| Dyson Airwrap HS05 | 通过 | 通过 | [S$379.00](https://www.enation.sg/product/dyson-airwrap-hs05-copper-nickel/) |
| HCG Pregnancy Rapid Test | 通过 | 通过 | [S$4.80](https://www.pharmacaresinghealth.sg/buzud-hcg-pregnancy-rapid-test) |
| Google Pixel 9 128GB | 通过 | 通过 | [S$948.00，缺货](https://sg.etoren.com/products/google-pixel-9-5g-g2ybb-128gb-porcelain-12gb-ram) |
| Razer DeathAdder V3 | 通过 | 通过 | [S$106.00](https://online.challenger.sg/products/razer-deathadder-v3-mse) |
| Nikon Z50 II | 通过 | 通过 | [S$1,679.00](https://webtronic.sg/en/item/categoryitem/WEB23344-001) |
| Sennheiser Momentum 4 Wireless | 通过 | 通过 | [S$499.00](https://www.carousell.sg/p/%F0%9F%8E%B6sg-sennheiser-momentum-4-wireless-80th-anniversary-special-edition-1383769404/) |
| Philips AC1715/30 | 未找到匹配结果 | 未找到匹配结果 | — |
| LEGO 10328 | 通过 | 通过 | [S$89.99](https://www.toysrus.com.sg/lego-botanical-bouquet-of-roses-10328-10009109.html) |
| iPhone 16 256GB | 通过 | 通过 | [S$1,455.00，库存未明确](https://sg.etoren.com/products/apple-iphone-16-5g-a3287-256gb-teal-nano-sim-+-esim) |
| Samsung 990 PRO 1TB | 候选页未核实价格 | 通过 | [S$415.00](https://online.challenger.sg/products/samsung-990-pro-1tb-nvme-m-2-ssd) |
| DJI Mini 4 Pro | 通过 | 通过 | [S$799.00，库存未明确](https://online.challenger.sg/products/dji-mini-4-pro?variant=41678447378507) |
| Marshall Emberton II | 候选页未核实价格 | 通过 | [S$169.00，库存未明确](https://www.carousell.sg/p/marshall-emberton-ii-bluetooth-speaker-new-gen-ii-1409005834/) |
| Braun Series 9 Pro 9465cc | 候选页未核实价格 | 候选页未核实价格 | — |
| New Balance 2002R | 通过 | 通过 | [S$200.00](https://fas-bee.com/en-sg/products/30715697) |
| Samsung Galaxy S24 256GB | 通过 | 通过 | [S$984.00，库存未明确](https://sg.etoren.com/products/samsung-galaxy-s24-5g-sm-s921b-dual-sim-256gb-cobalt-violet-8gb-ram-dual-nano-sim-+-esim) |
| Crucial X9 Pro 1TB | 候选页未核实价格 | 候选页未核实价格 | — |
| Insta360 X4 | 通过 | 通过 | [S$1,610.53](https://directnine.sg/products/insta360-x4-waterproof-8k-360-action-helmet-camera-with-32gb-sd-card-4k-wideangle-video-invisible-selfie-stick-effect-lens-guards-135-min-battery-life-sports-content-travel-outdoor-creator-2120214129) |
| Beats Studio Pro | 通过 | 通过 | [S$585.00 起，缺货](https://www.selfridges.com/SG/en/product/beats-beats-studio-pro-wireless-headphones_R04226035/) |
| Instant Pot Duo 6L | 候选页未核实价格 | 候选页未核实价格 | — |
| Owala FreeSip 24oz | 候选页未核实价格 | 通过 | [S$47.99](https://owalalife.sg/products/freesip?variant=51415650238763) |
| OnePlus 12 256GB | 候选页未核实价格 | 候选页未核实价格 | — |
| ASUS Zenbook 14 UX3405MA | 候选页未核实价格 | 候选页未核实价格 | — |
| Nintendo Switch OLED | 通过 | 通过 | [S$499.00](https://online.challenger.sg/products/nintendo-switch-oled-model-white) |
| Garmin Forerunner 265 | 通过 | 通过 | [S$478.00](https://online.challenger.sg/products/garmin-forerunner-265-46mm-black-1) |
| Oral-B iO 6 | 候选页未核实价格 | 候选页未核实价格 | — |
| CeraVe Moisturising Cream 454g | 通过 | 通过 | [S$40.04](https://tanatasa.sg/shop/cerave-moisturising-cream-454g) |

### 另选 12 款

| 商品 | 上线前 | 最终版 | 本次可核对的商品页示例 |
|---|---|---|---|
| Google Pixel 8a 128GB | 候选页未核实价格 | 候选页未核实价格 | — |
| Logitech G502 X | 通过 | 通过 | [S$73.00](https://online.challenger.sg/products/logitech-g502-x-gaming-mouse-910-006140-black) |
| Fujifilm Instax Mini 12 | 通过 | 通过 | [S$169.00](https://electromart.sg/products/fujifilm-instax-mini-12-instant-camera) |
| Soundcore Space One | 候选页未核实价格 | 候选页未核实价格 | — |
| Dyson V12 Detect Slim | 候选页未核实价格 | 候选页未核实价格 | — |
| LEGO 10329 | 候选页未核实价格 | 候选页未核实价格 | — |
| Samsung Galaxy A55 5G 128GB | 通过 | 通过 | [S$715.00 起，缺货](https://www.selfridges.com/SG/en/product/samsung-galaxy-a55-5g-128gb_R04303152/) |
| Samsung T7 Shield 1TB | 通过 | 通过 | [S$329.00，缺货](https://online.challenger.sg/products/samsung-t7-shield-1tb-portable-ssd-blue) |
| Sony ZV-E10 II | 通过 | 通过 | [S$1,473.00](https://www.cathayphoto.com.sg/cameras/interchangeable-lens-cameras/sony-zv-e10-ii-body-black) |
| Bose QuietComfort Ultra Headphones | 通过 | 通过 | [S$449.00](https://www.courts.com.sg/bose-quietcomfort-ultra-headphones---black-880066-0100-IP201329.html) |
| Tefal Easy Fry EY5018 | 候选页未核实价格 | 候选页未核实价格 | — |
| Stanley Quencher H2.0 30oz | 候选页未核实价格 | 候选页未核实价格 | — |

### 金额视图另测 6 款

| 商品 | 上线前 | 最终版 | 本次可核对的商品页示例 |
|---|---|---|---|
| Nothing Phone (2a) 128GB | 未测 | 候选页未核实价格 | — |
| SanDisk Extreme Portable SSD 1TB | 未测 | 通过 | [S$299.00](https://online.challenger.sg/products/sandisk-extreme-portable-ssd-1tb-usb-3-2-sdssde61-1t00-g25) |
| Sony Alpha 6700 | 未测 | 候选页未核实价格 | — |
| JBL Flip 6 | 未测 | 通过 | [S$124.00](https://electromart.sg/products/jbl-flip-6-portable-waterproof-speaker) |
| Tefal DT8230 | 未测 | 未找到匹配结果 | — |
| CeraVe Hydrating Cleanser 236ml | 未测 | 通过 | [S$16.80](https://tanatasa.sg/shop/cerave-hydrating-cleanser-236ml) |

## 复核说明

各批次的搜索回复、点击链接与额外的商家页面读取结果保存于本地项目的 `.tmp/merchant-*-1108/`。测试访客的对话已清理。尚未完成页面核验的商品计入失败，不能据此判断当地没有在售。

## 默认查价的网页验收

Chrome 在正式网站查 Owala FreeSip 24oz 只显示 `S$47.99`，复述价格和重开对话均保持相同格式。查 Philips AC1715/30 只显示“暂无页面价”。用户明确要求链接时仍可点击商品页，翻译请求仍返回译文。Insta360 X4 的专项复测显示 4 个不同金额，重新打开商家页确认均对应相机或明确包含相机的套装。

固定 30 款的两次优化后整批复测均在简洁显示上线之前完成；新增的镜头保护片及电池识别和金额显示方式通过随后的网站专项复测验收。金额视图上线后，12 款重复搜索和 6 款新商品均在网站默认金额视图运行。

最后一组的 CeraVe Hydrating Cleanser 236ml 首次搜索得到单瓶、乳液套装和其他洁面配方的金额。随后对金额视图增加精确商品名称优先规则，给完全匹配的单品优先展示其页面价。正式网站另测这款商品后，页面仅显示 **S$16.80**，没有链接或商品卡。同一查询包含套装的数据未用于回填六款成绩。
