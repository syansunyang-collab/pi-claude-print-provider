import type { ProviderModelConfig } from "@earendil-works/pi-coding-agent";

const ZERO_COST = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 } as const;
const EFFORT_LEVELS = {
  off: null,
  minimal: null,
  low: "low",
  medium: "medium",
  high: "high",
  xhigh: "xhigh",
  max: "max",
} as const;

function providerModel(
  id: string,
  name: string,
  contextWindow: number,
  maxTokens: number,
): ProviderModelConfig {
  return {
    id,
    name,
    reasoning: true,
    // Opus 4.6 predates xhigh; Haiku 5.5 now supports effort like the newer families.
    thinkingLevelMap: id === "claude-opus-4-6" ? { ...EFFORT_LEVELS, xhigh: null } : EFFORT_LEVELS,
    input: ["text", "image"],
    cost: ZERO_COST,
    contextWindow,
    maxTokens,
  };
}

/**
 * Full model ids, not the sonnet/fable/opus/haiku aliases: they are what the
 * Claude Code model picker exposes. Windows CLI 2.1.321 catalog observations
 * provide the native context windows, default output caps, and effort capabilities.
 * Sonnet 4.6 and Haiku 4.5 are intentionally excluded from this maintained list.
 * The doctor reports newer aliases without silently changing selected model IDs.
 *
 * The doctor reports a served window that stops matching the configured one,
 * because Pi places its compaction threshold by the configured value.
 */
export function providerModels(): ProviderModelConfig[] {
  return [
    providerModel("claude-opus-5-5", "Opus 5.5", 1_000_000, 128_000),
    providerModel("claude-fable-5-2", "Fable 5.2", 1_000_000, 128_000),
    providerModel("claude-sonnet-5-5", "Sonnet 5.5", 1_000_000, 128_000),
    providerModel("claude-haiku-5-5", "Haiku 5.5", 1_000_000, 128_000),
    providerModel("claude-fable-5-1", "Fable 5.1", 1_000_000, 64_000),
    providerModel("claude-sonnet-5", "Sonnet 5", 1_000_000, 64_000),
    providerModel("claude-opus-5", "Opus 5", 1_000_000, 64_000),
    providerModel("claude-fable-5", "Fable 5", 1_000_000, 64_000),
    providerModel("claude-opus-4-8", "Opus 4.8", 1_000_000, 64_000),
    providerModel("claude-opus-4-7", "Opus 4.7", 1_000_000, 64_000),
    providerModel("claude-opus-4-6", "Opus 4.6", 200_000, 64_000),
  ];
}
