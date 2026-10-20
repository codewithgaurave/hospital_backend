import rateLimit from "express-rate-limit";

// Strict rate limiter for Login attempts
export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 Minutes
  max: 15, // Limit each IP to 15 requests per 15 minutes
  message: {
    success: false,
    message: "Too many login attempts from this IP. Please try again after 15 minutes.",
    errors: {},
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// General API Rate Limiter
export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 Minutes
  max: 300, // Limit each IP to 300 requests per 15 minutes
  message: {
    success: false,
    message: "Too many API requests from this IP. Please try again later.",
    errors: {},
  },
  standardHeaders: true,
  legacyHeaders: false,
});
