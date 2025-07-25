const express = require('express');
const crypto = require('crypto');
const cors = require('cors');
const https = require('https');
const http = require('http');
const { URL } = require('url');

const app = express();
const activeStreams = new Map();

// ✅ Allow all CORS requests globally (optional)
app.use(cors());

// ✅ Handle CORS preflight requests
app.options('*', (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.sendStatus(200);
});

function generateToken() {
  return crypto.randomBytes(16).toString('hex');
}

// ✅ Generate temporary proxy URL
// ✅ Generate temporary proxy URL
app.get('/get-proxy', (req, res) => {
  const originalUrl = req.query.url;
  if (!originalUrl) {
    return res.status(400).json({ status: "error", error: 'Missing ?url=' });
  }

  try {
    const token = generateToken();
    const expiresAt = Date.now() + 3 * 60 * 60 * 1000; // 3 hours

    // ✅ Store full original URL, including path + query
    activeStreams.set(token, { fullUrl: originalUrl, expiresAt });

    res.json({
      status: "success",
      m3u8_url: `https://${req.get('host')}/stream/${token}`,
      expires_in: 10800
    });
  } catch (e) {
    return res.status(400).json({ status: "error", error: "Invalid URL" });
  }
});



// ✅ Stream proxy handler
app.use('/stream/:token/*', (req, res) => {
  const { token } = req.params;
  
  const stream = activeStreams.get(token);
  if (!stream) {
    return res.status(404).json({ error: 'Invalid or expired token' });
  }

  if (Date.now() > stream.expiresAt) {
    activeStreams.delete(token);
    return res.status(410).json({ error: 'Token expired' });
  }

  const parsedUrl = new URL(stream.fullUrl); // full signed URL

  const lib = parsedUrl.protocol === 'https:' ? https : http;

 const options = {
  hostname: parsedUrl.hostname,
  port: parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80),
  path: parsedUrl.pathname + parsedUrl.search,
  method: 'GET',
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
                  '(KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36',
    'Accept': '*/*',
    'Accept-Encoding': 'gzip, deflate, br',
    'Connection': 'keep-alive',
    'Referer': parsedUrl.origin,
    'Origin': parsedUrl.origin,
  }
};

const requestFn = parsedUrl.protocol === 'https:' ? https.request : http.request;

const proxyReq = requestFn(options, (proxyRes) => {
  res.status(proxyRes.statusCode);

  for (const [key, value] of Object.entries(proxyRes.headers)) {
    if (!key.toLowerCase().startsWith('access-control-')) {
      res.setHeader(key, value);
    }
  }

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  proxyRes.pipe(res);
});

proxyReq.on('error', (err) => {
  console.error('Proxy request failed:', err.message);
  res.status(500).json({ error: 'Proxy fetch failed' });
});

proxyReq.end(); // ✅ Move this INSIDE the route handler
});


// ✅ Optional: Debug all tokens
app.get('/_debug/tokens', (req, res) => {
  const all = [];
  for (const [token, value] of activeStreams.entries()) {
    all.push({
      token,
      baseUrl: value.baseUrl,
      expiresAt: value.expiresAt,
      expiresInSeconds: Math.floor((value.expiresAt - Date.now()) / 1000)
    });
  }
  res.json(all);
});

// ✅ Auto-remove expired tokens
setInterval(() => {
  const now = Date.now();
  for (const [token, { expiresAt }] of activeStreams.entries()) {
    if (now > expiresAt) {
      activeStreams.delete(token);
      console.log(`[Cleanup] Expired token removed: ${token}`);
    }
  }
}, 10 * 60 * 1000); // Every 10 minutes

// ✅ Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
