import express from "express";
import { getDashboardSummary } from "../controllers/dashboardController.js";
import { authenticateUser } from "../middleware/authMiddleware.js";

const router = express.Router();

router.use(authenticateUser);

router.get("/summary", getDashboardSummary);

export default router;
