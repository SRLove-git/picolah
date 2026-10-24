# Picolah

**购物之前，PICO 一下 · Southeast Asia price copilot**

Picolah 是一个面向东南亚市场的比价工作台：问一句想买的东西，它会把六个市场（SG / MY / TH / ID / PH / VN）的在售报价、运费和券后价摊开，告诉你最低价、和次低价差多少，以及要不要为官方店多付一点。

仓库按业务拆成两个项目，两者只通过 HTTP 数据接入契约耦合：爬虫采集 → `POST /api/v1/ingest/offers` → 网站校验、入库、比价、展示。

| 目录 | 业务 | 状态 | 内容 |
| --- | --- | --- | --- |
| [`web/`](web/README.md) | 网站 | 运行中 | React 工作台 + Express API + SQLite；对话比价、数据源网关、演示数据 |
| [`crawler/`](crawler/README.md) | 爬虫 | 基础版 | Bright Data 采集各平台报价；Lazada 已实测（SG），Shopee 数据集免登录（需开通），未开通可登录兜底 |

![Picolah welcome](web/docs/preview/welcome.png)

## 目录

```text
picolah/
├── web/                     # 网站项目（React + Express + SQLite）
│   ├── src/                 # React 工作台
│   ├── server/              # API、入库校验、比价查询、LLM 调用
│   ├── shared/              # 前后端共用的类型、目录、匹配与格式化
│   ├── mock/                # 模拟爬虫（真实爬虫开工前的开发替身）
│   └── docs/preview/        # 界面截图
├── crawler/                 # 爬虫项目（Bright Data + 本地浏览器）
│   ├── src/                 # 平台适配器、匹配、价格解析、入库
│   ├── scripts/             # Shopee 数据集检查 / 一次性登录
│   └── README.md
├── docs/ingest-api.md       # 两个项目之间的数据接入契约
├── deploy/                  # 生产部署：nginx vhost、自愈脚本、说明
├── Dockerfile               # 生产镜像（构建并托管 web/）
├── docker-compose.yml       # picolah + mock-crawler
└── pnpm-workspace.yaml      # workspace：web + crawler
```

## 快速开始

环境要求：**Node.js 24+**、**pnpm**。

```bash
pnpm install
cp web/.env.example web/.env   # Windows: Copy-Item web\.env.example web\.env
pnpm dev
```

- 工作台：**http://127.0.0.1:5173**
- API：**http://127.0.0.1:8787**
- 纯前端演示（不启动 API）：**http://127.0.0.1:5173/?mock=1**

首次启动会自动建库并写入演示数据（28 个商品 / 588 条报价 / 8 段示例对话）。想让价格动起来：

```bash
pnpm mock          # 常驻，模拟爬虫每 2 分钟推一批
pnpm mock:once     # 只推一批，适合冒烟测试
```

真实爬虫（需要先配置 `crawler/.env` 里的 Bright Data 凭据）：

```bash
pnpm crawl --list
pnpm crawl --market SG --platform lazada --product sony-wh1000xm5 --dry-run
```

Shopee 推荐用 Bright Data 数据集免登录（先在 Marketplace 开通 `Shopee - products`，把账号里的
`dataset_id` 填到 `crawler/.env` 的 `BRIGHTDATA_SHOPEE_DATASET_ID`）：

```bash
pnpm shopee:dataset-check --market=SG
pnpm crawl --market SG --platform shopee --product sony-wh1000xm5 --dry-run
```

未开通数据集时，仍可人工登录一次（cookie 会保存到 gitignore 的文件里）作为兜底：

```bash
pnpm shopee:login --market=SG
pnpm crawl --market SG --platform shopee --product sony-wh1000xm5 --dry-run
```

## 常用命令

在仓库根目录执行，脚本会转发到 `web/`：

| 命令 | 说明 |
| --- | --- |
| `pnpm dev` | 同时启动 API 与 Vite |
| `pnpm dev:api` / `pnpm dev:web` | 只启动其中一个 |
| `pnpm build` | 类型检查 + 生产构建 |
| `pnpm start` | 启动 API（存在 `web/dist/` 时同时托管前端） |
| `pnpm seed` | 清空并重建演示库 |
| `pnpm mock` / `pnpm mock:once` | 模拟爬虫常驻 / 推一批 |
| `pnpm crawl --market SG --platform lazada --limit 3` | 真实爬虫（Bright Data，见 [crawler/README](crawler/README.md)） |
| `pnpm shopee:dataset-check --market=SG` | 检查 Shopee 数据集是否已开通，并打印前几条结果 |
| `pnpm shopee:login --market=SG` | 数据集未配置时的兜底：Shopee 一次性登录，保存 cookie 供爬虫复用 |
| `pnpm test` | 匹配、目录完整性、比价与格式化测试 |

也可以 `cd web` 后直接运行 `pnpm dev`、`pnpm build` 等。

## 数据接入

爬虫只走这一个入口，完整字段、平台矩阵和错误码见 [docs/ingest-api.md](docs/ingest-api.md)：

```http
POST /api/v1/ingest/offers
Authorization: Bearer <INGEST_API_KEY>
Content-Type: application/json
```

```json
{
  "source": "shopee-my-crawler",
  "country": "MY",
  "offers": [
    {
      "externalId": "shopee-my-8821",
      "productId": "sony-wh1000xm5",
      "platformId": "shopee",
      "seller": "Sony Official Store",
      "itemPrice": 1399,
      "shippingFee": 0,
      "discount": 100,
      "url": "https://shopee.com.my/product/8821"
    }
  ]
}
```

`source + externalId` 是幂等键，重复推送不会产生重复报价；一个批次只写一个市场，整批原子写入。

## 生产部署

仓库根目录的 `Dockerfile` 构建网站镜像，`docker-compose.yml` 同时启动 `picolah` 与
`picolah-mock`。线上 picolah.com 由共享的 443 nginx 反代，说明见
[deploy/README.md](deploy/README.md)。

```bash
cp deploy/.env.example .env   # 填 LLM_API_KEY、INGEST_API_KEY
docker compose up -d --build
```

## 文档

- [网站说明](web/README.md)：功能、视觉、LLM 配置、环境变量、安全边界
- [爬虫说明](crawler/README.md)：Bright Data 配置、命令、匹配策略、平台状态
- [数据接入契约](docs/ingest-api.md)：字段、校验、幂等、错误码
- [部署说明](deploy/README.md)：Docker、隐藏入口、nginx、TLS

## License

Private prototype. No license granted yet.
