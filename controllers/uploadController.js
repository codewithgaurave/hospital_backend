import Patient from "../models/Patient.js";
import fs from "fs";
import path from "path";
import { logAudit } from "../utils/auditLogger.js";

// @desc    Upload file for a patient record
// @route   POST /api/patients/:id/files (or /api/uploads)
// @access  Private (Admin, Doctor, Staff)
export const uploadPatientFile = async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "No file uploaded or invalid file format",
        errors: { file: "File is required and must be JPEG, PNG, WEBP, or PDF under 10MB." },
      });
    }

    let patient;
    if (id && id !== "temp") {
      if (id.match(/^[0-9a-fA-F]{24}$/)) {
        patient = await Patient.findById(id);
      } else {
        patient = await Patient.findOne({ crNo: id });
      }
    }

    const fileMetaData = {
      filename: req.file.filename,
      originalName: req.file.originalname,
      mimeType: req.file.mimetype,
      size: req.file.size,
      path: `/uploads/${req.file.filename}`,
      uploadedAt: new Date(),
    };

    if (patient) {
      patient.files.push(fileMetaData);
      await patient.save();

      await logAudit({
        userId: req.user._id,
        action: "FILE_UPLOADED",
        resource: "Patient",
        resourceId: patient._id.toString(),
        metadata: { filename: req.file.filename, originalName: req.file.originalname },
      });
    }

    return res.status(200).json({
      success: true,
      message: "File uploaded successfully",
      data: fileMetaData,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Delete an uploaded file from a patient record
// @route   DELETE /api/patients/:id/files/:filename
// @access  Private (Admin, Doctor)
export const deletePatientFile = async (req, res, next) => {
  try {
    const { id, filename } = req.params;

    let patient;
    if (id.match(/^[0-9a-fA-F]{24}$/)) {
      patient = await Patient.findById(id);
    } else {
      patient = await Patient.findOne({ crNo: id });
    }

    if (!patient) {
      return res.status(404).json({
        success: false,
        message: "Patient record not found",
        errors: {},
      });
    }

    // Prevent path traversal attack
    const safeFilename = path.basename(filename);
    const filePath = path.join(process.cwd(), "uploads", safeFilename);

    // Remove file entry from MongoDB array
    patient.files = patient.files.filter((f) => f.filename !== safeFilename);
    await patient.save();

    // Remove physical file from disk safely if exists
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    await logAudit({
      userId: req.user._id,
      action: "FILE_DELETED",
      resource: "Patient",
      resourceId: patient._id.toString(),
      metadata: { filename: safeFilename },
    });

    return res.status(200).json({
      success: true,
      message: "File removed successfully",
      data: { filename: safeFilename },
    });
  } catch (error) {
    next(error);
  }
};
