// server.js
const express = require("express");
const axios = require("axios");
const cors = require("cors");
const app = express();
const PORT = process.env.PORT || 3000;

// URL of your Flask API hosted on Replit
const PYTHON_API = "https://5f129b41-01f2-4d5a-8f1c-6dcb49be4165-00-8xnq81j897xt.pike.replit.dev"; // CHANGE THIS

app.use(cors());
app.use(express.static("public")); // if you serve static HTML from here

// Proxy: Batches (obfuscates real URLs)
app.get("/api/proxy/batches", async (req, res) => {
  try {
    const response = await axios.get(`${PYTHON_API}/api/batches`);
    const batches = response.data.map(batch => ({
      name: batch.name,
      image: batch.image,
      url: `/api/proxy/subjects?batchId=${encodeURIComponent(batch.url)}`
    }));
    res.json(batches);
  } catch (error) {
    console.error(error.message);
    res.status(500).json({ error: "Failed to fetch batches" });
  }
});

// Proxy: Subjects
app.get("/api/proxy/subjects", async (req, res) => {
  const batchUrl = req.query.batchId;
  if (!batchUrl) return res.status(400).json({ error: "Missing batchId" });

  try {
    const response = await axios.get(`${PYTHON_API}/api/subjects`, {
      params: { url: batchUrl }
    });
    const subjects = response.data.map(subject => ({
      name: subject.name,
      url: `/api/proxy/chapters?subjectId=${encodeURIComponent(subject.url)}`
    }));
    res.json(subjects);
  } catch (error) {
    console.error(error.message);
    res.status(500).json({ error: "Failed to fetch subjects" });
  }
});

// Proxy: Chapters
app.get("/api/proxy/chapters", async (req, res) => {
  const subjectUrl = req.query.subjectId;
  if (!subjectUrl) return res.status(400).json({ error: "Missing subjectId" });

  try {
    const response = await axios.get(`${PYTHON_API}/api/chapters`, {
      params: { url: subjectUrl }
    });
    const chapters = response.data.map(chapter => ({
      name: chapter.name,
      url: `/api/proxy/lectures?chapterId=${encodeURIComponent(chapter.url)}`
    }));
    res.json(chapters);
  } catch (error) {
    console.error(error.message);
    res.status(500).json({ error: "Failed to fetch chapters" });
  }
});

// Proxy: Lectures (you may optionally hide these too)
app.get("/api/proxy/lectures", async (req, res) => {
  const chapterUrl = req.query.chapterId;
  if (!chapterUrl) return res.status(400).json({ error: "Missing chapterId" });

  try {
    const response = await axios.get(`${PYTHON_API}/api/lectures`, {
      params: { url: chapterUrl }
    });
    res.json(response.data); // Optional: sanitize thumbnails if needed
  } catch (error) {
    console.error(error.message);
    res.status(500).json({ error: "Failed to fetch lectures" });
  }
});

app.listen(PORT, () => {
  console.log(`✅ Node.js proxy server running at http://localhost:${PORT}`);
});
