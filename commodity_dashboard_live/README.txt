Commodity Dashboard - Live Data Troubleshooting Version

Why the previous HTML used fallback data:
- Browser fetches from a local/static HTML file are commonly blocked by CORS.
- Yahoo Finance does not provide reliable public CORS-enabled browser API access.
- Public CORS proxies are unreliable, rate-limited, or blocked.

How to run with live data:
1. Install Node.js 18 or later.
2. Open Terminal / Command Prompt in this folder.
3. Run: node server.js
4. Open: http://localhost:8080

Why this works:
- Your browser fetches /api/proxy on localhost.
- server.js fetches Yahoo/Stooq data server-side, where CORS is not an issue.
- The browser receives the data from your own localhost server.
