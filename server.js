const express = require('express');
const request = require('request');
const cors = require('cors');
const bodyParser = require('body-parser');

const app = express();
const PORT = process.env.PORT || 3000;

// Proxy target
const TARGET_URL = "https://others.streamfiles.eu.org/cw";
const DOMAIN_COOKIE = ".streamfiles.eu.org";

// Cookies to inject
const CUSTOM_COOKIES = [
  "verified_task=dHJ1ZQ==; path=/; domain=" + DOMAIN_COOKIE,
  "countdown_end_time=MTc1MDgyMjgzNzQ5Nw==; path=/; domain=" + DOMAIN_COOKIE
];

// Shared secret token for API access
const API_TOKEN = "abc123securetoken";

// Middleware
app.use(cors());
app.use(bodyParser.json());

// Proxy route with cookie injection
app.get('/', (req, res) => {
  request({
    url: TARGET_URL,
    headers: {
      'User-Agent': req.headers['user-agent'] || 'Mozilla/5.0',
      'Cookie': CUSTOM_COOKIES.join('; ')
    }
  })
    .on('response', function (response) {
      // Prevent caching
      res.set({
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
        'Surrogate-Control': 'no-store',
        'Content-Type': response.headers['content-type']
      });
    })
    .pipe(res);
});

// Token-authenticated API middleware
app.use('/api', (req, res, next) => {
  const token = req.query.token || (req.headers['authorization'] || '').split(' ')[1];
  if (token !== API_TOKEN) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
});

// POST /api/event endpoint
app.post('/api/event', (req, res) => {
  console.log("📥 Event received:", req.body);
  res.json({ status: 'ok', received: req.body });
});

// Optional ping endpoint
app.get('/api/ping', (req, res) => {
  res.json({ status: 'online', time: Date.now() });
});

// Start the server
app.listen(PORT, () => {
  console.log(`🚀 Proxy server running at http://localhost:${PORT}`);
});
