# 按国家站点搜索 — 2026-11-06

首轮国家搜索版本：`country-search-20261106T132555Z`。

商品价格搜索已使用界面所选国家；问题中明确指定受支持国家时，以问题为准。当前支持新加坡、马来西亚、泰国、印度尼西亚、菲律宾和越南。全网表示该国家内跨网站查价，不再默认发送 `geography: global`。

- DeepSeek 和 Bright Data 请求携带国家名称及当地币种；Bright Data 同时设置国家参数。DeepSeek 读取最多 30 个候选，先排序再核验。
- 优先本国域名、国家子域名和国家专区。候选、衍生商品链接、补搜和服务端结果校验均排除明确的外国域名或国家路径。
- 通用域名可保留，但页面必须返回所选国家的本币报价；网页摘要价格不作为商品报价。URL 或本币只能作为站点市场归属信号，不证明商家所在地、仓储或配送能力。
- 没有结果时只在原国家补搜一次，不自动扩大到全球。商品型号、规格、有效页面价格和来源核验继续保留；库存未知、缺货、起价和区间价仍可展示。
- 报价缓存原有键包含国家与搜索范围；国家切换不会复用其他国家的结果。网页报价继续逐项显示，避免不同配置被直接合并排名。
- 历史全球搜索记录及内部工具显式 global 参数保持兼容；正常聊天入口按当前国家查价。

## 验证

- 独立 GitHub 工作树：抓取端 241 项、网站端 298 项测试通过，两端类型检查及网站构建通过。
- 生产候选：抓取端 229 项、服务端相关 76 项测试通过，两端类型检查通过；候选和生产 LLM 报价渲染检查通过。生产服务端类型检查依既有配置排除缺少前端源文件依赖的 chat-content.test.ts。
- 部署保留环境变量、数据挂载、前端构建产物及其他运行文件，并保留回滚镜像。首次候选因测试 Payload 类型缺少 geography 字段而中止，补齐后通过；失败候选没有切换线上服务。

首轮公网真实请求（修补参考站过滤前）：国家路由正确 9/9；取得页面价 7/9；流式完成 9/9；应用缓存命中 0/9；测试会话清理后剩余 0。

本轮固定为六国各一次 Sony WH-CH720N、两国小米14，以及一次国家覆盖场景。这是国家路由与真实来源抽查，不能与此前全球 30 款的 96.7% 直接比较，也不能代表各国全部商品的搜索成功率。

| # | 商品 | 界面国家 | 目标国家 | 实际国家 | 页面价示例 | 状态 |
|---:|---|---|---|---|---|---|
| 1 | Sony WH-CH720N | SG | SG | SG | [SGD 149](https://www.courts.com.sg/sony-wireless-noise-cancellation-headphones-black-wh-ch720n%2Fbce-IP182171.html) | PAGE_PRICE |
| 2 | Sony WH-CH720N | MY | MY | MY | [MYR 420](https://pioneerecommercesolution.online/product/sony-whch720n-wireless-noise-canceling-headphones-black/) | PAGE_PRICE |
| 3 | Sony WH-CH720N | TH | TH | TH | [THB 3490](https://shop.rtbtechnology.com/en/product/951982/product-951982?category_id=60868) | PAGE_PRICE |
| 4 | Sony WH-CH720N | ID | ID | ID | [IDR 1.7999e+06](https://www.monotaro.id/s044216870.html) | PAGE_PRICE |
| 5 | Sony WH-CH720N | PH | PH | PH | [PHP 4999](https://ansons.ph/product/sony-wh-ch720n-black-wireless-noise-canceling-headphones/) | PAGE_PRICE |
| 6 | Sony WH-CH720N | VN | VN | VN | [VND 2.936e+06](https://apshop.vn/products/tai-nghe-chong-on-sony-wh-ch720n) | PAGE_PRICE |
| 7 | 小米14 | SG | SG | SG | [SGD 669](https://www.1p.sg/products/xiaomi-14) | PAGE_PRICE |
| 8 | 小米14 | MY | MY | MY | — | 参考价未通过复核 |
| 9 | 马来西亚小米14价格 | SG | MY | MY | — | 参考价未通过复核 |

## 附加来源核查与修补

Phoneaqua 和 MobileKiShop 的独立 Fetch 只返回地区参考价格和规格，无商家购买信息，已加入非零售来源过滤。首轮新加坡小米14以 1p.sg 的 SGD 669 作为有效页面价；马来西亚两次请求均只有参考站报价，复核不通过，原始记录保留。马来西亚耳机来源的独立复抓超时，样本仅依据首轮 API 已核验页面记录计入，未独立验证商家履约。第 8、9 项在同一国家对相同商品并发查询，共享一次进行中的搜索，不是两次独立抓取。

## 证据

部署记录、未改动哈希、测试日志、固定请求清单、完整 SSE、原始结果和会话清理结果保存在 `.tmp/country-site-search/`。报告中的链接去除了购物车等动作参数；原始 URL 保存在本地测试证据中。此次修改针对国家范围，未将上一轮发现的其他报价解析问题宣称为全部修复。

## 参考站过滤后的追加复测

当前生产版本：`country-source-filter-20261106T133633Z`。两端候选测试、类型检查与生产检查通过，保持国家规则；应用服务重建后清空旧缓存。

仅追加新加坡小米14和问题明确指定马来西亚的小米14两次请求，不替换首轮 9 次原始记录。

| 查询 | 目标国家 | 实际国家 | 状态 | 页面价 |
|---|---|---|---|---|
| 小米14 | SG | SG | PAGE_PRICE | [SGD 669](https://www.1p.sg/products/xiaomi-14) |
| 马来西亚小米14价格 | MY | MY | PRODUCT_PAGE_UNVERIFIED | — |

追加复测流式完成 2/2，应用缓存命中 0/2，测试会话清理后剩余 0。参考站报价未再次返回。
