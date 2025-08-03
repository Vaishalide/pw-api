const express = require('express');
const crypto = require('crypto');
const cors = require('cors');
const https = require('https');
const http = require('http');
const { URL } = require('url');
const { createClient } = require('redis'); // ✅ 1. Import Redis client

const app = express();

// ✅ 2. Create and connect the Redis client
// It automatically uses the REDIS_URL from Heroku's environment variables.
const redisClient = createClient({
  url: process.env.REDIS_URL
});

redisClient.on('error', (err) => console.log('Redis Client Error', err));
redisClient.connect();

// The token will expire in 3 hours (in seconds)
const TOKEN_EXPIRATION_SECONDS = 3 * 60 * 60; 

app.use(cors());
app.options('*', cors()); // Simplifies CORS preflight handling

function generateToken() {
  return crypto.randomBytes(16).toString('hex');
}

// ✅ Generate temporary proxy URL using Redis
app.get('/get-proxy', async (req, res) => { // 👈 Note: async function
  const originalUrl = req.query.url;
  if (!originalUrl) {
    return res.status(400).json({ error: 'Missing ?url=' });
  }

  try {
    const parsed = new URL(originalUrl);
    const lastSlash = parsed.pathname.lastIndexOf('/');
    const basePath = parsed.pathname.substring(0, lastSlash + 1);
    parsed.pathname = basePath;
    const baseUrl = parsed.toString();

    const token = generateToken();

    // ✅ 3. Store the base URL in Redis with an expiration time
    await redisClient.set(token, baseUrl, {
      EX: TOKEN_EXPIRATION_SECONDS // Set expiration directly in Redis
    });

    res.json({
      status: "success",
      m3u8_url: `https://${req.get('host')}/stream/${token}/master.mpd`,
      expires_in: TOKEN_EXPIRATION_SECONDS
    });

  } catch (e) {
    return res.status(400).json({ status: "error", error: "Invalid URL" });
  }
});

// ✅ Stream proxy handler using Redis
app.use('/stream/:token/*', async (req, res) => { // 👈 Note: async function
  const { token } = req.params;
  const filePath = req.params[0];

  // ✅ 4. Retrieve the base URL from Redis
  const baseUrl = await redisClient.get(token);

  if (!baseUrl) {
    // If the key doesn't exist, it's either invalid or expired automatically
    return res.status(404).json({ error: 'Invalid or expired token' });
  }

  const targetUrl = baseUrl + filePath;
  const parsedUrl = new URL(targetUrl);
  const lib = parsedUrl.protocol === 'https:' ? https : http;

  const options = {
    hostname: parsedUrl.hostname,
    port: parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80),
    path: parsedUrl.pathname + parsedUrl.search,
    method: 'GET',
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36',
      'Referer': parsedUrl.origin,
      'Origin': parsedUrl.origin
    }
  };

  const proxyReq = lib.request(options, (proxyRes) => {
    // Forward the headers from the target to the client
    res.writeHead(proxyRes.statusCode, proxyRes.headers);
    proxyRes.pipe(res);
  });

  proxyReq.on('error', (err) => {
    console.error('Proxy request failed:', err.message);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Proxy fetch failed' });
    }
  });

  proxyReq.end();
});

// The setInterval cleanup function is no longer needed.
// Redis handles the token expiration automatically. ✨

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
