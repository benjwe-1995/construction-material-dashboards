const http = require("http");
const fs = require("fs");
const path = require("path");
const { URL } = require("url");

const PORT = process.env.PORT || 8080;
const ROOT = __dirname;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml"
};

function send(res, status, body, headers = {}) {
  res.writeHead(status, {
    "Access-Control-Allow-Origin": "*",
    "Cache-Control": "no-store",
    ...headers
  });
  res.end(body);
}

async function proxyFetch(target, res) {
  try {
    if (!target) {
      return send(
        res,
        400,
        JSON.stringify({ error: "Missing url" }),
        { "Content-Type": "application/json" }
      );
    }

    const allowedHosts = new Set([
      "query1.finance.yahoo.com",
      "query2.finance.yahoo.com",
      "stooq.com",
      "stooq.pl"
    ]);

    const targetUrl = new URL(target);

    if (!allowedHosts.has(targetUrl.hostname)) {
      return send(
        res,
        400,
        JSON.stringify({ error: "Host not allowed", host: targetUrl.hostname }),
        { "Content-Type": "application/json" }
      );
    }

    const response = await fetch(targetUrl.toString(), {
      headers: {
        "User-Agent": "Mozilla/5.0 commodity-dashboard",
        "Accept": "application/json,text/csv,text/plain,*/*",
        "Referer": "https://finance.yahoo.com/"
      }
    });

    const text = await response.text();

    return send(
      res,
      response.status,
      text,
      {
        "Content-Type":
          response.headers.get("content-type") || "text/plain; charset=utf-8"
      }
    );
  } catch (err) {
    return send(
      res,
      502,
      JSON.stringify({
        error: err.message || String(err)
      }),
      { "Content-Type": "application/json" }
    );
  }
}

const server = http.createServer((req, res) => {
  const reqUrl = new URL(req.url, `http://localhost:${PORT}`);

  if (reqUrl.pathname === "/api/proxy") {
    const target = reqUrl.searchParams.get("url");
    return proxyFetch(target, res);
  }

  let filePath =
    reqUrl.pathname === "/"
      ? path.join(ROOT, "index.html")
      : path.join(ROOT, reqUrl.pathname);

  filePath = path.normalize(filePath);

  if (!filePath.startsWith(ROOT)) {
    return send(res, 403, "Forbidden", { "Content-Type": "text/plain" });
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      return send(res, 404, "Not found", { "Content-Type": "text/plain" });
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME[ext] || "application/octet-stream";

    return send(res, 200, data, { "Content-Type": contentType });
  });
});

server.listen(PORT, () => {
  console.log(`Commodity dashboard running on port ${PORT}`);
});
