# 线上商品搜索价格返回率 — 2026-11-05

测试时间：2026-11-05 23:43:45 至 2026-11-05 23:55:50（北京时间）。

**复核后可接受的价格返回率：12/20 = 60.0%。接口原始返回率：13/20 = 65.0%。** 其中 MX Master 3S 的唯一结果来自优惠资讯页，并出现币种疑点，已作为误报剔除；原始记录完整保留。

复核后成功查询的价格返回耗时中位数 48.9 秒，P90 为 70.3 秒。20 个首轮请求全程耗时中位数为 62.5 秒；最慢的 Samsung 990 PRO 1TB 查询为 112.1 秒，最终没有报价。复核完成日期为 2026-11-06（北京时间）。

至少两个不同商家域名返回报价：**2/20（10.0%）**。这是来源覆盖指标，不保证这些报价为相同容量、配置或币种。

## 测试方法

- 预先固定 5 类、每类 4 个商品，使用公开网站同一 `/api/chat` 链路；每次创建独立会话，市场参数为 SG，实际搜索范围为 global/web。
- 两路并发，每个请求最长 180 秒；20 个首轮结果全部保留。系统内部的补充搜索和重试属于实际用户链路；没有用人工重试覆盖首轮失败。
- 成功要求至少一条报价标记为 live、在售、`verification.source=product-page`，核验时间在本次请求内，价格为正数且具有币种和有效 HTTP(S) 商品链接。返回型号及容量标题已另行检查。
- 耗时从发出请求算到收到有效价格事件，不包含其后的答案文本生成；P90 使用成功样本的最近秩分位数。
- 该样本偏重电子消费品，是现场抽样，不能直接代表所有商品的长期成功率。报价返回率不等于可成交价格准确率或全网覆盖率。
- 小米 14 和 Sony WH-CH720N 各额外重复两次，稳定性结果单列，不计入首轮 20 个商品的分母。

## 分类结果

| 类别 | 接口返回 / 测试 | 复核后成功 / 测试 | 复核后成功率 |
| --- | ---: | ---: | ---: |
| 手机 | 3 / 4 | 3 / 4 | 75% |
| 耳机 / 音箱 | 3 / 4 | 3 / 4 | 75% |
| 家电 | 2 / 4 | 2 / 4 | 50% |
| 电脑配件 / 摄影 | 2 / 4 | 1 / 4 | 25% |
| 穿戴 / 游戏 | 3 / 4 | 3 / 4 | 75% |

## 首轮明细

| 查询 | 结果 | 接口报价数 | 价格返回 / 全程秒 | 检查 / 核验页 | 返回价格（原币种） |
| --- | --- | ---: | ---: | ---: | --- |
| 小米14 | 成功 | 1 | 51.4 / 53.1 | 8 / 1 | USD 1110 |
| Sony WH-CH720N | 成功 | 1 | 38.1 / 39.5 | 8 / 1 | USD 89.99 |
| 小米17 | 成功 | 1 | 49.6 / 50.2 | 8 / 1 | EUR 1013.48 |
| Sony WH-1000XM5 | 成功 | 1 | 82.8 / 84.1 | 12 / 1 | HKD 3190 |
| iPhone 16 256GB | 成功 | 1 | 59.5 / 60.6 | 12 / 1 | GBP 665.84 |
| AirPods Pro 2 | 失败 | 0 | — / 78.2 | 12 / 0 | — |
| Samsung Galaxy S24 256GB | 失败 | 0 | — / 81.0 | 12 / 0 | — |
| JBL Flip 6 | 成功 | 1 | 63.3 / 64.5 | 8 / 1 | INR 7699 |
| Dyson V12 Detect Slim | 成功 | 3 | 39.5 / 40.9 | 8 / 3 | EUR 649；SGD 849；CHF 649 |
| Logitech MX Master 3S | 误报，复核剔除 | 1 | 49.6 / 51.2 | 8 / 1 | JPY 459 |
| Philips HD9252/91 | 成功 | 1 | 38.8 / 40.0 | 8 / 1 | PKR 35000 |
| Logitech G502 HERO | 失败 | 0 | — / 91.0 | 12 / 0 | — |
| Joyoung DJ13E-Q7 | 失败 | 0 | — / 108.6 | 12 / 0 | — |
| Samsung 990 PRO 1TB | 失败 | 0 | — / 112.1 | 12 / 0 | — |
| Tefal RK818A | 失败 | 0 | — / 85.4 | 12 / 0 | — |
| Canon EOS R50 | 成功 | 2 | 47.0 / 48.1 | 8 / 2 | USD 746；GBP 859 |
| Nintendo Switch OLED | 成功 | 1 | 70.3 / 71.7 | 8 / 1 | CAD 484.99 |
| Sony PlayStation 5 Slim | 成功 | 1 | 30.9 / 32.0 | 8 / 1 | HKD 6799 |
| Apple Watch Series 10 | 失败 | 0 | — / 65.5 | 12 / 0 | — |
| Garmin Forerunner 265 | 成功 | 1 | 48.2 / 50.2 | 8 / 1 | EUR 419 |

## 重复稳定性

| 查询 | 首轮 | 补测 1 | 补测 2 | 合计 |
| --- | --- | --- | --- | --- |
| 小米14 | 成功（53.1 秒） | 成功（28.9 秒） | 成功（32.6 秒） | 3 / 3 |
| Sony WH-CH720N | 成功（39.5 秒） | 成功（29.6 秒） | 成功（21.8 秒） | 3 / 3 |

## 失败与瓶颈

### 额外发现的误报

