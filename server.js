// server.js
const express = require('express');
const path = require('path');
const cors = require('cors');
const fetch = require('node-fetch');

const app = express();

// Enable CORS
app.use(cors());

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Proxy target
const API_BASE = 'https://sorry-junie-ishaautofilterbot-a45d8912.koyeb.app';

// Proxy routes
app.get('/data', async (req, res) => {
  try {
    const response = await fetch(`${API_BASE}/data`);
    const data = await response.json();
    res.json(data);
  } catch (err) {
    console.error('Error fetching /data:', err);
    res.status(500).json({ error: 'Failed to fetch data' });
  }
});

app.get('/data/batches/:batchId/subjects', async (req, res) => {
  try {
    const response = await fetch(`${API_BASE}/data/batches/${req.params.batchId}/subjects`);
    const data = await response.json();
    res.json(data);
  } catch (err) {
    console.error('Error fetching subjects:', err);
    res.status(500).json({ error: 'Failed to fetch subjects' });
  }
});

app.get('/data/batches/:batchId/subjects/:subjectId/topics', async (req, res) => {
  try {
    const response = await fetch(`${API_BASE}/data/batches/${req.params.batchId}/subjects/${req.params.subjectId}/topics`);
    const original = await response.json();

    // Normalize lectures, notes, dpps to always be arrays
    const topics = original.map(topic => ({
      ...topic,
      lectures: Array.isArray(topic.lectures)
        ? topic.lectures
        : Object.values(topic.lectures || {}),
      notes: Array.isArray(topic.notes)
        ? topic.notes
        : Object.values(topic.notes || {}),
      dpps: Array.isArray(topic.dpps)
        ? topic.dpps
        : Object.values(topic.dpps || {})
    }));

    res.json(topics);
  } catch (err) {
    console.error('Error fetching topics:', err);
    res.status(500).json({ error: 'Failed to fetch topics' });
  }
});

// SPA fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
