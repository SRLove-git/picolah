# Pico 全网价格搜索

2026-11-05：Pico 对话的商品查询改为实时跨网站搜索。Discover 的商品库和价格保存策略不变。

配置：`CHAT_PRICE_SEARCH_SOURCE=web`、`CRAWLER_SEARCH_SCOPE=web`、`PRICE_SEARCH_PROVIDER=deepseek`。Crawler 使用 `WEB_SEARCH_API_KEY`，或在 LLM_BASE_URL 为 DeepSeek 官方域名时复用 `LLM_API_KEY`。现有 Web Unlocker 继续负责商品详情页读取。

价格请求（包括“全网搜索 … 价格”）不会进入仅供资料问答的摘要回答流程。DeepSeek 官方 Search API 只发现链接，随后最多核对 8 个商品页、每域名最多 2 页、并发 3 页。详情页请求限制为 25 秒，搜索请求限制为 20 秒。商品页必须提供同型号、正确市场币种、明确单品价和在售状态；失效、混合规格或不匹配的报价被排除。运费与优惠缺失时保留未知状态，不把零元作为已确认费用。

Courts 实际页面的 Offer.url 为 `{}`：仅当 Product.@id 明确绑定同一个商品页时允许该缺省字段。支持 NA221/09 这类制造商完整型号，拒绝 /08、/09R1 和混合型号；“Series 2000”不视为另一个型号。

网页内容只作为数据，不能指挥模型。搜索摘要价格不会成为报价；也不会将本次价格写回商品库。抓取或核验失败不等于无货。结果仅代表本次成功读取并核验的页面，不保证覆盖全部网站或全网最低。

本地验证：45 项 crawler 搜索/核验测试、45 项 web 对话/工具测试；隔离的待部署 runtime 再通过 21 项抓取核验测试与类型检查。独立容器、线上 API 和公网验证记录保存在 `.tmp/web-price-search-20261105/`。

官方接口文档：https://api-docs.deepseek.com/api/search/

## 线上部署

- 初次价格链路：`web-price-20261105T100528Z`；中文品牌修正：`web-price-brand-20261105T100918Z`。
- 候选容器及线上接口均返回 Courts 同型号商品页报价；商品库保持 89 件，报价记录和原采集时间未改变。
- 已单独验证中文“飞利浦”和英文 Philips 保留品牌；搜索模型中的插入连字符会在发送搜索引擎前规范化，避免被当作排除操作符。
- 回滚备份：`/opt/picolah-backups/web-price-20261105T100528Z`；`/opt/picolah-backups/web-price-brand-20261105T100918Z`。原 crawler 镜像已在此前被移除，发布前从仍运行的容器恢复了文件系统基线，未把运行时密钥写入镜像元数据。
- 公网中文请求“全网搜索飞利浦 NA221/09 价格”通过：34226 ms，核验 8 个候选页，返回 1 条同型号有效报价（Courts，SGD 158，运费未知）。其余 7 个来源未通过核验，未作为有效价格。聊天记录重新读取一致，测试会话已移除。证据：`.tmp/web-price-search-20261105/public-qa.json`。
