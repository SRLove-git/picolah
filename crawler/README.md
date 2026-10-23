# Picolah Crawler

独立爬虫进程：用 [Bright Data](https://brightdata.com) 采集东南亚电商平台的商品报价，标准化后写入网站的价格库。

网站（`../web/`）只负责校验、入库、比价和展示，不执行采集；两边只通过 `POST /api/v1/ingest/offers` 通信，契约见 [`../docs/ingest-api.md`](../docs/ingest-api.md)。

## 状态

| 平台 | 状态 | 抓取方式 |
| --- | --- | --- |
| Lazada（六国） | ✅ SG 实测通过，其余市场同一模板待逐国验证 | Web Unlocker 抓搜索页 HTML |
| Shopee（六国） | 🧪 实验性 | Scraping Browser 渲染 + 搜索 API 拦截 |
| TikTok Shop / Amazon SG / Tokopedia / Tiki | ⏳ 未实现 | 预留 `PlatformAdapter` 接口 |

## 工作方式

```text
GET /api/catalog            网站商品目录（productId 天然对齐）
      │
      ▼
buildQuery(product)         商品名 → 搜索词
      │
      ▼
PlatformAdapter.search()    Lazada: Web Unlocker / Shopee: Scraping Browser
      │
      ▼
matchListing()              品牌 + 型号 token + 配件排除 + 价格中位数过滤
      │
      ▼
Offer                       每个商品 × 市场 × 平台只保留一条最可信报价
      │
      ▼
POST /api/v1/ingest/offers  按市场分批、幂等写入（source=picolah-crawler）
```

匹配宁可漏，不可错：标题必须命中品牌和型号，配件词（case / cover / for ... / ear pads 等）直接丢弃；同一商品有 ≥4 个候选时，低于价格中位数 35% 的离群结果会被剔除，避免把配件价当成主机价。

## 快速开始

要求：Node.js 24+、pnpm，网站 API 已启动（`pnpm dev` 或 `pnpm start`）。

```bash
pnpm install
cp crawler/.env.example crawler/.env   # Windows: Copy-Item crawler\.env.example crawler\.env
```

然后在 `crawler/.env` 里填 Bright Data 凭据。先确认能读到商品目录：

```bash
pnpm crawl --list
```

只抓一个商品做 dry-run（不写库）：

```bash
pnpm crawl --market SG --platform lazada --product sony-wh1000xm5 --dry-run
```

确认价格和标题没问题后，去掉 `--dry-run` 正式入库：

```bash
pnpm crawl --market SG --platform lazada --product sony-wh1000xm5
```

## 命令

```text
pnpm crawl --market <SG,MY,...> [--platform lazada,shopee] [options]
```

| 参数 | 说明 |
| --- | --- |
| `-m, --market` | 必填；市场，逗号分隔：`SG MY TH ID PH VN` |
| `-p, --platform` | 平台，默认 `lazada`；已实现 `lazada`、`shopee` |
| `-i, --product` | 只跑指定商品 id，逗号分隔 |
| `-l, --limit` | 最多跑多少个商品，默认 5 |
| `--concurrency` | 并发搜索数，默认 2（1–6） |
| `-d, --dry-run` | 只打印报价 JSON，不写网站 |
| `--all` | 不限商品数量（慎用，请求数 = 商品 × 市场 × 平台） |
| `--list` | 列出网站商品目录后退出 |

示例：

```bash
# 两个市场 × 一个平台 × 前 3 个商品
pnpm crawl --market SG,MY --platform lazada --limit 3 --dry-run

# 只跑某个商品，两个平台
pnpm crawl --market SG --platform lazada,shopee --product sony-wh1000xm5 --dry-run
```

## Bright Data 配置

`crawler/.env`（已 gitignore）：

```dotenv
# Web Unlocker：抓普通 HTML 页面
BRIGHTDATA_API_TOKEN=...
BRIGHTDATA_ZONE=web_unlocker1
BRIGHTDATA_CUSTOMER_ID=hl_...
BRIGHTDATA_ZONE_PASSWORD=...

# Scraping Browser：Playwright over CDP，抓 JS 渲染页面
BRIGHTDATA_BROWSER_CUSTOMER_ID=hl_...
BRIGHTDATA_BROWSER_ZONE=scraping_browser1
BRIGHTDATA_BROWSER_ZONE_PASSWORD=...
```

- **Web Unlocker** 走 REST：`POST https://api.brightdata.com/request`，`format=raw` 直接拿 HTML。
- **Scraping Browser** 走 CDP：`wss://brd-customer-<id>-zone-<zone>:<password>@brd.superproxy.io:9222`，用 `playwright-core` 连接，无需本地浏览器。

### IP 白名单 / 黑名单（重要）

Bright Data 的 zone 可以限制来源 IP。如果请求返回：

```text
x-brd-error: Auth Failed (code: ip_blacklisted)
```

或者 Scraping Browser 报 `407 Auth Failed (ip_blacklisted)`，说明当前机器出口 IP 被该 zone 拒绝。到控制台把对应 IP 段从 **Denylisted IPs** 移除（或加入 allowlist）：

- Web Unlocker：<https://brightdata.com/cp/zones/web_unlocker1/access_params?id=hl_1ff8c7ce>
- Scraping Browser：<https://brightdata.com/cp/zones/scraping_browser1/access_params?id=hl_1ff8c7ce>

爬虫会把这条错误翻译成可操作的提示并停止本轮，而不是对每个商品重复失败。

## 写入网站

- `source`：`picolah-crawler`（可用 `CRAWLER_SOURCE` 改；改了就相当于新数据源）
- `externalId`：`<market>-<platform>-<platformItemId>`，稳定幂等
- 币种：按市场固定（SGD / MYR / THB / IDR / PHP / VND）
- `itemPrice` 使用搜索结果里的当前售价；`shippingFee`、`discount` 暂记为 0（搜索页不提供准确运费/券信息）
- `rating` / `reviews` 来自 Lazada JSON-LD 或 Shopee 搜索 API
- `seller` 暂时回退为平台名（Lazada / Shopee），商品详情页的店铺名是下一步

> 切到真实爬虫前，先停掉并清理网站的 mock 数据源（`source='picolah-mock'`），否则同一平台会出现 mock + 真实两份报价。步骤见 [`../deploy/README.md`](../deploy/README.md)。

## 费用与频控

一次搜索 = 一次 Bright Data 请求（会产生费用）。默认 `--limit 5`、`--concurrency 2`，不会自动重试整轮；校验失败/匹配不到的请求不会写库。跑全量前先用 `--dry-run` 和 `--limit` 估算。

## 已知限制

- Shopee 适配器尚未在真实页面回归（当前账号的 Scraping Browser zone 需要先解除 IP 限制）；解析优先用页面里的 `/api/v4/search/search_items` 响应，失败再退回 DOM 文本。
- Lazada 依赖页面结构（`data-qa-locator="product-item"`、`ooOxS` 价格 class、JSON-LD ItemList）；平台改版后需要更新 `src/platforms/lazada.ts` 里的选择器。
- 搜索页不提供准确运费、优惠券和店铺名，这三项目前是保守占位。
- 没有做多市场 IP 定位（`country` 参数已支持但未默认开启），价格以平台站点本身的市场为准。
- 请遵守目标平台的 Terms of Service 和当地法律，控制频率，只采集公开商品页。

## 目录

```text
crawler/
├── src/
│   ├── brightdata/
│   │   ├── web-unlocker.ts       # REST 抓 HTML，错误/重试/提示
│   │   └── scraping-browser.ts   # Playwright over CDP
│   ├── platforms/
│   │   ├── lazada.ts             # 搜索页 + JSON-LD 解析
│   │   ├── shopee.ts             # 搜索 API 拦截 + DOM 兜底
│   │   └── index.ts              # 适配器注册表
│   ├── catalog.ts                # GET /api/catalog
│   ├── match.ts                  # 品牌/型号匹配、配件排除、离群价格
│   ├── money.ts                  # 多币种价格解析
│   ├── ingest.ts                 # 分批幂等入库
│   ├── pipeline.ts               # 任务编排 / 并发
│   ├── cli.ts                    # 参数与运行入口
│   └── *.test.ts
├── .env.example
└── README.md
```
