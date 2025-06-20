// server.js
const express = require("express");
const axios = require("axios");
const cors = require("cors");
const app = express();
const PORT = process.env.PORT || 3000;

// URL of your Flask API hosted on Replit
const PYTHON_API = "https://api-data-3273d6dd6260.herokuapp.com"; // CHANGE THIS

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

// Proxy: Today Class
app.get("/api/proxy/todayclass", async (req, res) => {
  const batchUrl = req.query.batchId;
  if (!batchUrl) return res.status(400).json({ error: "Missing batchId" });

  try {
    const response = await axios.get(`${PYTHON_API}/api/todayclass`, {
      params: { url: batchUrl }
    });

    const cleaned = response.data.map(cls => {
      const cleanedItem = { ...cls };

      // Replace rarestudy thumbnail if matched
      if (cleanedItem.thumbnail === "https://rarestudy.site/static/rarestudy.jpg") {
        cleanedItem.thumbnail = "https://res.cloudinary.com/dfpbytn7c/image/upload/v1749008680/IMG_20250604_091231_088_th95bg.jpg";
      }

      // Remove null thumbnail and assign image
      if (cleanedItem.thumbnail === null) {
        delete cleanedItem.thumbnail;
      } else {
        cleanedItem.image = cleanedItem.thumbnail;
      }

      return cleanedItem;
    });

    res.json(cleaned);
  } catch (error) {
    console.error("Failed to fetch todayclass:", error.message);
    res.status(500).json({ error: "Failed to fetch todayclass" });
  }
});

// Proxy: Notes
app.get("/api/proxy/notes", async (req, res) => {
  const chapterUrl = req.query.chapterId;
  if (!chapterUrl) return res.status(400).json({ error: "Missing chapterId" });

  try {
    const response = await axios.get(`${PYTHON_API}/api/notes`, {
      params: { url: chapterUrl }
    });
    res.json(response.data);
  } catch (error) {
    console.error("Failed to fetch notes:", error.message);
    res.status(500).json({ error: "Failed to fetch notes" });
  }
});

// Proxy: DPP Notes
app.get("/api/proxy/dppnotes", async (req, res) => {
  const dppUrl = req.query.chapterId;
  if (!dppUrl) return res.status(400).json({ error: "Missing chapterId" });

  try {
    const response = await axios.get(`${PYTHON_API}/api/DppNotes`, {
      params: { url: dppUrl }
    });
    res.json(response.data);
  } catch (error) {
    console.error("Failed to fetch DPP notes:", error.message);
    res.status(500).json({ error: "Failed to fetch DPP notes" });
  }
});

// Proxy: DPP Lecture Videos
app.get("/api/proxy/dpplecture", async (req, res) => {
  const dppUrl = req.query.chapterId;
  if (!dppUrl) return res.status(400).json({ error: "Missing chapterId" });

  try {
    const response = await axios.get(`${PYTHON_API}/api/DppVideos`, {
      params: { url: dppUrl }
    });

    const lectures = response.data.map(item => {
      const lecture = { ...item };

      // Map thumbnail to image if it exists
      if (lecture.thumbnail) {
        lecture.image = lecture.thumbnail;
      }

      return lecture;
    });

    res.json(lectures);
  } catch (error) {
    console.error("Failed to fetch DPP lectures:", error.message);
    res.status(500).json({ error: "Failed to fetch DPP lectures" });
  }
});

app.listen(PORT, () => {
  console.log(`✅ Node.js proxy server running at http://localhost:${PORT}`);
});
