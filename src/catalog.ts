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
    // Haiku has no effort control. Claude Code still owns its thinking default.
    ...(id.startsWith("claude-haiku-") ? { reasoning: false } : { reasoning: true, thinkingLevelMap: EFFORT_LEVELS }),
    input: ["text", "image"],
    cost: ZERO_COST,
    contextWindow,
    maxTokens,
  };
}

/**
 * Full model ids, not the sonnet/fable/opus/haiku aliases: they are what the
 * aliases resolve to in Claude Code 2.1.292, plus the explicitly selectable
 * Fable 5.2 (1M context / 128K output, per its official model overview).
 * Existing models retain the CLI catalog's window and default output cap.
 * When Claude Code moves an alias, the doctor names the id this list offers.
 *
 * The doctor reports a served window that stops matching the configured one,
 * because Pi places its compaction threshold by the configured value.
 */
export function providerModels(): ProviderModelConfig[] {
  return [
    providerModel("claude-sonnet-5-5", "Sonnet 5.5", 1_000_000, 128_000),
    providerModel("claude-fable-5-2", "Fable 5.2", 1_000_000, 128_000),
    providerModel("claude-fable-5-1", "Fable 5.1", 1_000_000, 64_000),
    providerModel("claude-opus-5-5", "Opus 5.5", 1_000_000, 128_000),
    providerModel("claude-haiku-4-5", "Haiku 4.5", 200_000, 32_000),
  ];
}
