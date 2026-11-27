import { MongoClient, type Db } from 'mongodb';
import { config } from './config.js';

let client: MongoClient | null = null;

export async function getDb(): Promise<Db> {
  if (!config.mongoUri) throw new Error('MONGODB_URI non défini (voir .env.example).');
  if (!client) {
    client = new MongoClient(config.mongoUri);
    await client.connect();
  }
  return client.db(config.dbName);
}
