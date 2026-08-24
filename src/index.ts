import "dotenv/config";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createMcpExpressApp } from "@modelcontextprotocol/sdk/server/express.js";
import { createServer } from "./server.js";

/**
 * 무상태(stateless) Streamable HTTP 서버.
 * PlayMCP를 포함한 대부분의 원격 MCP 클라이언트는 매 요청마다 새 커넥션을 여는
 * 무상태 모드로 충분하다 (세션 유지가 필요한 리소스 구독 기능은 안 씀).
 */
const app = createMcpExpressApp();

app.post("/mcp", async (req, res) => {
  const server = createServer();
  try {
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    });
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
    res.on("close", () => {
      transport.close();
      server.close();
    });
  } catch (error) {
    console.error("MCP 요청 처리 중 오류:", error);
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: "2.0",
        error: { code: -32603, message: "Internal server error" },
        id: null,
      });
    }
  }
});

// GET/DELETE는 세션 기반(SSE 재연결/명시적 종료) 기능인데 무상태 모드라 지원 안 함
app.get("/mcp", (_req, res) => {
  res.writeHead(405).end(
    JSON.stringify({
      jsonrpc: "2.0",
      error: { code: -32000, message: "Method not allowed (stateless server)." },
      id: null,
    })
  );
});

app.delete("/mcp", (_req, res) => {
  res.writeHead(405).end(
    JSON.stringify({
      jsonrpc: "2.0",
      error: { code: -32000, message: "Method not allowed (stateless server)." },
      id: null,
    })
  );
});

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

const PORT = Number(process.env.PORT ?? 3000);
app.listen(PORT, () => {
  console.log(`mart-compare-mcp listening on port ${PORT} (endpoint: /mcp)`);
});

process.on("SIGINT", () => {
  console.log("서버 종료");
  process.exit(0);
});
