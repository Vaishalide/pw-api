const express = require('express');
const path = require('path');
const app = express();

// Load local data
const data = require('./data.json');

// Serve static files from "public" directory
app.use(express.static(path.join(__dirname, 'public')));

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

// Route: GET /data/batches/:batchId/subjects/:subjectId/topics
app.get('/data/batches/:batchId/subjects/:subjectId/topics', (req, res) => {
  const batch = data.batches[req.params.batchId];
  const subject = batch?.subjects?.[req.params.subjectId];

  if (!subject || !subject.topics) {
    return res.status(404).json({ error: 'Subject or topics not found' });
  }

  const topics = Object.entries(subject.topics).map(([key, topic]) => ({
    key,
    ...topic,
    lectures: Array.isArray(topic.lectures) ? topic.lectures : Object.values(topic.lectures || {}),
    notes: Array.isArray(topic.notes) ? topic.notes : Object.values(topic.notes || {}),
    dpps: Array.isArray(topic.dpps) ? topic.dpps : Object.values(topic.dpps || {})
  }));

  res.json(topics);
});

// SPA fallback to index.html
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
