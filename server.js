const express = require('express');
const cors = require('cors');
const app = express();
const PORT = process.env.PORT || 3000;

// Original cookie data
const COOKIE_DATA = {
  domain: ".streamfiles.eu.org",
  cookies: {
    verified_task: "d",
    //countdown_end_time: "MTc1MDgyMjgzNzQ5Nw=="
  },
  target_url: "https://others.streamfiles.eu.org/cw",
  timestamp: () => Date.now()  // for dynamic freshness
};

app.use(cors());

// JSON API that returns cookie data in real-time
app.get('/api/cookies', (req, res) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.json({
    domain: COOKIE_DATA.domain,
    cookies: COOKIE_DATA.cookies,
    target_url: COOKIE_DATA.target_url,
    timestamp: COOKIE_DATA.timestamp()
  });
});

app.listen(PORT, () => {
  console.log(`✅ Cookie JSON API running at http://localhost:${PORT}/api/cookies`);
});
