import Document from "../models/Document.js";
import Patient from "../models/Patient.js";
import fs from "fs";
import path from "path";
import { logAudit } from "../utils/auditLogger.js";

// @desc    Upload document / medical file under specific category
// @route   POST /api/patients/:id/documents
// @access  Private (Admin, Doctor, Staff)
export const uploadDocument = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { category, visitId } = req.body;

    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "No file uploaded or invalid file type",
        errors: { file: "File is required and must be JPEG, PNG, WEBP, or PDF under 10MB." },
      });
    }

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
      });
    }

    const docCategory = ["Patient Image", "Investigation", "Histopathology", "Other"].includes(category)
      ? category
      : "Other";

    const documentData = {
      patientId: patient._id,
      visitId: visitId && visitId.match(/^[0-9a-fA-F]{24}$/) ? visitId : undefined,
      originalName: req.file.originalname,
      storedName: req.file.filename,
      mimeType: req.file.mimetype,
      size: req.file.size,
      path: `/uploads/${req.file.filename}`,
      category: docCategory,
      uploadedBy: req.user._id,
      uploadedAt: new Date(),
    };

    const doc = await Document.create(documentData);

    // Also sync to patient's embedded files array for backwards compatibility
    patient.files.push({
      filename: req.file.filename,
      originalName: req.file.originalname,
      mimeType: req.file.mimetype,
      size: req.file.size,
      path: `/uploads/${req.file.filename}`,
      uploadedAt: new Date(),
    });
    await patient.save();

    await logAudit({
      userId: req.user._id,
      action: "DOCUMENT_UPLOADED",
      resource: "Document",
      resourceId: doc._id.toString(),
      metadata: { crNo: patient.crNo, category: docCategory, filename: req.file.filename },
    });

    return res.status(201).json({
      success: true,
      message: "Document uploaded successfully",
      data: doc,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get all documents for a patient (optional filter by category or visitId)
// @route   GET /api/patients/:id/documents
// @access  Private
export const getPatientDocuments = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { category, visitId } = req.query;

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
      });
    }

    const query = { patientId: patient._id };
    if (category && category !== "All") {
      query.category = category;
    }
    if (visitId) {
      query.visitId = visitId;
    }

    const documents = await Document.find(query)
      .populate("uploadedBy", "name role")
      .sort({ uploadedAt: -1 })
      .lean();

    let finalDocs = [...documents];
    if (patient.files && patient.files.length > 0 && (!category || category === "All" || category === "Other")) {
      const existingStoredNames = new Set(documents.map((d) => d.storedName));
      for (const pf of patient.files) {
        if (!existingStoredNames.has(pf.filename)) {
          finalDocs.push({
            _id: pf._id ? pf._id.toString() : pf.filename,
            patientId: patient._id,
            storedName: pf.filename,
            originalName: pf.originalName || pf.filename,
            mimeType: pf.mimeType,
            size: pf.size || 0,
            path: pf.path || `/uploads/${pf.filename}`,
            category: "Other",
            uploadedAt: pf.uploadedAt || new Date(),
          });
        }
      }
    }

    return res.status(200).json({
      success: true,
      data: finalDocs,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Secure document streaming (Authenticated access only)
// @route   GET /api/files/:fileId
// @access  Private
export const streamDocument = async (req, res, next) => {
  try {
    const { fileId } = req.params;

    let doc = null;
    if (fileId.match(/^[0-9a-fA-F]{24}$/)) {
      doc = await Document.findById(fileId);
      if (!doc) {
        // Also check if fileId is an embedded subdocument in patient.files
        const patientWithFile = await Patient.findOne({ "files._id": fileId }, { "files.$": 1 });
        if (patientWithFile && patientWithFile.files?.[0]) {
          const f = patientWithFile.files[0];
          doc = {
            storedName: f.filename,
            originalName: f.originalName || f.filename,
            mimeType: f.mimeType,
          };
        }
      }
    } else {
      doc = await Document.findOne({
        $or: [{ storedName: fileId }, { originalName: fileId }]
      });
      if (!doc) {
        const patientWithFile = await Patient.findOne({ "files.filename": fileId }, { "files.$": 1 });
        if (patientWithFile && patientWithFile.files?.[0]) {
          const f = patientWithFile.files[0];
          doc = {
            storedName: f.filename,
            originalName: f.originalName || f.filename,
            mimeType: f.mimeType,
          };
        }
      }
    }

    // Path traversal check
    const safeFilename = doc?.storedName ? path.basename(doc.storedName) : path.basename(fileId);
    const filePath = path.join(process.cwd(), "uploads", safeFilename);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({
        success: false,
        message: "File not found on server disk",
      });
    }

    // Determine mimeType if not already found in doc
    let mimeType = doc?.mimeType;
    if (!mimeType) {
      const ext = path.extname(safeFilename).toLowerCase();
      if (ext === ".pdf") mimeType = "application/pdf";
      else if (ext === ".png") mimeType = "image/png";
      else if (ext === ".jpg" || ext === ".jpeg") mimeType = "image/jpeg";
      else if (ext === ".webp") mimeType = "image/webp";
      else if (ext === ".svg") mimeType = "image/svg+xml";
      else mimeType = "application/octet-stream";
    }

    const originalName = doc?.originalName || safeFilename;

    res.setHeader("Content-Type", mimeType);
    res.setHeader("Content-Disposition", `inline; filename="${encodeURIComponent(originalName)}"`);

    const fileStream = fs.createReadStream(filePath);
    fileStream.pipe(res);
  } catch (error) {
    next(error);
  }
};

// @desc    Delete document record & physical file safely
// @route   DELETE /api/patients/:id/documents/:fileId
// @access  Private (Admin, Doctor)
export const deleteDocument = async (req, res, next) => {
  try {
    const { id, fileId } = req.params;

    let doc;
    if (fileId.match(/^[0-9a-fA-F]{24}$/)) {
      doc = await Document.findById(fileId);
    } else {
      doc = await Document.findOne({ storedName: fileId });
    }

    if (!doc) {
      return res.status(404).json({
        success: false,
        message: "Document record not found",
      });
    }

    // Remove physical file safely
    const safeFilename = path.basename(doc.storedName);
    const filePath = path.join(process.cwd(), "uploads", safeFilename);

    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    // Delete Document record
    await Document.findByIdAndDelete(doc._id);

    // Also clean embedded array on Patient if exists
    await Patient.findByIdAndUpdate(doc.patientId, {
      $pull: { files: { filename: safeFilename } },
    });

    await logAudit({
      userId: req.user._id,
      action: "DOCUMENT_DELETED",
      resource: "Document",
      resourceId: doc._id.toString(),
      metadata: { filename: safeFilename },
    });

    return res.status(200).json({
      success: true,
      message: "Document removed successfully",
      data: { id: doc._id, filename: safeFilename },
    });
  } catch (error) {
    next(error);
  }
};
