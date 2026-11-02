# pi-claude-print-provider

**在 Pi 里调度你自己的 Claude 订阅：走官方 Claude Code，不碰 token，工具全由 Pi 执行。**

[中文](#中文) · [English](#english)

<a id="中文"></a>

## 为什么有这个项目

我在 [Pi](https://github.com/earendil-works/pi) 里同时调度 Claude、GPT 和其他几家 AI 的订阅，需要一个能接入 Claude 订阅的 provider。

Anthropic 对第三方工具使用订阅账号管得很严。社区里有些做法会从本机读取 Claude 的 OAuth token，或者把请求伪装成官方 Claude Code 发出去。这些做法违反 Anthropic 的条款，也已经有人因此被封号。

所以我选了合规的路：让本机官方的 `claude` 程序自己登录、自己发请求，插件不碰任何凭据。这个插件延续自 chem 的 [pi-claude-code-provider](https://github.com/chem/pi-claude-code-provider)，它从一开始就是这么设计的。

## 它为什么合规

Anthropic 的 [Legal and compliance](https://code.claude.com/docs/en/legal-and-compliance) 页面写明，不允许第三方开发者收集、存储或转手 Claude.ai 的凭据和会话 token，但这些限制：

> "Nor does it prevent an end user from signing in to the unmodified Claude Code binary with their own Claude subscription"
>
> （也不妨碍终端用户用自己的 Claude 订阅登录未经修改的 Claude Code 程序。）

本插件就落在这条线以内：

- **不经手凭据。** 插件不读取、复制或转发 OAuth token 或 API key。登录由官方 Claude Code 完成（`claude auth login`），插件启动前只运行 `claude auth status` 检查登录状态。
- **不改官方程序。** 插件调用的是你本机已安装、未经修改的 `claude`，用的是它公开文档里的非交互模式（`claude -p`）。
- **不冒充客户端。** 插件不自己构造发往 Anthropic 的请求，也不伪造请求头或客户端身份。所有网络请求都由官方 `claude` 自己发出。
- **主动拦截凭据变量。** Claude 子进程只拿到白名单里的环境变量。如果有人试图传入 `ANTHROPIC_API_KEY`、`ANTHROPIC_AUTH_TOKEN`、`ANTHROPIC_BASE_URL`、`CLAUDE_CODE_OAUTH_TOKEN` 或 Bedrock/Vertex 开关，插件直接拒绝启动。

是否符合你所用套餐的条款，最终由你自己负责，详见文末的合规说明。

## 它怎么工作

1. Pi 每发一次请求，插件就启动一个新的 `claude -p` 进程，把 Pi 当前的完整对话通过 stdin 发过去。
2. Claude 想调用工具时，会发给插件提供的一个 MCP 桥。这个桥只把调用作为"提议"交还给插件，对每个 `tools/call` 一律拒绝执行。
3. Pi 在自己的界面里执行这个工具，正常经过 Pi 的 hook 和权限检查，再把结果带进下一轮请求。

会话、分支和压缩都由 Pi 管理，Claude Code 这边不保存会话。插件没有运行时依赖。

## 缓存与计费

### 为什么要关心缓存

插件每轮都要把完整对话重发一遍，命中提示缓存（prompt cache）与否，花费差别很大。按 Anthropic 公开的 [API 价格](https://platform.claude.com/docs/en/build-with-claude/prompt-caching)：
- 缓存读取通常是基础输入价的 0.1 倍（Sonnet 5.5 和 Opus 5.5 是 0.05 倍）；
- 5 分钟缓存写入是 1.25 倍，1 小时缓存写入是 2 倍。

用订阅时，用量计入套餐额度。Anthropic 没有公开额度和 token 的换算方式，但没命中缓存时，同样的对话会消耗更多额度。开启了额外用量时，超出套餐的部分会另外计费。插件给 Pi 上报的金额恒为 0，因为它无法知道订阅怎么计费。

### 缓存在什么情况下会丢

- **间隔太久。** API 默认缓存 5 分钟。插件给历史打的缓存断点是 1 小时，所以一小时内断断续续地用仍能命中，超过一小时就会整段重新写入。
- **Claude Code 在末尾追加的内容在变。** Claude Code 默认会在末尾附一段不断变化的 `<total_tokens>` 提示，会让缓存全部失效。插件通过设置 `totalTokensReminder: "off"` 关掉它。
- **升级 Claude Code。** Claude Code 会在最前面放一段带版本号、不进缓存的计费头，所以每次升级后的第一轮都会冷启动。
- **一步里并行工具调用太多。** 每个缓存断点最多往回找约 20 个块，一步里有大约 19 个以上并行工具调用时，缓存复用会悄悄失效。
- **前缀内容在变。** 例如 Haiku 4.5 收到的环境信息排在对话之前，只要它变了就命中不了；Haiku 4.5 不足 4096 token 时也不缓存。

### chem 的设计

缓存相关的核心设计来自 chem：
- 历史只追加、不改写，工具列表顺序固定；
- 关掉 `<total_tokens>` 提示；
- 插件自己在最后一条历史上打 1 小时缓存断点。因为 API 要求长 TTL 在前，而 Claude Code 自己的断点就是 1 小时的，所以只能用 1 小时，代价是写入价比 5 分钟的高；
- 不花额度检查请求结构的 `npm run capture:claude-breakpoints`；
- 四个付费缓存测试：第 2、3 轮命中率必须 ≥ 80%，写入量必须少于第 1 轮的四分之一。

### 我们的改动

- **图片改为内联。** 上游把图片写成文件再用 `@"路径"` 引用，Claude Code 会把读取附件的说明放在对话前面，每加一张图都会改写缓存前缀；在当前验证的 Claude Code 版本上，超过 256 KiB 的 `@` 文件还会被悄悄丢掉。现在图片以 base64 块经 stdin 发送，紧跟引用它的那条记录，新图片只会让历史变长。
- **摘要请求不写缓存。** chem 已经让一次性摘要（例如压缩）不打插件自己的断点，但当前验证的 Claude Code 版本仍会在末尾放它自己的 1 小时断点，把只写不读的摘要按 2 倍价格写进缓存。现在这类请求会给 Claude 子进程设置 `DISABLE_PROMPT_CACHING=1`。

### 数据

**日常使用记录（不是对照实验）。** 数据来自维护者在 Windows 上 2026-09-13 到 2026-10-09 的 Pi 会话日志，共 630 次通过本插件的 Opus 请求。命中率按 `cacheRead / (input + cacheRead + cacheWrite)` 逐轮计算。

| 分组 | 轮数 | 整体命中率 | 中位数 |
| --- | ---: | ---: | ---: |
| 全部 | 630 | 96.8% | 99.0% |
| 上游阶段（模型 id `opus`） | 332 | 94.5% | 99.0% |
| 本项目阶段（模型 id `claude-opus-5-5`） | 298 | 98.2% | 98.9% |
| 距上一轮不到 5 分钟 | 598 | 97.6% | 99.0% |
| 距上一轮 5 到 60 分钟 | 10 | 94.6% | 99.1% |
| 距上一轮超过 60 分钟 | 3 | 0.0% | 0.0% |

- **间隔在 5 到 25 分钟的 10 次。** 9 次命中率在 98% 以上，说明缓存确实活过了默认的 5 分钟。另 1 次隔 5.1 分钟却是 0%，原因不明。
- **间隔超过 2 小时的 3 次。** 全部是 0%，和 1 小时有效期一致。
- **量级估算。** 如果按 Opus 5.5 的 API 价格粗算，这 630 轮有缓存时的花费约为完全不命中时的 14%。这不是订阅账单，只用来看量级。
- **上游阶段的图片。** 本轮新带图片的 6 次，命中率中位数只有 23.4%。还有连续 9 轮的缓存读取都停在 37,324 token，后面的历史每轮都在重写。这和"附件说明放在对话前面会改写前缀"的机制吻合，但日志里看不到实际请求，因果没有核实。本项目阶段没有带图片的轮次，所以内联图片的效果还没有真实数据。
- **样本很少。** 5 到 60 分钟只有 10 个样本，超过 60 分钟只有 3 个，30 到 60 分钟之间完全没有数据。
- **两个阶段不能直接比。** 两个阶段的日期、任务和 Claude Code 版本都不同，命中率差异不能全部算在本项目的改动上。

**付费验证（受控测试）。** 2026-10-09 在 Windows 11 上用 Max 订阅跑缓存测试，第 2、3 轮命中率如下：
- Sonnet：96.1% 和 95.9%
- Haiku：98.3% 和 98.3%

图片缓存测试也在门槛内通过，但没有记录具体数字。

间隔 30 到 60 分钟的受控测试，以及由本插件执行的压缩请求的缓存测试，还没有做。

## 测试情况

| 环境 | 测试 | 结果 |
| --- | --- | --- |
| Linux，Node 22.23.1 和 24.16.0（2026-10-11 本地运行，非 GitHub Actions） | `npm run release:check` | 382 条：376 通过、0 失败、6 条仅限 Windows 的测试跳过 |
| Windows 11 x64，Node 24.12.0 | `npm test` | 382 条：349 通过、0 失败、33 条仅限 POSIX 的测试跳过 |
| Windows 11 x64，Max 订阅（2026-10-09，提交 `696d473`） | 全部 15 个付费阶段 | 全部通过，共启动 Claude 57 次 |

Linux 和 macOS 还没有跑过付费阶段。

## 安装与使用

### 要求

- [Pi](https://pi.dev) 0.86.1 或更新。
- Claude Code 2.1.281 或更新。
- 以上是最低版本；实际验证过的版本和平台见 [兼容基线](DEVELOPING.md#compatibility-baseline)。
- 已用 Pro、Max、Team 或 Enterprise 订阅登录官方 Claude Code（`claude auth login`，可用 `claude auth status` 确认）。
  - 不支持 API key，也不支持经 Bedrock、Vertex 或 Foundry 路由。
  - 不支持通过 `CLAUDE_CODE_OAUTH_TOKEN` 登录。
- 只有 Pi 从 npm 安装时，才需要 Node.js 22.19 或更新。

### 安装

```bash
pi install git:github.com/syansunyang-collab/pi-claude-print-provider@v1.0.1
```

上面的命令固定在 `v1.0.1` 标签；去掉 `@v1.0.1` 则跟随默认分支。加 `-l` 可以只装到当前项目。

如果之前装过上游的 npm 版，先执行 `pi remove npm:pi-claude-code-provider`。

建议把 Claude Code 固定在已验证的版本，并关掉自动更新：

```bash
claude install <已验证的 Claude Code 版本>
```

然后在 Claude Code 设置的 `env` 里把 `DISABLE_AUTOUPDATER` 设为 `"1"`。Claude Code 升级后如果请求失败，先运行 doctor（见下文），它会列出已验证的版本。

Windows 上如果 `claude` 是 npm 生成的 `.cmd` 包装脚本，插件无法直接启动它。请安装原生的 `claude.exe`，或把 `PI_CLAUDE_CODE_PROVIDER_PATH` 设为 `claude.exe` 的完整路径。

### 使用

- 在 `/model` 里选择 `pi-claude-code-provider` 下的型号：`claude-sonnet-5-5`、`claude-fable-5-1`、`claude-opus-5-5`、`claude-haiku-4-5`。
- 命令行可以直接指定：`pi --model pi-claude-code-provider/claude-sonnet-5-5`。
- 安装后或升级 Claude Code 后，运行 `/pi-claude-code-provider-doctor`。它检查版本、型号和工具桥，不消耗订阅额度。
- `/pi-claude-code-provider-doctor report` 生成不含对话内容的诊断报告，分享前请先自己检查一遍。
- 插件自带一个基于 Claude 的网页搜索工具，每次调用都消耗订阅额度。如果你已有别的搜索工具，可以设置 `PI_CLAUDE_CODE_PROVIDER_WEB_SEARCH=off` 关掉它。

### 常用配置

| 环境变量 | 作用 |
| --- | --- |
| `PI_CLAUDE_CODE_PROVIDER_PATH` | 指定 `claude` 可执行文件的路径 |
| `PI_CLAUDE_CODE_PROVIDER_WEB_SEARCH` | `on`（默认）或 `off` |
| `PI_CLAUDE_CODE_PROVIDER_TRANSCRIPT_BREAKPOINT` | `on`（默认）或 `off`。只在 Claude Code 拒绝多余缓存断点时才关，关掉就等于关掉缓存 |
| `PI_CLAUDE_CODE_PROVIDER_THINKING_DISPLAY` | `summarized`（默认）、`omitted` 或 `off` |
| `PI_CLAUDE_CODE_PROVIDER_METRICS_LOG` | 把不含对话内容的请求指标追加写入一个 JSONL 文件 |

完整的变量列表、超时设置和排障说明见 [DESIGN.md](DESIGN.md) 和 [DEVELOPING.md](DEVELOPING.md)。

为了兼容已有的会话和配置，provider ID（`pi-claude-code-provider`）、doctor 命令和 `PI_CLAUDE_CODE_PROVIDER_*` 环境变量都沿用上游的名字，没有改。

## 我们的改动（相对上游 0.6.0）

- **Claude 的 codemode 入口引导。** 工具目录中对齐 JSON `code` 参数说明，并加入批量读取/命令的场景与范例。复用 Pi 的 codemode 与只提议的工具桥，不强制切换 `only` 模式，也不隐藏其他工具。
- **图片数量默认不设限。** 仍内联发送有效上下文中的每张图片；单图 20 MiB、图片合计 100 MiB、转录 32 MiB 的字节上限不变。Claude Code 或服务端仍可能拒绝过多图片。
- **运行修正。** Windows 二次终止后确认退出即完成清理；错误结果优先于普通助手回显；重载后刷新 compat stream，避免沿用旧 CLI 实例。

- **适配新版 Claude Code。** 这个版本在 print 模式下会加载内置的 `plugin-authoring` 插件，导致每个请求都过不了隔离检查。现在它和 `agents-md`、`telemetry` 一起在 `--settings` 里被关掉。已验证基线见 [兼容基线](DEVELOPING.md#compatibility-baseline)；最低支持版本仍是 Pi 0.86.1、Claude Code 2.1.281。
- **图片内联。** 图片以 base64 块经 stdin 发送，不再用 `@"路径"` 引用文件。
- **图片不再落盘。** 删除了会话图片目录和图片租约代码。Windows 上旧版本留下的图片目录不会自动清理，需要手动删除。
- **摘要请求不写缓存。** Pi 标记为 `cacheRetention: "none"` 的请求，会给 Claude 子进程设置 `DISABLE_PROMPT_CACHING=1`。
- **使用完整型号名。** 选择器里列的是完整型号名，不再是 `sonnet`、`fable`、`opus`、`haiku` 这些别名；别名指向新型号时，doctor 会提示。用旧别名保存的会话需要重新选模型。
- **Windows 维护。** 在 Windows 11 x64 上开发并跑过付费验证。
- **测试与文档同步更新。**

## 致谢

本项目延续自 **chem** 的 [chem/pi-claude-code-provider](https://github.com/chem/pi-claude-code-provider)。整体设计、进程管理、只提议的工具桥、环境变量白名单，以及绝大部分测试，都出自 chem 之手，以 MIT 许可发布。感谢 chem 把它做得这么扎实、文档写得这么完整，我们才接得住。chem 的版权声明完整保留在 [LICENSE](LICENSE) 中。

## 为什么另开仓库

chem 在 2026-09-27 发布 v0.6.0 后归档了上游仓库。Pi 和 Claude Code 都更新得很快，经常有破坏性变更。chem 在上游 README 里说明这是业余项目，之后不再维护，也请大家不要再提 issue 和 PR。这个决定完全合理。

我们自己每天都在用这个插件，所以另开一个仓库，继续适配新版 Claude Code 和 Windows，并换了名字，免得和 chem 的原包混淆。本仓库的问题由我们负责，请在这里反馈，不要去打扰上游。

## 合规、商标与遥测说明

- **运行方式。** 本插件运行的是官方、未经修改的 Claude Code 程序，依赖你自己在 Claude Code 里完成的登录。它不提供 Claude 登录入口，不经手 Claude 凭据，也不支持共享账号。
- **商标与非关联声明。** "Claude" 和 "Claude Code" 是 Anthropic, PBC 的商标。本项目的名称和文档使用这两个词，只是为了说明插件运行的是什么，即官方 Claude Code CLI。pi-claude-print-provider 是独立的社区项目，与 Anthropic 没有任何关联，未获 Anthropic 认可、赞助或支持，也不是 Anthropic 的官方产品。
- **条款由你自己负责。** 是否符合你所用套餐的条款，由使用者自行负责。请阅读 Anthropic 的 [Legal and compliance](https://code.claude.com/docs/en/legal-and-compliance) 页面和帮助文章 [Use the Claude Agent SDK with your Claude plan](https://support.claude.com/en/articles/15036540-use-the-claude-agent-sdk-with-your-claude-plan)。该文章 2026-10-07 的更新说，`claude -p` 和第三方应用仍然可以使用订阅额度；6 月的更新用了 "For now" 的说法，政策随时可能调整。
- **遥测。** 沿用上游做法，每个 Claude 子进程都设置 `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1`，并通过 `--settings` 关闭内置的 `telemetry@builtin` 插件。这写死在 `src/claude-args.ts` 和 `src/auth.ts` 里，目前没有开关可以重新打开。

## 许可证

MIT。Copyright (c) 2026 chem；Copyright (c) 2026 Kai Mercer。全文见 [LICENSE](LICENSE)。

---

<a id="english"></a>

# pi-claude-print-provider (English)

**Use your own Claude subscription in Pi through the official Claude Code. No token handling, and Pi runs every tool.**

## Why this project exists

I use [Pi](https://github.com/earendil-works/pi) to work with my Claude, GPT, and other AI subscriptions side by side, and I needed a provider for my Claude subscription.

Anthropic is strict about third-party tools using subscription accounts. Some community approaches read Claude's OAuth token from the local machine, or make requests look as if they came from the official Claude Code. Those approaches break Anthropic's terms, and some people have had their accounts banned for it.

So I took the compliant route: the official `claude` program on your machine signs in and sends its own requests, and the provider never touches credentials. This provider continues chem's [pi-claude-code-provider](https://github.com/chem/pi-claude-code-provider), which was designed this way from the start.

## Why it is compliant

Anthropic's [Legal and compliance](https://code.claude.com/docs/en/legal-and-compliance) page says third-party developers may not collect, store, or intermediate Claude.ai credentials or session tokens. It also says:

> "Nor does it prevent an end user from signing in to the unmodified Claude Code binary with their own Claude subscription"

This provider stays inside that line:

- **No credential handling.** It never reads, copies, or forwards OAuth tokens or API keys. The official Claude Code handles sign-in (`claude auth login`); before starting, the provider only runs `claude auth status` to check the login.
- **No modified binary.** It runs the unmodified `claude` you installed, in its documented non-interactive mode (`claude -p`).
- **No client impersonation.** It builds no requests to Anthropic itself and forges no headers or client identity. Every network request comes from the official `claude`.
- **Credential variables blocked.** Claude child processes get an allowlisted environment. If `ANTHROPIC_API_KEY`, `ANTHROPIC_AUTH_TOKEN`, `ANTHROPIC_BASE_URL`, `CLAUDE_CODE_OAUTH_TOKEN`, or the Bedrock/Vertex switches are passed in, the provider refuses to start the process.

You remain responsible for following your plan's terms; see the compliance notes at the end.

## How it works

1. For each Pi request, the provider starts a fresh `claude -p` process and sends Pi's current conversation on stdin.
2. When Claude wants a tool, it calls an MCP bridge the provider supplies. The bridge hands the call back as a proposal and rejects every `tools/call`.
3. Pi runs the tool in its own UI, through its normal hooks and permission checks, and the result goes into the next request.

Pi owns sessions, branches, and compaction; Claude Code keeps no session of its own. The provider has no runtime dependencies.

## Caching and billing

### Why caching matters

The provider resends the whole conversation every turn, so whether the prompt cache hits makes a large difference. Anthropic's published [API prices](https://platform.claude.com/docs/en/build-with-claude/prompt-caching) put cache reads at usually 0.1× the base input price (0.05× for Sonnet 5.5 and Opus 5.5), 5-minute cache writes at 1.25×, and 1-hour cache writes at 2×.

On a subscription, usage counts against your plan limits. Anthropic does not publish how limits map to tokens, but a cache miss makes the same conversation use more of your plan. With usage credits enabled, usage beyond the plan is billed separately. The provider always reports a cost of 0 to Pi because it cannot know how a subscription is billed.

### What loses the cache

- **Long gaps.** The API caches for 5 minutes by default. The provider marks the history with a 1-hour breakpoint, so intermittent use within an hour can still hit; after more than an hour the history is written again.
- **Changing content that Claude Code appends.** By default Claude Code appends a changing `<total_tokens>` reminder, which breaks the cache completely. The provider turns it off with `totalTokensReminder: "off"`.
- **Claude Code upgrades.** Claude Code puts a billing header with its own version, never cached, at the very start, so the first turn after an upgrade starts cold.
- **Many parallel tool calls in one step.** Each breakpoint looks back about 20 blocks, so a step with about 19 or more parallel tool calls silently loses reuse.
- **A changing prefix.** For example, Haiku 4.5 receives environment content ahead of the conversation and misses whenever it changes. Haiku 4.5 also caches nothing below 4096 tokens.

### chem's design

The core caching design is chem's:
- append-only history with a fixed tool order;
- the `<total_tokens>` reminder turned off;
- a provider-owned 1-hour breakpoint on the last history block. It has to be 1 hour because the API requires longer TTLs first and Claude Code's own markers are 1-hour, at the cost of a higher write price than 5 minutes;
- `npm run capture:claude-breakpoints`, which checks the request shape without using quota;
- four paid cache stages: turns 2 and 3 must hit at least 80% and write less than a quarter of turn 1's cache write.

### Our changes

- **Inline images.** Upstream wrote images to files and referenced them as `@"path"`. Claude Code narrated those reads ahead of the conversation, so every new image rewrote the cached prefix, and the currently verified Claude Code release silently drops `@` files over 256 KiB. Images now go on stdin as base64 blocks, right after the record that references them, so a new image only extends the history.
- **No cache writes for summaries.** chem already kept the provider's breakpoint off one-shot summaries such as compaction. The currently verified Claude Code release still adds its own 1-hour breakpoint and writes the summary, which is never read, to the cache at 2×. These requests now run the Claude child with `DISABLE_PROMPT_CACHING=1`.

### Data

**Real usage, not a controlled test.** These numbers come from the maintainer's Pi session logs on Windows, 2026-09-13 to 2026-10-09: 630 Opus requests through this provider. Hit rate is `cacheRead / (input + cacheRead + cacheWrite)` per turn.

| Group | Turns | Overall hit | Median |
| --- | ---: | ---: | ---: |
| All | 630 | 96.8% | 99.0% |
| Upstream phase (model id `opus`) | 332 | 94.5% | 99.0% |
| This project (model id `claude-opus-5-5`) | 298 | 98.2% | 98.9% |
| Less than 5 min since the previous turn | 598 | 97.6% | 99.0% |
| 5 to 60 min | 10 | 94.6% | 99.1% |
| More than 60 min | 3 | 0.0% | 0.0% |

- **The 10 gaps of 5 to 25 minutes.** 9 hit at 98% or more, so the cache did outlive the 5-minute default. The other one, after 5.1 minutes, hit 0% for no known reason.
- **The 3 gaps of more than 2 hours.** All hit 0%, consistent with a 1-hour lifetime.
- **Order of magnitude.** At Opus 5.5 API prices, these 630 turns with caching cost roughly 14% of what they would with no cache hits at all. This is not a subscription bill; it only shows the scale.
- **Images in the upstream phase.** The 6 turns that added a new image had a median hit rate of only 23.4%, and in a run of 9 turns the cache read stayed at 37,324 tokens while the rest of the history was rewritten each turn. That matches the mechanism of attachment narration rewriting the prefix, but the logs do not show the actual requests, so the cause is unverified. The current phase has no image turns, so there is no real-usage data yet on inline images.
- **Small samples.** There are only 10 samples for 5 to 60 minutes and 3 for more than 60, and none between 30 and 60 minutes.
- **The two phases are not directly comparable.** They differ in dates, tasks, and Claude Code versions, so the difference in hit rate cannot all be credited to this project's changes.

**Paid validation (controlled).** On 2026-10-09, on Windows 11 with a Max subscription, the cache stages hit as follows on turns 2 and 3:
- Sonnet: 96.1% and 95.9%
- Haiku: 98.3% and 98.3%

The image cache stages also passed their thresholds, but no figures were recorded.

Controlled tests for 30 to 60 minute gaps and for compaction run through this provider have not been done yet.

## Tests

| Environment | Test | Result |
| --- | --- | --- |
| Linux, Node 22.23.1 and 24.16.0 (run locally 2026-10-11, not GitHub Actions) | `npm run release:check` | 382 tests: 376 pass, 0 fail, 6 Windows-only skipped |
| Windows 11 x64, Node 24.12.0 | `npm test` | 382 tests: 349 pass, 0 fail, 33 POSIX-only skipped |
| Windows 11 x64, Max subscription (2026-10-09, commit `696d473`) | all 15 paid stages | all passed, 57 Claude launches |

Paid stages have not been run on Linux or macOS.

## Install and use

### Requirements

- [Pi](https://pi.dev) 0.86.1 or newer.
- Claude Code 2.1.281 or newer.
- These are minimums; see the [compatibility baseline](DEVELOPING.md#compatibility-baseline) for tested versions and platforms.
- The official Claude Code signed in with a Pro, Max, Team, or Enterprise subscription (`claude auth login`; check with `claude auth status`).
  - API keys and routing through Bedrock, Vertex, or Foundry are not supported.
  - Logins through `CLAUDE_CODE_OAUTH_TOKEN` are not supported.
- Node.js 22.19 or newer, only when Pi itself is installed from npm.

### Install

```bash
pi install git:github.com/syansunyang-collab/pi-claude-print-provider@v1.0.1
```

The command above pins the `v1.0.1` tag; drop `@v1.0.1` to follow the default branch. Add `-l` for a project-local install.

If you installed the upstream npm package, remove it first with `pi remove npm:pi-claude-code-provider`.

We recommend pinning Claude Code to the verified version and turning off auto-update:

```bash
claude install <verified Claude Code version>
```

Then set `DISABLE_AUTOUPDATER` to `"1"` in the `env` of Claude Code's settings. If requests fail after a Claude Code update, run the doctor (below); it names the verified version.

On Windows, if `claude` is an npm-generated `.cmd` shim, the provider cannot launch it. Install the native `claude.exe`, or set `PI_CLAUDE_CODE_PROVIDER_PATH` to the full path of `claude.exe`.

### Use

- In `/model`, pick a model under `pi-claude-code-provider`: `claude-sonnet-5-5`, `claude-fable-5-1`, `claude-opus-5-5`, or `claude-haiku-4-5`.
- From the command line: `pi --model pi-claude-code-provider/claude-sonnet-5-5`.
- After installing, or after a Claude Code update, run `/pi-claude-code-provider-doctor`. It checks versions, models, and the tool bridge without using subscription quota.
- `/pi-claude-code-provider-doctor report` produces a diagnostic report without conversation content. Review it before sharing.
- The bundled Claude-backed web search tool uses subscription quota on every call. If you already have another search tool, set `PI_CLAUDE_CODE_PROVIDER_WEB_SEARCH=off` to turn it off.

### Common settings

| Variable | Purpose |
| --- | --- |
| `PI_CLAUDE_CODE_PROVIDER_PATH` | Path to the `claude` executable |
| `PI_CLAUDE_CODE_PROVIDER_WEB_SEARCH` | `on` (default) or `off` |
| `PI_CLAUDE_CODE_PROVIDER_TRANSCRIPT_BREAKPOINT` | `on` (default) or `off`. Turn it off only if Claude Code rejects extra cache breakpoints; off disables caching |
| `PI_CLAUDE_CODE_PROVIDER_THINKING_DISPLAY` | `summarized` (default), `omitted`, or `off` |
| `PI_CLAUDE_CODE_PROVIDER_METRICS_LOG` | Append request metrics, without conversation content, to a JSONL file |

The full list of variables, timeouts, and troubleshooting is in [DESIGN.md](DESIGN.md) and [DEVELOPING.md](DEVELOPING.md).

For compatibility with existing sessions and settings, the provider ID (`pi-claude-code-provider`), the doctor command, and the `PI_CLAUDE_CODE_PROVIDER_*` variables keep their upstream names.

## What's different from upstream 0.6.0

- **Claude-facing codemode guidance.** The tool catalog aligns the JSON `code` input description and adds a batching scenario and example. It reuses Pi's codemode and proposal-only bridge, without forcing `only` mode or hiding other tools.
- **No default image-count cap.** Every image in the effective context still travels inline. The 20 MiB per-image, 100 MiB aggregate-image, and 32 MiB transcript byte bounds remain; Claude Code or the service may still reject too many images.
- **Runtime fixes.** Windows cleanup accepts confirmed exit after the second termination wait; terminal errors outrank ordinary assistant echoes; reload refreshes the compat stream rather than retaining an old CLI instance.

- **Support for the current Claude Code.** The verified release loads its built-in `plugin-authoring` plugin in print mode, which made every request fail the isolation check. It is now disabled in `--settings` along with `agents-md` and `telemetry`. Verified baseline: see the [compatibility baseline](DEVELOPING.md#compatibility-baseline). The minimum stays Pi 0.86.1, Claude Code 2.1.281.
- **Inline images.** Images go on stdin as base64 blocks instead of `@"path"` file references.
- **No image files on disk.** The session image store and image leases are gone. On Windows, image directories left by earlier versions are not cleaned up automatically and must be removed by hand.
- **No cache writes for summaries.** Requests Pi marks `cacheRetention: "none"` run the Claude child with `DISABLE_PROMPT_CACHING=1`.
- **Full model IDs.** The picker lists full model IDs instead of the `sonnet`, `fable`, `opus`, and `haiku` aliases, and the doctor warns when an alias moves to a newer model. Sessions saved with an old alias ID need a model reselected.
- **Windows maintenance.** Developed and paid-verified on Windows 11 x64.
- **Tests and docs updated to match.**

## Acknowledgements

This project continues [chem/pi-claude-code-provider](https://github.com/chem/pi-claude-code-provider) by **chem**. The design, the process supervision, the proposal-only tool bridge, the env allowlist, and almost all of the tests are chem's work, released under the MIT license. Thank you, chem, for building it carefully and documenting it so thoroughly that picking it up was possible. chem's copyright notice is kept in [LICENSE](LICENSE).

## Why a new repo

chem archived the upstream repository after releasing v0.6.0 on 2026-09-27. Pi and Claude Code both ship breaking changes often. chem explained in the upstream README that the project was a hobby with no further maintenance planned, and asked people not to file more issues or pull requests. That decision is entirely fair.

We use this provider every day, so we started a separate repository to keep it working with newer Claude Code releases and on Windows, under a new name so it is not confused with chem's original package. Problems in this repository are ours; please report them here, not upstream.

## Compliance, trademark, and telemetry

- **How it runs.** This provider runs the official, unmodified Claude Code binary and relies on the login you make in Claude Code yourself. It does not offer Claude sign-in, handle Claude credentials, or support shared accounts.
- **Trademark and non-affiliation.** "Claude" and "Claude Code" are trademarks of Anthropic, PBC. They appear in this project's name and docs only to describe what the provider runs: the official Claude Code CLI. pi-claude-print-provider is an independent community project. It is not affiliated with, endorsed by, sponsored by, or supported by Anthropic, and it is not an official Anthropic product.
- **Your terms are your responsibility.** You are responsible for following Anthropic's terms for your plan. Read Anthropic's [Legal and compliance](https://code.claude.com/docs/en/legal-and-compliance) page and the help article [Use the Claude Agent SDK with your Claude plan](https://support.claude.com/en/articles/15036540-use-the-claude-agent-sdk-with-your-claude-plan). Its 2026-10-07 update says `claude -p` and third-party apps can still use subscription limits; the June update says "For now", so the policy may change.
- **Telemetry.** As upstream did, every Claude child gets `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1`, and `--settings` disables the built-in `telemetry@builtin` plugin. This is hard-coded in `src/claude-args.ts` and `src/auth.ts`; there is currently no option to turn it back on.

## License

MIT. Copyright (c) 2026 chem; Copyright (c) 2026 Kai Mercer. See [LICENSE](LICENSE).
