import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";

// This is the public, quota-free reproduction command, not a model smoke test.
test("public cache data reproduce the long-session usage summary", () => {
    const actual = JSON.parse(execFileSync(process.execPath, [fileURLToPath(new URL("../../scripts/summarize-cache-usage.js", import.meta.url))], { encoding: "utf8" }));
    const expected = JSON.parse(readFileSync(new URL("../../docs/data/cache-summary-20261102.json", import.meta.url), "utf8"));
    assert.deepEqual(actual, expected);
    assert.equal(actual.groups["legacy-audit"].requests, 786);
    assert.equal(actual.groups["legacy-audit"].totals.cacheWrite1h, actual.groups["legacy-audit"].totals.cacheWrite);
    assert.equal(actual.groups["legacy-audit"].firstHitPercent, 0);
    assert.notEqual(actual.groups["legacy-audit"].weightedHitPercent, actual.groups["legacy-audit"].meanHitPercent);
});
