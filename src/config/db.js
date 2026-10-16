import mongoose from 'mongoose';

let cachedPromise = null;

export const connectDB = async () => {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error('MONGODB_URI is not defined in Vercel Environment Variables.');
  }

  if (mongoose.connection.readyState >= 1) {
    return mongoose.connection;
  }

  if (!cachedPromise) {
    cachedPromise = mongoose.connect(uri, {
      serverSelectionTimeoutMS: 10000,
    }).then((conn) => {
      console.log(`🍃 MongoDB Connected: ${conn.connection.host}`);
      return conn;
    }).catch((err) => {
      cachedPromise = null;
      console.error(`⚠️ MongoDB Connection Error: ${err.message}`);
      throw new Error(`MongoDB Atlas Connection Failed (${err.message}). Ensure 0.0.0.0/0 is allowed in MongoDB Atlas Network Access.`);
    });
  }

  return cachedPromise;
};
