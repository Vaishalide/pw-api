const express = require("express");
const axios = require("axios");
const cors = require("cors");
const app = express();
const PORT = process.env.PORT || 3000;

// Backend API
const PYTHON_API = "https://api-data-3273d6dd6260.herokuapp.com";

app.use(cors());
app.use(express.static("public"));

const replaceHostToFrontend = url => url.replace("https://rarestudy.site", "fetch");
const replaceHostToBackend = url => url.replace("fetch", "https://rarestudy.site");

// Proxy: Batches
app.get("/api/proxy/batches", async (req, res) => {
  try {
    const response = await axios.get(`${PYTHON_API}/api/batches`);
    const batches = response.data.map(batch => ({
      name: batch.name,
      image: batch.image,
      url: `/api/proxy/subjects?batchId=${encodeURIComponent(replaceHostToFrontend(batch.url))}`
    }));
    res.json(batches);
  } catch (error) {
    console.error(error.message);
    res.status(500).json({ error: "Failed to fetch batches" });
  }
});

// Proxy: Subjects
app.get("/api/proxy/subjects", async (req, res) => {
  const batchUrl = replaceHostToBackend(req.query.batchId);
  if (!batchUrl) return res.status(400).json({ error: "Missing batchId" });

  try {
    const response = await axios.get(`${PYTHON_API}/api/subjects`, {
      params: { url: batchUrl }
    });
    const subjects = response.data.map(subject => ({
      name: subject.name,
      url: `/api/proxy/chapters?subjectId=${encodeURIComponent(replaceHostToFrontend(subject.url))}`
    }));
    res.json(subjects);
  } catch (error) {
    console.error(error.message);
    res.status(500).json({ error: "Failed to fetch subjects" });
  }
});

// Proxy: Chapters
app.get("/api/proxy/chapters", async (req, res) => {
  const subjectUrl = replaceHostToBackend(req.query.subjectId);
  if (!subjectUrl) return res.status(400).json({ error: "Missing subjectId" });

  try {
    const response = await axios.get(`${PYTHON_API}/api/chapters`, {
      params: { url: subjectUrl }
    });
    const chapters = response.data.map(chapter => ({
      name: chapter.name,
      url: `/api/proxy/lectures?chapterId=${encodeURIComponent(replaceHostToFrontend(chapter.url))}`
    }));
    res.json(chapters);
  } catch (error) {
    console.error(error.message);
    res.status(500).json({ error: "Failed to fetch chapters" });
  }
});


// Proxy: Lectures
app.get("/api/proxy/lectures", async (req, res) => {
  const chapterUrl = replaceHostToBackend(req.query.chapterId);
  if (!chapterUrl) return res.status(400).json({ error: "Missing chapterId" });

  try {
    const response = await axios.get(`${PYTHON_API}/api/lectures`, {
      params: { url: chapterUrl }
    });

    const lectures = response.data.map(lecture => {
      if (lecture.thumbnail) {
        lecture.image = lecture.thumbnail;
      }

      // Case 1: Clean YouTube links like https://rarestudy.site/youtube.com/...
      if (
        typeof lecture.url === "string" &&
        lecture.url.includes("https://rarestudy.site/youtube.com")
      ) {
        lecture.url = lecture.url.replace("https://rarestudy.site", "");
      }

      // Case 2: Convert non-YouTube rarestudy.site links to fetch format
      else if (
        typeof lecture.url === "string" &&
        lecture.url.includes("https://rarestudy.site")
      ) {
        lecture.url = replaceHostToFrontend(lecture.url);
      }

      return lecture;
    });

    res.json(lectures);
  } catch (error) {
    console.error("Failed to fetch lectures:", error.message);
    res.status(500).json({ error: "Failed to fetch lectures" });
  }
});

// Proxy: Today Class
app.get("/api/proxy/todayclass", async (req, res) => {
  const batchUrl = replaceHostToBackend(req.query.batchId);
  if (!batchUrl) return res.status(400).json({ error: "Missing batchId" });

  try {
    const response = await axios.get(`${PYTHON_API}/api/todayclass`, {
      params: { url: batchUrl }
    });

    const cleaned = response.data.map(cls => {
      const cleanedItem = { ...cls };

      if (cleanedItem.thumbnail === "https://rarestudy.site/static/rarestudy.jpg") {
        cleanedItem.thumbnail = "https://res.cloudinary.com/dfpbytn7c/image/upload/v1749008680/IMG_20250604_091231_088_th95bg.jpg";
      }

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
  const chapterUrl = replaceHostToBackend(req.query.chapterId);
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
  const dppUrl = replaceHostToBackend(req.query.chapterId);
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
  const dppUrl = replaceHostToBackend(req.query.chapterId);
  if (!dppUrl) return res.status(400).json({ error: "Missing chapterId" });

  try {
    const response = await axios.get(`${PYTHON_API}/api/DppVideos`, {
      params: { url: dppUrl }
    });

    const lectures = response.data.map(item => {
      const lecture = { ...item };
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
// Proxy: Video Data
app.get("/api/proxy/video", async (req, res) => {
  const videoUrl = replaceHostToBackend(req.query.url);
  if (!videoUrl) return res.status(400).json({ error: "Missing url" });

  try {
    const response = await axios.get(`${PYTHON_API}/api/video`, {
      params: { url: videoUrl }
    });

    // Pass through exact response data (can be object or string)
    res.json(response.data);
  } catch (error) {
    console.error("Failed to fetch video data:", error.message);
    res.status(500).json({ error: "Failed to fetch video data" });
  }
});

app.listen(PORT, () => {
  console.log(`✅ Node.js proxy server running at http://localhost:${PORT}`);
});
