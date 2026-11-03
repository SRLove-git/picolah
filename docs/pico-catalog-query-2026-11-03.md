# Pico 商品库查询实测 — 2026-11-03

> 以下为修复前的测试记录。问题现已修复并部署，完整名称与日常问法均为 58/58；详见[修复及验收报告](/Users/yangyongze/Documents/ChatGPT/picolah/docs/pico-catalog-query-fix-2026-11-03.md)。

线上新加坡市场共 58 款商品。完整商品名全部可命中；本次日常问法 53 款准确命中、4 款漏查、1 款返回目标及相近型号，尚不能视为全部正常。

## 测试方式与结果

- 目标：`https://picolah.com`；从 `/api/catalog?market=SG` 实时读取，返回 `total=58`，列表共 58 项，无遗漏分页。
- 逐款调用网站 Pico 实际使用的 `POST /api/chat`，检查 HTTP 状态、SSE `results`、`done`、回复文本及商品 ID。每次使用独立访客身份和新对话，避免上一轮对话影响。
- 每款测试两种输入：商品库完整名称；“帮我查一下{品牌/型号或常见名称}，新加坡有报价吗？”。后者明确保留容量和产品型号，飞利浦使用英文品牌 Philips。
- 基础测试 116 次；6 次异常复核（其中 1 次为连接超时）、3 次英文抽测、3 次不存在型号/规格保护测试、1 次错误规格复核，共 129 次请求尝试。
- 首次 Marshall Emberton III 日常问法出现客户端连接超时；单独重试后命中，未计为商品漏查。其余 5 个日常查询缺陷均复现。
- 128 次请求完整返回；创建的 128 个测试对话均已删除，并通过各自访客的对话列表确认清理完成。
- 测试范围为新加坡、首轮文本查询；不代表其他市场、所有同义词、图片识别或多轮追问均通过。

| 检查 | 结果 |
| --- | --- |
| 完整名称准确命中 | 58 / 58 |
| 日常问法准确命中（网络失败重试后） | 53 / 58 |
| 日常问法未命中 | 4 / 58 |
| 日常问法目标混入相近型号 | 1 / 58 |
| 英文问法抽测 | 2 / 3；iPhone 16 Pro 256GB 漏查 |
| 不存在型号/规格保护 | 2 / 3；Philips NA221/08 错配为 NA221/09 |
| 本次返回有效报价的商品 | 0 / 58 |

## 可复现的问题

| 商品/问题 | 复现输入 | 实际结果 |
| --- | --- | --- |
| iPhone 16 Pro 256GB | 帮我查一下iPhone 16 Pro 256GB，新加坡有报价吗？ | 暂未找到与「PRO-256GB Pro 256GB」匹配的商品。可以补充品牌、完整型号或容量再试。 |
| New Balance 530 复古跑鞋 | 帮我查一下New Balance 530，新加坡有报价吗？ | 暂未找到与「BALANCE-530」匹配的商品。可以补充品牌、完整型号或容量再试。 |
| Samsung Galaxy S24 Ultra 256GB | 帮我查一下三星 Galaxy S24 Ultra 256GB，新加坡有报价吗？ | 暂未找到与「Samsung ULTRA-256GB Ultra 256GB」匹配的商品。可以补充品牌、完整型号或容量再试。 |
| Xiaomi 14T Pro 512GB | 帮我查一下小米 14T Pro 512GB，新加坡有报价吗？ | 暂未找到与「Xiaomi PRO-512GB Pro 512GB」匹配的商品。可以补充品牌、完整型号或容量再试。 |
| 小米 G20 Max 无线吸尘器 | 帮我查一下小米 G20 Max 吸尘器，新加坡有报价吗？ | 同时返回小米 G20 Max 和普通 G20 |
| 错配不同型号后缀 | Philips NA221/08 | 返回飞利浦 NA221/09 空气炸锅；复测仍然错配 |

英文复现：`Where is iPhone 16 Pro 256GB cheapest in Singapore?` 同样返回 `PRO-256GB Pro 256GB` 未找到；Sony WH-1000XM5、Philips NA221/09 英文问法通过。

不存在的 Sony WF-1000XM6、iPhone 15 512GB 均未返回其他型号或容量，保护通过。

## 原因定位

以下由本地当前源码和线上返回共同定位，未修改或部署查询逻辑：

