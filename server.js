// -----------------------------------------------------------------------------
// Dependencies
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

// --- PERFORMANCE UPDATE ---
// Import cluster and os modules to utilize all CPU cores
import cluster from 'cluster';
import os from 'os';

// -----------------------------------------------------------------------------
// Main Application Logic
// -----------------------------------------------------------------------------
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Get the number of available CPU cores
const numCPUs = os.cpus().length;

if (cluster.isPrimary) {
  // --- PRIMARY PROCESS ---
  // This is the main process. Its job is to create (fork) worker processes.
  console.log(`✅ Primary process ${process.pid} is running.`);
  console.log(`Forking server for ${numCPUs} CPU cores.`);

  // Create a worker for each CPU core
  for (let i = 0; i < numCPUs; i++) {
    cluster.fork();
  }

  // Listen for when a worker process dies
  cluster.on('exit', (worker, code, signal) => {
    console.error(`Worker ${worker.process.pid} died. Forking a new one...`);
    // Automatically restart the worker to ensure high availability
    cluster.fork();
  });

} else {
  // --- WORKER PROCESS ---
  // This is a worker process. It runs the actual Express server.
  // All workers will share the same port.

  // Environment & Security Setup
  if (!process.env.JWT_SECRET) {
    console.error("FATAL ERROR: JWT_SECRET environment variable is not set.");
    process.exit(1);
  }
  const secretKey = crypto.createHash('sha256').update(process.env.JWT_SECRET).digest();
  const alg = 'dir';
  const enc = 'A256GCM';

  // CORS Configuration
  const allowedOrigins = [
    'https://pwthor.site',
    'https://www.pwjarvis.com',
    'http://localhost:3000',
    'http://127.0.0.1:5500'
  ];
  const corsOptions = {
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error('This origin is not allowed by CORS'));
      }
    },
  };

  // Express App Setup
  const app = express();
  app.use(cors(corsOptions));
  app.options('*', cors(corsOptions));

  // Endpoint: /get-proxy
  app.get('/get-proxy', async (req, res) => {
    const originalUrl = req.query.url;
    if (!originalUrl) {
      return res.status(400).json({ status: "error", error: 'Missing required query parameter: ?url=' });
    }

    try {
      const parsed = new URL(originalUrl);
      const queryString = parsed.search;
      const lastSlash = parsed.pathname.lastIndexOf('/');
      const basePath = parsed.pathname.substring(0, lastSlash + 1);
      const baseUrl = `${parsed.protocol}//${parsed.host}${basePath}`;

      const token = await new EncryptJWT({ baseUrl, queryString })
        .setProtectedHeader({ alg, enc })
        .setIssuedAt()
        .setExpirationTime('3h')
        .encrypt(secretKey);

      const expiresInSeconds = 3 * 60 * 60;
      const proxyUrlPath = `/stream/${token}/${path.basename(parsed.pathname)}`;

      res.json({
        status: "success",
        manifest_url: `https://${req.get('host')}${proxyUrlPath}`,
        expires_in: expiresInSeconds
      });

    } catch (e) {
      console.error("URL Parsing or Encryption Error:", e.message);
      return res.status(400).json({ status: "error", error: "Invalid URL provided" });
    }
  });

  // Middleware: /stream/:token/*
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

      const forwardedHeaders = {
        'User-Agent': req.get('User-Agent') || 'Mozilla/5.0',
        'Referer': parsedUrl.origin,
        'Origin': parsedUrl.origin,
      };

      if (req.headers.range) {
        forwardedHeaders['Range'] = req.headers.range;
      }

      const options = {
        hostname: parsedUrl.hostname,
        port: parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80),
        path: parsedUrl.pathname + queryString,
        method: 'GET',
        headers: forwardedHeaders
      };

      const proxyReq = lib.request(options, (proxyRes) => {
        res.statusCode = proxyRes.statusCode;
        Object.keys(proxyRes.headers).forEach((key) => {
          const lowerCaseKey = key.toLowerCase();
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
      console.warn(`[Auth] Rejected token on worker ${process.pid}: ${err.name}`);
      return res.status(401).json({ status: "error", error: 'Token is invalid or has expired' });
    }
  });

  // Server Start for this worker
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`🚀 Worker ${process.pid} started. Listening on http://localhost:${PORT}`);
  });
}
