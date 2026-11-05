# 搜索商品链接，再核验详情页

实现与验证日期：2026-11-01（Asia/Shanghai）。本轮仅修改本地代码，未部署线上。

## 当前流程

1. 聊天解析商品名、完整型号、市场、平台限制和预算。
2. 默认使用现有 Shopee / Lazada / Amazon SG 适配器搜索候选；此阶段只取标题和商品链接。
3. 每个平台最多保留 3 个链接；总计最多抓取 9 个详情页，全局详情页并发最多 3 个。
4. Web Unlocker 读取商品页，用 JSON-LD `Product` + 单一 `Offer` 校验来源、型号、规格、币种、库存、商品状态及报价有效期。多规格区间报价不作为单一价格。
5. 根据详情页价格进行预算筛选和排序。详情页缺失的卖家、评分、运费和优惠，不从搜索卡片补入。
6. 返回商品页标题、原链接、页面提供的品牌/型号/说明、核验时间，以及已核验报价。聊天回答使用这些字段；桌面和手机报价行显示核验标记和时间。

`scope: web` 保留搜索引擎发现链接的入口，与平台路径共用详情页核验器。该路径最多执行一次 SERP 搜索和 8 次详情页请求。本轮查询账号的已开通 zone，只发现 Web Unlocker、Browser API、ISP proxy；尚无 SERP zone，也没有创建或开通新服务。因此本地默认仍为平台搜索。

## 失败与兼容性

- 搜索失败、详情页抓取失败、详情页无法核验、匹配/预算不符分别计数；失败不等于没有在售商品。
- `summary.discovered / pagesChecked / pagesVerified` 记录候选、已检查、匹配报价页数量。`requests` 是逻辑搜索任务加详情页请求数，平台适配器自身的重试或轮询不包含在这一计数中。
- 没有有效单品 JSON-LD、库存不明、缺货、需登录或无法抓取的页面，目前不会提供可比较报价。后续可用真实页面样本扩展明确的详情页解析规则。
- Web 工具拒绝缺少 `verification.source=product-page` 的报价，也拒绝早于当前请求超过 60 秒的核验时间；60 秒用于容忍服务时钟偏差。发布时需同步更新 crawler 和 web。
- 不读历史价格库，不写入商品或报价库，也不在详情页失败后回退搜索摘要价格。

## 本轮证据

| 检查 | 结果 |
| --- | --- |
| Crawler 测试 | 133 项通过 |
| Web 测试 | 157 项通过 |
| 类型检查 / Web 构建 | 通过；构建保留现有大 chunk 提示 |
| 浏览器，1365×900 / 390×844 | 使用注入搜索与详情页样本：详情页价覆盖搜索价、原链接、可见核验标记和时间、无横向溢出、无页面 JS 错误 |
| Lazada SG 搜索 Sony WH-CH720N | 网络请求失败，未得到可核验报价 |
| 搜索发现的 Best Denki WH-CH720N 商品页 | Web Unlocker 外层 HTTP 200，但来源状态为 401、空 body；正确拒绝报价 |
| 真实聊天请求：Sony WH-CH720N，只看 Amazon SG | 本地 Web → 已鉴权 crawler `/search` → 供应商搜索失败；返回 `status=failed`、空报价和明确失败说明 |

浏览器正向展示使用的是测试样本，不代表真实供应商抓取成功。当前尚未完成一次真实搜索到详情页报价的成功闭环。

本地独立预览：`http://127.0.0.1:8788/7hk9ho`；对应 crawler 工具端口为 `8791`，预览数据库为 `/tmp/picolah-hybrid-preview.db`，没有替换已有端口服务。

临时验收文件在仓库已忽略目录 `.tmp/hybrid-acceptance/`，包含真实聊天结果、浏览器报告及两种宽度截图；测试输出在 `/tmp/picolah-hybrid-*-tests.log`。

接口依据：[Bright Data Web Unlocker API](https://docs.brightdata.com/api-reference/rest-api/unlocker/unlock-website)、[SERP API](https://docs.brightdata.com/api-reference/rest-api/serp/serp-api)。
