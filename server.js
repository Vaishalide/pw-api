const express = require('express');
const path = require('path');
const fetch = require('node-fetch'); // Make sure to install: npm install node-fetch
const app = express();

app.use(express.static(path.join(__dirname, 'public')));

const API_BASE = 'https://sorry-junie-ishaautofilterbot-a45d8912.koyeb.app';

// Proxy: GET /data
app.get('/data', async (req, res) => {
  try {
    const response = await fetch(`${API_BASE}/data`);
    const json = await response.json();
    res.json(json);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch data' });
  }
});

// Proxy: GET /data/batches/:batchId/subjects
app.get('/data/batches/:batchId/subjects', async (req, res) => {
  try {
    const response = await fetch(`${API_BASE}/data/batches/${req.params.batchId}/subjects`);
    const json = await response.json();
    res.json(json);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch subjects' });
  }
});

// Proxy: GET /data/batches/:batchId/subjects/:subjectId/topics
app.get('/data/batches/:batchId/subjects/:subjectId/topics', async (req, res) => {
  try {
    const response = await fetch(`${API_BASE}/data/batches/${req.params.batchId}/subjects/${req.params.subjectId}/topics`);
    const topics = await response.json();

    // Normalize structure
    const normalized = topics.map(topic => ({
      ...topic,
      lectures: Array.isArray(topic.lectures) ? topic.lectures : Object.values(topic.lectures || {}),
      notes: Array.isArray(topic.notes) ? topic.notes : Object.values(topic.notes || {}),
      dpps: Array.isArray(topic.dpps) ? topic.dpps : Object.values(topic.dpps || {})
    }));

    res.json(normalized);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch topics' });
  }
});

// SPA Fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
