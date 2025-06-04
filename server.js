// server.js

const express = require('express');
const axios   = require('axios');
const { URL } = require('url');
const data    = require('./data.json');

const app = express();
// In server.js, right after `const app = express()`:
const cors = require('cors');
app.use(cors());

// ─────────────────────────────────────────────────────────────────
// 1. MIDDLEWARE (CORS, JSON parsing, etc.)
// ─────────────────────────────────────────────────────────────────

app.use(express.json());

// ─────────────────────────────────────────────────────────────────
// 2. BUILD videoMap (token → { url, mimeType })
//    Walk through data.batches → subjects → topics → lectures
//    For each lecture.videoUrl, generate a base64‐token and store its mapping.
// ─────────────────────────────────────────────────────────────────

const videoMap = {};

Object.entries(data.batches || {}).forEach(([batchId, batchObj]) => {
  const subjects = batchObj.subjects || {};
  Object.entries(subjects).forEach(([subjectId, subjObj]) => {
    const topics = subjObj.topics || {};
    Object.entries(topics).forEach(([topicKey, topicObj]) => {
      // Normalize lectures into an array
      const lecturesArr = Array.isArray(topicObj.lectures)
        ? topicObj.lectures
        : Object.values(topicObj.lectures || {});

      lecturesArr.forEach((lec, idx) => {
        if (!lec.videoUrl) return;
        // Create raw token (e.g. "BatchA__Math__Algebra__0")
        const rawToken = `${batchId}__${subjectId}__${topicKey}__${idx}`;
        // Convert to URL‐safe Base64
        const b64Token = Buffer.from(rawToken).toString('base64url');

        videoMap[b64Token] = {
          url: lec.videoUrl,
          mimeType: lec.videoUrl.endsWith('.m3u8')
            ? 'application/vnd.apple.mpegurl'
            : 'video/MP2T'
        };
      });
    });
  });
});

// ─────────────────────────────────────────────────────────────────
// 3. GET /data/batches?limit=<N>&offset=<M>
//    Returns paginated list of batches: { total, offset, limit, batches: [ { key, name, image } … ] }
// ─────────────────────────────────────────────────────────────────

app.get('/data/batches', (req, res) => {
  const limit = parseInt(req.query.limit, 10) || 10;
  const offset = parseInt(req.query.offset, 10) || 0;

  const allBatchKeys = Object.keys(data.batches || {});
  const totalBatches = allBatchKeys.length;
  const pageKeys     = allBatchKeys.slice(offset, offset + limit);

  const page = pageKeys.map(key => {
    const batchObj = data.batches[key];
    return {
      key,
      name:  batchObj.name,
      image: batchObj.image
    };
  });

  // Cache this response for 5 minutes
  res.setHeader('Cache-Control', 'public, max-age=300');
  res.json({ total: totalBatches, offset, limit, batches: page });
});

// ─────────────────────────────────────────────────────────────────
// 4. SERVER-SIDE SEARCH ENDPOINT
//    GET /data/batches/search?q=<query>
//    Returns { results: [ { key, name, image } … ] }
// ─────────────────────────────────────────────────────────────────

app.get('/data/batches/search', (req, res) => {
  const q = (req.query.q || '').trim().toLowerCase();
  if (!q) {
    return res.json({ results: [] });
  }

  const results = Object.entries(data.batches || {}).reduce((acc, [key, batchObj]) => {
    if (batchObj.name.toLowerCase().includes(q)) {
      acc.push({
        key,
        name:  batchObj.name,
        image: batchObj.image
      });
    }
    return acc;
  }, []);

  res.json({ results });
});

// ─────────────────────────────────────────────────────────────────
// 5. GET /data/batches/:batchId/subjects
//    Returns { subjects: [ { key, name } … ] }
// ─────────────────────────────────────────────────────────────────

app.get('/data/batches/:batchId/subjects', (req, res) => {
  const { batchId } = req.params;
  const batchObj = data.batches[batchId];
  if (!batchObj) {
    return res.status(404).json({ error: 'Batch not found' });
  }

  const subjects = batchObj.subjects || {};
  const list = Object.entries(subjects).map(([subjectId, subjObj]) => ({
    key: subjectId,
    name: subjObj.name
  }));

  res.json({ subjects: list });
});

// ─────────────────────────────────────────────────────────────────
// 6. GET /data/batches/:batchId/subjects/:subjectId/topics
//    Returns { topics: [ { key, name, lectures: [ { title, videoUrl, … } … ], notes: [], dpps: [] } … ] }
// ─────────────────────────────────────────────────────────────────

