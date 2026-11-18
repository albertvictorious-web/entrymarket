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
  await database.collection('users').createIndex({ tenantId: 1, role: 1 });
  await database.collection('nmi').createIndex({ tenantId: 1, marketingId: 1, date: -1 });
  await database.collection('leads').createIndex({ tenantId: 1, marketingId: 1, status: 1 });
  await database.collection('appointments').createIndex({ tenantId: 1, marketingId: 1, date: 1 });
  await database.collection('rewards').createIndex({ tenantId: 1, marketingId: 1, status: 1 });
  await database.collection('announcements').createIndex({ tenantId: 1, createdAt: -1 });
  await database.collection('tenants').createIndex({ slug: 1 }, { unique: true });
  await database.collection('tenants').createIndex({ subscriptionStatus: 1, expiresAt: 1 });
  await migrateTenants(database);
}

async function migrateTenants(database) {
  const tenants = database.collection('tenants');
  const users = database.collection('users');
  const masterEmail = String(process.env.MASTER_ADMIN_EMAIL || 'admin@entrymarket.id').trim().toLowerCase();
  const master = await users.findOne({ email: masterEmail, role: { $in: ['admin', 'master'] } });
  if (master) {
    await users.updateOne({ _id: master._id }, { $set: { role: 'master' }, $unset: { tenantId: '' } });
  }

  const migrations = database.collection('migrations');
  if (await migrations.findOne({ _id: 'tenant-scope-v1' })) return;

  const tenantCollections = [
    'nmi', 'leads', 'appointments', 'rewards', 'announcements',
    'claims', 'settings', 'notes', 'reglinks', 'ai_chats',
  ];
  const existingTenantUsers = await users.findOne({ role: { $in: ['admin', 'marketing'] }, tenantId: { $exists: true } });
  const missingTenantUsers = await users.findOne({ role: { $in: ['admin', 'marketing'] }, tenantId: { $exists: false } });
  const unassignedData = await Promise.all(tenantCollections.map((name) =>
    database.collection(name).findOne({ tenantId: { $exists: false } }, { projection: { _id: 1 } }),
  ));
  if (!missingTenantUsers && !existingTenantUsers && !unassignedData.some(Boolean)) return;

  let legacyTenant = await tenants.findOne({ slug: 'entrymarket-default' });
  if (!legacyTenant) {
    const owner = await users.findOne({ role: 'admin' });
    const now = new Date();
    try {
      const { insertedId } = await tenants.insertOne({
        name: owner?.company || 'Doo Financial Futures',
        slug: 'entrymarket-default',
        plan: 'Legacy',
        subscriptionStatus: 'active',
        createdAt: now,
        updatedAt: now,
      });
      legacyTenant = { _id: insertedId };
    } catch (error) {
      if (error?.code !== 11000) throw error;
      legacyTenant = await tenants.findOne({ slug: 'entrymarket-default' });
    }
  }

  await users.updateMany(
    { role: { $in: ['admin', 'marketing'] }, tenantId: { $exists: false } },
    { $set: { tenantId: legacyTenant._id } },
  );
  await Promise.all(tenantCollections.map((name) =>
    database.collection(name).updateMany({ tenantId: { $exists: false } }, { $set: { tenantId: legacyTenant._id } }),
  ));
  await migrations.updateOne(
    { _id: 'tenant-scope-v1' },
    { $set: { completedAt: new Date() } },
    { upsert: true },
  );
}

export async function close() {
  if (client) await client.close();
}
