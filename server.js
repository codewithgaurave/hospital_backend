import dotenv from "dotenv";
import mongoose from "mongoose";
import app from "./app.js";
import { connectDB } from "./config/db.js";

// Load environment variables
dotenv.config();

const PORT = process.env.PORT || 5000;

// Connect to MongoDB
connectDB();

// Start Express Server
const server = app.listen(PORT, () => {
  console.log(`==================================================`);
  console.log(`[Patient Record Management Express Server]: Running on PORT ${PORT}`);
  console.log(`[Environment]: ${process.env.NODE_ENV || "development"}`);
  console.log(`[Allowed Client CORS Origin]: ${process.env.CLIENT_URL || "http://localhost:5173"}`);
  console.log(`==================================================`);
});

// Graceful Shutdown Handler
const gracefulShutdown = (signal) => {
  console.log(`\n[${signal}] Received signal. Initiating graceful shutdown...`);

  server.close(async () => {
    console.log("[Express Server]: HTTP server closed successfully.");
    try {
      await mongoose.connection.close();
      console.log("[MongoDB]: Mongoose database connection closed.");
      process.exit(0);
    } catch (err) {
      console.error("[MongoDB Shutdown Error]:", err.message);
      process.exit(1);
    }
  });

  // Force exit after 10 seconds if shutdown hangs
  setTimeout(() => {
    console.error("[Graceful Shutdown]: Forced timeout reached. Terminating process.");
    process.exit(1);
  }, 10000);
};

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));

// Handle unhandled promise rejections & uncaught exceptions
process.on("unhandledRejection", (err) => {
  console.error(`[Unhandled Rejection Error]: ${err.message}`);
});

process.on("uncaughtException", (err) => {
  console.error(`[Uncaught Exception Error]: ${err.message}`);
});
