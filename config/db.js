import mongoose from "mongoose";

export const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGO_URI || "mongodb://127.0.0.1:27017/patient_management_db", {
      // Modern mongoose options
    });
    console.log(`[MongoDB Connected]: ${conn.connection.host}/${conn.connection.name}`);
  } catch (error) {
    console.error(`[MongoDB Connection Error]: ${error.message}`);
    // Fail gracefully in development, allow server to run with mock fallback if MongoDB is not running locally
    if (process.env.NODE_ENV === "production") {
      process.exit(1);
    }
  }
};
