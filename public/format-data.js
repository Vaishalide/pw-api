// This script can be used to format your data.json
// Run it with: node format-data.js

const fs = require('fs');

// Read data.json
const data = require('./data.json');

// You might need to compress or format your data if it's very large
// Cloudflare Variables have size limits
// For large datasets, consider chunking or using Cloudflare KV

// Just ensure the data.json is valid and properly formatted
const formattedData = JSON.stringify(data, null, 2);

// Output formatted data
fs.writeFileSync('formatted-data.json', formattedData);

console.log('Data formatted and saved to formatted-data.json');
console.log('Size: ' + (formattedData.length / 1024).toFixed(2) + ' KB');

// If your data is very large (>1MB), it may need to be split or stored differently
// Cloudflare Variables have a size limit of 1MB per variable
if (formattedData.length > 1024 * 1024) {
  console.warn('WARNING: Data exceeds 1MB, consider using Cloudflare KV or R2 instead of Variables');
}
