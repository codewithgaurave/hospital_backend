import express from "express";
import {
  getDashboardAnalytics,
  getAdvancedSearch,
  getGlobalSearch,
  getOPDReport,
  getIPDReport,
  getDischargeReport,
  getFollowUpReport,
  getHistopathologyReport,
  exportReportCSV,
  generatePatientPDF,
  generateVisitPDF,
} from "../controllers/reportController.js";
import { authenticateUser, requirePermission } from "../middleware/authMiddleware.js";

const router = express.Router();

// Require authentication for all Report routes
router.use(authenticateUser);

// Dashboard Analytics API
router.get("/dashboard", requirePermission("reports.view"), getDashboardAnalytics);

// Global & Advanced Search APIs
router.get("/search", requirePermission("patients.search"), getAdvancedSearch);
router.get("/global-search", getGlobalSearch);

// Clinical Reports
router.get("/opd", requirePermission("reports.view"), getOPDReport);
router.get("/ipd", requirePermission("reports.view"), getIPDReport);
router.get("/discharges", requirePermission("reports.view"), getDischargeReport);
router.get("/followups", requirePermission("reports.view"), getFollowUpReport);
router.get("/histopathology", requirePermission("reports.view"), getHistopathologyReport);

// Export CSV Endpoint
router.get("/export", requirePermission("reports.export"), exportReportCSV);

// Server-side PDF Endpoints
router.get("/patients/:id/pdf", requirePermission("reports.print"), generatePatientPDF);
router.get("/visits/:visitId/pdf", requirePermission("reports.print"), generateVisitPDF);

export default router;
