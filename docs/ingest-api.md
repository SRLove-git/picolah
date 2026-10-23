# 爬虫数据接入 API

Picolah 的价格全部来自外部爬虫。本文档定义爬虫 App 如何把标准化的商品和报价写入价格库。

> 网站侧实现：`web/server/routes/ingest.ts`；爬虫项目：[`crawler/`](../crawler/README.md)（尚未开工）。本文档是两个项目之间的唯一契约。

- 版本：`v1`
- Base URL（本地）：`http://127.0.0.1:8787`
- 通过 Vite 代理时也可用：`http://127.0.0.1:5173`
- 所有金额使用**市场本地货币**，不要换算成人民币或美元。

## 1. 鉴权

```http
Authorization: Bearer <INGEST_API_KEY>
```

密钥在服务端 `.env` 的 `INGEST_API_KEY` 中配置。开发环境默认值是 `pcl_dev_crawler_key`，生产必须更换。

| 情况 | 状态码 | 返回 |
| --- | --- | --- |
| 缺少 / 错误密钥 | `401` | `{ "ok": false, "error": "UNAUTHORIZED" }` |

网页端不会读取或下发密钥明文。

## 2. 写入报价

```http
POST /api/v1/ingest/offers
Content-Type: application/json
Authorization: Bearer <INGEST_API_KEY>
```

单批最多 **100 条报价**。一个批次只能写一个市场、一个币种。**整批校验通过才会写入；任何一条校验失败，整批都不会落库。**

### 请求体

```jsonc
{
  "source": "shopee-my-crawler",
  "country": "MY",
  "products": [
    {
      "id": "sony-wh1000xm5",
      "name": "Sony WH-1000XM5 无线降噪耳机",
      "brand": "Sony",
      "category": "耳机",
      "tagline": "旗舰降噪 · 30 小时续航",
      "visual": "headphones",
      "specs": "午夜黑 · 双设备连接",
      "aliases": ["sony xm5", "wh-1000xm5", "降噪耳机"]
    }
  ],
  "offers": [
    {
      "externalId": "shopee-my-8821",
      "productId": "sony-wh1000xm5",
      "platformId": "shopee",
      "seller": "Sony Official Store",
      "currency": "MYR",
      "itemPrice": 1399,
      "shippingFee": 0,
      "discount": 100,
      "url": "https://shopee.com.my/product/8821",
      "rating": 4.9,
      "reviews": 1310,
      "inStock": true,
      "isOfficial": true,
      "capturedAt": "2026-10-20T08:00:00.000Z"
    }
  ]
}
```

### 顶层字段

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `source` | string | 是 | 数据源标识，2–80 字符，只允许字母、数字、`.`、`_`、`-`。同一个爬虫请保持不变。 |
| `country` | enum | 是 | `SG` `MY` `TH` `ID` `PH` `VN` 之一。 |
| `products` | array | 否 | 本批涉及的商品元数据，最多 100 个。引用已有商品时可省略。 |
| `offers` | array | 是 | 1–100 条报价。 |

### `products[]`

商品以 `id` 作 upsert。存在则更新元数据，不存在则创建。

| 字段 | 类型 | 必填 | 约束 / 默认值 |
| --- | --- | --- | --- |
| `id` | string | 是 | 2–80 字符；小写字母、数字、连字符；例如 `sony-wh1000xm5`。所有数据源必须复用同一个 id。 |
| `name` | string | 是 | 2–160 字符，展示用商品名。 |
| `brand` | string | 是 | 1–80 字符。 |
| `category` | string | 否 | 默认 `其他`，最长 40 字符。 |
| `tagline` | string | 否 | 默认空，最长 160 字符。 |
| `visual` | enum | 否 | 默认 `phone`。见下面的插画枚举。 |
| `specs` | string | 否 | 默认空，最长 160 字符。 |
| `aliases` | string[] | 否 | 最多 30 个，每个最长 80 字符。用于中文 / 英文 / 型号检索。 |

`visual` 可选值：

```text
headphones  phone  serum  earbuds  airfryer
sneaker     watch  speaker  coffee
```

前端根据这个值渲染本地 SVG 商品插画，不依赖外部图片 CDN。

### `offers[]`

| 字段 | 类型 | 必填 | 约束 / 默认值 |
| --- | --- | --- | --- |
| `externalId` | string | 是 | 1–200 字符。同一个 `source` 下必须全局唯一（跨市场也不能重复），用来做幂等。若一个 source 覆盖多国，建议把市场代码放进 id，例如 `my-shopee-8821`。 |
| `productId` | string | 是 | 必须是本批 `products` 中的 id，或价格库中已存在的商品 id。 |
| `platformId` | enum | 是 | 见下方「平台矩阵」。必须属于当前市场。 |
| `seller` | string | 是 | 1–120 字符，店铺名。 |
| `currency` | string | 否 | 3 个字母。如果传入，必须等于市场币种（例如 MY 必须为 `MYR`）。建议省略，由服务端按市场决定。 |
| `itemPrice` | number | 是 | 大于 0，最多 1e12。 |
| `shippingFee` | number | 否 | 默认 0，不能为负。 |
| `discount` | number | 否 | 默认 0，不能为负；折扣不能大于 `itemPrice + shippingFee`。 |
| `url` | string | 是 | 必须是 `http(s)` 链接，最长 2000。**请传真实商品页 URL。** |
| `rating` | number | 否 | 0–5，默认 0。 |
| `reviews` | integer | 否 | ≥0，默认 0。 |
| `inStock` | boolean | 否 | 默认 `true`。 |
| `isOfficial` | boolean | 否 | 默认 `false`。官方店 / LazMall / Shopee Mall 等可标记为 true。 |
| `capturedAt` | ISO 8601 string | 否 | 采集时间。省略时使用服务端当前时间。用于 `last_seen` 和价格点的时间戳。 |

