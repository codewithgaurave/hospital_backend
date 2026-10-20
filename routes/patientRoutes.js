import express from "express";
import {
  createPatient,
  getPatients,
  searchPatients,
  getPatientById,
  updatePatient,
  archivePatient,
  deletePatientPermanently,
  getPatientFilterOptions,
} from "../controllers/patientController.js";
import {
  getPatientHistory,
  getPatientVisits,
  createPatientVisit,
  getVisitById,
  updatePatientVisit,
  deletePatientVisit,
} from "../controllers/visitController.js";
import {
  uploadDocument,
  getPatientDocuments,
  deleteDocument,
} from "../controllers/documentController.js";
import { upload } from "../middleware/uploadMiddleware.js";
import { authenticateUser, authorizeRoles } from "../middleware/authMiddleware.js";
import { handleValidationErrors } from "../middleware/validator.js";
import { validatePatientRegistration } from "../validators/patientValidator.js";

const router = express.Router();

// Protect all patient routes with authenticateUser
router.use(authenticateUser);

// Patient Filter Options (dynamic doctors, departments, wards from patient table)
router.get("/filter-options", getPatientFilterOptions);

// Patient Search Route
router.get("/search", searchPatients);

// Patient List & Create
router
  .route("/")
  .get(getPatients)
  .post(authorizeRoles("admin", "doctor", "staff"), validatePatientRegistration, handleValidationErrors, createPatient);

// Direct visit delete helper for standalone reports
router.delete("/visits/:visitId", authorizeRoles("admin", "doctor"), deletePatientVisit);

// Medical History & Visits Routes
router.get("/:id/history", getPatientHistory);
router
  .route("/:id/visits")
  .get(getPatientVisits)
  .post(authorizeRoles("admin", "doctor", "staff"), createPatientVisit);

router
  .route("/:id/visits/:visitId")
  .get(getVisitById)
  .put(authorizeRoles("admin", "doctor"), updatePatientVisit)
  .patch(authorizeRoles("admin", "doctor"), updatePatientVisit)
  .delete(authorizeRoles("admin", "doctor"), deletePatientVisit);

// Document Management Routes
router
  .route("/:id/documents")
  .get(getPatientDocuments)
  .post(authorizeRoles("admin", "doctor", "staff"), upload.single("file"), uploadDocument);

router.delete("/:id/documents/:fileId", authorizeRoles("admin", "doctor"), deleteDocument);

// Backward Compatibility Upload Routes
router.post("/:id/files", authorizeRoles("admin", "doctor", "staff"), upload.single("file"), uploadDocument);
router.delete("/:id/files/:filename", authorizeRoles("admin", "doctor"), deleteDocument);

// Patient Archive (Soft Delete)
router.put("/:id/archive", authorizeRoles("admin", "doctor"), archivePatient);

// Patient Profile, Update, Permanent Delete
router
  .route("/:id")
  .get(getPatientById)
  .put(authorizeRoles("admin", "doctor"), updatePatient)
  .delete(authorizeRoles("admin"), deletePatientPermanently);

export default router;
