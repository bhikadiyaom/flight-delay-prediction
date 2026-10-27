import mongoose from 'mongoose';
import { env } from './env.js';
import { logger } from '../utils/logger.js';

mongoose.set('strictQuery', true);

export async function connectDB(uri = env.MONGODB_URI) {
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 8000 });
  logger.info('mongo connected', { db: mongoose.connection.name });
  return mongoose.connection;
}

export async function disconnectDB() {
  await mongoose.disconnect();
}

export const dbReady = () => mongoose.connection.readyState === 1;
