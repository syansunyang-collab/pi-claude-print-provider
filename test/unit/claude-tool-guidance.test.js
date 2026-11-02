import assert from "node:assert/strict";
import { readFile, rm } from "node:fs/promises";
import test from "node:test";
import { createAssistantMessageEventStream, getCurrentTools, validateToolCall } from "@earendil-works/pi-ai";
import { Type } from "typebox";
import { prepareRequest } from "../../src/context-serializer.ts";
import { createOutput } from "../../src/output.ts";
import { ClaudeEventMapper } from "../../src/stream-events.ts";
import { PROVIDER_INIT_FIELDS, initRecord, toolUseEvents } from "../support/claude-fixture.js";

// Frozen wording from the controlled guidance probe, not the production helper.
const originalHeader = "The input is raw JavaScript (not JSON, no code fence), run as an async function body in a QuickJS sandbox:";
const correctedHeader = 'This MCP tool takes a JSON object with one code string: {"code":"<JavaScript source>"}. Put raw JavaScript inside the code field, without a markdown code fence. The script runs as an async function body in a QuickJS sandbox:';
const usageExample = '\n\nWhen inspecting multiple independent files or commands, prefer one codemode script to separate MCP read/bash calls, including when those MCP calls could already run in parallel. This lets the script combine or filter results before they enter the model context. Inside the script use original Pi names such as tools.read and tools.bash, not MCP transport names. For example, pass this JavaScript in the code field:\nconst paths = ["PROJECT.md", "STATUS.md"];\nconst results = await Promise.allSettled(paths.map(path => tools.read({path})));\nresults.forEach((result, i) => text({path: paths[i], result}));';
const codemode = { name: "codemode", description: `Run JavaScript. ${originalHeader}\nGlobals stay unchanged.`, parameters: Type.Object({ code: Type.String() }) };
const read = { name: "read", description: "Read files", parameters: Type.Object({ path: Type.String() }) };

async function catalog(tools) {
    const prepared = await prepareRequest({ messages: [], tools });
    try {
        return { entries: JSON.parse(await readFile(prepared.catalogPath, "utf8")), names: prepared.toolNames };
    } finally {
        await rm(prepared.directory, { recursive: true, force: true });
    }
}

test("Claude catalog adapts only final codemode description, leaving Pi tools and schemas unchanged", async () => {
    const updated = { ...codemode, description: `${codemode.description}\nCurrent declaration.` };
    const messages = [
        { role: "system", content: "", toolsAdded: [read, codemode], timestamp: 0 },
        { role: "system", content: "", toolsRemoved: [{ name: "codemode" }], timestamp: 1 },
        { role: "system", content: "", toolsAdded: [updated], timestamp: 2 },
    ];
    const before = structuredClone(messages);
    const tools = getCurrentTools(messages);
    const { entries, names } = await catalog(tools);
    assert.deepEqual(entries, [
        { name: "codemode", description: updated.description.replace(originalHeader, correctedHeader) + usageExample, inputSchema: updated.parameters },
        { name: "read", description: read.description, inputSchema: read.parameters },
    ]);
    assert.deepEqual(messages, before);
    assert.deepEqual(tools, getCurrentTools(before));
    assert.equal(names.get("mcp__pi__codemode"), "codemode");
    assert.equal(entries.find((tool) => tool.name === "codemode").inputSchema.properties.code.type, "string");

    const removed = getCurrentTools([...messages, { role: "system", content: "", toolsRemoved: [{ name: "codemode" }], timestamp: 3 }]);
    assert.deepEqual((await catalog(removed)).entries, [{ name: "read", description: read.description, inputSchema: read.parameters }]);
    const other = { ...codemode, name: "other_script" };
    assert.deepEqual((await catalog([other])).entries, [{ name: other.name, description: other.description, inputSchema: other.parameters }]);
});

test("codemode JSON code proposal maps back to Pi unchanged without executing the script", async () => {
    const model = { id: "fixture", api: "test", provider: "test" };
    const stream = createAssistantMessageEventStream();
    const output = createOutput(model);
    const { names } = await catalog([codemode, read]);
    const mapper = new ClaudeEventMapper({ stream, output, expectedTools: new Set(names.keys()), toolNames: names, onToolUse() {} });
    mapper.accept(initRecord(PROVIDER_INIT_FIELDS, {
        tools: [...names.keys()], mcp_servers: [{ name: "pi", status: "connected" }],
    }));
    const args = { code: 'const results = await Promise.allSettled([tools.read({path: "PROJECT.md"}), tools.read({path: "STATUS.md"})]); text(results);' };
    for (const record of toolUseEvents({ messageId: "msg_code", toolUseId: "toolu_code", name: "mcp__pi__codemode", partialJson: JSON.stringify(args) })) {
        mapper.accept(record);
    }
    assert.equal(mapper.completeToolUse(), true);
    const result = await stream.result();
    assert.equal(result.stopReason, "toolUse");
    assert.deepEqual(result.content, [{ type: "toolCall", id: "toolu_code", name: "codemode", arguments: args }]);
    assert.deepEqual(validateToolCall([codemode], result.content[0]), args);
});
