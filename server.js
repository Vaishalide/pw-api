// server.js

const express = require('express');
const axios   = require('axios');
const { URL } = require('url');
const data    = require('./data.json');

const app = express();
// Enable CORS for all routes
const cors = require('cors');
app.use(cors());

// Parse JSON bodies (for POST/PUT requests, though not used here)
app.use(express.json());

// ─────────────────────────────────────────────────────────────────
// 1. BUILD videoMap (token → { url, mimeType })
//    Walk through data.batches → subjects → topics → lectures
//    For each lecture.videoUrl, generate a URL‐safe base64 token and store its mapping.
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

      lecturesArr.forEach((lecture, idx) => {
        if (!lecture.videoUrl) return;

        // Create a raw token string: e.g. "BatchA__Math__Algebra__0"
        const rawToken = `${batchId}__${subjectId}__${topicKey}__${idx}`;
        // Convert to URL‐safe Base64
        const b64Token = Buffer.from(rawToken).toString('base64url');

        videoMap[b64Token] = {
          url: lecture.videoUrl,
          mimeType: lecture.videoUrl.endsWith('.m3u8')
            ? 'application/vnd.apple.mpegurl'
            : 'video/MP2T',
        };
      });
    });
  });
});

// ─────────────────────────────────────────────────────────────────
// 2. GET /data/batches?limit=<N>&offset=<M>
//    Returns paginated list of batches: { total, offset, limit, batches: [ { key, name, image } … ] }
// ─────────────────────────────────────────────────────────────────

app.get('/data/batches', (req, res) => {
  const limit = parseInt(req.query.limit, 10) || 10;
  const offset = parseInt(req.query.offset, 10) || 0;

  const allBatchKeys = Object.keys(data.batches || {});
  const totalBatches = allBatchKeys.length;
  const pageKeys = allBatchKeys.slice(offset, offset + limit);

  const page = pageKeys.map((key) => {
    const batchObj = data.batches[key];
    return {
      key,
      name: batchObj.name,
      image: batchObj.image,
    };
  });

  // Cache this response for 5 minutes (300 seconds)
  res.setHeader('Cache-Control', 'public, max-age=300');
  res.json({ total: totalBatches, offset, limit, batches: page });
});

// ─────────────────────────────────────────────────────────────────
// 3. SEARCH: GET /data/batches/search?q=<query>
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
        name: batchObj.name,
        image: batchObj.image,
      });
    }
    return acc;
  }, []);

  res.json({ results });
});

// ─────────────────────────────────────────────────────────────────
// 4. GET /data/batches/:batchId/subjects
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
    name: subjObj.name,
  }));

  res.json({ subjects: list });
});

// ─────────────────────────────────────────────────────────────────
// 5. GET /data/batches/:batchId/subjects/:subjectId/topics
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

  // Helper: normalize array‐or‐object into an array
  const normalize = (arrOrObj) =>
    Array.isArray(arrOrObj) ? arrOrObj : Object.values(arrOrObj || {});

  const topics = Object.entries(subjObj.topics || {}).map(
    ([topicKey, topicObj]) => {
      const lecturesArr = normalize(topicObj.lectures);
      // For each lecture, replace lecture.videoUrl with our proxy URL: /video/<token>
      const lecturesWithProxy = lecturesArr.map((lec, idx) => {
        const rawToken = `${batchId}__${subjectId}__${topicKey}__${idx}`;
        const b64Token = Buffer.from(rawToken).toString('base64url');
        return {
          ...lec,
          videoUrl: `https://testing-453c50579f45.herokuapp.com/video/${b64Token}`, // Proxy URL
        };
      });

      return {
        key: topicKey,
        name: topicObj.name,
        lectures: lecturesWithProxy,
        notes: normalize(topicObj.notes),
        dpps: normalize(topicObj.dpps),
      };
    }
  );

  res.json({ topics });
});

// ─────────────────────────────────────────────────────────────────
// 6. PROXY ENDPOINT: GET /video/:token(*)
//    - If no “remainder” ⇒ fetch the upstream .m3u8, rewrite segment URIs ⇒ “/video/<token>/<segment>”
//    - If “remainder” present ⇒ fetch that segment (.ts) from upstream and stream with correct Content-Type.
// ─────────────────────────────────────────────────────────────────

app.get('/video/:token(*)', async (req, res) => {
  try {
    const raw = req.params.token;
    // raw might look like "<base64Token>" or "<base64Token>/chunk-0.ts"
    const [maybeToken, ...rest] = raw.split('/');
    let remainderPath = rest.join('/'); // e.g. "chunk-0.ts" or "" if none

    // Strip any leading slashes in remainderPath to avoid “//segment.ts”
    remainderPath = remainderPath.replace(/^\/+/, '');

    // 1. Lookup the token in our in-memory map
    const entry = videoMap[maybeToken];
    if (!entry) {
      return res.status(404).send('Video not found');
    }
    const { url: upstreamUrl, mimeType } = entry;

    // 2. Determine the actual upstream URL to fetch
    let targetUrl;
    if (!remainderPath) {
      // No remainder ⇒ fetch the .m3u8 playlist itself
      targetUrl = upstreamUrl;
    } else {
      // Remainder present ⇒ fetch a .ts (or other) segment under the same directory
      const upstreamParsed = new URL(upstreamUrl);
      // Remove the trailing “/<something>.m3u8” from the path, keep the base directory
      const basePath = upstreamParsed.pathname.replace(/\/[^/]*\.m3u8$/, '/');
      // Append the cleaned remainderPath (no leading slash)
      upstreamParsed.pathname = basePath + remainderPath;
      targetUrl = upstreamParsed.toString();
    }

    // 3. Fetch from upstream, getting a streaming response
    const upstreamRes = await axios.get(targetUrl, { responseType: 'stream' });

    // 4. If this is the HLS playlist itself (mimeType = HLS + no remainder),
    //    buffer it, rewrite each URI to our proxy, and send back
    if (mimeType === 'application/vnd.apple.mpegurl' && !remainderPath) {
      res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');

      let playlistText = '';
      upstreamRes.data.setEncoding('utf8');
      upstreamRes.data.on('data', (chunk) => {
        playlistText += chunk;
      });
      upstreamRes.data.on('end', () => {
        const rewritten = playlistText
          .split('\n')
          .map((line) => {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith('#')) return line;
            // Rewrite “chunk-0.ts” → “/video/<token>/chunk-0.ts”
            return `/video/${maybeToken}/${trimmed}`;
          })
          .join('\n');
        res.send(rewritten);
      });
    } else {
      // 5. Otherwise (TS segment or any other file), forward stream with correct Content-Type
      const actualContentType =
        upstreamRes.headers['content-type'] || mimeType;
      res.setHeader('Content-Type', actualContentType);
      upstreamRes.data.pipe(res);
    }
  } catch (err) {
    console.error('Error in /video proxy:', err);
    res.status(500).send('Proxy error');
  }
});

// ─────────────────────────────────────────────────────────────────
// 7. FALLBACK FOR UNKNOWN ROUTES
// ─────────────────────────────────────────────────────────────────

app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

// ─────────────────────────────────────────────────────────────────
// 8. START SERVER
// ─────────────────────────────────────────────────────────────────

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
