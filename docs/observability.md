# 可观测性

## Prometheus 指标

`web/server/metrics.ts` 用少量内存计数器暴露 Prometheus 文本格式，不引入额外依赖：

```bash
curl http://127.0.0.1:8787/metrics
```

生产环境必须设置 `METRICS_TOKEN`，否则 `/metrics` 返回 404：

```bash
export METRICS_TOKEN='replace-with-a-long-random-token'
curl -H "Authorization: Bearer $METRICS_TOKEN" https://your-host/metrics
```

指标：

| 指标 | 类型 | 说明 |
| --- | --- | --- |
| `picolah_http_requests_total{method,route}` | counter | 按方法 + 归一化路由计数；数字/UUID 会折叠成 `:id`，避免标签爆炸 |
| `picolah_http_request_errors_total` | counter | 5xx 总数 |
| `picolah_http_request_duration_seconds` | histogram | 请求耗时，桶 5ms–10s |
| `picolah_http_responses_total{status}` | counter | 状态码分布 |
| `picolah_http_requests_in_flight` | gauge | 处理中的请求 |
| `picolah_process_uptime_seconds` | gauge | 进程运行时长 |
| `picolah_process_resident_memory_bytes` | gauge | RSS |

## 推荐告警

- 5xx 比例 > 2%（5 分钟）；
- P95 延迟 > 2s（5 分钟）；
- `picolah_http_requests_in_flight` 持续 > 50；
- 进程重启（uptime 归零）；
- `/api/health` 连续失败。

## 日志

服务端统一输出到 stdout，包含请求错误堆栈。生产用 Docker 日志驱动或采集器收集；不要把 `Authorization`、Cookie、`X-Picolah-User` 原样写入日志。

## 外部错误追踪（可选）

当前没有绑定 Sentry/OTel SDK。接 Sentry 时只需在 `web/server/index.ts` 最前面初始化，并在错误处理中间件里 `captureException(error)`；不要把 LLM API Key、Bright Data token、数据库连接串放进事件上下文。
