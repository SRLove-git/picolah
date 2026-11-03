# Pico 商品库查询修复及线上验收 — 2026-11-03

已修复并部署。新加坡 58 款商品以完整名称和日常问法查询均准确命中，原有漏查与型号错配已复现验证通过。

## 修复内容

- 商品库查询保留完整商品名和规格，避免把 Pro 256GB、Balance 530 等片段当作整个型号；多轮筛选及图片识别后的查询使用同一规则。
- 型号识别保留 /08、/09 等版本后缀；不存在的规格不再替换为相近款。
- 区分 G20 与 G20 Max、iPhone 不同代际；明确同时查询多个商品时仍可返回各自结果。
- 容量比较使用完整数值，保留 4.2L 等小数，避免部分数字匹配。

## 验收

| 验证层级 | 结果 |
| --- | --- |
| 工作区完整测试 | 250 / 250 |
| 实际提交版本独立构建及测试 | 构建成功；246 / 246 |
| 服务器数据库副本候选版本 | 133 / 133 查询通过 |
| 公网完整名称 | 58 / 58 |
| 公网日常问法 | 58 / 58，修复前为 53 / 58 |
| 公网英文/紧凑写法、错误规格和多轮筛选 | 17 / 17 |
| 公网 HTML 与更新资源 | HTML + 15 个资源 SHA-256 匹配 |
| 生产服务、SQLite | 健康；quick_check=ok |

公网总计 133 次查询全部通过。130 个 API 测试对话已删除并确认列表为空。Safari 另进行了 3 次界面验收，保留该验收对话以供查看；其截图记录了英文 iPhone 请求准确命中、G20 Max 单独命中、NA221/08 返回未找到。

## 部署记录

- 功能提交：[ca60b5c](https://github.com/SRLove-git/picolah/commit/ca60b5cb7764d106d920d6cbb2cfe91148faa206)，已推送 main。
- 发布：`catalog-query-ca60b5c-20261103T144630Z`。
- 镜像：`sha256:c1f1231c102e03af2aac91b882c4f098ca9ed4cc63be81d36cd627c575253819`。
- 备份：`/opt/picolah-backups/catalog-query-ca60b5c-20261103T144630Z`。
- 当前页面：[PICOLAH](https://picolah.com/7hk9ho#home)。
- 保留生产环境变量、数据库挂载、爬虫服务与非本次修改的后端文件。数据库以一致性快照验证候选版本后再切换服务。

## 报价状态

查询识别问题已经修复，但本轮没有更新商品价格。线上有 45 款商品的历史商品页核验报价，时间为 2026-11-02T11:19:19.076Z 至 2026-11-02T13:51:51.018Z，均超过当前生产配置的 24 小时有效期；有效记录数为 0。因此本轮查询可识别全部商品，但仍没有可展示的现价。

保留仅展示重新核验成功现价的要求；未修改历史报价时间，也未调整有效期。

## 验收材料

- [公网逐款结果](/Users/yangyongze/Documents/ChatGPT/picolah/.tmp/pico-catalog-query-fixed-20261103/all-results.json)
- [公网边界及多轮结果](/Users/yangyongze/Documents/ChatGPT/picolah/.tmp/pico-catalog-query-fixed-20261103/edge-results.json)
- [汇总](/Users/yangyongze/Documents/ChatGPT/picolah/.tmp/pico-catalog-query-fixed-20261103/summary.json)
- [浏览器截图](/Users/yangyongze/Documents/ChatGPT/picolah/.tmp/catalog-query-fix/browser-verified.png)
- [资源及健康检查](/Users/yangyongze/Documents/ChatGPT/picolah/.tmp/catalog-query-fix/public-verification.json)
- [修复前测试报告](/Users/yangyongze/Documents/ChatGPT/picolah/docs/pico-catalog-query-2026-11-03.md)

核验时间：2026-11-03T14:52:00.770436+00:00。
