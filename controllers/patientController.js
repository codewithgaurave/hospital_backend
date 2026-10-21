import Patient from "../models/Patient.js";
import Visit from "../models/Visit.js";
import Document from "../models/Document.js";
import { logAudit } from "../utils/auditLogger.js";

// @desc    Register new patient & generate backend authoritative CR Number
// @route   POST /api/patients
// @access  Private (Admin, Doctor, Staff)
export const createPatient = async (req, res, next) => {
  try {
    // Manual CR Number entry (auto-generate feature removed per client requirement)
    const rawCrNo = req.body.crNo || "";
    const crNo = typeof rawCrNo === "string" ? rawCrNo.trim() : String(rawCrNo).trim();

    if (!crNo) {
      return res.status(400).json({
        success: false,
        message: "CR Number is required. Please enter a manual CR Number.",
        errors: { crNo: "CR Number is required" },
      });
    }

    // Check if CR Number already exists
    const existingPatient = await Patient.findOne({ crNo });
    if (existingPatient) {
      return res.status(400).json({
        success: false,
        message: `CR Number "${crNo}" already exists in the system. Please enter a unique CR Number.`,
        errors: { crNo: "CR Number already in use" },
      });
    }

    // Manual IP Number entry
    const ipNo = (
      req.body.ipNo ||
      req.body.ipNumber ||
      req.body.hospitalDetails?.ipNumber ||
      req.body.hospitalDetails?.hospitalNumber ||
      ""
    ).toString().trim();

    const status = req.body.status || req.body.statusOnDischarge || "Admitted";

    const hospitalDetails = {
      ...(req.body.hospitalDetails || {}),
      hospitalNumber: req.body.hospitalDetails?.hospitalNumber || ipNo || undefined,
      ipNumber: ipNo || req.body.hospitalDetails?.hospitalNumber || undefined,
      patientNumber: req.body.hospitalDetails?.patientNumber || undefined,
    };

    const patientData = {
      ...req.body,
      crNo, // Manual user-entered CR Number
      ipNo: ipNo || undefined, // Manual user-entered IP Number
      hospitalDetails,
      dischargeRemarks: req.body.dischargeRemarks || req.body.doctorComments || "",
      status,
      statusOnDischarge: status,
      isArchived: false,
      createdBy: req.user._id,
    };

    const patient = await Patient.create(patientData);

    // Automatically create initial visit entry in medical history timeline
    try {
      await Visit.create({
        patientId: patient._id,
        visitDate: new Date(),
        visitType: req.body.wardDetails?.ward ? "IPD / Admission" : "OPD",
        doctor: patient.doctorDetails?.doctorName,
        department: patient.doctorDetails?.departmentName,
        ward: patient.wardDetails?.ward,
        bedNumber: patient.wardDetails?.bedNumber,
        diagnosis: patient.diagnosis?.diagnosisDetails,
        presentingComplaints: patient.diagnosis?.presentingComplaints,
        physicalFindings: patient.diagnosis?.physicalFindings,
        investigation: patient.investigationDetails,
        treatment: patient.treatment?.treatmentDetails,
        operationDetails: patient.treatment?.operationProcedureDetails,
        opdFindings: patient.opdFindings,
        courseInHospital: patient.courseInHospital,
        status: status,
        doctorComments: patient.doctorComments,
        dischargeRemarks: patient.dischargeRemarks,
        ipNo: patient.ipNo,
        medications: patient.medications || [],
        followUpDate: patient.followUp?.date,
        followUpInstructions: patient.followUp?.instructions,
        followUpNotes: patient.followUp?.notes,
        histopathologyDetails: patient.histopathologyDetails,
        notes: "Initial Patient Registration & Admission",
        createdBy: req.user._id,
      });
    } catch (visitErr) {
      console.error("Initial visit creation warning:", visitErr.message);
    }

    await logAudit({
      userId: req.user._id,
      action: "PATIENT_CREATED",
      resource: "Patient",
      resourceId: patient._id.toString(),
      metadata: { crNo: patient.crNo, ipNo: patient.ipNo, name: patient.personalDetails?.name },
    });

    return res.status(201).json({
      success: true,
      message: "Patient registered successfully",
      data: patient,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get all patients with search, filter, and server-side pagination
// @route   GET /api/patients
// @access  Private
export const getPatients = async (req, res, next) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 10;
    const skip = (page - 1) * limit;

    const { search, status, doctor, department, ward, includeArchived } = req.query;

    const query = {};

    // Exclude archived records unless explicitly requested by authorized user
    if (includeArchived !== "true") {
      query.isArchived = false;
    }

    if (search) {
      const searchRegex = new RegExp(search.trim(), "i");
      query.$or = [
        { crNo: searchRegex },
        { ipNo: searchRegex },
        { "personalDetails.name": searchRegex },
        { "contactDetails.mobile": searchRegex },
        { "hospitalDetails.hospitalNumber": searchRegex },
        { "hospitalDetails.ipNumber": searchRegex },
      ];
    }

    if (status && status !== "All") {
      let statusCondition;
      if (status === "Admitted") {
        statusCondition = {
          $or: [
            { status: "Admitted" },
            { status: { $exists: false }, statusOnDischarge: "Admitted" },
          ],
          status: { $nin: ["Discharged", "Under Treatment", "Pending"] },
          statusOnDischarge: { $nin: ["Discharged", "Under Treatment", "Pending"] },
        };
      } else if (status === "Discharged") {
        statusCondition = {
          $or: [{ status: "Discharged" }, { statusOnDischarge: "Discharged" }],
        };
      } else if (status === "Under Treatment") {
        statusCondition = {
          $or: [{ status: "Under Treatment" }, { statusOnDischarge: "Under Treatment" }],
        };
      } else {
        statusCondition = {
          $or: [{ status: status }, { statusOnDischarge: status }],
        };
      }

      if (query.$or) {
        query.$and = [{ $or: query.$or }, statusCondition];
        delete query.$or;
      } else {
        Object.assign(query, statusCondition);
      }
    }

    if (doctor && doctor !== "All") {
      query["doctorDetails.doctorName"] = doctor;
    }

    if (department && department !== "All") {
      query["doctorDetails.departmentName"] = department;
    }

    if (ward && ward !== "All") {
      query["wardDetails.ward"] = ward;
    }

    const patients = await Patient.find(query)
      .populate("createdBy", "name role")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    const total = await Patient.countDocuments(query);
    const totalPages = Math.ceil(total / limit) || 1;

    return res.status(200).json({
      success: true,
      data: {
        patients,
        pagination: {
          page,
          limit,
          total,
          totalPages,
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Search patients with advanced fields (CR, Name, Mobile, Hospital No, Doctor, Date Range)
// @route   GET /api/patients/search
// @access  Private
export const searchPatients = async (req, res, next) => {
  try {
    const { q, crNo, ipNo, mobile, hospitalNumber, doctor, fromDate, toDate } = req.query;

    const query = { isArchived: false };

    if (q) {
      const qRegex = new RegExp(q.trim(), "i");
      query.$or = [
        { crNo: qRegex },
        { ipNo: qRegex },
        { "personalDetails.name": qRegex },
        { "contactDetails.mobile": qRegex },
        { "hospitalDetails.hospitalNumber": qRegex },
        { "hospitalDetails.ipNumber": qRegex },
        { "doctorDetails.doctorName": qRegex },
      ];
    }

    if (crNo) {
      query.crNo = new RegExp(crNo.trim(), "i");
    }

    if (ipNo) {
      query.$or = [
        { ipNo: new RegExp(ipNo.trim(), "i") },
        { "hospitalDetails.ipNumber": new RegExp(ipNo.trim(), "i") },
        { "hospitalDetails.hospitalNumber": new RegExp(ipNo.trim(), "i") },
      ];
    }

    if (mobile) {
      query["contactDetails.mobile"] = new RegExp(mobile.trim(), "i");
    }

    if (hospitalNumber) {
      query["hospitalDetails.hospitalNumber"] = new RegExp(hospitalNumber.trim(), "i");
    }

    if (doctor) {
      query["doctorDetails.doctorName"] = new RegExp(doctor.trim(), "i");
    }

    if (fromDate || toDate) {
      query["admissionDetails.admissionDate"] = {};
      if (fromDate) query["admissionDetails.admissionDate"].$gte = fromDate;
      if (toDate) query["admissionDetails.admissionDate"].$lte = toDate;
    }

    const patients = await Patient.find(query)
      .populate("createdBy", "name role")
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();

    return res.status(200).json({
      success: true,
      message: `${patients.length} patient record(s) found`,
      data: patients,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get patient profile by ID or CR Number
// @route   GET /api/patients/:id
// @access  Private
export const getPatientById = async (req, res, next) => {
  try {
    const { id } = req.params;

    let patient;
    if (id.match(/^[0-9a-fA-F]{24}$/)) {
      patient = await Patient.findById(id).populate("createdBy updatedBy archivedBy", "name role");
    } else {
      patient = await Patient.findOne({ crNo: id }).populate("createdBy updatedBy archivedBy", "name role");
    }

    if (!patient) {
      return res.status(404).json({
        success: false,
        message: `Patient record not found with ID/CR Number: ${id}`,
        errors: {},
      });
    }

    return res.status(200).json({
      success: true,
      message: "Patient record retrieved",
      data: patient,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Update patient record with whitelist validation
// @route   PUT /api/patients/:id
// @access  Private (Admin, Doctor)
export const updatePatient = async (req, res, next) => {
  try {
    const { id } = req.params;

    let patient = await Patient.findById(id) || await Patient.findOne({ crNo: id });

    if (!patient) {
      return res.status(404).json({
        success: false,
        message: "Patient record not found",
        errors: {},
      });
    }

    // Whitelist updateable fields & explicitly strip immutable metadata
    const updateData = { ...req.body };
    delete updateData.createdBy;
    delete updateData.createdAt;
    delete updateData.isArchived;
    delete updateData.archivedAt;
    delete updateData.archivedBy;
    updateData.updatedBy = req.user._id;

    // Handle manual CR Number update
    if (updateData.crNo) {
      const trimmedCrNo = String(updateData.crNo).trim();
      if (trimmedCrNo !== patient.crNo) {
        const existingWithCr = await Patient.findOne({ crNo: trimmedCrNo, _id: { $ne: patient._id } });
        if (existingWithCr) {
          return res.status(400).json({
            success: false,
            message: `CR Number "${trimmedCrNo}" is already in use by another patient.`,
            errors: { crNo: "CR Number already in use" },
          });
        }
        updateData.crNo = trimmedCrNo;
      }
    } else {
      delete updateData.crNo;
    }

    // Handle manual IP Number update
    if (updateData.ipNo || updateData.ipNumber || updateData.hospitalDetails?.ipNumber) {
      const ipVal = String(updateData.ipNo || updateData.ipNumber || updateData.hospitalDetails?.ipNumber).trim();
      updateData.ipNo = ipVal;
      updateData.hospitalDetails = {
        ...(patient.hospitalDetails?.toObject?.() || patient.hospitalDetails || {}),
        ...(updateData.hospitalDetails || {}),
        ipNumber: ipVal,
        hospitalNumber: updateData.hospitalDetails?.hospitalNumber || ipVal,
      };
    }

    if (updateData.status && !updateData.statusOnDischarge) {
      updateData.statusOnDischarge = updateData.status;
    } else if (updateData.statusOnDischarge && !updateData.status) {
      updateData.status = updateData.statusOnDischarge;
    } else if (updateData.status && updateData.statusOnDischarge) {
      updateData.statusOnDischarge = updateData.status;
    }

    const updatedPatient = await Patient.findByIdAndUpdate(
      patient._id,
      { $set: updateData },
      { new: true, runValidators: true }
    );

    await logAudit({
      userId: req.user._id,
      action: "PATIENT_UPDATED",
      resource: "Patient",
      resourceId: updatedPatient._id.toString(),
      metadata: { crNo: updatedPatient.crNo },
    });

    return res.status(200).json({
      success: true,
      message: "Patient record updated successfully",
      data: updatedPatient,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Soft Delete / Archive patient record
// @route   PUT /api/patients/:id/archive or DELETE /api/patients/:id
// @access  Private (Admin, Doctor with permission)
export const archivePatient = async (req, res, next) => {
  try {
    const { id } = req.params;

    const patient = await Patient.findById(id) || await Patient.findOne({ crNo: id });

    if (!patient) {
      return res.status(404).json({
        success: false,
        message: "Patient record not found",
        errors: {},
      });
    }

    patient.isArchived = true;
    patient.archivedAt = new Date();
    patient.archivedBy = req.user._id;
    await patient.save();

    await logAudit({
      userId: req.user._id,
      action: "PATIENT_ARCHIVED",
      resource: "Patient",
      resourceId: patient._id.toString(),
      metadata: { crNo: patient.crNo },
    });

    return res.status(200).json({
      success: true,
      message: `Patient record ${patient.crNo} archived successfully`,
      data: { id: patient._id, crNo: patient.crNo },
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Permanently delete patient record along with visits & documents
// @route   DELETE /api/patients/:id
// @access  Private (Admin)
export const deletePatientPermanently = async (req, res, next) => {
  try {
    const { id } = req.params;

    const patient = (await Patient.findById(id)) || (await Patient.findOne({ crNo: id }));

    if (!patient) {
      return res.status(404).json({
        success: false,
        message: "Patient record not found",
        errors: {},
      });
    }

    await Patient.findByIdAndDelete(patient._id);
    await Visit.deleteMany({ patientId: patient._id });
    await Document.deleteMany({ patientId: patient._id });

    await logAudit({
      userId: req.user._id,
      action: "PATIENT_DELETED",
      resource: "Patient",
      resourceId: patient._id.toString(),
      metadata: { crNo: patient.crNo },
    });

    return res.status(200).json({
      success: true,
      message: `Patient ${patient.crNo} deleted successfully`,
      data: { id: patient._id, crNo: patient.crNo },
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get dynamic distinct filter options (doctors, departments, wards) directly from Patient collection
// @route   GET /api/patients/filter-options
// @access  Private
export const getPatientFilterOptions = async (req, res, next) => {
  try {
    // 1. Doctors with their exact department from patient table
    const doctorsAgg = await Patient.aggregate([
      {
        $match: {
          isArchived: false,
          "doctorDetails.doctorName": { $exists: true, $nin: [null, ""] },
        },
      },
      {
        $group: {
          _id: {
            doctorName: { $trim: { input: "$doctorDetails.doctorName" } },
            departmentName: { $trim: { input: "$doctorDetails.departmentName" } },
          },
        },
      },
      {
        $project: {
          _id: 0,
          doctorName: "$_id.doctorName",
          departmentName: "$_id.departmentName",
        },
      },
      { $sort: { doctorName: 1 } },
    ]);

    // 2. Exact distinct departments from patient records only
    const rawDepts = await Patient.distinct("doctorDetails.departmentName", {
      isArchived: false,
      "doctorDetails.departmentName": { $exists: true, $nin: [null, ""] },
    });
    const departments = Array.from(
      new Set(
        rawDepts
          .map((d) => (typeof d === "string" ? d.trim() : ""))
          .filter(Boolean)
      )
    ).sort((a, b) => a.localeCompare(b));

    // 3. STRICTLY ONLY the 5 official Neurosurgery wards (no others allowed)
    const wards = [
      "Neurosurgery General ward 1",
      "Neurosurgery General ward 2",
      "Neurosurgery HDU",
      "Neurosurgery ICU",
      "Neurosurgery Pediatrics ward",
    ];

    return res.status(200).json({
      success: true,
      data: {
        doctors: doctorsAgg,
        departments,
        wards,
      },
    });
  } catch (error) {
    next(error);
  }
};

