// Local MongoDB without installing it: `npm run dev:db` starts a real mongod (downloaded once by
// mongodb-memory-server) on 127.0.0.1:27017 with data persisted in server/.data/mongo.
import { MongoMemoryServer } from 'mongodb-memory-server';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

const dbPath = path.resolve('.data', 'mongo');
mkdirSync(dbPath, { recursive: true });

const mongod = await MongoMemoryServer.create({
  instance: { port: 27017, ip: '127.0.0.1', dbPath, storageEngine: 'wiredTiger' },
});
console.log(`mongod ready: ${mongod.getUri()}  (data: ${dbPath}). Ctrl+C to stop.`);

const stop = async () => { await mongod.stop({ doCleanup: false }); process.exit(0); };
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
