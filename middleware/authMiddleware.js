import jwt from "jsonwebtoken";
import User from "../models/User.js";
import { checkRolePermission } from "../config/permissions.js";

// Middleware to authenticate requests via HttpOnly cookie or Bearer token
export const authenticateUser = async (req, res, next) => {
  let token;

  // 1. Check HttpOnly cookie first (Preferred production security)
  if (req.cookies && req.cookies.token) {
    token = req.cookies.token;
  } 
  // 2. Fallback to Authorization Header
  else if (req.headers.authorization && req.headers.authorization.startsWith("Bearer")) {
    token = req.headers.authorization.split(" ")[1];
  }

  if (!token) {
    return res.status(401).json({
      success: false,
      message: "Unauthorized access. Please log in to proceed.",
      errors: {},
    });
  }

  try {
    const secret = process.env.JWT_SECRET || "supersecret_jwt_key_2026_patient_record_management";
    const decoded = jwt.verify(token, secret);

    const user = await User.findById(decoded.id).select("-password");

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "User session expired or user no longer exists.",
        errors: {},
      });
    }

    // REQUIREMENT #8: Deactivated user must not be able to authenticate
    if (!user.isActive) {
      return res.status(403).json({
        success: false,
        message: "Your account has been deactivated. Please contact the hospital administrator.",
        errors: {},
      });
    }

    req.user = user;
    next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: "Invalid or expired authentication token.",
      errors: {},
    });
  }
};

// Role-based authorization middleware
export const authorizeRoles = (...roles) => {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: `Forbidden. Role '${req.user?.role}' is not authorized to perform this operation.`,
        errors: {},
      });
    }
    next();
  };
};

// Permission-based authorization middleware (Requirement #4 & #5)
export const requirePermission = (...requiredPermissions) => {
  return async (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required.",
      });
    }

    if (req.user.role === "admin") {
      return next(); // Admin superuser bypass
    }

    for (const perm of requiredPermissions) {
      const hasPerm = await checkRolePermission(req.user.role, perm);
      if (!hasPerm) {
        return res.status(403).json({
          success: false,
          message: `Forbidden. Missing required permission '${perm}'.`,
        });
      }
    }

    next();
  };
};
