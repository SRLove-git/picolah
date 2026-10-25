# 性能与 E2E

## API 冒烟（无需浏览器）

```bash
# 先启动 API（或在 compose 里起 web）
npm run dev:api
npm run e2e:api
# 指向远端：
PICOLAH_BASE_URL=https://your-host npm run e2e:api
```

检查 `/api/health`、`/api/config`、`/metrics`、PWA manifest 和安全响应头。生产环境如果开了入口 Cookie，`/api/config` 会被 404 挡住；这项应在内网或用入口 Cookie 跑。

## k6 压测

安装 k6 后：

```bash
PICOLAH_BASE_URL=http://127.0.0.1:8787 VUS=20 DURATION=60s npm run load:smoke
```

阈值：失败率 < 2%，P95 < 800ms。当前脚本只压 `/api/health`，用于验证进程/网络基线；压比价接口前先准备商品目录和登录 Cookie，避免把 401 当成性能结果。

## 真实浏览器 E2E

本轮没有引入 Playwright 依赖（安装浏览器会显著增加 CI 时间）。建议下一步：

```bash
pnpm --prefix web add -D @playwright/test
pnpm --prefix web exec playwright install chromium
```

覆盖路径：注册 → 登录 → 首页提问 → 比价卡 → 关注 → 告警 → 导出/注销 → 隐私页。CI 里用 `playwright install --with-deps chromium`，并复用 `web/data` 的临时 SQLite。

## 前端性能

- 视图已按路由懒加载：Reels、Messages、Profile、Watchlist、Account、Legal 各自成 chunk；首屏主包从约 714KB 降到约 536KB（minified）。
- 生产构建仍提示主 chunk > 500KB；下一步可把 `i18n` 语言包和 `lucide-react` 图标按需加载，或进一步拆分 Chat/Home。
- Service Worker 只缓存 `/assets/`、`/fonts/` 等静态资源，不缓存 API 和 `/go/` 跳转，避免价格数据离线过期。
