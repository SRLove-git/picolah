# PostgreSQL 接入

网站现在同时支持 **SQLite（默认）** 和 **PostgreSQL**，由 `DATABASE_URL` 自动选择：

- 不设置 `DATABASE_URL`：使用 `node:sqlite`，单文件、零运维，适合本地开发和单机部署。
- 设置 `DATABASE_URL`（例如 `postgres://picolah:...@127.0.0.1:5432/picolah`）：启动时连接 PostgreSQL，自动执行 [`web/db/postgres.sql`](../web/db/postgres.sql) 建表。

两种驱动暴露同一个异步 `Database` 接口（`web/server/db.ts`）：`get` / `all` / `run` / `transaction` / `close`。业务层用 `?` 占位符；PostgreSQL 驱动会转换成 `$1..$n`，所以仓储、鉴权、画像、watchlist 和 ingest 不需要两套 SQL。

## 快速启用

```bash
# 1. 准备数据库（Docker 或已有实例）
docker run -d --name picolah-pg \
  -e POSTGRES_DB=picolah \
  -e POSTGRES_USER=picolah \
  -e POSTGRES_PASSWORD=change-me \
  -p 5432:5432 \
  postgres:16-alpine

# 2. 配置并启动
export DATABASE_URL='postgres://picolah:change-me@127.0.0.1:5432/picolah'
pnpm dev:api
```

首次连接会自动建表；也可以手动执行：

```bash
psql "$DATABASE_URL" -f web/db/postgres.sql
```

Docker Compose 提供了一个可选的 PostgreSQL 服务：

```bash
# .env 里设置 POSTGRES_PASSWORD 和 DATABASE_URL
docker compose --profile postgres up -d
```

`docker-compose.yml` 的 `postgres` 服务使用 `pgdata/` 持久化；应用容器通过 `DATABASE_URL` 连接。不启用该 profile 时仍走 SQLite。

## 配置

| 变量 | 默认 | 说明 |
| --- | --- | --- |
| `DATABASE_URL` | 空 | 设置后启用 PostgreSQL；空则 SQLite |
| `PICOLAH_DB_PATH` | `data/picolah.db` | 仅 SQLite 使用 |
| `DATABASE_POOL_SIZE` | `10` | PostgreSQL 连接池上限 |

连接池错误会写日志，不会让进程崩溃。`/api/health` 会执行 `SELECT 1`，数据库不可用时返回 `503`，并显示 `database: "postgres" | "sqlite"` 和 `databaseOk`。

## 数据迁移

小数据量可以直接用 `pgloader`，或按表导出/导入。推荐顺序（照顾外键）：

1. `products`
2. `offers`、`price_points`
3. `conversations`、`messages`
4. `ingest_runs`
5. `app_users`、`users`、`sessions`
6. `user_events`、`watchlist`、`price_alerts`

迁移后至少核对：

```sql
SELECT count(*) FROM products;
SELECT count(*) FROM offers;
SELECT count(*) FROM price_points;
SELECT max(created_at) FROM messages;
```

时间字段统一存 ISO 字符串（`TEXT`），布尔字段存 `INTEGER 0/1`，与 SQLite 保持一致；PostgreSQL schema 不依赖 `timestamptz` 的时区转换。

## 备份与恢复

SQLite 继续使用 `scripts/backup-db.sh`。PostgreSQL 使用：

```bash
pg_dump "$DATABASE_URL" --format=custom --file="backup-$(date +%F).dump"
pg_restore --clean --if-exists --dbname="$DATABASE_URL" backup-2026-10-25.dump
```

把命令放进 cron 或云厂商的自动备份；定期做一次恢复演练。

## 验收清单

- [x] `pnpm --prefix web typecheck` / `test` / `build` 全绿（含 PGlite PostgreSQL 集成测试）；
- [x] 使用嵌入式 PGlite（PostgreSQL 协议兼容）跑通建表、商品、报价、价格点、ingest 幂等、会话、账号、画像、watchlist、告警、30 日低与 `/api/health`；
- [x] `/api/health` 返回数据库类型与连通性；
- [x] ingest 在 PostgreSQL 下按 `source + external_id` 幂等；
- [ ] 在生产同版本 PostgreSQL 上做一次完整压测与恢复演练（PGlite 不是生产服务器）。

> PGlite 用于自动化测试，验证的是 SQL 与协议层；正式切库前仍应在目标 PostgreSQL 版本（建议 16+）上跑一遍 `web/server/postgres.test.ts` 同等流程。
