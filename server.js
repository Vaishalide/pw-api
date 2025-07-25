// server.js
const express = require('express');
const crypto = require('crypto');
const cors = require('cors');
const https = require('https');
const http = require('http');
const { URL } = require('url');

const app = express();
const activeStreams = new Map();

app.use(cors());

function generateToken() {
  return crypto.randomBytes(16).toString('hex');
}

// Generate temporary proxy URL
app.get('/get-proxy', (req, res) => {
  const originalUrl = req.query.url;
  if (!originalUrl) {
    return res.status(400).json({ error: 'Missing ?url=' });
  }

  try {
    const baseUrl = originalUrl.replace(/\/[^\/?#]+(\?.*)?$/, '/'); // Keep full signed path
    const token = generateToken();
    const expiresAt = Date.now() + 3 * 60 * 60 * 1000; // 3 hours

    activeStreams.set(token, { baseUrl, expiresAt });

    res.json({
      proxy_url: `${req.protocol}://${req.get('host')}/stream/${token}/master.mpd`,
      expires_in: 10800 // seconds
    });
  } catch (e) {
    res.status(400).json({ error: 'Invalid URL' });
  }
});

// Serve MPD & segment content using token
app.use('/stream/:token/*', (req, res) => {
  const { token } = req.params;
  const filePath = req.params[0];

  console.log(`🔍 Incoming request with token: ${token}`);
  console.log(`📦 Active tokens:`, Array.from(activeStreams.keys()));

  const stream = activeStreams.get(token);

  if (!stream) {
    console.warn(`❌ Token not found: ${token}`);
    return res.status(404).json({ error: 'Invalid or expired token' });
  }

  if (Date.now() > stream.expiresAt) {
    activeStreams.delete(token);
    console.warn(`⏰ Token expired: ${token}`);
    return res.status(410).json({ error: 'Token expired' });
  }

  const targetUrl = stream.baseUrl + filePath;
  console.log(`[Proxy] ${req.originalUrl} → ${targetUrl}`);

  const parsedUrl = new URL(targetUrl);
  const lib = parsedUrl.protocol === 'https:' ? https : http;

  const proxyReq = lib.get(parsedUrl, (proxyRes) => {
    res.status(proxyRes.statusCode);
    for (const [key, value] of Object.entries(proxyRes.headers)) {
      res.setHeader(key, value);
    }
    proxyRes.pipe(res);
  });

  proxyReq.on('error', (err) => {
    console.error('Proxy request failed:', err.message);
    res.status(500).json({ error: 'Proxy fetch failed' });
  });
});

// Optional: List tokens
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

// Cleanup expired tokens
setInterval(() => {
  const now = Date.now();
  for (const [token, { expiresAt }] of activeStreams.entries()) {
    if (now > expiresAt) {
      activeStreams.delete(token);
      console.log(`[Cleanup] Expired token removed: ${token}`);
    }
  }
}, 10 * 60 * 1000);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
