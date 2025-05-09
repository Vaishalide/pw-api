const express = require('express');
const cors = require('cors');
const app = express();
const data = require('./data.json');

app.use(cors());

// Existing route
app.get('/data', (req, res) => {
  res.json(data);
});

// 🔹 New route to get subjects of a batch
app.get('/data/batches/:batchId/subjects', (req, res) => {
  const batch = data.batches[req.params.batchId];
  if (!batch || !batch.subjects) return res.status(404).json([]);

  const subjects = Object.entries(batch.subjects).map(([key, val]) => ({
    key,
    name: val.name
  }));
  res.json(subjects);
});

// 🔹 New route to get topics of a subject in a batch
app.get('/data/batches/:batchId/subjects/:subjectId/topics', (req, res) => {
  const batch = data.batches[req.params.batchId];
  if (!batch || !batch.subjects) return res.status(404).json([]);

  const subject = batch.subjects[req.params.subjectId];
  if (!subject || !subject.topics) return res.status(404).json([]);

  const topics = Object.entries(subject.topics).map(([key, val]) => ({
    key,
    name: val.name,
    lectures: Array.isArray(val.lectures) ? val.lectures : Object.values(val.lectures || {}),
    notes: Array.isArray(val.notes) ? val.notes : Object.values(val.notes || {}),
    dpps: Array.isArray(val.dpps) ? val.dpps : Object.values(val.dpps || {})
  }));

  res.json(topics);
});


const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
