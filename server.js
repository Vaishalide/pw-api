const express = require('express');
const cors = require('cors');
const app = express();
const data = require('./data.json'); // Load local JSON file

app.use(cors()); // Enable CORS for all origins
app.get('/', (req, res) => {
  res.send('✅ PW API is running! ');
});

app.get('/data', (req, res) => {
  res.json(data);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
