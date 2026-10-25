# PostgreSQL 迁移路径

当前运行时仍使用 Node 内置的 `node:sqlite`（`web/server/db.ts`），同步 API，单文件、零运维。
目标 schema 已放在 [`web/db/postgres.sql`](../web/db/postgres.sql)，它与 SQLite schema 字段一一对应。**这不是已完成的双驱动运行态**，而是一条可在需要时执行的迁移路径；在没有改完异步仓储层之前，设置 `DATABASE_URL` 不会自动切换数据库。

## 为什么没有直接切

- 现有仓储、鉴权、watchlist、profile 路由全部调用同步的 `db.prepare(...).get/all/run`；`pg` 是异步驱动。
- SQLite 的 `?` 占位符、`INSERT OR REPLACE`、`PRAGMA` 和 `node:sqlite` 的行对象与 `pg` 不同。
- 直接替换会把全部路由改成 async，并改变事务边界；在没有完整回归前风险高于收益。

## 迁移步骤

1. 建库并执行 schema：

   ```bash
   export DATABASE_URL='postgres://picolah:change-me@127.0.0.1:5432/picolah'
   psql "$DATABASE_URL" -f web/db/postgres.sql
   ```

2. 在 `web/package.json` 增加 `pg` 与 `@types/pg`，新增 `web/server/db-postgres.ts`：
   - 暴露 `query<T>(sql, params)`、`one<T>`、`many<T>`、`transaction(fn)`；
   - 把 `?` 占位符转换为 `$1..$n`，或在迁移时直接改写 SQL；
   - 行字段名从 snake_case 转 camelCase 的逻辑集中在一层，路由不改输出形状。

3. 把 `web/server/repo.ts`、`watchlist.ts`、`profile.ts`、`auth.ts`、`crawler` ingest 的查询逐组改为 async。
   - 事务：`upsertOffers` 里的显式 `BEGIN/COMMIT` 改为 `withTransaction`；
   - 时间：继续用 ISO 字符串写入 `TEXT`，避免驱动时区差异；
   - 布尔：继续存 `0/1 INTEGER`，读出来再转 boolean。

4. 数据迁移：
   - 用 `scripts/export-sqlite.ts` 把 SQLite 各表导成 COPY/JSON；
   - 先迁 `products`、`offers`、`price_points`，再迁 `conversations/messages`；
   - 最后迁 `users/sessions/app_users/user_events/watchlist/price_alerts`；
   - 迁移后对比 `offers` 行数、`price_points` 行数、最近 `last_seen`。

5. 灰度：`DB_DRIVER=sqlite|postgres` 开关，先让只读的比价查询走 Postgres，写入仍回 SQLite；验证后再切写入。

## 验收清单

- [ ] `pnpm --prefix web typecheck` / `test` / `build` 全绿；
- [ ] `/api/health` 返回数据库类型与连通性；
- [ ] ingest 批次在 Postgres 下幂等（同一 `source + external_id` 只保留一条）；
- [ ] 价格曲线、30 日低、watchlist 告警与 SQLite 结果逐条一致；
- [ ] 连接池上限、慢查询日志、备份/恢复演练完成。

在完成上述步骤前，生产部署继续使用 SQLite + 定期备份（`scripts/backup-db.sh`）。
