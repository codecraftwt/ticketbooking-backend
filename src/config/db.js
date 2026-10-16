import mongoose from 'mongoose';

// Disable query buffering in serverless to fail fast and show exact errors
mongoose.set('bufferCommands', false);

export const connectDB = async () => {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error('MONGODB_URI is not defined in Vercel Environment Variables.');
  }

  if (mongoose.connection.readyState === 1) {
    return mongoose.connection;
  }

  try {
    const conn = await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 5000,
      connectTimeoutMS: 5000,
    });
    console.log(`🍃 MongoDB Connected: ${conn.connection.host}`);
    return conn;
  } catch (err) {
    console.error(`⚠️ MongoDB Connection Error: ${err.message}`);
    throw new Error(`MongoDB Atlas Connection Error: ${err.message}`);
  }
};
