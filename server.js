const express = require('express');
const app = express();
const data = require('./data.json');

// Optional: Restrict CORS to proxy domain
const cors = require('cors');
app.use(cors({ origin: 'https://physicswallahapi.onrender.com' }));

// Route: GET /data (list of batches)
app.get('/data', (req, res) => {
  res.json(data);
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

// Route: GET /data/batches/:batchId/subjects/:subjectId/topics
app.get('/data/batches/:batchId/subjects/:subjectId/topics', (req, res) => {
  const batch = data.batches[req.params.batchId];
  const subject = batch?.subjects?.[req.params.subjectId];

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

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
