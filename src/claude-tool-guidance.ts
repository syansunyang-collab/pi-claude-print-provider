import type { Tool } from "@earendil-works/pi-ai";

// Claude's proposal bridge exposes JSON schemas, unlike Pi's raw-code UI.
// Keep this adaptation in the catalog view, not in the host's tool declaration.
const ORIGINAL_HEADER = "The input is raw JavaScript (not JSON, no code fence), " +
  "run as an async function body in a QuickJS sandbox:";
const CORRECTED_HEADER = 'This MCP tool takes a JSON object with one code string: {"code":"<JavaScript source>"}. ' +
  "Put raw JavaScript inside the code field, without a markdown code fence. " +
  "The script runs as an async function body in a QuickJS sandbox:";
const USAGE_EXAMPLE = "\n\nWhen inspecting multiple independent files or commands, " +
  "prefer one codemode script to separate MCP read/bash calls, " +
  "including when those MCP calls could already run in parallel. " +
  "This lets the script combine or filter results before they enter the model context. " +
  "Inside the script use original Pi names such as tools.read and tools.bash, not MCP transport names. " +
  "For example, pass this JavaScript in the code field:\n" +
  'const paths = ["PROJECT.md", "STATUS.md"];\n' +
  "const results = await Promise.allSettled(paths.map(path => tools.read({path})));\n" +
  "results.forEach((result, i) => text({path: paths[i], result}));";

export function claudeToolDescription(tool: Tool): string {
  if (tool.name !== "codemode") return tool.description;
  return tool.description.replace(ORIGINAL_HEADER, CORRECTED_HEADER) + USAGE_EXAMPLE;
}
