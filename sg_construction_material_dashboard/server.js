const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

let fetchFn = global.fetch;
try { if (!fetchFn) fetchFn = require('node-fetch'); } catch (_) {}

const PORT = process.env.PORT || 8082;
const ROOT = __dirname;

const DATASET_1 = 'd_29f7b431ad79f61f19a731a6a86b0247';
const DATASET_2 = 'd_f0d327721805672aa181014c6ea821ec';

const DATASET_META = {
  [DATASET_1]: {
    shortName: 'Dataset 1',
    title: 'Construction Material Market Prices, Monthly',
    source: 'BCA / SingStat via data.gov.sg',
    url: 'https://data.gov.sg/datasets/d_29f7b431ad79f61f19a731a6a86b0247/view'
  },
  [DATASET_2]: {
    shortName: 'Dataset 2',
    title: 'Import Price Index, By Commodity Group, Monthly',
    source: 'SingStat via data.gov.sg',
    url: 'https://data.gov.sg/datasets/d_f0d327721805672aa181014c6ea821ec/view'
  }
};

const SERIES_CONFIG = [
  { key: 'cement', group: 'construction', dataset: DATASET_1, name: 'Cement', unit: 'S$ / tonne', color: '#38bdf8', required: ['cement'], exclude: [] },
  { key: 'steel_rebar', group: 'construction', dataset: DATASET_1, name: 'Steel Rebar', unit: 'S$ / tonne', color: '#fb7185', required: ['steel', 'reinforcement'], exclude: [] },
  { key: 'granite_aggregate', group: 'construction', dataset: DATASET_1, name: 'Granite Aggregate', unit: 'S$ / tonne', color: '#a78bfa', required: ['granite'], exclude: [] },
  { key: 'sand', group: 'construction', dataset: DATASET_1, name: 'Sand', unit: 'S$ / tonne', color: '#fbbf24', required: ['sand'], exclude: [] },
  { key: 'ready_mixed_concrete', group: 'construction', dataset: DATASET_1, name: 'Ready-mixed Concrete', unit: 'S$ / m³', color: '#34d399', required: ['ready', 'mixed', 'concrete'], exclude: [] },

  { key: 'crude_oil', group: 'import', dataset: DATASET_2, name: 'Crude Oil', unit: 'Index, 2023=100', color: '#f59e0b', required: ['petroleum', 'oils', 'bituminous', 'minerals', 'crude'], exclude: [] },
  { key: 'copper', group: 'import', dataset: DATASET_2, name: 'Copper', unit: 'Index, 2023=100', color: '#fb7185', required: ['copper'], exclude: [] },
  { key: 'aluminium', group: 'import', dataset: DATASET_2, name: 'Aluminium', unit: 'Index, 2023=100', color: '#38bdf8', required: ['aluminium'], exclude: [] },
  { key: 'steel', group: 'import', dataset: DATASET_2, name: 'Steel', unit: 'Index, 2023=100', color: '#34d399', required: ['iron', 'steel', 'bars', 'rods', 'angles', 'shapes', 'sections'], exclude: [] }
];

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml'
};

function send(res, status, body, headers = {}) {
  res.writeHead(status, {
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'no-store',
    ...headers
  });
  res.end(body);
}

function sendJson(res, status, obj) {
  send(res, status, JSON.stringify(obj, null, 2), { 'Content-Type': 'application/json; charset=utf-8' });
}

function normalise(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/&amp;/g, 'and')
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function parseNumber(value) {
  if (value === null || value === undefined) return NaN;
  const s = String(value).replace(/,/g, '').trim();
  if (!s || s === '-' || /^na$/i.test(s)) return NaN;
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
}

