// server.js

const express = require('express');
const axios = require('axios');
const { URL } = require('url');
const data = require('./data.json');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

const videoMap = {};
Object.entries(data.batches || {}).forEach(([batchId, batchObj]) => {
  const subjects = batchObj.subjects || {};
  Object.entries(subjects).forEach(([subjectId, subjObj]) => {
    const topics = subjObj.topics || {};
    Object.entries(topics).forEach(([topicKey, topicObj]) => {
      const lecturesArr = Array.isArray(topicObj.lectures)
        ? topicObj.lectures
        : Object.values(topicObj.lectures || {});

      lecturesArr.forEach((lec, idx) => {
        if (!lec.videoUrl) return;
        const rawToken = `${batchId}__${subjectId}__${topicKey}__${idx}`;
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

app.get('/data/batches', (req, res) => {
  const limit = parseInt(req.query.limit, 10) || 10;
  const offset = parseInt(req.query.offset, 10) || 0;

  const allBatchKeys = Object.keys(data.batches || {});
  const totalBatches = allBatchKeys.length;
  const pageKeys = allBatchKeys.slice(offset, offset + limit);

  const page = pageKeys.map(key => {
    const batchObj = data.batches[key];
    return {
      key,
      name: batchObj.name,
      image: batchObj.image
    };
  });

  res.setHeader('Cache-Control', 'public, max-age=300');
  res.json({ total: totalBatches, offset, limit, batches: page });
});

app.get('/data/batches/search', (req, res) => {
  const q = String(req.query.q || '').trim().toLowerCase();
  if (!q) return res.json({ results: [] });

  const matches = Object.entries(data.batches || {})
    .filter(([key, batchObj]) => {
      const nameLower = String(batchObj.name || '').toLowerCase();
      return nameLower.includes(q) || key.toLowerCase().includes(q);
    })
    .map(([key, batchObj]) => ({
      key,
      name: batchObj.name,
      image: batchObj.image
    }));

  res.setHeader('Cache-Control', 'public, max-age=30');
  res.json({ results: matches });
});

app.get('/data/batches/:batchId/subjects', (req, res) => {
  const batchId = req.params.batchId;
  const batch = data.batches?.[batchId];

  if (!batch || !batch.subjects) {
    return res.status(404).json({ error: 'Batch not found or has no subjects' });
  }

  const subjects = Object.entries(batch.subjects).map(([key, subj]) => ({
    key,
    name: subj.name
  }));

  res.json({ subjects });
});

app.get('/data/batches/:batchId/subjects/:subjectId/topics', (req, res) => {
  const { batchId, subjectId } = req.params;
  const topicObj = data.batches?.[batchId]?.subjects?.[subjectId]?.topics;

  if (!topicObj) {
    return res.status(404).json({ error: 'Subject or topics not found' });
  }

  const normalize = input => {
    if (Array.isArray(input)) return input;
    if (input && typeof input === 'object') return Object.values(input);
    return [];
  };

  const topics = Object.entries(topicObj).map(([topicKey, topic]) => {
    const lecturesArr = normalize(topic.lectures);

    const lecturesWithProxy = lecturesArr.map((lec, idx) => {
      const rawToken = `${batchId}__${subjectId}__${topicKey}__${idx}`;
      const b64Token = Buffer.from(rawToken).toString('base64url');
      return {
        ...lec,
        videoUrl: `https://testing-453c50579f45.herokuapp.com/video/${b64Token}`
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

app.get('/video/:token(*)', async (req, res) => {
  const raw = req.params.token;
  const [maybeToken, ...rest] = raw.split('/');
  const remainderPath = rest.join('/');

  if (!videoMap[maybeToken]) {
    return res.status(404).send('Video not found');
  }

  const { url: upstreamUrl, mimeType } = videoMap[maybeToken];

  let targetUrl;
  if (!remainderPath) {
    targetUrl = upstreamUrl;
  } else {
    const upstreamParsed = new URL(upstreamUrl);
    const basePath = upstreamParsed.pathname.replace(/\/[^/]*\.m3u8$/, '/');
    upstreamParsed.pathname = basePath + remainderPath;
    targetUrl = upstreamParsed.toString();
  }

  try {
    const upstreamRes = await axios.get(targetUrl, { responseType: 'stream' });

    if (mimeType === 'application/vnd.apple.mpegurl' && !remainderPath) {
      res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
      res.setHeader('Cache-Control', 'no-store'); // Disable cache
      let playlistText = '';
      upstreamRes.data.setEncoding('utf8');
      upstreamRes.data.on('data', chunk => {
        playlistText += chunk;
      });
      upstreamRes.data.on('end', () => {
        console.log('Original Playlist:\n', playlistText);
        const rewritten = playlistText
          .split('\n')
          .map(line => {
            const trimmed = line.trim();
            if (trimmed === '' || trimmed.startsWith('#')) return line;
            if (trimmed.includes('jarvis.ts')) return ''; // Skip jarvis.ts segment
            return `/video/${maybeToken}/${trimmed}`;
          })
          .filter(line => line !== '')
          .join('\n');
        console.log('Rewritten Playlist:\n', rewritten);
        res.send(rewritten);
      });
    } else {
      res.setHeader('Content-Type', mimeType);
      upstreamRes.data.pipe(res);
    }
  } catch (err) {
    console.error('Error in /video proxy:', err.message);
    res.status(500).send('Proxy error');
  }
});

app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
