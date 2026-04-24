const mongoose = require('mongoose');

const getMongoUri = () => {
  if (typeof process.env.MONGO_URI === 'string' && process.env.MONGO_URI.trim()) {
    return process.env.MONGO_URI.trim();
  }

  if (process.env.NODE_ENV !== 'production') {
    const fallbackUri = 'mongodb://127.0.0.1:27017/secureinstagram';
    console.warn(`[DB] MONGO_URI not set. Falling back to ${fallbackUri}`);
    return fallbackUri;
  }

  return undefined;
};

const connectDB = async () => {
  const mongoUri = getMongoUri();

  if (!mongoUri) {
    console.error('Database connection error: MONGO_URI is missing. Set it in backend/.env.');
    process.exit(1);
  }

  try {
    const conn = await mongoose.connect(mongoUri, {
      connectTimeoutMS: 10000,
      socketTimeoutMS: 45000,
      serverSelectionTimeoutMS: 5000,
      retryWrites: true,
    });
    console.log(`MongoDB Connected: ${conn.connection.host}`);
  } catch (error) {
    console.error('Database connection error:', error.message);
    console.log('⚠️  Retrying MongoDB connection in 5 seconds...');
    setTimeout(() => connectDB(), 5000);
  }
};

module.exports = connectDB;