app.get('/data/batches/:batchId/subjects/:subjectId/topics', (req, res) => {
  const { batchId, subjectId } = req.params;
  const batchObj = data.batches[batchId];
  if (!batchObj) {
    return res.status(404).json({ error: 'Batch not found' });
  }

  const subjObj = (batchObj.subjects || {})[subjectId];
  if (!subjObj) {
    return res.status(404).json({ error: 'Subject not found' });
  }

  // Helper to normalize either array or object into []
  const normalize = arrOrObj =>
    Array.isArray(arrOrObj) ? arrOrObj : Object.values(arrOrObj || {});

  const topics = Object.entries(subjObj.topics || {}).map(([topicKey, topic]) => {
    const lecturesArr = normalize(topic.lectures);
    // For each lecture, lecture.videoUrl was overridden above to be `/video/<token>`
    const lecturesWithProxy = lecturesArr.map((lec, idx) => {
      const rawToken = `${batchId}__${subjectId}__${topicKey}__${idx}`;
      const b64Token = Buffer.from(rawToken).toString('base64url');
      return {
        ...lec,
        videoUrl: `/video/${b64Token}` // Proxy URL
      };
    });

    return {
      key: topicKey,
      name: topic.name,
      lectures: lecturesWithProxy,
      notes: normalize(topic.notes),
      dpps: normalize(topic.dpps)
    };
  });

  res.json({ topics });
});

// ─────────────────────────────────────────────────────────────────
// 7. PROXY ENDPOINT: GET /video/:token(*)
//    - If no “remainder” ⇒ fetch the upstream .m3u8, rewrite segment URIs ⇒ /video/<token>/…
//    - If “remainder” (e.g. "chunk-0.ts") ⇒ fetch that .ts from the upstream base and stream.
// ─────────────────────────────────────────────────────────────────

app.get('/video/:token(*)', async (req, res) => {
  const raw = req.params.token;
  // raw might be "<base64Token>" or "<base64Token>/chunk-0.ts"
  const [maybeToken, ...rest] = raw.split('/');
  const remainderPath = rest.join('/'); // e.g. "chunk-0.ts" or "" if none

  // 1. Lookup the token in our in-memory map
  if (!videoMap[maybeToken]) {
    return res.status(404).send('Video not found');
  }
  const { url: upstreamUrl, mimeType } = videoMap[maybeToken];

  // 2. Determine the actual URL to fetch from the upstream service
  let targetUrl;
  if (!remainderPath) {
    // No remainder ⇒ fetch the .m3u8 playlist itself
    targetUrl = upstreamUrl;
  } else {
    // Remainder present ⇒ fetch a .ts segment under the same directory
    const upstreamParsed = new URL(upstreamUrl);
    // Remove the trailing "/something.m3u8" from the path, append the segment name
    const basePath = upstreamParsed.pathname.replace(/\/[^/]*\.m3u8$/, '/');
    upstreamParsed.pathname = basePath + remainderPath;
    targetUrl = upstreamParsed.toString();
  }

  try {
    // 3. Fetch from upstream, getting a streaming response
    const upstreamRes = await axios.get(targetUrl, { responseType: 'stream' });

    // 4. If this is the playlist itself (mimeType = HLS + no remainder),
    //    buffer it, rewrite segment URIs, and send it back
    if (mimeType === 'application/vnd.apple.mpegurl' && !remainderPath) {
      res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');

      let playlistText = '';
      upstreamRes.data.setEncoding('utf8');
      upstreamRes.data.on('data', chunk => {
        playlistText += chunk;
      });
      upstreamRes.data.on('end', () => {
        const rewritten = playlistText
          .split('\n')
          .map(line => {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith('#')) return line;
            // Rewrite “chunk-0.ts” ⇒ “/video/<token>/chunk-0.ts”
            return `/video/${maybeToken}/${trimmed}`;
          })
          .join('\n');
        res.send(rewritten);
      });
    } else {
      // 5. Otherwise (TS segment or other), forward with the correct content-type
      //    Prefer the actual upstream Content-Type, fallback to our stored mimeType
      const actualContentType = upstreamRes.headers['content-type'] || mimeType;
      res.setHeader('Content-Type', actualContentType);
      upstreamRes.data.pipe(res);
    }
  } catch (err) {
    console.error('Error in /video proxy:', err.message);
    res.status(500).send('Proxy error');
  }
});

// ─────────────────────────────────────────────────────────────────
// 8. FALLBACK FOR UNKNOWN ROUTES
// ─────────────────────────────────────────────────────────────────

app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

// ─────────────────────────────────────────────────────────────────
// 9. START SERVER
// ─────────────────────────────────────────────────────────────────

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
