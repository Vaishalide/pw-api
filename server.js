// server.js
const express = require('express');
const axios = require('axios');
const { URL } = require('url');
const cors = require('cors');
const { getDb } = require('./db');

const app = express();
app.use(cors());
app.use(express.json());

const COLLECTION = 'batches';
const QUALITIES = [720, 480, 360, 240];
const videoMap = {};

const allowedOrigins = [
  'https://pw-thor-6781512f6f22.herokuapp.com',
  'https://pwthor.site',
  'pwthor.site',
  'https://po.com',
  'http://po.com',
  'https://xyz.com',
  'http://xyz.com'
];

app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    next();
  } else {
    return res.status(403).json({ telegram: '@pw_thor' });
  }
});
app.options('*', (req, res) => res.sendStatus(200));

/**
 * Helper: load all batch records, normalizing either:
 *  - many documents each with {_id, name, image, subjects}
 *  - or one document with { batches: { batchKey: { name, image, subjects } } }
 */
async function loadAllBatches(collection) {
  const docs = await collection.find().toArray();

  // If there's exactly one doc and it has .batches wrapper, use that
  if (docs.length === 1 && docs[0].batches && typeof docs[0].batches === 'object') {
    return Object.entries(docs[0].batches).map(([key, data]) => ({
      key,
      name: data.name,
      image: data.image,
      raw: data
    }));
  }

  // Otherwise assume each doc is already one batch
  return docs.map(doc => ({
    key: doc._id,
    name: doc.name,
    image: doc.image,
    raw: doc
  }));
}

/**
 * Helper: load a single batch by ID, normalizing wrapper if needed
 */
async function loadBatchById(collection, batchId) {
  // First, try direct lookup (_id)
  const direct = await collection.findOne({ _id: batchId });
  if (direct) return direct;

  // Fallback: wrapper style
  // find the wrapper doc that has this key under .batches
  const wrapper = await collection.findOne({ [`batches.${batchId}`]: { $exists: true } });
  return wrapper?.batches?.[batchId] || null;
}

// GET /data/batches
app.get('/data/batches', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit, 10) || 10;
    const offset = parseInt(req.query.offset, 10) || 0;

    const db = await getDb();
    const coll = db.collection(COLLECTION);

    const all = await loadAllBatches(coll);
    const total = all.length;
    const slice = all.slice(offset, offset + limit);

    const batches = slice.map(b => ({ key: b.key, name: b.name, image: b.image }));

    res.setHeader('Cache-Control', 'public, max-age=300');
    res.json({ total, offset, limit, batches });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to fetch batches' });
  }
});

// GET /data/batches/search?q=
app.get('/data/batches/search', async (req, res) => {
  const q = String(req.query.q || '').trim();
  if (!q) return res.json({ results: [] });

  try {
    const db = await getDb();
    const coll = db.collection(COLLECTION);
    const regex = new RegExp(q, 'i');

    // search both wrapper style and direct docs
    const directMatches = await coll.find({
      $or: [{ name: regex }, { _id: regex }]
    }).toArray();

    // wrapper-style search
    const wrapper = await coll.findOne({ batches: { $exists: true } });
    let wrapperMatches = [];
    if (wrapper) {
      wrapperMatches = Object.entries(wrapper.batches)
        .filter(([, data]) => regex.test(data.name) || regex.test(dataKey))
        .map(([dataKey, data]) => ({
          key: dataKey,
          name: data.name,
          image: data.image
        }));
    }

    const seen = new Set();
    const results = [];

    directMatches.forEach(doc => {
      if (!seen.has(doc._id)) {
        seen.add(doc._id);
        results.push({ key: doc._id, name: doc.name, image: doc.image });
      }
    });
    wrapperMatches.forEach(w => {
      if (!seen.has(w.key)) {
        seen.add(w.key);
        results.push(w);
      }
    });

    res.setHeader('Cache-Control', 'public, max-age=30');
    res.json({ results });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Search failed' });
  }
});

// GET /data/batches/:batchId/subjects
app.get('/data/batches/:batchId/subjects', async (req, res) => {
  const { batchId } = req.params;
  try {
    const db = await getDb();
    const coll = db.collection(COLLECTION);
    const batch = await loadBatchById(coll, batchId);

    if (!batch || !batch.subjects) {
      return res.status(404).json({ error: 'Batch not found or has no subjects' });
    }

    const subjects = Object.entries(batch.subjects).map(([key, subj]) => ({
      key,
      name: subj.name
    }));
    res.json({ subjects });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Subject lookup failed' });
  }
});

