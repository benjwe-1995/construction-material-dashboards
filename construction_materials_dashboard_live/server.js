const http = require("http");
const fs = require("fs");
const path = require("path");
const { URL } = require("url");

const PORT = process.env.PORT || 8081;
const ROOT = __dirname;

const allowedSeries = new Set([
  "PCU327320327320", // Concrete
  "WPU1321", // Sand, gravel, crushed stone
  "PCU33343334", // HVAC and commercial refrigeration equipment
  "WPU1148", // Air conditioning and refrigeration equipment
  "PCU3261223261221", // Plastics pipe
  "WPU117409", // Power and distribution transformers
  "PCU3339213339211", // Elevators and moving stairways
  "WPU1173" // Motors, generators, motor generator sets
]);

function send(res, status, body, contentType = "application/json") {
  res.writeHead(status, {
    "Content-Type": contentType,
    "Access-Control-Allow-Origin": "*",
    "Cache-Control": "no-store"
  });
  res.end(body);
}

function parseFredCsv(csv) {
  const lines = csv.trim().split(/\r?\n/);
  const data = [];

  for (let i = 1; i < lines.length; i++) {
    const [date, rawValue] = lines[i].split(",");
    if (!date || !rawValue || rawValue === ".") continue;

    const value = Number(rawValue);
    if (Number.isFinite(value)) {
      data.push({ date, value });
    }
  }

  return data;
}

async function handleFred(res, series) {
  if (!allowedSeries.has(series)) {
    return send(res, 400, JSON.stringify({ error: "Series not allowed" }));
  }

  const url = `https://fred.stlouisfed.org/graph/fredgraph.csv?id=${encodeURIComponent(series)}`;

  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 construction-dashboard"
      }
    });

    if (!response.ok) {
      throw new Error(`FRED HTTP ${response.status}`);
    }

    const csv = await response.text();
    const data = parseFredCsv(csv);

    return send(
      res,
      200,
      JSON.stringify({
        series,
        source: "FRED / U.S. Bureau of Labor Statistics",
        source_url: url,
        data
      })
    );
  } catch (err) {
    return send(
      res,
      502,
      JSON.stringify({
        error: err.message,
        series,
        source_url: url
      })
    );
  }
}

const server = http.createServer(async (req, res) => {
  const parsed = new URL(req.url, `http://localhost:${PORT}`);

  if (parsed.pathname.startsWith("/api/fred/")) {
    const series = parsed.pathname.split("/").pop();
    return handleFred(res, series);
  }

  let filePath =
    parsed.pathname === "/"
      ? path.join(ROOT, "index.html")
      : path.join(ROOT, parsed.pathname);

  filePath = path.normalize(filePath);

  if (!filePath.startsWith(ROOT)) {
    return send(res, 403, "Forbidden", "text/plain");
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      return send(res, 404, "Not found", "text/plain");
    }

    const ext = path.extname(filePath).toLowerCase();

    const contentTypes = {
      ".html": "text/html",
      ".css": "text/css",
      ".js": "text/javascript",
      ".json": "application/json",
      ".png": "image/png",
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".svg": "image/svg+xml"
    };

    const type = contentTypes[ext] || "application/octet-stream";

    return send(res, 200, data, type);
  });
});

server.listen(PORT, () => {
  console.log(`Construction materials dashboard running on port ${PORT}`);
});
