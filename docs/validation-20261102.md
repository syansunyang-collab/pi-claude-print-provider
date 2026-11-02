# 维护改动说明 / Maintenance notes

本页概述本仓相对归档上游的维护改动，以及可据以了解兼容性的验证信息。详细版本历史见 [CHANGELOG.md](../CHANGELOG.md)，开发与兼容基线见 [DEVELOPING.md](../DEVELOPING.md)。

## 主要改动

- 图片随所属历史记录以内联 base64 块经 stdin 发送，不再生成临时图片文件或维护会话图片缓存目录。图片仍受单张、总量和转录字节上限约束；Pi 自身的会话可能保留图片。
- `cacheRetention: "none"` 的一次性摘要请求会关闭提示缓存，避免只写入而不复用的缓存条目。
- 使用完整型号 ID，并适配新版 Claude Code 的内置插件、工具目录和协议行为。
- Claude 看到的 codemode 工具说明与 JSON `code` 入参一致，并增加批量操作范例。Pi 的工具定义、执行器和提议桥保持原有职责；provider 不强制 `only` 模式。
- 修正 Windows 子进程清理、错误信息优先级和扩展重载后的 compat stream 刷新。
- CLI 非必要流量和内置 telemetry 保持关闭；可选指标日志写在本地。

## 验证信息

当前兼容基线和最低支持版本分别维护在 [DEVELOPING.md](../DEVELOPING.md#compatibility-baseline) 与源码兼容配置中。Pi SDK 1.4.0 已通过相关定向测试和类型检查。完整发布基线见 DEVELOPING.md，具体改动见版本记录。

图片传输行为由 serializer 与 CLI 参数构建相关的确定性测试覆盖，不需要发起 Claude 请求。缓存实测数据是另一份真实长会话记录，安装元数据为 0.6.0；见[缓存结果](cache-results.md)。

## English

This page summarizes maintenance changes from the archived upstream and points to compatibility evidence. See [CHANGELOG.md](../CHANGELOG.md) for release history and [DEVELOPING.md](../DEVELOPING.md) for development procedures and compatibility baselines.

Images travel inline as base64 over stdin after their transcript records. The provider no longer creates temporary image files or maintains a session image-cache directory. Image and transcript byte limits remain, and Pi itself may retain images in its sessions. One-shot summaries marked `cacheRetention: "none"` disable prompt caching. Other maintenance work updates full model IDs, Claude Code compatibility, codemode guidance, Windows cleanup, error precedence, and reload behavior.

Targeted tests and typechecking cover Pi SDK 1.4.0. DEVELOPING.md records the full release baseline. Image transport is covered by deterministic serializer and CLI-argument tests without Claude inference. The cache measurements are a separate real session recorded with installation metadata 0.6.0; see the [cache report](cache-results.md).
