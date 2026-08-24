import "dotenv/config";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createMcpExpressApp } from "@modelcontextprotocol/sdk/server/express.js";
import { createServer } from "./server.js";

/**
 * 무상태(stateless) Streamable HTTP 서버.
 * PlayMCP를 포함한 대부분의 원격 MCP 클라이언트는 매 요청마다 새 커넥션을 여는
 * 무상태 모드로 충분하다 (세션 유지가 필요한 리소스 구독 기능은 안 씀).
 *
 * host를 명시적으로 '0.0.0.0'으로 지정한다. createMcpExpressApp()의 기본값은
 * host: '127.0.0.1'인데, 이 경우 SDK가 DNS 리바인딩 방지 미들웨어를 자동으로 걸어서
 * Host 헤더가 localhost/127.0.0.1/[::1]이 아닌 모든 요청을 403으로 거부한다.
 * Render 같은 공개 배포 환경에서는 헬스체크·실제 클라이언트 요청 모두 Host 헤더가
 * 서비스 도메인(예: mart-compare-mcp.onrender.com)이라서, 이 방어막에 /health까지
 * 같이 막혀 배포 헬스체크가 계속 타임아웃났다 (2026-08-25 배포 실패 원인).
 */
const app = createMcpExpressApp({ host: "0.0.0.0" });

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