服务端计算：

```text
final_price = itemPrice + shippingFee - discount
```

金额按币种舍入：IDR / VND 取整，其它保留两位小数。

#### 平台矩阵

| 市场 | 币种 | 允许的 `platformId` |
| --- | --- | --- |
| SG 新加坡 | SGD | `shopee` `lazada` `tiktok` `amazon-sg` |
| MY 马来西亚 | MYR | `shopee` `lazada` `tiktok` |
| TH 泰国 | THB | `shopee` `lazada` `tiktok` |
| ID 印度尼西亚 | IDR | `shopee` `lazada` `tiktok` `tokopedia` |
| PH 菲律宾 | PHP | `shopee` `lazada` `tiktok` |
| VN 越南 | VND | `shopee` `lazada` `tiktok` `tiki` |

### 幂等语义

- 唯一键：`(source, externalId)`。
- 已存在：更新价格、库存、卖家、URL、评分等字段，并追加价格点。
- 不存在：创建新报价（内部 id 由服务端生成）。
- 重复推送同一批次是安全的；不会产生重复报价行。
- 同一个 `capturedAt` 的相同报价只会保留一个价格点（`INSERT OR REPLACE`）。

建议爬虫始终使用稳定 `externalId`（例如平台商品 ID 或 `platform + shop + item` 的哈希），不要用会变化的价格或时间。如果同一个 source 会跨市场运行，务必在 `externalId` 前加市场前缀，避免不同国家的报价互相覆盖。

## 3. 响应

成功：

```json
{
  "ok": true,
  "runId": "1be9e5f4-…",
  "source": "shopee-my-crawler",
  "country": "MY",
  "received": 1,
  "created": 1,
  "updated": 0,
  "productsUpserted": 1,
  "status": "ok"
}
```

### 错误码

| 状态码 | `error` | 场景 |
| --- | --- | --- |
| `401` | `UNAUTHORIZED` | 缺失或错误 Bearer token。 |
| `413` | `PAYLOAD_TOO_LARGE` | 请求体超过限制。 |
| `422` | `VALIDATION_ERROR` | 字段类型 / 枚举 / 平台 / 币种错误；返回 `issues[]`。 |
| `422` | `UNKNOWN_PRODUCT` | offer 引用了不存在的 productId，且没有在本批 `products` 中提交。 |
| `500` | `INGEST_FAILED` | 数据库写入失败，整批已回滚。 |

校验失败示例：

```json
{
  "ok": false,
  "error": "VALIDATION_ERROR",
  "issues": [
    { "externalId": "shopee-my-8821", "message": "马来西亚 的币种必须是 MYR" },
    { "path": "offers.0.itemPrice", "message": "Too small: expected number to be >0" }
  ]
}
```

### 重试建议

- `401` / `422`：修复请求后再发；原样重试不会成功。
- `500`：可以指数退避重试，数据不会产生半批。
- 网络超时：直接重试同一批次，幂等键会消除重复。
- 成功写入和数据库失败会记录到网页的「最近入库」中；鉴权失败和请求校验失败不会写库。

## 4. 读取已有商品

如果爬虫需要把平台商品映射到 Picolah 的商品 id：

```http
GET /api/catalog
```

```json
{
  "products": [
    {
      "id": "sony-wh1000xm5",
      "name": "Sony WH-1000XM5 无线降噪耳机",
      "brand": "Sony",
      "category": "耳机",
      "visual": "headphones",
      "specs": "午夜黑 · 双设备连接"
    }
  ]
}
```

正式环境建议再提供受保护的「商品创建 / 匹配」管理接口，而不是依赖爬虫自由创建。

## 5. 爬虫 App 实现建议

1. **按市场拆批次**：一次只发一个国家，币种自然一致；便于失败隔离。
2. **先聚合再做价**：采集原始页 → 清洗成统一 schema → 批量校验 → 一次性 POST。不要在采集循环里逐条请求。
3. **稳定 externalId**：价格变化不应改变 externalId。
4. **用 capturedAt**：让价格点反映实际采集时间；统一用 UTC ISO 8601。
5. **频控与退避**：批次间隔根据平台压力调整，不要并发轰炸；失败时指数退避。
6. **密钥管理**：从环境变量读取，不要写进前端或日志。
7. **异常价格保护**：如果价格相对上次跌幅超过阈值，先标记待审核，或至少在批次里附来源。
8. **监控**：记录 runId、HTTP 状态、入库条数和服务端返回的 issues。

## 6. 生产化注意事项

- 更换默认 `INGEST_API_KEY`，并增加 IP allowlist / HMAC 请求签名。
- 多实例部署时改用 PostgreSQL 与行级锁或队列，避免 SQLite 单写入瓶颈。
- 给网关增加速率限制和审计表。
- 将 `/api/config` 中的网关统计移出公开接口，或加管理员鉴权。
- 定期清理过旧价格点，或按周期聚合为日低价。
