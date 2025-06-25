const express = require("express");
const cors = require("cors");
const app = express();
const PORT = process.env.PORT || 3000;

const VALID_TOKEN = "abcdef@2005#";  // <-- Use the same value in MainActivity

app.use(cors());

// --- Cookie profiles for multiple sites ---
const COOKIE_PROFILES = {
  cw: {
    domain: ".streamfiles.eu.org",
    cookies: {
      verified_task: "dHJ1ZQ==",
      countdown_end_time: "MTc2NDU0NzIwMDAwMA=="
    },
    target_url: "https://others.streamfiles.eu.org/cw"
  },
  pwthor: {
    domain: ".pwthor.site",
    cookies: {
      login: "success"
    },
    target_url: "https://example.pwthor.site/home"
  }
};

// --- Token check middleware ---
app.use('/api/cookies/:site', (req, res, next) => {
  const token = req.header("X-App-Token");
  if (token !== VALID_TOKEN) {
    return res.status(403).json({ error: "Unauthorized" });
  }
  next();
});

// --- Dynamic cookie API ---
app.get('/api/cookies/:site', (req, res) => {
  const { site } = req.params;
  const profile = COOKIE_PROFILES[site];

  if (!profile) {
    return res.status(404).json({ error: "Site profile not found" });
  }

  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.json({
    domain: profile.domain,
    cookies: profile.cookies,
    target_url: profile.target_url,
    timestamp: Date.now()
  });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
