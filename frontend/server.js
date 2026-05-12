import http from "http";
import path from "path";
import { fileURLToPath } from "url";
import { readFile } from "fs/promises";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const port = Number(process.env.FRONTEND_PORT || 3000);
const backendUrl = process.env.BACKEND_URL || "http://localhost:8787";
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

function safePath(urlPath) {
  const cleaned = urlPath.split("?")[0];
  const relative = cleaned === "/" ? "/index.html" : cleaned;
  const decoded = decodeURIComponent(relative);
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
  if (req.url === "/chat" && req.method === "POST") {
    await handleChat(req, res);
    return;
  }
  await handleStatic(req, res);
});

server.listen(port, () => {
  console.log(`Frontend server running on http://localhost:${port}`);
});