`Logitech MX Master 3S` 返回 `JPY 459`，链接指向 Dealmoon 优惠资讯页，而不是天猫商品购买页。[原文页面](https://www.dealmoon.com/cn/459-logitech-mx-master-3s-wireless-bluetooth-mouse-electromagnetic-scroll-wheel/6257340.html)介绍天猫促销，并经 `go.dealmoon.com` 跳转购买；页面正文的人民币促销上下文与日元标签不一致。

对英文原 URL 重新获取 HTML 后，确认其 JSON-LD 自身写了 `priceCurrency: JPY` 和 `InStock`；当前解析器直接采纳了这些字段。问题是优惠资讯页被当作商家商品页，以及缺少对页面结构化数据与实际售卖场景的交叉校验。这里没有断言天猫当前成交价就是人民币 459 元，也没有用该资讯价替代有效报价。

完整证据在 `.tmp/search-success-20261105/dealmoon-source-audit.json` 和 `manual-review.json`。这次测试没有修改生产代码。

### 未返回报价的 7 个商品

- `AirPods Pro 2`：`PRODUCT_PAGE_UNVERIFIED`，发现 15 个候选、检查 12 页、核验 0 页。
- `Samsung Galaxy S24 256GB`：`PRODUCT_PAGE_UNVERIFIED`，发现 16 个候选、检查 12 页、核验 0 页。
- `Logitech G502 HERO`：`PRODUCT_PAGE_UNVERIFIED`，发现 15 个候选、检查 12 页、核验 0 页。
- `Joyoung DJ13E-Q7`：`PRODUCT_PAGE_UNVERIFIED`，发现 12 个候选、检查 12 页、核验 0 页。
- `Samsung 990 PRO 1TB`：`PRODUCT_PAGE_UNVERIFIED`，发现 13 个候选、检查 12 页、核验 0 页。
- `Tefal RK818A`：`PRODUCT_PAGE_UNVERIFIED`，发现 12 个候选、检查 12 页、核验 0 页。
- `Apple Watch Series 10`：`PRODUCT_PAGE_UNVERIFIED`，发现 17 个候选、检查 12 页、核验 0 页。

首轮共检查 196 页，系统判定核验成功 16 页（8.2%），其中包含上述误报。HTTP 200 且流式应答完成：20/20。接口完成与获得价格是不同指标。

同期供应商日志中，主要失败/未核验原因如下。该日志没有查询 ID，且可能包含同期其他流量，因此仅用于诊断，不作为上述成功率分母。

| 提供方 | 结果 | 原因 | HTTP 状态 | 次数 |
| --- | --- | --- | ---: | ---: |
| deepseek | unverified | STOCK_NOT_EXPLICIT | — | 76 |
| brightdata | error | WEB_PAGE_TIMEOUT | — | 58 |
| deepseek | unverified | PRODUCT_HEADING_UNVERIFIED | — | 53 |
| deepseek | unverified | PRICE_FORMAT_UNSUPPORTED | — | 20 |
| deepseek | error | WEB_PAGE_TIMEOUT | — | 18 |
| deepseek | error | WEB_PAGE_SOURCE_FAILED | — | 16 |
| deepseek | error | WEB_PAGE_SOURCE_FAILED | 404 | 13 |
| brightdata | error | WEB_PAGE_SOURCE_FAILED | 404 | 12 |
| deepseek | unverified | PRODUCT_UNAVAILABLE | — | 12 |
| brightdata | error | WEB_PAGE_SOURCE_FAILED | 502 | 7 |
| deepseek | unverified | PRODUCT_NOT_NEW | — | 7 |
| deepseek | unverified | PAGE_NOT_PRODUCT | — | 4 |
| brightdata | error | WEB_PAGE_SOURCE_FAILED | 402 | 4 |
| deepseek | unverified | VARIANT_PRICE_RANGE | — | 3 |
| deepseek | unverified | PRICE_OR_CURRENCY_MISSING | — | 2 |
| deepseek | unverified | VARIANT_NOT_SELECTED | — | 2 |
| brightdata | error | WEB_PAGE_SOURCE_FAILED | 403 | 2 |
| brightdata | error | WEB_PAGE_SOURCE_FAILED | 410 | 2 |
| deepseek | conflict | PRODUCT_PAGE_PRICE_CONFLICT | — | 1 |
| brightdata | error | WEB_PAGE_HTTP_ERROR | 500 | 1 |
| deepseek | error | WEB_DNS_FAILED | — | 1 |

同期 Fetch 日志出现 228 次请求，仅 1 次解析候选报价成功，随后因价格冲突被拒绝，未出现 Fetch 与 HTML 双源核验成功事件；Bright Data HTML 抓取成功 168 次。结合返回结果，当前价格链路明显依赖 HTML 回退，Fetch 内容的库存和商品身份可解析性仍是瓶颈。该统计为上述同期日志范围。

## 环境与证据

- 测试期间未修改或重新部署线上代码。测试前后服务健康，结束后测试账号下的会话数量为 0。
- 网站镜像：`sha256:e6d7fcec3ee4a002e2a17b02c9820d765030b32c869e9bfa38e44bef67c3232a`。
- 爬虫镜像：`sha256:e479237a47abc1f7de0bc1b6e22801e093688d07fcaaa6d577273c29fb051df9`。
- 配置：DeepSeek Search + DeepSeek Fetch，HTML 回退开启，爬虫搜索并发上限为 3；测试占用 2 路。
- 原始证据：`.tmp/search-success-20261105/plan.json`、`results.json`、各请求 `*-frames.json`、`provider-events.json` 和 `summary.json`。
- 可读明细：`docs/search-success-rate-2026-11-05.csv`。