function parseMonthColumn(key) {
  const raw = String(key || '').trim();
  const compact = raw.replace(/[\s_-]+/g, '');
  const monthMap = {
    jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
    jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12'
  };
  let m = compact.match(/^((?:19|20)\d{2})(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)$/i);
  if (m) return `${m[1]}-${monthMap[m[2].toLowerCase()]}-01`;
  m = raw.match(/^((?:19|20)\d{2})\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)$/i);
  if (m) return `${m[1]}-${monthMap[m[2].toLowerCase()]}-01`;
  return null;
}

function getRowLabel(record) {
  const preferredKeys = ['DataSeries', 'Data Series', 'data_series', 'dataseries'];
  for (const key of preferredKeys) {
    if (record[key]) return String(record[key]);
  }
  for (const [key, value] of Object.entries(record)) {
    if (String(key).startsWith('_')) continue;
    if (parseMonthColumn(key)) continue;
    if (typeof value === 'string' && value.trim()) return value;
  }
  return '';
}

function scoreRecord(record, config) {
  const label = normalise(getRowLabel(record));
  let score = 0;
  for (const token of config.required) {
    if (label.includes(normalise(token))) score += 10;
  }
  for (const token of config.exclude || []) {
    if (label.includes(normalise(token))) score -= 20;
  }
  // Specific nudges for ambiguous terms.
  if (config.key === 'sand' && label.includes('concreting sand')) score += 10;
  if (config.key === 'steel_rebar' && label.includes('steel reinforcement bars')) score += 20;
  if (config.key === 'ready_mixed_concrete' && label.includes('ready mixed concrete')) score += 20;
  if (config.key === 'crude_oil' && label.includes('petroleum oils') && label.includes('crude')) score += 20;
  if (config.key === 'steel' && label.includes('iron and steel bars')) score += 20;
  return score;
}

function findMatchingRecord(records, config) {
  let best = null;
  let bestScore = -Infinity;
  for (const record of records) {
    const score = scoreRecord(record, config);
    if (score > bestScore) {
      best = record;
      bestScore = score;
    }
  }
  const minimum = Math.min(config.required.length * 10, 20);
  if (!best || bestScore < minimum) {
    const labels = records.map(getRowLabel).filter(Boolean).slice(0, 30);
    throw new Error(`No good match for ${config.name}. Best score ${bestScore}. Sample rows: ${labels.join(' | ')}`);
  }
  return { record: best, score: bestScore };
}

function recordToSeries(record) {
  const rows = [];
  for (const [key, value] of Object.entries(record)) {
    const date = parseMonthColumn(key);
    if (!date) continue;
    const price = parseNumber(value);
    if (Number.isFinite(price)) rows.push({ date, price });
  }
  rows.sort((a, b) => a.date.localeCompare(b.date));
  return rows;
}

async function fetchDataGovRows(datasetId) {
  if (!DATASET_META[datasetId]) throw new Error(`Dataset not allowed: ${datasetId}`);
  if (!fetchFn) throw new Error('Fetch is unavailable. Use Node 18+ or run npm install to install node-fetch.');

  const all = [];
  let offset = 0;
  const limit = 1000;
  let total = Infinity;

  while (offset < total) {
    const apiUrl = new URL('https://data.gov.sg/api/action/datastore_search');
    apiUrl.searchParams.set('resource_id', datasetId);
    apiUrl.searchParams.set('limit', String(limit));
    apiUrl.searchParams.set('offset', String(offset));

    const response = await fetchFn(apiUrl.toString(), {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0 sg-data-dashboard-local'
      }
    });

    const text = await response.text();
    if (!response.ok) {
      throw new Error(`data.gov.sg HTTP ${response.status}: ${text.slice(0, 300)}`);
    }

    let payload;
    try { payload = JSON.parse(text); }
    catch (err) { throw new Error(`data.gov.sg returned non-JSON: ${text.slice(0, 300)}`); }

    if (!payload.success) {
      throw new Error(payload.error?.message || payload.error || 'data.gov.sg returned success=false');
    }

    const result = payload.result || {};
    const records = result.records || [];
    all.push(...records);
    total = Number(result.total ?? all.length);
    offset += records.length;
    if (!records.length) break;
  }

  return all;
}