// GET /data/batches/:batchId/subjects/:subjectId/topics
app.get('/data/batches/:batchId/subjects/:subjectId/topics', async (req, res) => {
  const { batchId, subjectId } = req.params;
  try {
    const db = await getDb();
    const coll = db.collection(COLLECTION);
    const batch = await loadBatchById(coll, batchId);

    const topicsObj = batch?.subjects?.[subjectId]?.topics;
    if (!topicsObj) {
      return res.status(404).json({ error: 'Subject or topics not found' });
    }

    const normalize = input => Array.isArray(input) ? input : Object.values(input || {});

    const topics = Object.entries(topicsObj).map(([topicKey, topic]) => {
      const lecturesArr = normalize(topic.lectures);

      const lecturesWithProxy = lecturesArr.map((lec, idx) => {
        if (!lec.videoUrl) return { ...lec };

        // generate tokens & register in map
        const tokens = QUALITIES.map(quality => {
          const raw = `${batchId}__${subjectId}__${topicKey}__${idx}__${quality}`;
          return Buffer.from(raw).toString('base64url');
        });

        QUALITIES.forEach((quality, i) => {
          const upstreamUrl = lec.videoUrl.replace(/\/hls\/720\//, `/hls/${quality}/`);
          videoMap[tokens[i]] = {
            url: upstreamUrl,
            mimeType: upstreamUrl.endsWith('.m3u8')
              ? 'application/vnd.apple.mpegurl'
              : 'video/MP2T'
          };
        });

        return {
          title: lec.title,
          thumbnail: lec.thumbnail,
          videoUrl:  `/video/${tokens[0]}`, // 720p
          videoUrl1: `/video/${tokens[1]}`, // 480p
          videoUrl2: `/video/${tokens[2]}`, // 360p
          videoUrl3: `/video/${tokens[3]}`  // 240p
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
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to load topics' });
  }
});

// PROXY /video/:token/*
app.get('/video/:token(*)', async (req, res) => {
  const [maybeToken, ...rest] = req.params.token.split('/');
  const remainderPath = rest.join('/');
  const videoMeta = videoMap[maybeToken];
  if (!videoMeta) return res.status(404).send('Video not found');

  const { url: upstreamUrl, mimeType } = videoMeta;

  // handle encryption key
  if (remainderPath === 'enc.key') {
    try {
      const m3u8Res = await axios.get(upstreamUrl);
      const keyLine = m3u8Res.data.split('\n').find(l => l.startsWith('#EXT-X-KEY:'));
      const actualKeyUrl = new URL(keyLine.match(/URI="([^"]+)"/)[1], upstreamUrl).toString();
      const keyRes = await axios.get(actualKeyUrl, { responseType: 'arraybuffer' });
      res.setHeader('Content-Type', 'application/octet-stream');
      return res.send(Buffer.from(keyRes.data));
    } catch (err) {
      return res.status(500).send('Key proxy error');
    }
  }

  // handle playlist vs. segment
  const targetUrl = remainderPath
    ? upstreamUrl.replace(/\/[^/]*\.m3u8$/, `/${remainderPath}`)
    : upstreamUrl;

  try {
    const streamRes = await axios.get(targetUrl, { responseType: 'stream' });
    if (mimeType === 'application/vnd.apple.mpegurl' && !remainderPath) {
      res.setHeader('Content-Type', mimeType);
      let text = '';
      streamRes.data.setEncoding('utf8');
      streamRes.data.on('data', chunk => text += chunk);
      streamRes.data.on('end', () => {
        const rewritten = text
          .split('\n')
          .map(line => {
            if (line.includes('jarvis.ts')) return '';
            if (line.includes('enc.key')) {
              return line.replace(/URI="([^"]+)"/, `URI="/video/${maybeToken}/enc.key"`);
            }
            if (line.startsWith('#') || line === '') return line;
            return `/video/${maybeToken}/${line}`;
          })
          .filter(Boolean)
          .join('\n');
        res.send(rewritten);
      });
    } else {
      res.setHeader('Content-Type', mimeType);
      streamRes.data.pipe(res);
    }
  } catch (e) {
    res.status(500).send('Proxy error');
  }
});

app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
