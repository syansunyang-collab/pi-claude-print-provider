import assert from "node:assert/strict";
import test from "node:test";
import { createAssistantMessageEventStream, isContextOverflow, isRetryableAssistantError } from "@earendil-works/pi-ai";
import { normalizeClaudeOverflow } from "../../src/errors.ts";
import { createOutput } from "../../src/output.ts";
import { ClaudeEventMapper } from "../../src/stream-events.ts";
import { recordKind, terminalResultErrorDetail, validateClaudeInitialization } from "../../src/claude-protocol.ts";

const base = {
    type: "system",
    subtype: "init",
    tools: [],
    mcp_servers: [],
    model: "claude-sonnet-5",
    permissionMode: "dontAsk",
    slash_commands: [],
    skills: [],
    plugins: [],
    apiKeySource: "none",
};

test("reports sanitized MCP initialization errors without private paths", () => {
    assert.throws(
        () => validateClaudeInitialization({
            ...base,
            mcp_server_errors: [{
                name: "pi",
                type: "invalid_config",
                message: "bad\u0000 config at /tmp/provider-private/catalog.json",
            }],
        }, { tools: new Set(), mcpServer: "none", privatePaths: ["/tmp/provider-private"] }),
        (error) => error.code === "isolation_mcp"
            && /invalid_config: bad +config at <PRIVATE>\/catalog\.json/.test(error.message)
            && !error.message.includes("/tmp/provider-private"),
    );
    assert.throws(
        () => validateClaudeInitialization({ ...base, mcp_server_errors: [{ type: "broken" }] }, { tools: new Set(), mcpServer: "none" }),
        (error) => error.code === "protocol_init",
    );
    assert.throws(
        () => validateClaudeInitialization({
            ...base,
            mcp_server_errors: [{ name: "pi", type: "invalid_config", message: "bad image at /tmp/provider-images/image.png" }],
        }, { tools: new Set(), mcpServer: "none", privatePaths: ["/tmp/provider-private", "/tmp/provider-images"] }),
        (error) => error.code === "isolation_mcp"
            && error.message.includes("<PRIVATE>/image.png")
            && !error.message.includes("/tmp/provider-images"),
    );
});

test("shares terminal result diagnostics across Claude protocol consumers", () => {
    assert.equal(terminalResultErrorDetail({ result: null, errors: ["first", "second"] }), "first; second");
    assert.equal(terminalResultErrorDetail({ terminal_reason: "limit" }, "assistant detail"), "limit");
    assert.equal(terminalResultErrorDetail({ errors: ["network request failed"], result: "partial reply" }, "ordinary echo"), "network request failed");
    assert.equal(terminalResultErrorDetail({ errors: ["OAuth session expired"] }, "ordinary echo"), "OAuth session expired");
    assert.equal(terminalResultErrorDetail({ result: "Prompt is too long" }, "ordinary echo", "rate limit exceeded"), "Prompt is too long");
    assert.equal(terminalResultErrorDetail({}, "ordinary echo", "rate limit exceeded"), "rate limit exceeded");
    assert.equal(terminalResultErrorDetail({ result: "actual result diagnostic" }, "ordinary echo"), "actual result diagnostic");
    assert.equal(terminalResultErrorDetail({}, "assistant detail"), "assistant detail");
    assert.equal(terminalResultErrorDetail({}), "unknown error");
});

test("terminal overflow outranks an assistant echo and rejected rate-limit event", () => {
    const output = createOutput({ id: "fixture", api: "test", provider: "test" });
    const mapper = new ClaudeEventMapper({
        stream: createAssistantMessageEventStream(), output,
        expectedTools: new Set(), toolNames: new Map(), onToolUse() {},
    });
    mapper.accept(base);
    mapper.accept({ type: "rate_limit_event", rate_limit_info: { status: "rejected", rateLimitType: "five_hour", resetsAt: 1_800_000_000 } });
    mapper.accept({ type: "assistant", message: { content: [{ type: "text", text: "ordinary partial reply" }] } });
    mapper.accept({ type: "result", is_error: true, result: "Prompt is too long" });
    assert.match(output.errorMessage, /Prompt is too long/);
    const error = { ...output, stopReason: "error", errorMessage: normalizeClaudeOverflow(output.errorMessage) };
    assert.equal(isContextOverflow(error), true);
    assert.equal(isRetryableAssistantError(error), false);
});

test("names what an isolation failure found, bounded and without paths", () => {
    const expectation = { tools: new Set(), mcpServer: "none" };
    // Claude Code 2.1.281's built-in agents-md plugin is exactly this kind of drift.
    assert.throws(
        () => validateClaudeInitialization({ ...base, plugins: [{ name: "agents-md", path: "/opt/claude/plugins/agents-md" }] }, expectation),
        (error) => {
            assert.equal(error.code, "isolation_customizations");
            assert.equal(error.message, "Claude Code loaded unexpected customizations (plugins: agents-md)");
            return true;
        },
    );
    const many = ["a", "b", "c", "d", "e", "f", "g"];
    assert.throws(
        () => validateClaudeInitialization({ ...base, skills: ["/private/skill"], slash_commands: many }, expectation),
        /\(skills: <path>; slash_commands: a, b, c, d, e, and 2 more\)$/,
    );
    assert.throws(
        () => validateClaudeInitialization({ ...base, mcp_servers: [{ name: "rogue", status: "connected" }] }, expectation),
        /Claude Code loaded an unexpected MCP server \(rogue\)$/,
    );
});

test("names a record by its bounded type and subtype", () => {
    assert.equal(recordKind({ type: "system", subtype: "commands_changed" }), "system/commands_changed");
    assert.equal(recordKind({ type: "result" }), "result");
    assert.equal(recordKind({}), "untyped");
    assert.equal(recordKind({ type: "sys<tem>\n", subtype: 7 }), "system");
});
