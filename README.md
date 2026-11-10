# pi-claude-print-provider

**在 Pi 里使用自己的 Claude 订阅：调用官方 Claude Code CLI，由 Pi 管理上下文并执行工具。**

[中文](#中文) · [English](#english) · [实测缓存 / Cache results](docs/cache-results.md) · [维护说明 / Maintenance](docs/validation-20261102.md)

<a id="中文"></a>

## 中文

这是独立维护的社区 provider，延续自 [chem/pi-claude-code-provider](https://github.com/chem/pi-claude-code-provider)。插件调用官方、未经修改的 Claude Code；登录由你在 CLI 中完成，插件不读取或转发凭据。每轮请求由新的 `claude -p` 进程处理，Pi 管理会话、分支和压缩。Claude 提出的工具调用经桥交回 Pi，由 Pi 的工具和 hook 执行。

### 安装与使用

最低声明支持 Pi 0.86.1、Claude Code 2.1.281；npm 版 Pi 需要 Node.js 22.19 或更新。历史完整验证基线见 [DEVELOPING.md](DEVELOPING.md#compatibility-baseline)。

先登录并确认官方 CLI：

```bash
claude auth login
claude auth status
```

如果安装过旧 npm 包，先移除，避免重复注册：

```bash
pi remove npm:pi-claude-code-provider
```

然后安装固定版本：

```bash
pi install git:github.com/syansunyang-collab/pi-claude-print-provider@v1.0.1
```

重载 Pi 资源后，在 `/model` 选择 `pi-claude-code-provider` 下的型号；也可直接启动：

```bash
pi --model pi-claude-code-provider/claude-sonnet-5-5
```

可选型号：`claude-sonnet-5-5`、`claude-fable-5-2`、`claude-fable-5-1`、`claude-opus-5-5`、`claude-haiku-4-5`。Fable 5.2 支持 1M 上下文和 128K 最大输出；5.1 保留供已有会话使用。使用资格和额外用量取决于登录 CLI 的账号。Windows 需要原生、可直接运行的 `claude.exe`，不能使用 npm 的 `.cmd` 包装脚本；必要时用 `PI_CLAUDE_CODE_PROVIDER_PATH` 指定路径。

安装后或 CLI 更新后，可运行 `/pi-claude-code-provider-doctor` 检查版本、型号和工具桥，不发起模型推理。`/pi-claude-code-provider-doctor report` 会生成脱敏诊断信息，分享前请先检查。

### 功能与图片

- 每次请求都把 Pi 当前上下文交给新的 Claude Code 进程；会话状态和工具执行由 Pi 管理。
- 工具桥只接收工具提议，不执行工具；Pi 负责实际读取、命令和修改。
- codemode 工具说明提供批量操作场景和脚本范例，方便合并读取或命令。
- 修复 Windows 子进程清理、正式错误被回显覆盖，以及重载后沿用旧 stream 的问题。
- 图片直接通过 stdin 发送，不再生成临时图片文件或维护图片缓存目录。provider 不设默认张数上限；单图上限 20 MiB、图片合计 100 MiB、文本转录 32 MiB。Pi 自身的会话仍可能保存图片。
- 默认配置下，`cacheRetention: "none"` 的一次性摘要请求会关闭提示缓存。
- Claude 子进程关闭非必要流量和内置遥测。可选指标日志只写本地文件。

详见[维护改动说明](docs/validation-20261102.md)和[架构设计](DESIGN.md)。

### 实测缓存

真实长会话中记录了 **786 次请求**，整体缓存命中率达到 **98.7%**，中位数为 **99.3%**。采样时间和运行环境见下方的数据说明。

命中率按 `cacheRead / (input + cacheRead + cacheWrite)` 计算。该样本的逐请求数据和复算汇总见[缓存结果](docs/cache-results.md)。缓存命中率是输入 token 口径，不等于费用折扣；缓存写入和读取也会计量。1 小时缓存写入价格是基础输入的 2 倍，5 分钟写入为 1.25 倍，即前者是后者的 1.6 倍。

### 费用显示

搭配 Claude API 估价扩展，Pi 会按当前模型的 Anthropic API 单价显示等价费用，计入普通输入、缓存读取、缓存写入和输出，1 小时缓存写入也按对应费率计算。订阅实际用量可在 Claude 官方用量页查看。

### 配置与边界

| 环境变量 | 作用 |
| --- | --- |
| `PI_CLAUDE_CODE_PROVIDER_PATH` | 指定 Claude 可执行文件 |
| `PI_CLAUDE_CODE_PROVIDER_WEB_SEARCH` | `on`（默认）或 `off`；独立网页搜索会使用 Claude 额度 |
| `PI_CLAUDE_CODE_PROVIDER_TRANSCRIPT_BREAKPOINT` | `on`（默认）或 `off`；关闭可绕过缓存断点兼容问题，但会失去历史缓存复用 |
| `PI_CLAUDE_CODE_PROVIDER_THINKING_DISPLAY` | `summarized`（默认）、`omitted` 或 `off` |
| `PI_CLAUDE_CODE_PROVIDER_METRICS_LOG` | 可选的本地 JSONL 请求指标文件 |

历史重放仅过滤助手独立文本块中的 `<thinking_mode>auto</thinking_mode>`（允许首尾空白），避免把模式标签继续当成旧回答发送。原始会话、实时显示、工具和思考块保留，混合正文及其他标签不删；有意要求裸输出同一标签也会命中，可用引号或代码块保留。首次处理已有标签的历史会改变受影响的缓存前缀，后续追加保持稳定，不手动清空缓存。

插件不支持用 API key、`CLAUDE_CODE_OAUTH_TOKEN`、Bedrock、Vertex 或 Foundry 替代官方 CLI 的订阅登录。它不是 Anthropic 官方产品，也不经手他人凭据或转售额度。

### 开发与致谢

- [DEVELOPING.md](DEVELOPING.md)：开发设置、兼容基线与验证流程。
- [CONTRIBUTING.md](CONTRIBUTING.md) · [SECURITY.md](SECURITY.md) · [CHANGELOG.md](CHANGELOG.md)

感谢原作者 **chem**。整体架构、进程管理、只提议的工具桥及大部分测试延续自上游，MIT 版权声明保留于 [LICENSE](LICENSE)。本仓库独立维护；Claude 和 Claude Code 是 Anthropic, PBC 的商标，本项目无官方背书。

---

<a id="english"></a>

## English

**Use your own Claude subscription in Pi through the official Claude Code CLI. Pi manages context and runs tools.**

This independently maintained provider continues [chem/pi-claude-code-provider](https://github.com/chem/pi-claude-code-provider). You sign in through the unmodified official CLI; the provider does not read or forward credentials. Each request starts a fresh `claude -p` process. Pi owns sessions, branches, compaction, and tool execution; the bridge returns Claude's tool proposals to Pi.

### Install and use

The declared minimums are Pi 0.86.1 and Claude Code 2.1.281; npm-installed Pi requires Node.js 22.19 or newer. The historical full verification baseline is in [DEVELOPING.md](DEVELOPING.md#compatibility-baseline).

```bash
claude auth login
claude auth status
```

If the old npm package is installed, remove it first to avoid registering both providers:

```bash
pi remove npm:pi-claude-code-provider
```

Then install the pinned release:

```bash
pi install git:github.com/syansunyang-collab/pi-claude-print-provider@v1.0.1
```

Reload Pi resources, then select a model under `pi-claude-code-provider`, or start Pi directly:

```bash
pi --model pi-claude-code-provider/claude-sonnet-5-5
```

Available IDs are `claude-sonnet-5-5`, `claude-fable-5-2`, `claude-fable-5-1`, `claude-opus-5-5`, and `claude-haiku-4-5`. Fable 5.2 supports a 1M context window and 128K maximum output; 5.1 remains available for existing sessions. Entitlements and extra usage depend on the account signed into Claude Code. Windows requires a native executable `claude.exe`, not an npm `.cmd` shim; set `PI_CLAUDE_CODE_PROVIDER_PATH` if needed.

Run `/pi-claude-code-provider-doctor` after installation or a CLI update to check versions, models, and the tool bridge without inference. Its `report` output is sanitized; inspect it before sharing.

### Features and images

- Each request sends Pi's current context to a new Claude Code process. Pi owns session state and tool execution.
- The bridge only accepts tool proposals; Pi performs the actual reads, commands, and edits.
- Codemode guidance includes batching scenarios and script examples for combining reads or commands.
- Fixes cover Windows child-process cleanup, terminal-error precedence, and refreshing streams after reload.
- Images are sent directly over stdin without temporary image files or an image-cache directory. The provider has no default image-count cap; limits are 20 MiB per image, 100 MiB for all images, and 32 MiB for the text transcript. Pi itself may retain images in its sessions.
- With the default configuration, one-shot summaries marked `cacheRetention: "none"` disable prompt caching.
- CLI nonessential traffic and built-in telemetry are disabled. Optional metrics are written locally.

See [maintenance notes](docs/validation-20261102.md) and [DESIGN.md](DESIGN.md).

### Measured cache usage

A real long session recorded **786 requests**, with a **98.7%** input-token-weighted cache hit rate and a **99.3%** median per-request hit rate. The collection dates and runtime environment are listed in the data report.

The formula is `cacheRead / (input + cacheRead + cacheWrite)`. Per-request data and the reproducible summary are in the [cache report](docs/cache-results.md). This measures input-token reuse, not a discount on the bill. A 1-hour cache write costs 2× base input, versus 1.25× for a 5-minute write: 1.6× the 5-minute write price.

### Cost display

With the Claude API estimation extension, Pi displays API-equivalent costs using the current Anthropic model prices. Estimates include uncached input, cache reads, cache writes, and output, with the corresponding rate for 1-hour writes. Your actual subscription usage is available on Claude's official usage page.

### Configuration and limits

| Variable | Purpose |
| --- | --- |
| `PI_CLAUDE_CODE_PROVIDER_PATH` | Select the Claude executable |
| `PI_CLAUDE_CODE_PROVIDER_WEB_SEARCH` | `on` (default) or `off`; web search uses Claude capacity separately |
| `PI_CLAUDE_CODE_PROVIDER_TRANSCRIPT_BREAKPOINT` | `on` (default) or `off`; disabling avoids breakpoint compatibility issues but loses history reuse |
| `PI_CLAUDE_CODE_PROVIDER_THINKING_DISPLAY` | `summarized` (default), `omitted`, or `off` |
| `PI_CLAUDE_CODE_PROVIDER_METRICS_LOG` | Optional local JSONL request metrics |

History replay omits only assistant text blocks equal to `<thinking_mode>auto</thinking_mode>` after trimming outer whitespace. Stored history, live display, tools, thinking, mixed text, and other tags remain unchanged. An intentionally requested bare marker is also omitted; quote or fence it to retain it. Filtering existing history changes the affected cached prefix on first use; later appends stay stable without manually clearing caches.

API keys, `CLAUDE_CODE_OAUTH_TOKEN`, Bedrock, Vertex, and Foundry are not supported as replacements for official CLI subscription sign-in. This is not an Anthropic product and does not handle other people's credentials or resell usage.

See [DEVELOPING.md](DEVELOPING.md), [CONTRIBUTING.md](CONTRIBUTING.md), [SECURITY.md](SECURITY.md), and [CHANGELOG.md](CHANGELOG.md). Thanks to **chem** for the upstream design, process management, proposal-only bridge, and most of the tests; the original MIT copyright notice remains in [LICENSE](LICENSE). This repository is independently maintained. Claude and Claude Code are trademarks of Anthropic, PBC; this project is not endorsed by Anthropic.