- [model-search.ts](/Users/yangyongze/Documents/ChatGPT/picolah/web/shared/model-search.ts:9) 的通用型号正则把 `Pro 256GB`、`Ultra 256GB`、`Balance 530`、`Pro 512GB` 提取成型号。纯函数复现与线上答复中的错误查询一致。
- [live-query.ts](/Users/yangyongze/Documents/ChatGPT/picolah/web/server/agent/live-query.ts:31) 一旦提取到这些片段，就用片段重新组装查询，丢失真实产品主体。
- [catalog-search.ts](/Users/yangyongze/Documents/ChatGPT/picolah/web/server/agent/catalog-search.ts:36) 只有整条消息等于商品标题时才走标题优先，因此复制全名通过、加日常问句仍失败。
- [query.ts](/Users/yangyongze/Documents/ChatGPT/picolah/web/shared/query.ts:150) 的型号/规格约束未完整区分 G20 与 G20 Max，别名包含匹配使两者同时入选；通用型号提取不保留 `/08`、`/09` 后缀，导致 NA221 规格错配。

## 报价状态

58 款完整名称查询均识别到商品，但 `offers=[]`，本次无任何可展示的有效报价。此项是报价可用性问题，不能算商品未入库，也不能据此断言商家无货。

本次未核验商家商品页，也未用历史报价替代现价；未通过线上数据库审计确认各条报价失效原因。线上查询已明确证实的事实仅为：当前新加坡查询没有返回有效报价。

## 58 款逐项记录

完整名称一列均为准确商品 ID 命中；日常问法列为最终复核结果。

