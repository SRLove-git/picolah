# Picolah Crawler

独立爬虫进程：用 [Bright Data](https://brightdata.com) 采集东南亚电商平台的商品报价，标准化后写入网站的价格库。

网站（`../web/`）只负责校验、入库、比价和展示，不执行采集；两边只通过 `POST /api/v1/ingest/offers` 通信，契约见 [`../docs/ingest-api.md`](../docs/ingest-api.md)。

## 状态

| 平台 | 状态 | 抓取方式 |
| --- | --- | --- |
| Lazada（六国） | ✅ SG 实测通过，其余市场同一模板待逐国验证 | Web Unlocker API 抓搜索页 HTML |
| Shopee（六国） | ✅ 数据集免登录（需在 Bright Data 开通）；未开通时回退到登录 cookie | Marketplace Dataset API（`Shopee - products`） |
| Amazon SG | ✅ SG 实测解析 | Web Unlocker API 抓搜索页 HTML（也支持代理池） |
| TikTok Shop / Tokopedia / Tiki | ⏳ 未实现 | 预留 `PlatformAdapter` 接口 |

> Shopee 对自动化流量会重定向到 `/verify/traffic/error`（提示登录）或滑块验证码，Web Unlocker/浏览器直接搜索拿不到商品。推荐开通 Bright Data 的 **Shopee - products** 数据集，用 Filter 接口按型号取结构化记录，全程不需要 Shopee 登录；数据集未配置时仍可使用下面的登录 cookie 兜底。

## 工作方式

```text
GET /api/catalog            网站商品目录（productId 天然对齐）
      │
      ▼
buildQuery(product)         商品名 → 搜索词
      │
      ▼
PlatformAdapter.search()    Lazada: Web Unlocker / Shopee: 数据集 Filter（或登录浏览器兜底）
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
pnpm crawl --market SG --platform amazon-sg --product sony-wh1000xm5 --dry-run
```

确认价格和标题没问题后，去掉 `--dry-run` 正式入库：

```bash
pnpm crawl --market SG --platform lazada --product sony-wh1000xm5
```

### Shopee：数据集免登录（推荐）

Bright Data 的 **Shopee - products** 是现成的结构化数据集（商品、价格、评分、卖家、库存等），
用 Filter 接口按型号筛选，不需要登录 Shopee，也不会触发搜索页的登录墙。

1. 在 [Bright Data Marketplace](https://brightdata.com/cp/scrapers/browse) 搜索并开通 **Shopee - products**（按记录计费）。
2. 开通后把该数据集在账号里的 `dataset_id` 写入 `crawler/.env`：

```dotenv
BRIGHTDATA_SHOPEE_DATASET_ID=gd_xxxxxxxxxxxxxxxx
BRIGHTDATA_SHOPEE_DATASET_LIMIT=50
```

3. 直接跑 Shopee：

```bash
pnpm crawl --market SG --platform shopee --product sony-wh1000xm5 --dry-run
```

适配器会调用 `POST /datasets/filter`（`title includes 型号` + `domain includes shopee.sg`），
轮询快照完成后下载 CSV，映射成统一的 `Offer` 再入库。同一个型号在一次进程内会缓存筛选结果，
避免重复创建快照。

> 注意：`/datasets/list` 里的目录 id 只是 Marketplace 目录，未开通时调用会返回 404；
> 必须使用**开通后账号里的** dataset id。若返回 400 `This dataset does not support collection`，
> 说明该数据集不支持 Filter，需要换支持 Filter 的 Shopee 数据集或改用登录方案。

### Shopee：先登录一次（数据集未配置时的兜底）

Shopee 对自动化流量要求登录。第一次使用前，在仓库根目录运行：

```bash
pnpm shopee:login --market=SG
```

会弹出一个真实的 Chrome 窗口（默认直连，登录更稳），手动登录 Shopee SG 后脚本自动把 cookie 保存到
`crawler/.shopee-state.SG.json`（已 gitignore）。每个市场单独登录一次即可（`--market=MY` 等）。

```bash
pnpm crawl --market SG --platform shopee --product sony-wh1000xm5 --dry-run
```

登录窗口如果走代理更稳，加 `--proxy`；只想检查 Chrome / 代理是否可用，用 `--check`。

## 命令

```text
pnpm crawl --market <SG,MY,...> [--platform lazada,shopee,amazon-sg] [options]
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

Shopee 数据集 / 登录：

```bash
pnpm shopee:dataset-check --market=SG   # 需先配置 dataset id；会创建一次付费筛选任务
pnpm shopee:login --market=SG           # 数据集未配置时的兜底：打开 Chrome 登录并保存 cookie
pnpm shopee:login --market=SG --check   # 只检查 Chrome / 代理
```

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
# Bright Data 账号
BRIGHTDATA_CUSTOMER_ID=hl_...
BRIGHTDATA_API_TOKEN=...

# 抓取通道：api = Web Unlocker REST，proxy = ISP 代理
BRIGHTDATA_TRANSPORT=api
BRIGHTDATA_ZONE=web_unlocker1

# proxy 模式（可选）
BRIGHTDATA_PROXY_ZONE=isp_proxy1
BRIGHTDATA_PROXY_PASSWORD=...
BRIGHTDATA_PROXY_HOST=http://brd.superproxy.io:44445

# 可选代理池模式（默认 api）
BRIGHTDATA_TRANSPORT=proxy
BRIGHTDATA_PROXY_ZONE=isp_proxy1
BRIGHTDATA_PROXY_PASSWORD=...
BRIGHTDATA_PROXY_HOST=http://brd.superproxy.io:33335

# Scraping Browser：Playwright over CDP，抓 JS 渲染页面
BRIGHTDATA_BROWSER_CUSTOMER_ID=hl_...
BRIGHTDATA_BROWSER_ZONE=scraping_browser1
BRIGHTDATA_BROWSER_ZONE_PASSWORD=...
BRIGHTDATA_BROWSER_HOST=brd.superproxy.io
BRIGHTDATA_BROWSER_PORT=9222

# Shopee 数据集（免登录）：开通 “Shopee - products” 后填账号里的 dataset_id
BRIGHTDATA_SHOPEE_DATASET_ID=
BRIGHTDATA_SHOPEE_DATASET_LIMIT=50
```

两种 HTTP 通道：

| 模式 | 用途 | 说明 |
| --- | --- | --- |
| `api` | Web Unlocker REST | `POST https://api.brightdata.com/request`，能执行 JS / 过风控，Lazada 用这个 |
| `proxy` | ISP 代理 | `http://brd-customer-<id>-zone-<proxy-zone>:<password>@host:port`，IP 干净但不做解锁 |

> **Lazada 适配器会强制使用 `api` 模式**：实测 ISP 代理只能拿到 Lazada 的 JS 空壳（58KB、无商品卡片），Web Unlocker 才能拿到完整搜索页（1.8MB、带 40 个商品）。`BRIGHTDATA_TRANSPORT` 只作为其他平台/自定义抓取的默认值；Amazon SG 用默认通道即可。

- **Web Unlocker** 走 REST：`POST https://api.brightdata.com/request`，`format=raw` 直接拿 HTML。
- **Scraping Browser** 走 CDP：`wss://brd-customer-<id>-zone-<zone>:<password>@<host>:<port>`，用 `playwright-core` 连接，无需本地浏览器；可按市场加 `-country-sg` 之类的出口标记。
- **本地 Chrome**（Shopee 默认）：自动检测 Chrome / Edge，走 ISP 代理（`CRAWLER_LOCAL_PROXY=on`）；登录脚本默认直连，避免代理不稳定。
- `CRAWLER_BROWSER=auto|local|brightdata` 控制用哪个浏览器；`auto` 有本地 Chrome 就用本地，否则用 Scraping Browser。

### IP 白名单 / 黑名单（重要）

Bright Data 的 zone 可以限制来源 IP。如果请求返回：

```text
x-brd-error: Auth Failed (code: ip_blacklisted)
```

或者 Scraping Browser 报 `407 Auth Failed (ip_blacklisted)`，说明当前机器出口 IP 被该 zone 拒绝。到控制台把对应 IP 段从 **Denylisted IPs** 移除（或加入 allowlist）：

- Web Unlocker：<https://brightdata.com/cp/zones/web_unlocker1/access_params>
- Scraping Browser：<https://brightdata.com/cp/zones/scraping_browser1/access_params>

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

Shopee 数据集模式按**筛选返回的记录数**计费（`BRIGHTDATA_SHOPEE_DATASET_LIMIT`，默认 50 条/次），不是按请求数；先用 `pnpm shopee:dataset-check` 跑一个型号确认结果和费用。

## 已知限制

- Shopee 推荐走**数据集免登录**（`BRIGHTDATA_SHOPEE_DATASET_ID`）；数据集按记录计费，且只覆盖数据集声明支持的市场。数据集未配置时才回退到**一次性人工登录**：Shopee 会对自动化流量返回 `/verify/traffic/error` 或滑块验证码，用 `shopee:login` 保存 cookie 后即可。登录状态存在 `crawler/.shopee-state.<market>.json`，过期后重跑登录。
- Shopee 的登录捕获依赖本地 Chrome（Windows 自带 Chrome/Edge 即可）；纯服务器环境需要先装 Chrome，或把本地生成的 state 文件拷过去并设置 `SHOPEE_STORAGE_STATE`。
- Lazada 依赖页面结构（`data-qa-locator="product-item"`、`ooOxS` 价格 class、JSON-LD ItemList）；平台改版后需要更新 `src/platforms/lazada.ts` 里的选择器。
- ISP 代理模式已支持，但对 Lazada 只能拿到未渲染的空壳页，所以 Lazada 固定走 Web Unlocker API。
- 搜索页不提供准确运费、优惠券和店铺名，这三项目前是保守占位。
- 没有做多市场 IP 定位（`country` 参数已支持但未默认开启），价格以平台站点本身的市场为准。
- 请遵守目标平台的 Terms of Service 和当地法律，控制频率，只采集公开商品页。

## 目录

```text
crawler/
├── src/
│   ├── brightdata/
│   │   ├── web-unlocker.ts       # REST 抓 HTML，错误/重试/提示
│   │   ├── csv.ts                # 数据集快照 CSV 解析（RFC 4180）
│   │   └── scraping-browser.ts   # Playwright over CDP
│   ├── platforms/
│   │   ├── amazon-sg.ts           # Amazon SG 搜索页解析
│   │   ├── lazada.ts             # 搜索页 + JSON-LD 解析
│   │   ├── shopee.ts             # 搜索 API 拦截 + DOM 兜底
│   │   ├── shopee-dataset.ts     # Bright Data 数据集 Filter + CSV 映射
│   │   └── index.ts              # 适配器注册表
│   ├── catalog.ts                # GET /api/catalog
│   ├── match.ts                  # 品牌/型号匹配、配件排除、离群价格
│   ├── money.ts                  # 多币种价格解析
│   ├── ingest.ts                 # 分批幂等入库
│   ├── pipeline.ts               # 任务编排 / 并发
│   ├── cli.ts                    # 参数与运行入口
│   └── *.test.ts
├── .env.example
├── scripts/shopee-login.ts   # 一次性登录，保存 Shopee cookie
└── README.md
```
