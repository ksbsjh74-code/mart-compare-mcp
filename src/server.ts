import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerTools } from "./tools/compareProducts.js";

export function createServer(): McpServer {
  const server = new McpServer({
    name: "mart-compare-mcp",
    version: "0.1.0",
  });

  registerTools(server);

  return server;
}
