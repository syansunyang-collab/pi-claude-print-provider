import assert from "node:assert/strict";
import test from "node:test";
import { getSupportedThinkingLevels } from "@earendil-works/pi-ai";
import { providerModels } from "../../src/catalog.ts";

test("advertises concrete model IDs, including Fable 5.2, with their context and output limits", () => {
    // The same on every subscription tier: Claude Code serves Opus 5.5 with its
    // native 1M window on Pro too, so nothing here depends on the account.
    const models = providerModels();
    assert.deepEqual(
        models.map(({ id, name, contextWindow, maxTokens }) => ({ id, name, contextWindow, maxTokens })),
        [
            { id: "claude-opus-5-5", name: "Opus 5.5", contextWindow: 1_000_000, maxTokens: 128_000 },
            { id: "claude-fable-5-2", name: "Fable 5.2", contextWindow: 1_000_000, maxTokens: 128_000 },
            { id: "claude-sonnet-5-5", name: "Sonnet 5.5", contextWindow: 1_000_000, maxTokens: 128_000 },
            { id: "claude-haiku-5-5", name: "Haiku 5.5", contextWindow: 1_000_000, maxTokens: 128_000 },
            { id: "claude-fable-5-1", name: "Fable 5.1", contextWindow: 1_000_000, maxTokens: 64_000 },
            { id: "claude-sonnet-5", name: "Sonnet 5", contextWindow: 1_000_000, maxTokens: 64_000 },
            { id: "claude-opus-5", name: "Opus 5", contextWindow: 1_000_000, maxTokens: 64_000 },
            { id: "claude-fable-5", name: "Fable 5", contextWindow: 1_000_000, maxTokens: 64_000 },
            { id: "claude-opus-4-8", name: "Opus 4.8", contextWindow: 1_000_000, maxTokens: 64_000 },
            { id: "claude-opus-4-7", name: "Opus 4.7", contextWindow: 1_000_000, maxTokens: 64_000 },
            { id: "claude-opus-4-6", name: "Opus 4.6", contextWindow: 200_000, maxTokens: 64_000 },
        ],
    );
    for (const model of models) {
        assert.deepEqual(model.input, ["text", "image"]);
        assert.deepEqual(model.cost, { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 });
        assert.equal(model.reasoning, true);
        assert.deepEqual(model.thinkingLevelMap, {
            off: null,
            minimal: null,
            low: "low",
            medium: "medium",
            high: "high",
            xhigh: model.id === "claude-opus-4-6" ? null : "xhigh",
            max: "max",
        });
        assert.deepEqual(getSupportedThinkingLevels(model), model.id === "claude-opus-4-6"
            ? ["low", "medium", "high", "max"] : ["low", "medium", "high", "xhigh", "max"]);
    }
});
