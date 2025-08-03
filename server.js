// -----------------------------------------------------------------------------
// Dependencies
// -----------------------------------------------------------------------------
const express = require('express');
const cors = require('cors');
const https = require('https');
const http = require('http');
const { URL } = require('url');
const jwt = require('jsonwebtoken'); // ✅ Import the JSON Web Token library

// -----------------------------------------------------------------------------
// Environment Variable Check
// -----------------------------------------------------------------------------
// For security, the JWT secret is loaded from an environment variable.
// It's crucial to set this in your hosting environment (e.g., Heroku Config Vars).
if (!process.env.JWT_SECRET) {
  console.error("FATAL ERROR: JWT_SECRET environment variable is not set.");
  process.exit(1); // Exit if the secret key is not configured.
}

// -----------------------------------------------------------------------------
// Express App Setup
// -----------------------------------------------------------------------------
const app = express();

// ✅ Allow all CORS requests. This is necessary for the client-side player
// to fetch the stream from a different origin.
app.use(cors());

// ✅ Handle CORS preflight (OPTIONS) requests. This is a standard part of CORS.
app.options('*', (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.sendStatus(204); // No Content
});

// -----------------------------------------------------------------------------
// Endpoint: /get-proxy
// Generates a temporary, signed JWT for a given stream URL.
// -----------------------------------------------------------------------------
app.get('/get-proxy', (req, res) => {
  const originalUrl = req.query.url;
  if (!originalUrl) {
    return res.status(400).json({ status: "error", error: 'Missing required query parameter: ?url=' });
  }

  try {
    // 1. Parse the original URL to extract the base path.
    // This prevents the full file path from being in the token.
    const parsed = new URL(originalUrl);
    const lastSlash = parsed.pathname.lastIndexOf('/');
    const basePath = parsed.pathname.substring(0, lastSlash + 1);
    parsed.pathname = basePath;
    const baseUrl = parsed.toString(); // e.g., "https://videostream.com/path/to/vids/"

    // 2. Create the JWT payload.
    // This is the data that will be securely stored inside the token.
    const payload = { baseUrl };

    // 3. Sign the token.
    // This creates the JWT string, signing it with your secret key.
    // The library automatically adds the 'expiresIn' claim.
    const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '3h' });
    const expiresInSeconds = 3 * 60 * 60; // 3 hours

    // 4. Send the response to the client.
    // The client will use this URL to request the stream segments.
    res.json({
      status: "success",
      m3u8_url: `https://${req.get('host')}/stream/${token}/master.mpd`, // Or .m3u8
      expires_in: expiresInSeconds
    });

  } catch (e) {
    console.error("URL Parsing Error:", e.message);
    return res.status(400).json({ status: "error", error: "Invalid URL provided" });
  }
});

// -----------------------------------------------------------------------------
// Middleware: /stream/:token/*
// Verifies the JWT and proxies the request to the original media server.
// -----------------------------------------------------------------------------
app.use('/stream/:token/*', (req, res) => {
  const { token } = req.params;
  const filePath = req.params[0]; // The rest of the path after the token

  try {
    // 1. Verify the JWT.
    // `jwt.verify` checks the signature AND the expiration time.
    // If the token is invalid or expired, it will throw an error.
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // 2. Construct the full target URL.
    // The `baseUrl` is securely retrieved from the decoded token payload.
    const targetUrl = decoded.baseUrl + filePath;
    const parsedUrl = new URL(targetUrl);
    const lib = parsedUrl.protocol === 'https:' ? https : http;

    // 3. Set up the proxy request options.
    const options = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80),
      path: parsedUrl.pathname + parsedUrl.search,
      method: 'GET',
      headers: {
        'User-Agent': req.get('User-Agent') || 'Mozilla/5.0', // Pass through user-agent
        'Referer': parsedUrl.origin,
        'Origin': parsedUrl.origin,
      }
    };

    // 4. Create and send the proxy request.
    const proxyReq = lib.request(options, (proxyRes) => {
      // Pass back the status code and headers from the origin server.
      res.writeHead(proxyRes.statusCode, proxyRes.headers);
      // Pipe the response body (the video/audio data) directly to the client.
      proxyRes.pipe(res);
    });

    proxyReq.on('error', (err) => {
      console.error('Proxy request failed:', err.message);
      if (!res.headersSent) {
        res.status(502).json({ status: "error", error: 'Proxy request failed' }); // Bad Gateway
      }
    });

    proxyReq.end();

  } catch (err) {
    // This block catches errors from `jwt.verify`.
    // e.g., TokenExpiredError, JsonWebTokenError (malformed token).
    console.warn(`[Auth] Rejected token: ${err.name} - ${err.message}`);
    return res.status(401).json({ status: "error", error: 'Token is invalid or has expired' }); // Unauthorized
  }
});

// -----------------------------------------------------------------------------
// Server Start
// -----------------------------------------------------------------------------
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Proxy server running on http://localhost:${PORT}`);
});
