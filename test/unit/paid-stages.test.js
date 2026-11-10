import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { MINIMUM_TOOL_BEARING_CAP, PAID_STAGES, PINNED_STAGE_SETTINGS, RELEASE_ORDER, releaseCap, stageEnvironment, modelMatrixCases } from "../../scripts/lib/paid-stages.js";
import { WEB_SEARCH_ENV, webSearchSetting } from "../../src/web-search.ts";
import { providerModels } from "../../src/catalog.ts";

const developing = fileURLToPath(new URL("../../DEVELOPING.md", import.meta.url));

test("a tool-bearing stage can afford the launches a tool round trip costs", () => {
    // Proposing a call and continuing after Pi executes it are separate Claude
    // launches, so a one-launch cap fails before the lane can ever pass.
    for (const [name, stage] of Object.entries(PAID_STAGES)) {
        if (!stage.toolBearing) continue;
        assert.ok(
            stage.cap >= MINIMUM_TOOL_BEARING_CAP,
            `${name} round-trips a tool but caps at ${stage.cap}; a tool call needs at least ${MINIMUM_TOOL_BEARING_CAP} launches`,
        );
    }
});

test("documented launch caps match the runner and each other", async () => {
    const rows = [...(await readFile(developing, "utf8")).matchAll(/^\| `npm run test:paid:([a-z-]+)` \| (\d+) \|$/gm)]
        .map(([, name, cap]) => [name, Number(cap)]);
    assert.ok(rows.length > 0, "DEVELOPING.md documents no paid launch caps");
    const documented = new Map(rows);

    // Every stage is documented, and every documented cap is real.
    assert.deepEqual(
        [...documented.keys()].filter((name) => name !== "release").sort(),
        Object.keys(PAID_STAGES).sort(),
    );
    for (const [name, cap] of documented) {
        if (name === "release") continue;
        assert.equal(cap, PAID_STAGES[name].cap, `documented cap for ${name} does not match the runner`);
    }
    // The advertised aggregate must equal what the release order actually sums to,
    // so the maintainer authorizes the number of launches that can really occur.
    assert.equal(documented.get("release"), releaseCap(), "documented release cap does not match the release order");
    assert.deepEqual(RELEASE_ORDER.filter((name) => name in PAID_STAGES), RELEASE_ORDER);
});

test("every stage runs with web search registered, whatever the maintainer's shell says", () => {
    // The release suite verifies visible web search, so an ambient opt-out must
    // not fail the gate; the pin also has to track the provider's own name.
    assert.equal(PINNED_STAGE_SETTINGS[WEB_SEARCH_ENV], "on");
    for (const ambient of ["off", "0", "bogus"]) {
        const environment = stageEnvironment({ [WEB_SEARCH_ENV]: ambient, KEEP: "ambient" }, { STAGE: "value", [WEB_SEARCH_ENV]: "off" });
        assert.equal(webSearchSetting(environment), "on");
        assert.equal(environment.KEEP, "ambient");
        assert.equal(environment.STAGE, "value");
    }
});

test("every model a paid stage selects is one the picker offers", () => {
    // The picker offers full ids; an alias here fails the stage before any launch.
    const offered = new Set(providerModels().map((model) => model.id));
    for (const [name, stage] of Object.entries(PAID_STAGES)) {
        for (const flag of ["--case", "--cache-model"]) {
            const index = stage.args.indexOf(flag);
            if (index < 0) continue;
            const model = stage.args[index + 1].split(":")[0];
            assert.ok(offered.has(model), `${name} selects ${model}, which the picker does not offer`);
        }
    }
});

test("the expanded picker keeps the paid core within its cap and all Fable versions opt-in", () => {
    const { core, selectable } = modelMatrixCases(providerModels());
    assert.equal(core.length, PAID_STAGES.matrix.cap);
    assert.ok(core.every(({ model }) => !model.startsWith("claude-fable-")));
    assert.ok(core.some(({ model, effort }) => model === "claude-haiku-5-5" && effort === "medium"));
    for (const model of providerModels()) assert.ok(selectable.some((entry) => entry.model === model.id), model.id);
});

test("stage values override ambient values", () => {
    assert.equal(stageEnvironment({ PI_OFFLINE: "0" }, { PI_OFFLINE: "1" }).PI_OFFLINE, "1");
});
