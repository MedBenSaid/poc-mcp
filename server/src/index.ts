import cors from "cors";
import express, { type Request, type Response } from "express";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { listCountrySummaries } from "./countries.js";
import { createMcpServer } from "./mcp.js";
import {
  addSseClient,
  getSessionCount,
  getSessionSnapshot,
  getSseClientCount,
  normalizeSessionId,
  removeSseClient,
} from "./store.js";

const PORT = Number(process.env.PORT) || 3001;
const HEARTBEAT_INTERVAL_MS = 25_000;

const app = express();

app.use(
  cors({
    origin: "*",
    exposedHeaders: ["Mcp-Session-Id"],
  })
);
app.use(express.json());

function extractSessionId(req: Request): string {
  return normalizeSessionId(req.query.session);
}

function getPublicBaseUrl(req: Request): string {
  if (process.env.PUBLIC_URL) {
    return process.env.PUBLIC_URL.replace(/\/$/, "");
  }

  const rawForwardedHost = req.headers["x-forwarded-host"];
  const forwardedHost = (Array.isArray(rawForwardedHost) ? rawForwardedHost[0] : rawForwardedHost)
    ?.split(",")[0]
    ?.trim();

  const rawForwardedProto = req.headers["x-forwarded-proto"];
  const forwardedProto = (Array.isArray(rawForwardedProto) ? rawForwardedProto[0] : rawForwardedProto)
    ?.split(",")[0]
    ?.trim();

  const host = forwardedHost || req.headers.host;
  if (!host || host === `localhost:${PORT}` || host === `127.0.0.1:${PORT}`) {
    return process.env.CLIENT_URL?.replace(/\/$/, "") || "http://localhost:5173";
  }

  const proto =
    forwardedProto ||
    (host.endsWith(".trycloudflare.com") || host.includes("ngrok") ? "https" : req.protocol || "http");

  return `${proto}://${host}`;
}

app.get("/health", (_req: Request, res: Response) => {
  res.json({
    status: "ok",
    sessions: getSessionCount(),
    sseClients: getSseClientCount(),
    countriesCount: listCountrySummaries().length,
  });
});

app.get("/session", (req: Request, res: Response) => {
  const session = extractSessionId(req);
  res.json(getSessionSnapshot(session));
});

app.get("/events", (req: Request, res: Response) => {
  const session = extractSessionId(req);

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();

  addSseClient(session, res);
  res.write(`event: connected\ndata: ${JSON.stringify({ status: "connected", session })}\n\n`);

  const heartbeat = setInterval(() => {
    try {
      res.write(": ping\n\n");
    } catch {
      clearInterval(heartbeat);
      removeSseClient(session, res);
    }
  }, HEARTBEAT_INTERVAL_MS);

  req.on("close", () => {
    clearInterval(heartbeat);
    removeSseClient(session, res);
  });
});

app.post("/mcp", async (req: Request, res: Response) => {
  const baseUrl = getPublicBaseUrl(req);
  const server = createMcpServer(baseUrl);
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
  });

  res.on("close", () => {
    void transport.close().catch(() => {});
    void server.close().catch(() => {});
  });

  try {
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (error) {
    console.error("Erreur lors du traitement de la requête MCP :", error);
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: "2.0",
        error: {
          code: -32603,
          message: "Internal server error",
        },
        id: null,
      });
    }
  }
});

const methodNotAllowedHandler = (_req: Request, res: Response) => {
  res.status(405).json({
    jsonrpc: "2.0",
    error: {
      code: -32000,
      message: "Method not allowed.",
    },
    id: null,
  });
};

app.get("/mcp", methodNotAllowedHandler);
app.delete("/mcp", methodNotAllowedHandler);

app.listen(PORT, () => {
  console.log(`Serveur MCP Workspace Pays prêt sur http://localhost:${PORT}`);
  console.log(`  - MCP     : POST http://localhost:${PORT}/mcp`);
  console.log(`  - SSE     : GET  http://localhost:${PORT}/events?session=...`);
  console.log(`  - Session : GET  http://localhost:${PORT}/session?session=...`);
  console.log(`  - Santé   : GET  http://localhost:${PORT}/health (${listCountrySummaries().length} fiches pays)`);
});
