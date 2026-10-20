import express from "express";
import {
  loginUser,
  logoutUser,
  getCurrentUser,
  changePassword,
  updateProfile,
  changeEmail,
} from "../controllers/authController.js";
import { authenticateUser } from "../middleware/authMiddleware.js";
import { loginLimiter } from "../middleware/rateLimiter.js";
import { handleValidationErrors } from "../middleware/validator.js";
import {
  validateLogin,
  validateChangePassword,
  validateUpdateProfile,
  validateChangeEmail,
} from "../validators/authValidator.js";

const router = express.Router();

router.post("/login", loginLimiter, validateLogin, handleValidationErrors, loginUser);
router.post("/logout", authenticateUser, logoutUser);
router.get("/me", authenticateUser, getCurrentUser);
router.post("/change-password", authenticateUser, validateChangePassword, handleValidationErrors, changePassword);
router.post("/change-email", authenticateUser, validateChangeEmail, handleValidationErrors, changeEmail);
router.put("/profile", authenticateUser, validateUpdateProfile, handleValidationErrors, updateProfile);

export default router;

