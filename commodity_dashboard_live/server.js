const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');
const PORT = process.env.PORT || 8080;
const ROOT = __dirname;
const MIME = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8'};
function send(res, status, body, headers={}) { res.writeHead(status, {'Access-Control-Allow-Origin':'*', ...headers}); res.end(body); }
async function proxyFetch(target, res) {
  try {
    const allowed = ['query1.finance.yahoo.com','query2.finance.yahoo.com','stooq.com'];
    const u = new URL(target);
    if (!allowed.includes(u.hostname)) return send(res, 400, JSON.stringify({error:'Host not allowed'}), {'Content-Type':'application/json'});
    const r = await fetch(target, {headers:{'User-Agent':'Mozilla/5.0 commodity-dashboard-local/1.0','Accept':'application/json,text/csv,text/plain,*/*','Referer':'https://finance.yahoo.com/'}});
    const text = await r.text();
    send(res, r.status, text, {'Content-Type': r.headers.get('content-type') || 'text/plain; charset=utf-8'});
  } catch (err) { send(res, 502, JSON.stringify({error:String(err.message || err)}), {'Content-Type':'application/json'}); }
}
http.createServer((req, res) => {
  const reqUrl = new URL(req.url, `http://localhost:${PORT}`);
  if (reqUrl.pathname === '/api/proxy') {
    const target = reqUrl.searchParams.get('url');
    if (!target) return send(res, 400, JSON.stringify({error:'Missing url'}), {'Content-Type':'application/json'});
    return proxyFetch(target, res);
  }
  let filePath = reqUrl.pathname === '/' ? path.join(ROOT, 'index.html') : path.join(ROOT, reqUrl.pathname);
  if (!filePath.startsWith(ROOT)) return send(res, 403, 'Forbidden');
  fs.readFile(filePath, (err, data) => {
    if (err) return send(res, 404, 'Not found');
    send(res, 200, data, {'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream'});
  });
}).listen(PORT, () => console.log(`Commodity dashboard running at http://localhost:${PORT}`));
