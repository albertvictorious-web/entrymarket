import 'dotenv/config';
import { MongoClient } from 'mongodb';

const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017';
const dbName = process.env.MONGODB_DB || 'entrymarket';

let client;
let db;

export async function connect() {
  if (db) return db;
  client = new MongoClient(uri, { serverSelectionTimeoutMS: 5000 });
  await client.connect();
  db = client.db(dbName);
  await ensureIndexes(db);
  return db;
}

export function getDb() {
  if (!db) throw new Error('Database not connected');
  return db;
}

async function ensureIndexes(database) {
  await database.collection('users').createIndex({ email: 1 }, { unique: true });
  await database.collection('users').createIndex({ role: 1 });
  await database.collection('nmi').createIndex({ marketingId: 1, date: -1 });
  await database.collection('leads').createIndex({ marketingId: 1, status: 1 });
  await database.collection('appointments').createIndex({ marketingId: 1, date: 1 });
  await database.collection('rewards').createIndex({ marketingId: 1, status: 1 });
  await database.collection('announcements').createIndex({ createdAt: -1 });
}

export async function close() {
  if (client) await client.close();
}
