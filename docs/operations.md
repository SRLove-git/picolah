# 运维手册

## 启动与健康检查

```bash
docker compose up -d --build
curl -fsS http://127.0.0.1:8787/api/health
```

`/api/health` 返回数据库状态、数据新鲜度、最近一次爬虫批次和告警积压；生产环境请把它接进探活与监控。容器健康检查已经内置在 `docker-compose.yml`。

## 账户与访问控制

- 生产环境 `NODE_ENV=production` 默认开启 `AUTH_REQUIRED`，登录后才能访问比价、画像、关注和提醒。
- 首次使用在登录页注册；密码使用 `scrypt` 哈希，会话是 httpOnly cookie，默认 30 天。
- 本地演示如不想登录，显式设置 `AUTH_REQUIRED=false`。
- 反向代理务必启用 HTTPS，否则会话 cookie 只适合内网使用。

## 数据备份

SQLite 使用 WAL，直接复制文件可能拿到不一致快照。使用在线备份脚本：

```bash
PICOLAH_DB_PATH=/app/data/picolah.db sh scripts/backup-db.sh
```

或在 compose 中启用每日备份容器：

```bash
docker compose --profile backup up -d
```

备份写入 `data/backups/picolah-<utc>.db.gz`，默认保留 7 份，可用 `BACKUP_KEEP` 调整。恢复时停掉 API，解压后替换 `data/picolah.db`（同时删除旧的 `-wal` / `-shm` 文件）。

设置 `DATABASE_URL` 后改用 PostgreSQL 备份：

```bash
pg_dump "$DATABASE_URL" --format=custom --file="backup-$(date +%F).dump"
pg_restore --clean --if-exists --dbname="$DATABASE_URL" backup-2026-10-25.dump
```

把 `pg_dump` 放进 cron 或使用云数据库自动备份，并定期做恢复演练。

## 联盟链接

`/go/:offerId` 是唯一的出站入口。配置以下任意环境变量即可给对应平台追加联盟参数，模板支持 `{url}`、`{rawUrl}`、`{platform}`：

```dotenv
AFFILIATE_SHOPEE_TEMPLATE=https://shope.ee/xxxx?sub_id={platform}
AFFILIATE_LAZADA_TEMPLATE=https://c.lazada.sg/t/c.xxxx?sub_aff_id=picolah
```

未配置时原样 302 到商家地址。页面底部和条款页已包含联盟披露。

## 价格提醒

- 关注商品时可设置目标价；任意降价也会形成提醒。
- 爬虫每次 ingest 成功后自动评估对应市场，也可以用 `ALERT_WEBHOOK_URL` 接 Slack/Telegram 桥。
- 同一关注项 24 小时内不会重复提醒；提醒会出现在“关注”页。

## 爬虫调度

```bash
npm --prefix crawler run crawl:schedule
```

默认每 6 小时抓一轮、进程内串行、失败指数退避。生产建议用独立 worker 或 cron 调用 `crawl`，避免和网站容器互相影响。

## CI

`.github/workflows/ci.yml` 在 Node 24 + pnpm 下执行：

- 网站 `typecheck`、`test`、`build`
- 爬虫 `typecheck`、单元测试

CI 中 `LLM_API_KEY` 为空，聊天测试走离线兜底；涉及真实模型的测试请放在独立的定时任务里。
