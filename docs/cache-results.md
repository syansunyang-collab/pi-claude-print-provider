# 实测缓存 / Measured cache usage

本页记录一段真实长会话中的 Claude provider 用量。数据时间为 **2026-10-31 至 2026-11-01（UTC+8）**；当时安装包元数据为 **0.6.0**，Pi SDK 为 **1.4.0**，Claude Code 为 **2.1.292**。

## 结果

| 指标 | 数值 |
| --- | ---: |
| 请求数 | 786 |
| 普通输入 token | 1,572 |
| 缓存读取 token | 382,332,940 |
| 缓存写入 token | 4,940,382 |
| 其中 1 小时写入 | 4,940,382 |
| 输出 token | 2,583,463 |
| 输入 token 加权命中率 | **98.723915731%** |
| 逐请求命中率中位数 | **99.280800578%** |
| 逐请求命中率算术平均 | 98.181004959% |

命中率按以下公式计算：

```text
单次命中率 = cacheRead / (input + cacheRead + cacheWrite)
整体加权命中率 = sum(cacheRead) / sum(input + cacheRead + cacheWrite)
```

`input` 是未缓存输入。`cacheWrite1h` 是 `cacheWrite` 的子集，不能重复相加；输出 token 不进入命中率分母。算术平均、中位数和输入 token 加权比例是不同统计量。

## 数据与复算

- [脱敏逐请求数据](data/cache-usage-20261102.csv)只包含样本内序号、阶段、token 计数和相对时间，不含对话内容、工具参数、路径、账号或响应 ID。
- [复算汇总](data/cache-summary-20261102.json)记录统计结果。
- 在仓库根目录运行以下命令，可用 Node 标准库重新生成汇总；脚本不调用 Claude，也不联网。

```bash
node scripts/summarize-cache-usage.js
```

## 如何理解

这个样本显示长会话中缓存复用率很高，但命中率不是费用折扣，也不能直接换算成订阅额度。缓存读取和写入都计量；provider 报告的美元费用为 0，表示它不知道订阅账单。

1 小时缓存写入价格为基础输入价格的 2 倍；5 分钟写入价格为 1.25 倍。因此 1 小时写入是 5 分钟写入价格的 **1.6 倍**。本样本的缓存写入全部记为 1 小时档。

## English

This page reports one real long session, from **2026-10-31 through 2026-11-01 (UTC+8)**. Installation metadata was **0.6.0**, with Pi SDK **1.4.0** and Claude Code **2.1.292**.

The session recorded **786 requests**: 1,572 uncached input tokens, 382,332,940 cache-read tokens, 4,940,382 cache-write tokens, and 2,583,463 output tokens. The input-token-weighted hit rate was **98.723915731%**; the per-request median was **99.280800578%**, and the arithmetic mean was 98.181004959%.

Use `cacheRead / (input + cacheRead + cacheWrite)`. `cacheWrite1h` is already included in `cacheWrite`; output is excluded from the hit-rate denominator. The anonymized [request data](data/cache-usage-20261102.csv) and [summary](data/cache-summary-20261102.json) can be reproduced with `node scripts/summarize-cache-usage.js` from the repository root. The script uses Node's standard library and makes no Claude requests or network calls.

A 1-hour cache write costs 2× base input, versus 1.25× for a 5-minute write, so the 1-hour write price is 1.6× the 5-minute price. All cache writes in this sample were reported in the 1-hour tier. Cache hit rate measures input-token reuse, not a subscription bill or a fee discount.
