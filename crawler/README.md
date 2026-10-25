# Picolah Crawler

独立爬虫进程：用 [Bright Data](https://brightdata.com) 为聊天实时并行搜索 Shopee、Lazada、Amazon SG 的商品报价，同时保留独立的目录商品批量采集、入库流程。Amazon 适配器目前仅支持新加坡市场，其余市场默认查询 Shopee 和 Lazada。

网站（`../web/`）不在 Web 进程里执行采集；Agent 通过带 Bearer 鉴权的内网工具服务执行实时 `POST /search`，不查商品/报价库、不将结果写库。只有独立的批量采集流程通过 `POST /api/v1/ingest/offers` 入库，契约见 [`../docs/ingest-api.md`](../docs/ingest-api.md)。

## 状态

| 平台 | 状态 | 抓取方式 |
| --- | --- | --- |
| 可选全网扩展（`scope: web`） | 未激活；需另外开通专用 SERP API zone 后实测 | SERP API 发现链接 → Web Unlocker 商品页 → JSON-LD 核价 |
| Lazada（六国） | 历史 SG 样例实测通过，本轮未真实请求；其余市场待逐国验证 | Web Unlocker API 抓搜索页 HTML |
| Shopee（六国） | 已实现；当前未配置 dataset / 登录态，需授权后验证 | Marketplace Dataset API（`Shopee - products`）或登录浏览器 |
| Amazon SG | 历史 SG 样例实测解析，本轮未真实请求 | Web Unlocker API 抓搜索页 HTML（也支持代理池） |
| TikTok Shop / Tokopedia / Tiki | ⏳ 未实现 | 预留 `PlatformAdapter` 接口 |

> Shopee 对自动化流量会重定向到 `/verify/traffic/error`（提示登录）或滑块验证码，Web Unlocker/浏览器直接搜索拿不到商品。推荐开通 Bright Data 的 **Shopee - products** 数据集，用 Filter 接口按型号取结构化记录，全程不需要 Shopee 登录；数据集未配置时仍可使用下面的登录 cookie 兜底。

## 工作方式

聊天搜索默认 `CRAWLER_SEARCH_SCOPE=platforms`：`POST /search` → 并行查询所选市场支持的 Shopee / Lazada / Amazon SG → 校验商品、型号、币种和来源报价 → 直接返回聊天。未指定平台时跨这些适配器搜索；明确指定平台时只查指定项。Amazon 目前仅支持 SG，不对其他市场返回新加坡报价。全程不访问商品目录或旧价格，也不入库。

需要不限平台的网站发现时，可另行配置 `scope: web` 的 SERP 扩展；它不是默认路径，尚需专用 zone 授权和真实验证，见下方「可选全网扩展」。

以下是独立 CLI `/crawl` 的目录批量采集流程，不参与聊天搜索：

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

供 LangChain Agent 调用的内网工具服务：

```bash
# crawler/.env 与 web/.env 使用同一个 CRAWLER_TOOL_TOKEN
pnpm crawler:tool
curl -H "Authorization: Bearer $CRAWLER_TOOL_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"market":"SG","platforms":["lazada"],"productIds":["sony-wh1000xm5"]}' \
  http://127.0.0.1:8790/crawl
```

`/crawl` 保留原有目录商品批量采集和入库流程；对话使用独立的纯实时 `POST /search`，不读取商品目录、不查询已有报价、不创建商品或写入报价。它使用同样的 Bearer 鉴权，SG 跨平台搜索请求为 `{"scope":"platforms","market":"SG","platforms":["shopee","lazada","amazon-sg"],"query":"Sony WF-1000XM6","model":"WF-1000XM6"}`。服务端要求平台路径明确传入 `platforms`，Web Agent 会按默认范围和用户筛选生成该列表；只查 Lazada 时使用 `"platforms":["lazada"]`。`query` 为 2–120 字符商品搜索词（不能是网址），`model` 为可选的完整型号保护。普通商品名如 `iPhone 17 Pro 256GB` 可以省略 `model`。

两个接口共用单进程忙碌保护，同一时间只跑一轮。平台搜索每次至多并行执行 3 个已实现的平台适配器；每个平台最多返回 3 条去重且校验过的原始来源报价，总计不超过 9 条。严格检查查询文字、数字与版本/容量；有完整型号时额外检查 WF/WH、代际等差异，并过滤配件、二手/翻新、无库存、错误币种和域名。没有可验证报价就不返回价格，不补库内商品、不推测品牌或价格；单个平台失败不能冒充已查完所有平台，未配置、抓取失败、解析失败与成功但无匹配结果分别报告，失败不等于商品不存在。单元测试通过注入搜索依赖运行，不使用真实凭据。

### 可选全网扩展

此路径仅在选择 `scope: web` 时使用，目前不默认启用，也不会自动为账号开通付费服务。需用户另行授权开通专用 **SERP API zone**，再将其名称填入 `crawler/.env` 的 `BRIGHTDATA_SERP_ZONE`（默认空）。它与 `BRIGHTDATA_ZONE` 的 Web Unlocker 区是两个不同用途的 zone，不能互相替代；共用 API token。未开通并配置前不能完成真实多网站搜索验证，缺失时返回 `SERP_NOT_CONFIGURED`，不会悄悄退回 Lazada 并声称已搜索全网。

- 先执行一次 SERP 请求，按所选市场搜索多个来源的公开链接；最多检查 30 条 organic 结果，保留最多 12 个候选，每个主机最多 2 条并优先覆盖不同来源。
- 再通过 Web Unlocker 抓取最多 8 个商品页，并发最多 3 个。单轮最多 **1 次 SERP + 8 次商品页请求**；SERP 最多 45 秒、无自动重试，请求可能产生 Bright Data 费用。
- 搜索摘要只用于发现链接，不能作为售价。商品页当前只接受可验证的 JSON-LD `Product` 与单一 `Offer`；校验币种、型号和来源链接，过滤多规格区间价、配件和不同型号，运费等缺失字段保持未知。
- 「全网」表示搜索范围不限于单个平台，不保证覆盖所有网站或解析每个结果。没有结构化报价、需要登录或被拦截的页面可能无法提供报价；搜索/解析失败不能用来断言商品不存在。
- 查询全程不查库、不写库。用户明确指定平台时仍走原有平台适配器，其重试规则和请求费用独立适用。

接口格式依据 [Bright Data SERP API 官方文档](https://docs.brightdata.com/api-reference/rest-api/serp/serp-api)。真实验证需要账号已开通可用的 SERP zone；离线测试只证明解析、筛选和请求边界，不证明供应商授权或真实网站可抓取。

### Lazada：页面解析与恢复

优先读取商品卡片的明确售价；页面中的独立 JSON-LD `Product + Offer` 也可解析，不再必须依附固定 DOM 类名。区间价、多规格聚合报价和促销金额不作为确定售价。来源链接必须属于对应市场，完整型号的重复别名可以合并识别，但不同型号、代际仍严格排除。

Web Unlocker 返回无法解析的页面、空响应或暂时网络错误时，最多再请求一次，并启用 [Bright Data 的 JavaScript rendering 参数](https://docs.brightdata.com/products/web-unlocker/features#force-javascript-rendering-with-a-browser)。每次请求最多 90 秒，关闭内层重试，最多 2 次请求；明确无结果、权限/IP 拒绝和验证码页面不盲目重试。每次真实请求可能产生供应商费用。日志只记录响应长度、是否已渲染和错误代码，不输出完整 HTML 或凭据。

`src/platforms/fixtures/lazada-sg-search.html` 是真实搜索页面的缩减商品卡片样本，已去除脚本、图片和跟踪属性；回归测试覆盖部分页面恢复、价格/来源校验及型号隔离，不使用真实凭据。

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
轮询快照完成后下载 CSV。聊天实时搜索直接返回校验过的原始报价，不入库；独立 CLI 才映射成 `Offer` 后按流程入库。不再使用进程生命周期内无限期的报价缓存，每次实时搜索会创建新快照并可能重新计费。

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

未配置数据集、又没有通过本地检查的同市场登录 cookie 时，搜索立即返回 `SHOPEE_LOGIN_REQUIRED`，不会先连接收费的远程浏览器。本地检查只检查 cookie 名称、市场、非空值和声明过期时间，不能证明服务器仍认可授权：过期、登录墙和验证码仍会明确报错，不能把它们当成商品不存在。默认 `auto` 优先使用本地 Chrome / Edge，没有本地浏览器时才回退远程；也可显式选择 `brightdata`。远程若不支持应用登录状态或市场上下文，会返回 `BROWSER_CONTEXT_FAILED`，不会静默丢弃这些设置。

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

# 可选 scope:web 扩展；必须另行开通专用 SERP API zone，不能复用 web_unlocker1
# 默认空，默认跨平台搜索无需此项；选 scope:web 但未配置时明确报错
BRIGHTDATA_SERP_ZONE=

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
- **SERP API** 使用专用 `BRIGHTDATA_SERP_ZONE` 搜索发现链接，商品价格随后由 Web Unlocker 读取商品页验证；不能把 Web Unlocker 或 Browser zone 当 SERP zone 使用。
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

聊天默认并行跨平台搜索，按各适配器的请求、数据集和重试规则计费；不能把一次聊天等同于一次 HTTP 请求。可选 `scope: web` 每轮最多 1 次 SERP 和 8 次商品页请求，页面并发上限 3；这些请求也可能产生供应商费用。两种聊天路径均不写库。

独立 CLI 默认 `--limit 5`、`--concurrency 2`，不会自动重试整轮；校验失败/匹配不到的请求不会写库。跑批量前先用 `--dry-run` 和 `--limit` 估算。

Shopee 数据集模式按**筛选返回的记录数**计费（`BRIGHTDATA_SHOPEE_DATASET_LIMIT`，默认 50 条/次），不是按请求数；先用 `pnpm shopee:dataset-check` 跑一个型号确认结果和费用。

## 已知限制

- 默认跨平台搜索覆盖 Shopee、Lazada 和 Amazon SG（仅 SG）；能否成功取到数据仍取决于各自授权、登录、页面结构和库存状态，失败必须单独报告。
- 可选 `scope: web` 扩展需要专用 SERP API zone，当前未激活；另行开通和配置之后还需真实端到端验证。通用商品页解析只支持可验证的单一 JSON-LD Offer，不承诺所有网站都能抓取、所有结果都能解析。
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