async function buildSeriesPayload() {
  const recordsByDataset = {};
  for (const datasetId of [DATASET_1, DATASET_2]) {
    recordsByDataset[datasetId] = await fetchDataGovRows(datasetId);
  }

  const series = [];
  const diagnostics = [];

  for (const config of SERIES_CONFIG) {
    const records = recordsByDataset[config.dataset] || [];
    const { record, score } = findMatchingRecord(records, config);
    const data = recordToSeries(record);
    if (!data.length) throw new Error(`${config.name} matched row but no month columns were parsed.`);
    const meta = DATASET_META[config.dataset];
    series.push({
      key: config.key,
      group: config.group,
      name: config.name,
      unit: config.unit,
      color: config.color,
      source: meta.title,
      sourceAgency: meta.source,
      sourceUrl: meta.url,
      originalRow: getRowLabel(record),
      observations: data.length,
      startDate: data[0].date,
      endDate: data[data.length - 1].date,
      data
    });
    diagnostics.push({
      key: config.key,
      name: config.name,
      matchedRow: getRowLabel(record),
      score,
      observations: data.length,
      first: data[0],
      latest: data[data.length - 1],
      sampleColumns: Object.keys(record).slice(0, 12)
    });
  }

  return {
    generatedAt: new Date().toISOString(),
    datasets: DATASET_META,
    recordCounts: Object.fromEntries(Object.entries(recordsByDataset).map(([id, rows]) => [id, rows.length])),
    series,
    diagnostics
  };
}

async function handleApi(reqUrl, res) {
  if (reqUrl.pathname === '/api/health') {
    return sendJson(res, 200, {
      ok: true,
      app: 'Singapore materials data.gov.sg dashboard',
      node: process.version,
      fetchAvailable: Boolean(fetchFn),
      endpoints: ['/api/series', `/api/raw/${DATASET_1}`, `/api/raw/${DATASET_2}`]
    });
  }

  if (reqUrl.pathname === '/api/series') {
    try { return sendJson(res, 200, await buildSeriesPayload()); }
    catch (err) { return sendJson(res, 502, { error: err.message || String(err) }); }
  }

  if (reqUrl.pathname.startsWith('/api/raw/')) {
    const datasetId = reqUrl.pathname.split('/').pop();
    try {
      const rows = await fetchDataGovRows(datasetId);
      return sendJson(res, 200, {
        datasetId,
        meta: DATASET_META[datasetId],
        count: rows.length,
        fields: rows[0] ? Object.keys(rows[0]) : [],
        sampleLabels: rows.map(getRowLabel).filter(Boolean).slice(0, 20),
        sample: rows.slice(0, 5)
      });
    } catch (err) {
      return sendJson(res, 502, { error: err.message || String(err), datasetId });
    }
  }

  return null;
}

const server = http.createServer(async (req, res) => {
  const reqUrl = new URL(req.url, `http://localhost:${PORT}`);
  if (reqUrl.pathname.startsWith('/api/')) {
    const handled = await handleApi(reqUrl, res);
    if (handled !== null) return;
  }

  let filePath = reqUrl.pathname === '/' ? path.join(ROOT, 'index.html') : path.join(ROOT, reqUrl.pathname);
  filePath = path.normalize(filePath);
  if (!filePath.startsWith(ROOT)) return send(res, 403, 'Forbidden', { 'Content-Type': 'text/plain' });

  fs.readFile(filePath, (err, data) => {
    if (err) return send(res, 404, 'Not found', { 'Content-Type': 'text/plain' });
    const ext = path.extname(filePath).toLowerCase();
    return send(res, 200, data, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
  });
});

server.listen(PORT, () => {
  console.log(`Singapore data.gov.sg dashboard running at http://localhost:${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/api/health`);
  console.log(`Series API:   http://localhost:${PORT}/api/series`);
});
