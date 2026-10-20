import express from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import morgan from "morgan";
import path from "path";
import mongoose from "mongoose";

import { apiLimiter } from "./middleware/rateLimiter.js";
import { notFoundHandler, errorHandler } from "./middleware/errorMiddleware.js";
import { authenticateUser } from "./middleware/authMiddleware.js";
import { streamDocument } from "./controllers/documentController.js";

import authRoutes from "./routes/authRoutes.js";
import patientRoutes from "./routes/patientRoutes.js";
import dashboardRoutes from "./routes/dashboardRoutes.js";
import adminRoutes from "./routes/adminRoutes.js";
import notificationRoutes from "./routes/notificationRoutes.js";
import reportRoutes from "./routes/reportRoutes.js";

const app = express();

// Security Middlewares - allow cross-origin resource access for file uploads/previews
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
  })
);

// CORS Configuration - Multi-origin support with credentials for Vercel & local development
const allowedOrigins = [
  "https://patientmanagement-adminpanel.vercel.app",
  "http://localhost:5173",
  "http://localhost:5174",
  "http://localhost:3000",
  process.env.CLIENT_URL,
].filter(Boolean);

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps, curl, or Postman)
      if (!origin) return callback(null, true);
      const cleanOrigin = origin.replace(/\/+$/, "");
      const isAllowed = allowedOrigins.some(
        (allowed) => allowed.replace(/\/+$/, "") === cleanOrigin
      );
      if (isAllowed) {
        return callback(null, true);
      }
      return callback(new Error(`Origin ${origin} not allowed by CORS`));
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With", "Accept"],
  })
);

// Body Parsers & Cookie Parser
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));
app.use(cookieParser());

// Serve uploaded static files
app.use("/uploads", express.static(path.join(process.cwd(), "uploads")));

// HTTP Request Logger
if (process.env.NODE_ENV !== "test") {
  app.use(morgan("dev"));
}

// Apply general API Rate Limiter
app.use("/api/", apiLimiter);

// API Health Check
app.get("/api/health", (req, res) => {
  const dbStatus = mongoose.connection.readyState === 1 ? "connected" : "disconnected";
  res.status(200).json({
    success: true,
    status: "ok",
    database: dbStatus,
    timestamp: new Date().toISOString(),
  });
});

// Secure Document Streaming Endpoint
app.get("/api/files/:fileId", authenticateUser, streamDocument);

// API Routes
app.use("/api/auth", authRoutes);
app.use("/api/patients", patientRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/reports", reportRoutes);

// Error Handling Middlewares
app.use(notFoundHandler);
app.use(errorHandler);

export default app;
