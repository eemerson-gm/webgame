import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import express from "express";
import { registerExcaliburTools } from "./tools/registerExcaliburTools.js";

const createConfiguredServer = (): McpServer => {
  const mcp = new McpServer({
    name: "excaliburjs-mcp-server",
    version: "1.0.0",
  });
  registerExcaliburTools(mcp);
  return mcp;
};

const startStdio = async (): Promise<void> => {
  const mcp = createConfiguredServer();
  const transport = new StdioServerTransport();
  await mcp.connect(transport);
};

const startStreamableHttp = (port: number): void => {
  const app = express();
  app.use(express.json({ limit: "2mb" }));
  app.post("/mcp", (req, res) => {
    void (async () => {
      const mcp = createConfiguredServer();
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
        enableJsonResponse: true,
      });
      res.on("close", () => {
        void transport.close();
      });
      try {
        await mcp.connect(transport);
        await transport.handleRequest(req, res, req.body);
      } finally {
        await mcp.close();
      }
    })();
  });
  app.listen(port, "127.0.0.1", () => {
    console.error(`[excaliburjs-mcp-server] http://127.0.0.1:${port}/mcp (Streamable HTTP, stateless)`);
  });
};

const run = (): void => {
  const portRaw = process.env.MCP_HTTP_PORT;
  if (portRaw !== undefined && portRaw.length > 0) {
    const port = parseInt(portRaw, 10);
    if (Number.isNaN(port) || port < 1 || port > 65535) {
      console.error("[excaliburjs-mcp-server] Invalid MCP_HTTP_PORT");
      process.exit(1);
    }
    startStreamableHttp(port);
    return;
  }
  void startStdio();
};

run();