| # | 商品 | 完整名称 | 日常问法 | 有效报价数 |
| --- | --- | --- | --- | --- |
| 1 | Adidas Samba OG 复古德训鞋 | 通过 | 准确命中 | 0 |
| 2 | AirPods Pro 2 (USB-C) | 通过 | 准确命中 | 0 |
| 3 | Apple Watch SE (第 2 代) 44mm | 通过 | 准确命中 | 0 |
| 4 | ASICS GEL-KAYANO 14 跑鞋 | 通过 | 准确命中 | 0 |
| 5 | Bose QuietComfort Ultra 头戴式耳机 | 通过 | 准确命中 | 0 |
| 6 | De’Longhi Dedica 意式半自动咖啡机 | 通过 | 准确命中 | 0 |
| 7 | Dyson V12 Detect Slim 无线吸尘器 | 通过 | 准确命中 | 0 |
| 8 | Garmin Forerunner 265 运动手表 | 通过 | 准确命中 | 0 |
| 9 | HUAWEI WATCH GT 5 46mm | 通过 | 准确命中 | 0 |
| 10 | iPhone 15 128GB | 通过 | 准确命中 | 0 |
| 11 | iPhone 16 Pro 256GB | 通过 | 未命中 | 0 |
| 12 | JBL Charge 5 便携蓝牙音箱 | 通过 | 准确命中 | 0 |
| 13 | Marshall Emberton III 便携音箱 | 通过 | 准确命中 | 0 |
| 14 | Nespresso Vertuo Pop 咖啡机 | 通过 | 准确命中 | 0 |
| 15 | New Balance 530 复古跑鞋 | 通过 | 未命中 | 0 |
| 16 | Nike Air Force 1 ’07 板鞋 | 通过 | 准确命中 | 0 |
| 17 | Samsung Galaxy Buds3 Pro | 通过 | 准确命中 | 0 |
| 18 | Samsung Galaxy S24 Ultra 256GB | 通过 | 未命中 | 0 |
| 19 | SK-II 护肤精华露 230ml | 通过 | 准确命中 | 0 |
| 20 | Sony WH-1000XM5 无线降噪耳机 | 通过 | 准确命中 | 0 |
| 21 | Sony WH-CH720N 无线降噪耳机 | 通过 | 准确命中 | 0 |
| 22 | Soundcore Liberty 4 NC 降噪豆 | 通过 | 准确命中 | 0 |
| 23 | The Ordinary 烟酰胺 10% + 锌 30ml | 通过 | 准确命中 | 0 |
| 24 | Xiaomi 14T Pro 512GB | 通过 | 未命中 | 0 |
| 25 | 小米 G20 Max 无线吸尘器 | 通过 | 混入普通 G20 | 0 |
| 26 | 小米 G20 无线吸尘器 | 通过 | 准确命中 | 0 |
| 27 | 小米 Smart Air Purifier 4 Lite 空气净化器 | 通过 | 准确命中 | 0 |
| 28 | 小米空气炸锅 6L | 通过 | 准确命中 | 0 |
| 29 | 理肤泉 Mela B3 淡斑精华 30ml | 通过 | 准确命中 | 0 |
| 30 | 雅诗兰黛小棕瓶精华 50ml | 通过 | 准确命中 | 0 |
| 31 | 飞利浦 AC3420/10 空气净化加湿一体机 | 通过 | 准确命中 | 0 |
| 32 | 飞利浦 AIS6010/10 一体式熨烫机 | 通过 | 准确命中 | 0 |
| 33 | 飞利浦 BAR300/60 意式咖啡机 | 通过 | 准确命中 | 0 |
| 34 | 飞利浦 CX7550/01 智能塔扇 | 通过 | 准确命中 | 0 |
| 35 | 飞利浦 DST1020/30 蒸汽熨斗 | 通过 | 准确命中 | 0 |
| 36 | 飞利浦 DST3040/76 蒸汽熨斗 | 通过 | 准确命中 | 0 |
| 37 | 飞利浦 DST8020/26 Azur 蒸汽熨斗 | 通过 | 准确命中 | 0 |
| 38 | 飞利浦 FC9352/61 PowerPro Compact 无尘袋吸尘器 | 通过 | 准确命中 | 0 |
| 39 | 飞利浦 HD2582/01 烤面包机 | 通过 | 准确命中 | 0 |
| 40 | 飞利浦 HD3170/62 迷你电饭煲 | 通过 | 准确命中 | 0 |
| 41 | 飞利浦 HD3300/20 蒸煮一体电火锅 | 通过 | 准确命中 | 0 |
| 42 | 飞利浦 HD9137/91 煮蛋器 | 通过 | 准确命中 | 0 |
| 43 | 飞利浦 HD9316/03 电热水壶 | 通过 | 准确命中 | 0 |
| 44 | 飞利浦 HD9395/90 双层电热水壶 1.7L | 通过 | 准确命中 | 0 |
| 45 | 飞利浦 HR2221/01 搅拌机 | 通过 | 准确命中 | 0 |
| 46 | 飞利浦 HR2222/01 搅拌机 | 通过 | 准确命中 | 0 |
| 47 | 飞利浦 HR2684/00 手持搅拌机 | 通过 | 准确命中 | 0 |
| 48 | 飞利浦 HR3705/11 手持打蛋器 | 通过 | 准确命中 | 0 |
| 49 | 飞利浦 NA120/09 空气炸锅 4.2L | 通过 | 准确命中 | 0 |
| 50 | 飞利浦 NA221/09 空气炸锅 | 通过 | 准确命中 | 0 |
| 51 | 飞利浦 NA342/09 空气炸锅 | 通过 | 准确命中 | 0 |
| 52 | 飞利浦 NA462/79 双层空气炸锅 | 通过 | 准确命中 | 0 |
| 53 | 飞利浦 NA543/00 蒸汽空气炸锅 | 通过 | 准确命中 | 0 |
| 54 | 飞利浦 STE3170/80 立式挂烫机 | 通过 | 准确命中 | 0 |
| 55 | 飞利浦 STH1000/16 手持挂烫机 | 通过 | 准确命中 | 0 |
| 56 | 飞利浦 XB2023/61 无尘袋吸尘器 | 通过 | 准确命中 | 0 |
| 57 | 飞利浦 XV5113/01 OneUp 电动拖把 | 通过 | 准确命中 | 0 |
| 58 | 飞利浦 XXL 空气炸锅 7.2L | 通过 | 准确命中 | 0 |

## 测试材料

- [汇总 JSON](/Users/yangyongze/Documents/ChatGPT/picolah/.tmp/pico-catalog-query-20261103/summary.json)
- [全部 129 次请求结果、查询语句和回复](/Users/yangyongze/Documents/ChatGPT/picolah/.tmp/pico-catalog-query-20261103/all-results.json)
- [本次商品清单快照](/Users/yangyongze/Documents/ChatGPT/picolah/.tmp/pico-catalog-query-20261103/catalog.json)
- [逐款测试脚本](/Users/yangyongze/Documents/ChatGPT/picolah/.tmp/pico-catalog-query-20261103/verify.py)
- [异常复核与边界测试脚本](/Users/yangyongze/Documents/ChatGPT/picolah/.tmp/pico-catalog-query-20261103/supplement.py)

各请求原始 SSE 另存于同一测试目录。浏览器中已有的 iPhone 查询对话亦显示英文问法失败、完整名称命中，与本次接口测试一致。

测试起始：2026-11-03T14:27:57.540264+00:00；整理完成：2026-11-03T14:33:41.674652+00:00。
