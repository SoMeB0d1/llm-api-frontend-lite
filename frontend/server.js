import http from "http";
import path from "path";
import { fileURLToPath } from "url";
import { readFileSync } from "fs";
import { readFile } from "fs/promises";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function loadEnvFromFile() {
  try {
    const envPath = path.join(__dirname, "..", ".env");
    const raw = readFileSync(envPath, "utf-8");
    raw.split(/\r?\n/).forEach((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) {
        return;
      }
      const idx = trimmed.indexOf("=");
      if (idx === -1) {
        return;
      }
      const key = trimmed.slice(0, idx).trim();
      const value = trimmed.slice(idx + 1).trim();
      if (key && !process.env[key]) {
        process.env[key] = value;
      }
    });
  } catch (error) {
    // Ignore missing .env
  }
}

loadEnvFromFile();

const port = Number(process.env.FRONTEND_PORT || 3000);
const backendPort = Number(process.env.BACKEND_PORT || 8787);
const backendUrl = process.env.BACKEND_URL || `http://localhost:${backendPort}`;
const publicDir = __dirname;

const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".json": "application/json; charset=utf-8",
};

function send(res, status, body, type) {
  res.writeHead(status, { "Content-Type": type || "text/plain; charset=utf-8" });
  res.end(body);
}

async function readJsonBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString("utf-8");
  if (!raw.trim()) {
    return null;
  }
  return JSON.parse(raw);
}

async function readRawBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

function safePath(urlPath) {
  const cleaned = urlPath.split("?")[0];
  let relative = cleaned === "/" ? "/token_check/token_check.html" : cleaned;
  if (cleaned === "/login" || cleaned === "/login/") {
    relative = "/login/login.html";
  }
  if (cleaned === "/token_check" || cleaned === "/token_check/") {
    relative = "/token_check/token_check.html";
  }
  const withIndex = relative.endsWith("/") ? `${relative}index.html` : relative;
  const decoded = decodeURIComponent(withIndex);
  const resolved = path.normalize(path.join(publicDir, decoded));
  if (!resolved.startsWith(publicDir)) {
    return null;
  }
  return resolved;
}

async function handleChat(req, res) {
  try {
    const body = await readJsonBody(req);
    if (!body) {
      send(res, 400, "{\"error\":\"empty_body\"}", "application/json");
      return;
    }

    const upstream = await fetch(`${backendUrl}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    const upstreamContentType = upstream.headers.get("content-type") || "application/json";
    const upstreamConversationId = upstream.headers.get("x-conversation-id");

    // SSE 流式透传
    if (upstreamContentType.startsWith("text/event-stream")) {
      const headers = {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      };
      if (upstreamConversationId) {
        headers["X-Conversation-Id"] = upstreamConversationId;
      }
      res.writeHead(upstream.status, headers);
      const reader = upstream.body;
      reader.on("data", (chunk) => {
        res.write(chunk);
      });
      reader.on("end", () => {
        res.end();
      });
      reader.on("error", (err) => {
        res.end();
      });
      return;
    }

    const text = await upstream.text();
    const headers = {
      "Content-Type": upstreamContentType,
    };
    if (upstreamConversationId) {
      headers["X-Conversation-Id"] = upstreamConversationId;
    }
    res.writeHead(upstream.status, headers);
    res.end(text);
  } catch (error) {
    send(
      res,
      502,
      JSON.stringify({ error: "proxy_error", message: error.message }),
      "application/json"
    );
  }
}

async function handleTitle(req, res) {
  try {
    const body = await readJsonBody(req);
    if (!body) {
      send(res, 400, "{\"error\":\"empty_body\"}", "application/json");
      return;
    }

    const upstream = await fetch(`${backendUrl}/title`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const text = await upstream.text();
    res.writeHead(upstream.status, {
      "Content-Type": upstream.headers.get("content-type") || "application/json",
    });
    res.end(text);
  } catch (error) {
    send(
      res,
      502,
      JSON.stringify({ error: "proxy_error", message: error.message }),
      "application/json"
    );
  }
}

async function handleHistory(req, res) {
  try {
    const body = await readJsonBody(req);
    if (!body) {
      send(res, 400, "{\"error\":\"empty_body\"}", "application/json");
      return;
    }

    const upstream = await fetch(`${backendUrl}/history`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const text = await upstream.text();
    res.writeHead(upstream.status, {
      "Content-Type": upstream.headers.get("content-type") || "application/json",
    });
    res.end(text);
  } catch (error) {
    send(
      res,
      502,
      JSON.stringify({ error: "proxy_error", message: error.message }),
      "application/json"
    );
  }
}

async function handleHistoryTopic(req, res) {
  try {
    const body = await readJsonBody(req);
    if (!body) {
      send(res, 400, "{\"error\":\"empty_body\"}", "application/json");
      return;
    }

    const upstream = await fetch(`${backendUrl}/history/topic`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const text = await upstream.text();
    res.writeHead(upstream.status, {
      "Content-Type": upstream.headers.get("content-type") || "application/json",
    });
    res.end(text);
  } catch (error) {
    send(
      res,
      502,
      JSON.stringify({ error: "proxy_error", message: error.message }),
      "application/json"
    );
  }
}

async function handleV1Proxy(req, res) {
  try {
    const targetUrl = `${backendUrl}${req.url}`;
    const headers = {};
    if (req.headers["content-type"]) {
      headers["Content-Type"] = req.headers["content-type"];
    }
    const body = ["GET", "HEAD"].includes(req.method || "")
      ? undefined
      : await readRawBody(req);
    const upstream = await fetch(targetUrl, {
      method: req.method,
      headers,
      body,
    });
    const buffer = Buffer.from(await upstream.arrayBuffer());
    res.writeHead(upstream.status, {
      "Content-Type": upstream.headers.get("content-type") || "application/json",
    });
    res.end(buffer);
  } catch (error) {
    send(
      res,
      502,
      JSON.stringify({ error: "proxy_error", message: error.message }),
      "application/json"
    );
  }
}

async function handleStatic(req, res) {
  const resolved = safePath(req.url || "/");
  if (!resolved) {
    send(res, 403, "Forbidden");
    return;
  }
  try {
    const data = await readFile(resolved);
    const ext = path.extname(resolved).toLowerCase();
    send(res, 200, data, contentTypes[ext] || "application/octet-stream");
  } catch (error) {
    send(res, 404, "Not Found");
  }
}

const server = http.createServer(async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.url === "/chat" && req.method === "POST") {
    await handleChat(req, res);
    return;
  }
  if (req.url === "/history" && req.method === "POST") {
    await handleHistory(req, res);
    return;
  }
  if (req.url === "/history/topic" && req.method === "POST") {
    await handleHistoryTopic(req, res);
    return;
  }
  if (req.url === "/title" && req.method === "POST") {
    await handleTitle(req, res);
    return;
  }
  if (req.url && (req.url.startsWith("/v1") || req.url.startsWith("/auth"))) {
    await handleV1Proxy(req, res);
    return;
  }
  await handleStatic(req, res);
});

server.listen(port);
