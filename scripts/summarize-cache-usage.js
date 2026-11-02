import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

// The committed numeric CSV contains no quoted fields or conversation content.
const data = readFileSync(process.argv[2] ?? new URL("../docs/data/cache-usage-20261102.csv", import.meta.url), "utf8");
const [header, ...lines] = data.trim().split(/\r?\n/);
const columns = header.split(",");
const groups = new Map();
for (const line of lines) {
  const values = line.split(",");
  assert.equal(values.length, columns.length);
  const row = Object.fromEntries(columns.map((key, i) => [key, key === "cohort" ? values[i] : Number(values[i])]));
  for (const [key, value] of Object.entries(row)) {
    if (key !== "cohort") assert(Number.isFinite(value) && value >= 0, `Invalid ${key}`);
  }
  assert(row.cacheWrite1h <= row.cacheWrite, "1h writes are a subset, not extra input");
  if (!groups.has(row.cohort)) groups.set(row.cohort, []);
  groups.get(row.cohort).push(row);
}
const mean = values => values.reduce((a, b) => a + b, 0) / values.length;
const median = values => {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};
const summaries = {};
for (const [cohort, rows] of groups) {
  const sum = key => rows.reduce((total, row) => total + row[key], 0);
  const promptTokens = row => row.input + row.cacheRead + row.cacheWrite;
  const hit = row => 100 * row.cacheRead / promptTokens(row);
  assert(rows.every(row => promptTokens(row) > 0));
  const hits = rows.map(hit);
  const totals = Object.fromEntries(["input", "output", "cacheRead", "cacheWrite", "cacheWrite1h"].map(key => [key, sum(key)]));
  const pairs = rows.slice(1).map((row, i) => ({ previous: rows[i], row }));
  const samePhase = pairs.filter(pair => pair.previous.phase === pair.row.phase);
  summaries[cohort] = {
    requests: rows.length,
    totals,
    promptTokens: totals.input + totals.cacheRead + totals.cacheWrite,
    weightedHitPercent: 100 * totals.cacheRead / (totals.input + totals.cacheRead + totals.cacheWrite),
    meanHitPercent: mean(hits),
    medianHitPercent: median(hits),
    firstHitPercent: hits[0],
    lastHitPercent: hits.at(-1),
    zeroHitRequests: hits.filter(value => value === 0).length,
    requestsAtLeast95Percent: hits.filter(value => value >= 95).length,
    requestsAtLeast99Percent: hits.filter(value => value >= 99).length,
    adjacentRequests: pairs.length,
    gapsOver5Minutes: pairs.filter(({ previous, row }) => row.startSeconds - previous.startSeconds > 300).length,
    samePhasePairs: samePhase.length,
    samePhasePairsWith303TokenTail: samePhase.filter(({ previous, row }) => previous.cacheRead + previous.cacheWrite - row.cacheRead === 303).length,
    maxPromptTokens: Math.max(...rows.map(promptTokens)),
  };
}
console.log(JSON.stringify({ schemaVersion: 1, dataSha256: createHash("sha256").update(data).digest("hex"), groups: summaries }, null, 2));
