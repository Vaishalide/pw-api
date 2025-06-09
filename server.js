const express = require('express');
const axios = require('axios');
const { URL } = require('url');
const cors = require('cors');
const { MongoClient } = require('mongodb');

const app = express();
app.use(cors());

const MONGO_URI = process.env.MONGO_URI || 'mongodb+srv://fasejo7264:wsXzyCB4DN8c3pUa@cluster0.kh8tnzd.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0';
const DB_NAME = 'telegramjson';
const COLLECTION = 'batches';

let mongoClient;
async function getDb() {
  if (!mongoClient) {
    mongoClient = new MongoClient(MONGO_URI, {
      maxPoolSize: 200,
      minPoolSize: 10,
      waitQueueTimeoutMS: 5000,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 10000,
    });
    await mongoClient.connect();
    console.log('✅ MongoDB connected with pooling');
  }
  return mongoClient.db(DB_NAME);
}

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

app.get('/data/batches', async (req, res) => {
  try {
    const db = await getDb();
    const limit = parseInt(req.query.limit) || 10;
    const offset = parseInt(req.query.offset) || 0;
    const collection = db.collection(COLLECTION);
    const total = await collection.countDocuments();
    const batches = await collection.find().skip(offset).limit(limit).toArray();

    const result = batches.map(doc => ({
      key: doc._id,
      name: doc.name,
      image: doc.image
    }));

    res.setHeader('Cache-Control', 'public, max-age=300');
    res.json({ total, offset, limit, batches: result });
  } catch (e) {
    res.status(500).json({ error: 'Failed to fetch batches' });
  }
});

app.get('/data/batches/search', async (req, res) => {
  const q = String(req.query.q || '').trim().toLowerCase();
  if (!q) return res.json({ results: [] });

  try {
    const db = await getDb();
    const collection = db.collection(COLLECTION);
    const docs = await collection.find({
      $or: [
        { name: { $regex: q, $options: 'i' } },
        { _id: { $regex: q, $options: 'i' } }
      ]
    }).toArray();

    const matches = docs.map(doc => ({
      key: doc._id,
      name: doc.name,
      image: doc.image
    }));

    res.setHeader('Cache-Control', 'public, max-age=30');
    res.json({ results: matches });
  } catch (e) {
    res.status(500).json({ error: 'Search failed' });
  }
});

app.get('/data/batches/:batchId/subjects', async (req, res) => {
  try {
    const db = await getDb();
    const batch = await db.collection(COLLECTION).findOne({ _id: req.params.batchId });
    if (!batch || !batch.subjects) return res.status(404).json({ error: 'Batch not found or has no subjects' });

    const subjects = Object.entries(batch.subjects).map(([key, subj]) => ({ key, name: subj.name }));
    res.json({ subjects });
  } catch (e) {
    res.status(500).json({ error: 'Subject lookup failed' });
  }
});

app.get('/data/batches/:batchId/subjects/:subjectId/topics', async (req, res) => {
  try {
    const db = await getDb();
    const { batchId, subjectId } = req.params;
    const batch = await db.collection(COLLECTION).findOne({ _id: batchId });
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
            mimeType: upstreamUrl.endsWith('.m3u8') ? 'application/vnd.apple.mpegurl' : 'video/MP2T'
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
  console.log(`Server running on port ${PORT}`);
});
