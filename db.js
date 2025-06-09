// db.js
const { MongoClient } = require('mongodb');

const MONGO_URI = process.env.MONGO_URI || 'mongodb+srv://playerzoneproowner:5KwRcJnoXEyNRD8D@cluster0.w3ryplr.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0';
const DB_NAME = 'telegramjson';

let client = null;
let db = null;

/**
 * Returns the MongoDB database instance, creating
 * the client & pool on first call.
 */
async function getDb() {
  if (db) return db;

  if (!client) {
    client = new MongoClient(MONGO_URI, {
      useUnifiedTopology: true,
      // adjust pool sizes to stay well under Atlas limits
      maxPoolSize: 20,
      minPoolSize: 5,
      serverSelectionTimeoutMS: 5000,
    });
    await client.connect();
    console.log('✅ MongoClient connected & pool established');
  }

  db = client.db(DB_NAME);
  return db;
}

module.exports = { getDb };
