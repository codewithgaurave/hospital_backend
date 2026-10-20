import express from "express";
import {
  getAdminDashboardSummary,
  getUsers,
  createUser,
  getUserById,
  updateUser,
  toggleUserStatus,
  resetUserPassword,
  getRolesAndPermissions,
  updateRolePermissions,
  getAuditLogs,
  getActivityFeed,
} from "../controllers/adminController.js";
import { authenticateUser, authorizeRoles, requirePermission } from "../middleware/authMiddleware.js";

const router = express.Router();

// Require Authentication for all Admin routes
router.use(authenticateUser);

// Admin Dashboard Summary
router.get("/dashboard", authorizeRoles("admin"), getAdminDashboardSummary);

// User Management Routes
router
  .route("/users")
  .get(authorizeRoles("admin"), getUsers)
  .post(authorizeRoles("admin"), createUser);

router
  .route("/users/:id")
  .get(authorizeRoles("admin"), getUserById)
  .put(authorizeRoles("admin"), updateUser);

router.patch("/users/:id/status", authorizeRoles("admin"), toggleUserStatus);
router.post("/users/:id/reset-password", authorizeRoles("admin"), resetUserPassword);

// Role & Permission Matrix Routes
router.get("/roles", authorizeRoles("admin"), getRolesAndPermissions);
router.get("/permissions", authorizeRoles("admin"), getRolesAndPermissions);
router.put("/roles/:role/permissions", authorizeRoles("admin"), updateRolePermissions);

// Audit Logs & Activity Feed Routes
router.get("/audit-logs", authorizeRoles("admin"), getAuditLogs);
router.get("/activity", authorizeRoles("admin"), getActivityFeed);

export default router;
