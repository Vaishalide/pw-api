const express = require('express');
const axios = require('axios');
const { URL } = require('url');
const cors = require('cors');
const { MongoClient } = require('mongodb');

const app = express();
app.use(cors());

const MONGO_URI_1 = process.env.MONGO_URI_1 || 'mongodb+srv://playerzoneproowner:5KwRcJnoXEyNRD8D@cluster0.w3ryplr.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0';
const MONGO_URI_2 = process.env.MONGO_URI_2 || 'mongodb+srv://user2:pass2@cluster0.mongodb.net/?retryWrites=true&w=majority';
const DB_NAME = 'telegramjson';
const COLLECTION = 'batches';

let db1 = null;
let db2 = null;

Promise.all([
  MongoClient.connect(MONGO_URI_1, { useUnifiedTopology: true }),
  MongoClient.connect(MONGO_URI_2, { useUnifiedTopology: true })
])
  .then(([client1, client2]) => {
    db1 = client1.db(DB_NAME);
    db2 = client2.db(DB_NAME);
    console.log('✅ Connected to both MongoDB accounts');
  })
  .catch(err => {
    console.error('❌ MongoDB connection error:', err);
    process.exit(1); // Stop server if connection fails
  });

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
app.use(express.json());

// Utility to combine and paginate two sets of documents
const combinePaginate = (data1, data2, offset, limit) => {
  const combined = [...data1, ...data2];
  const total = combined.length;
  const paginated = combined.slice(offset, offset + limit);
  return { total, paginated };
};

app.get('/data/batches', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;
    const offset = parseInt(req.query.offset) || 0;

    const [docs1, docs2] = await Promise.all([
      db1.collection(COLLECTION).find().toArray(),
      db2.collection(COLLECTION).find().toArray()
    ]);

    const { total, paginated } = combinePaginate(docs1, docs2, offset, limit);

    const result = paginated.map(doc => ({
      key: doc._id,
      name: doc.name,
      image: doc.image
    }));

    res.setHeader('Cache-Control', 'public, max-age=300');
    res.json({ total, offset, limit, batches: result });
  } catch (e) {
    console.error('❌ /data/batches error:', e);
    res.status(500).json({ error: 'Failed to fetch batches' });
  }
});

app.get('/data/batches/search', async (req, res) => {
  const q = String(req.query.q || '').trim().toLowerCase();
  if (!q) return res.json({ results: [] });

  try {
    const [results1, results2] = await Promise.all([
      db1.collection(COLLECTION).find({
        $or: [
          { name: { $regex: q, $options: 'i' } },
          { _id: { $regex: q, $options: 'i' } }
        ]
      }).toArray(),
      db2.collection(COLLECTION).find({
        $or: [
          { name: { $regex: q, $options: 'i' } },
          { _id: { $regex: q, $options: 'i' } }
        ]
      }).toArray()
    ]);

    const matches = [...results1, ...results2].map(doc => ({
      key: doc._id,
      name: doc.name,
      image: doc.image
    }));

    res.setHeader('Cache-Control', 'public, max-age=30');
    res.json({ results: matches });
  } catch (e) {
    console.error('❌ /search error:', e);
    res.status(500).json({ error: 'Search failed' });
  }
});

const findInBoth = async (filter) => {
  const [result1, result2] = await Promise.all([
    db1.collection(COLLECTION).findOne(filter),
    db2.collection(COLLECTION).findOne(filter)
  ]);
  return result1 || result2;
};

app.get('/data/batches/:batchId/subjects', async (req, res) => {
  try {
    const batch = await findInBoth({ _id: req.params.batchId });
    if (!batch || !batch.subjects) {
      return res.status(404).json({ error: 'Batch not found or has no subjects' });
    }

    const subjects = Object.entries(batch.subjects).map(([key, subj]) => ({
      key,
      name: subj.name
    }));

    res.json({ subjects });
  } catch (e) {
    console.error('❌ /subjects error:', e);
    res.status(500).json({ error: 'Subject lookup failed' });
  }
});

app.get('/data/batches/:batchId/subjects/:subjectId/topics', async (req, res) => {
  try {
    const { batchId, subjectId } = req.params;
    const batch = await findInBoth({ _id: batchId });
    const topicsObj = batch?.subjects?.[subjectId]?.topics;

    if (!topicsObj) return res.status(404).json({ error: 'Subject or topics not found' });

    const normalize = input => Array.isArray(input) ? input : Object.values(input || {});

    const topics = Object.entries(topicsObj).map(([topicKey, topic]) => {
      const lecturesArr = normalize(topic.lectures);

      const lecturesWithProxy = lecturesArr.map((lec, idx) => {
        if (!lec.videoUrl) return { ...lec };

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
          videoUrl:  `https://testing-453c50579f45.herokuapp.com/video/${tokens[0]}`,
          videoUrl1: `https://testing-453c50579f45.herokuapp.com/video/${tokens[1]}`,
          videoUrl2: `https://testing-453c50579f45.herokuapp.com/video/${tokens[2]}`,
          videoUrl3: `https://testing-453c50579f45.herokuapp.com/video/${tokens[3]}`
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
    console.error('❌ /topics error:', e);
    res.status(500).json({ error: 'Failed to load topics' });
  }
});

app.get('/video/:token(*)', async (req, res) => {
  const raw = req.params.token;
  const [maybeToken, ...rest] = raw.split('/');
  const remainderPath = rest.join('/');

  const videoMeta = videoMap[maybeToken];
  if (!videoMeta) return res.status(404).send('Video not found');

  const { url: upstreamUrl, mimeType } = videoMeta;

  if (remainderPath === 'enc.key') {
    try {
      const m3u8Res = await axios.get(upstreamUrl);
      const playlist = m3u8Res.data;
      const keyLine = playlist.split('\n').find(l => l.startsWith('#EXT-X-KEY:'));
      const match = keyLine.match(/URI="([^"]+)"/);
      const actualKeyUrl = new URL(match[1], upstreamUrl).toString();
      const keyRes = await axios.get(actualKeyUrl, { responseType: 'arraybuffer' });
      res.setHeader('Content-Type', 'application/octet-stream');
      return res.send(Buffer.from(keyRes.data));
    } catch (err) {
      return res.status(500).send('Key proxy error');
    }
  }

  const targetUrl = remainderPath
    ? new URL(upstreamUrl).toString().replace(/\/[^/]*\.m3u8$/, `/${remainderPath}`)
    : upstreamUrl;

  try {
    const streamRes = await axios.get(targetUrl, { responseType: 'stream' });
    if (mimeType === 'application/vnd.apple.mpegurl' && !remainderPath) {
      res.setHeader('Content-Type', mimeType);
      let text = '';
      streamRes.data.setEncoding('utf8');
      streamRes.data.on('data', chunk => (text += chunk));
      streamRes.data.on('end', () => {
        const rewritten = text
          .split('\n')
          .map(line => {
            if (line.includes('jarvis.ts')) return '';
            if (line.includes('enc.key')) return line.replace(/URI="([^"]+)"/, `URI="/video/${maybeToken}/enc.key"`);
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
  console.log(`🚀 Server running on port ${PORT}`);
});
