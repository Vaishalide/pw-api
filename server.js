/ -----------------------------------------------------------------------------
// Dependencies
// -----------------------------------------------------------------------------
const express = require('express');
const cors = require('cors');
const https = require('https');
const http = require('http');
const { URL } = require('url');
const { EncryptJWT, jwtDecrypt } = require('jose');
const crypto = require('crypto');

// -----------------------------------------------------------------------------
// Environment & Security Setup
// -----------------------------------------------------------------------------
if (!process.env.JWT_SECRET) {
  console.error("FATAL ERROR: JWT_SECRET environment variable is not set.");
  process.exit(1);
}

const secretKey = crypto.createHash('sha256').update(process.env.JWT_SECRET).digest();
const alg = 'dir';
const enc = 'A256GCM';

// -----------------------------------------------------------------------------
// CORS Configuration
// -----------------------------------------------------------------------------
// ✅ Define a whitelist of allowed origins for better security.
// Add any domains that should be allowed to use your proxy.
const allowedOrigins = [
  'https://pwthor.site',
  'https://www.pwjarvis.com', // Added based on previous error logs
  // Add other origins for local development if needed:
  // 'http://localhost:3000',
  // 'http://127.0.0.1:5500'
];

const corsOptions = {
  origin: (origin, callback) => {
    // Allow requests with no origin (e.g., mobile apps, curl)
    if (!origin || allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error('This origin is not allowed by CORS'));
    }
  },
};

// -----------------------------------------------------------------------------
// Express App Setup
// -----------------------------------------------------------------------------
const app = express();
// ✅ Use the new, more specific CORS options
app.use(cors(corsOptions));
// ✅ Handle preflight requests with the same options
app.options('*', cors(corsOptions));


// -----------------------------------------------------------------------------
// Endpoint: /get-proxy
// Generates a temporary, ENCRYPTED JWE token.
// -----------------------------------------------------------------------------
app.get('/get-proxy', async (req, res) => {
  const originalUrl = req.query.url;
  if (!originalUrl) {
    return res.status(400).json({ status: "error", error: 'Missing required query parameter: ?url=' });
  }

  try {
    const parsed = new URL(originalUrl);
    const lastSlash = parsed.pathname.lastIndexOf('/');
    const basePath = parsed.pathname.substring(0, lastSlash + 1);
    parsed.pathname = basePath;
    const baseUrl = parsed.toString();

    const token = await new EncryptJWT({ baseUrl })
      .setProtectedHeader({ alg, enc })
      .setIssuedAt()
      .setExpirationTime('3h')
      .encrypt(secretKey);

    const expiresInSeconds = 3 * 60 * 60;

    res.json({
      status: "success",
      m3u8_url: `https://${req.get('host')}/stream/${token}/master.mpd`,
      expires_in: expiresInSeconds
    });

  } catch (e) {
    console.error("URL Parsing or Encryption Error:", e.message);
    return res.status(400).json({ status: "error", error: "Invalid URL provided" });
  }
});

// -----------------------------------------------------------------------------
// Middleware: /stream/:token/*
// Decrypts the JWE and proxies the request.
// -----------------------------------------------------------------------------
app.use('/stream/:token/*', async (req, res) => {
  const { token } = req.params;
  const filePath = req.params[0];

  try {
    const { payload: decoded } = await jwtDecrypt(token, secretKey);

    const targetUrl = decoded.baseUrl + filePath;
    const parsedUrl = new URL(targetUrl);
    const lib = parsedUrl.protocol === 'https:' ? https : http;

    const options = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80),
      path: parsedUrl.pathname + parsedUrl.search,
      method: 'GET',
      headers: {
        'User-Agent': req.get('User-Agent') || 'Mozilla/5.0',
        'Referer': parsedUrl.origin,
        'Origin': parsedUrl.origin,
      }
    };

    const proxyReq = lib.request(options, (proxyRes) => {
      // ✅ **CORS FIX**: Manually set status and filter headers.
      // This prevents the upstream server's CORS headers from overwriting ours.
      res.statusCode = proxyRes.statusCode;
      Object.keys(proxyRes.headers).forEach((key) => {
        const lowerCaseKey = key.toLowerCase();
        // We ignore the upstream server's CORS headers and content encoding (as it can cause issues).
        if (!lowerCaseKey.startsWith('access-control-') && lowerCaseKey !== 'content-encoding') {
          res.setHeader(key, proxyRes.headers[key]);
        }
      });
      
      proxyRes.pipe(res);
    });

    proxyReq.on('error', (err) => {
      console.error('Proxy request failed:', err.message);
      if (!res.headersSent) {
        res.status(502).json({ status: "error", error: 'Proxy request failed' });
      }
    });

    proxyReq.end();

  } catch (err) {
    console.warn(`[Auth] Rejected token: ${err.name} - ${err.message}`);
    return res.status(401).json({ status: "error", error: 'Token is invalid or has expired' });
  }
});

// -----------------------------------------------------------------------------
// Server Start
// -----------------------------------------------------------------------------
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Encrypted proxy server running on http://localhost:${PORT}`);
});
