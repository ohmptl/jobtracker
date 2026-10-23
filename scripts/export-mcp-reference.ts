import { writeFileSync } from "node:fs";
import { z } from "zod";
import { toolSchemas, type Operation } from "../lib/tracker/schemas";
import { descriptions } from "../lib/tracker/mcp";
import { INTEGRATION_VERSION } from "../lib/tracker/integration-diagnostics";
const ownerOnly = new Set([
  "grant_client",
  "revoke_client",
  "clear_history",
]);
const tools = Object.entries(toolSchemas)
  .filter(([name]) => !ownerOnly.has(name))
  .map(([name, schema]) => ({
    name,
    description: descriptions[name as Operation] || name.replaceAll("_", " "),
    inputSchema: z.toJSONSchema(schema, { io: "input" }),
  }));
writeFileSync(
  "docs/mcp-tools.json",
  JSON.stringify({ version: INTEGRATION_VERSION, tools }, null, 2) + "\n",
);
