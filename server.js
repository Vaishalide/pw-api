// -----------------------------------------------------------------------------
// Dependencies (Using ES Module 'import' syntax)
// -----------------------------------------------------------------------------
import express from 'express';
import cors from 'cors';
import https from 'https';
import http from 'http';
import { URL } from 'url';
import { EncryptJWT, jwtDecrypt } from 'jose';
import crypto from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';

// -----------------------------------------------------------------------------
// Environment & Security Setup
// -----------------------------------------------------------------------------
// Since we are using ES Modules, __dirname is not available. This is how we get it.
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
const allowedOrigins = [
  'https://pwthor.site',
  'https://www.pwjarvis.com',
  // Add other origins for local development if needed:
  'http://localhost:3000',
  'http://127.0.0.1:5500'
];

const corsOptions = {
  origin: (origin, callback) => {
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
app.use(cors(corsOptions));
app.options('*', cors(corsOptions));

// -----------------------------------------------------------------------------
// Endpoint: /get-proxy
// -----------------------------------------------------------------------------
app.get('/get-proxy', async (req, res) => {
  const originalUrl = req.query.url;
  if (!originalUrl) {
    return res.status(400).json({ status: "error", error: 'Missing required query parameter: ?url=' });
  }

  try {
    const parsed = new URL(originalUrl);
    
    // --- START: MODIFICATION ---
    // 1. Extract the original query string
    const queryString = parsed.search;

    // 2. Build the base URL without the file name or query string
    const lastSlash = parsed.pathname.lastIndexOf('/');
    const basePath = parsed.pathname.substring(0, lastSlash + 1);
    const baseUrl = `${parsed.protocol}//${parsed.host}${basePath}`;

    // 3. Encrypt both the baseUrl and the queryString into the JWT payload
    const token = await new EncryptJWT({ baseUrl, queryString })
    // --- END: MODIFICATION ---
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
// -----------------------------------------------------------------------------
app.use('/stream/:token/*', async (req, res) => {
  const { token } = req.params;
  const filePath = req.params[0];

  try {
    const { payload: decoded } = await jwtDecrypt(token, secretKey);
    const { baseUrl, queryString } = decoded;

    if (!baseUrl || queryString === undefined) {
      return res.status(400).json({ status: "error", error: 'Malformed token payload' });
    }

    const targetUrl = baseUrl + filePath;
    const parsedUrl = new URL(targetUrl);
    const lib = parsedUrl.protocol === 'https:' ? https : http;

    // --- START: FIX ---
    // Create a headers object to forward from the client's request
    const forwardedHeaders = {
        'User-Agent': req.get('User-Agent') || 'Mozilla/5.0',
        'Referer': parsedUrl.origin,
        'Origin': parsedUrl.origin,
    };

    // CRITICAL: Forward the Range header for video seeking and chunking
    if (req.headers.range) {
        forwardedHeaders['Range'] = req.headers.range;
    }
    // --- END: FIX ---

    const options = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80),
      path: parsedUrl.pathname + queryString,
      method: 'GET',
      headers: forwardedHeaders // Use the new headers object
    };

    const proxyReq = lib.request(options, (proxyRes) => {
      // Forward the status code from the original server (e.g., 206 Partial Content)
      res.statusCode = proxyRes.statusCode;

      // Forward headers from the original server back to the client
      Object.keys(proxyRes.headers).forEach((key) => {
        // Prevent CORS issues and let the browser handle decompression
        const lowerCaseKey = key.toLowerCase();
        if (!lowerCaseKey.startsWith('access-control-') && lowerCaseKey !== 'content-encoding') {
          res.setHeader(key, proxyRes.headers[key]);
        }
      });
      
      // Pipe the data directly through, making it a true stream
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
  console.log(`🚀 Encrypted proxy server (ESM) running on http://localhost:${PORT}`);
});
