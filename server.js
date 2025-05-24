const express = require('express');
const app = express();
const data = require('./data.json');

// ✅ Only allow this domain
// ✅ Allow multiple domains
const allowedOrigins = [
  'https://pwthor.ct.ws',
  'https://powerstudy.ct.ws',
  'https://anotherdomain.com'
];
 // Replace with your actual domain

// 🔒 CORS Middleware to restrict access
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    next();
  } else {
    res.status(403).json({ ok: 'fetch' });
  }
});


// ✅ Support preflight CORS requests
app.options('*', (req, res) => {
  res.sendStatus(200);
});

// Route: GET /api/batches (used by frontend)
app.get('/data/batches', (req, res) => {
  res.json(data); // includes batches and optional popup
});

// Route: GET /data (optional for direct testing)
app.get('/data', (req, res) => {
  res.json(data);
});

// Utility function to clean arrays
const normalizeToArray = (input) => {
  if (Array.isArray(input)) {
    return input.filter(item => item !== null && item !== undefined);
  }
  if (input && typeof input === 'object') {
    return Object.values(input).filter(item => item !== null && item !== undefined);
  }
  return [];
};

// Route: GET /data/batches/:batchId/subjects/:subjectId/topics
app.get('/data/batches/:batchId/subjects/:subjectId/topics', (req, res) => {
  const { batchId, subjectId } = req.params;
  const subject = data.batches?.[batchId]?.subjects?.[subjectId];

  if (!subject || !subject.topics) {
    return res.status(404).json({ error: 'Subject or topics not found' });
  }

  const topics = Object.entries(subject.topics).map(([key, topic]) => ({
    key,
    ...topic,
    lectures: normalizeToArray(topic.lectures),
    notes: normalizeToArray(topic.notes),
    dpps: normalizeToArray(topic.dpps)
  }));

  res.json(topics);
});

// Route: GET /data/batches/:batchId/subjects/:subjectId/topics/:topicId
app.get('/data/batches/:batchId/subjects/:subjectId/topics/:topicId', (req, res) => {
  const { batchId, subjectId, topicId } = req.params;
  const topic = data.batches?.[batchId]?.subjects?.[subjectId]?.topics?.[topicId];

  if (!topic) return res.status(404).json({ error: 'Topic not found' });

  res.json({
    name: topic.name,
    lectures: normalizeToArray(topic.lectures),
    notes: normalizeToArray(topic.notes),
    dpps: normalizeToArray(topic.dpps)
  });
});

// Route: GET /data/batches/:batchId/subjects
app.get('/data/batches/:batchId/subjects', (req, res) => {
  const batch = data.batches[req.params.batchId];
  if (!batch || !batch.subjects) {
    return res.status(404).json({ error: 'Batch or subjects not found' });
  }

  const subjects = Object.entries(batch.subjects).map(([key, subject]) => ({
    key,
    ...subject
  }));

  res.json(subjects);
});

// Route: GET /data/batches/:batchId/subjects/:subjectId/topics
app.get('/data/batches/:batchId/subjects/:subjectId/topics', (req, res) => {
  const { batchId, subjectId } = req.params;
  const subject = data.batches?.[batchId]?.subjects?.[subjectId];

  if (!subject || !subject.topics) {
    return res.status(404).json({ error: 'Subject or topics not found' });
  }

  const normalizeToArray = (input) => {
    if (Array.isArray(input)) return input;
    if (input && typeof input === 'object') return Object.values(input);
    return [];
  };

  const topics = Object.entries(subject.topics).map(([key, topic]) => ({
    key,
    ...topic,
    lectures: normalizeToArray(topic.lectures),
    notes: normalizeToArray(topic.notes),
    dpps: normalizeToArray(topic.dpps)
  }));

  res.json(topics);
});

// Route: GET /data/batches/:batchId/subjects/:subjectId/topics/:topicId
app.get('/data/batches/:batchId/subjects/:subjectId/topics/:topicId', (req, res) => {
  const { batchId, subjectId, topicId } = req.params;
  const topic = data.batches?.[batchId]?.subjects?.[subjectId]?.topics?.[topicId];

  if (!topic) return res.status(404).json({ error: 'Topic not found' });

  const normalizeToArray = (input) => {
    if (Array.isArray(input)) return input;
    if (input && typeof input === 'object') return Object.values(input);
    return [];
  };

  res.json({
    name: topic.name,
    lectures: normalizeToArray(topic.lectures),
    notes: normalizeToArray(topic.notes),
    dpps: normalizeToArray(topic.dpps)
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
