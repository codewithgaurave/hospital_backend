import Visit from "../models/Visit.js";
import Patient from "../models/Patient.js";
import Document from "../models/Document.js";
import { logAudit } from "../utils/auditLogger.js";

// @desc    Get complete medical history timeline for a patient
// @route   GET /api/patients/:id/history
// @access  Private
export const getPatientHistory = async (req, res, next) => {
  try {
    const { id } = req.params;

    let patient;
    if (id.match(/^[0-9a-fA-F]{24}$/)) {
      patient = await Patient.findById(id).lean();
    } else {
      patient = await Patient.findOne({ crNo: id }).lean();
    }

    if (!patient) {
      return res.status(404).json({
        success: false,
        message: "Patient record not found",
        errors: {},
      });
    }

    const visits = await Visit.find({ patientId: patient._id })
      .populate("createdBy updatedBy", "name role")
      .sort({ visitDate: -1, createdAt: -1 })
      .lean();

    const documents = await Document.find({ patientId: patient._id })
      .sort({ uploadedAt: -1 })
      .lean();

    return res.status(200).json({
      success: true,
      data: {
        patient: {
          id: patient._id,
          crNo: patient.crNo,
          name: patient.personalDetails?.name,
          fatherGuardianName: patient.personalDetails?.fatherGuardianName,
          age: patient.personalDetails?.age,
          gender: patient.personalDetails?.gender,
          dob: patient.personalDetails?.dob,
          mobile: patient.contactDetails?.mobile,
          email: patient.contactDetails?.email,
          status: patient.status || patient.statusOnDischarge || "Admitted",
          doctor: patient.doctorDetails?.doctorName,
          department: patient.doctorDetails?.departmentName,
          ward: patient.wardDetails?.ward,
          bedNumber: patient.wardDetails?.bedNumber,
        },
        visits,
        documents,
      },
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get paginated / filtered list of visits for a patient
// @route   GET /api/patients/:id/visits
// @access  Private
export const getPatientVisits = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { visitType, doctor, fromDate, toDate, search } = req.query;

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

    if (visitType && visitType !== "All") {
      query.visitType = visitType;
    }

    if (doctor && doctor !== "All") {
      query.doctorName = new RegExp(doctor, "i");
    }

    if (search) {
      const searchRegex = new RegExp(search, "i");
      query.$or = [
        { diagnosis: searchRegex },
        { doctorName: searchRegex },
        { treatmentDetails: searchRegex },
        { presentingComplaints: searchRegex },
      ];
    }

    if (fromDate || toDate) {
      query.visitDate = {};
      if (fromDate) query.visitDate.$gte = new Date(fromDate);
      if (toDate) query.visitDate.$lte = new Date(toDate);
    }

    const visits = await Visit.find(query)
      .populate("createdBy updatedBy", "name role")
      .sort({ visitDate: -1 })
      .lean();

    return res.status(200).json({
      success: true,
      data: visits,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Add a new visit record for a patient (OPD, IPD, Follow-up, Emergency, Procedure)
// @route   POST /api/patients/:id/visits
// @access  Private (Admin, Doctor, Staff)
export const createPatientVisit = async (req, res, next) => {
  try {
    const { id } = req.params;

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

    // Auto-calculate sequential visitNumber for this patient
    const lastVisit = await Visit.findOne({ patientId: patient._id }).sort({ visitNumber: -1 });
    const visitNumber = lastVisit ? lastVisit.visitNumber + 1 : 1;

    const statusOnDischarge = req.body.statusOnDischarge || req.body.status || "Under Treatment";

    const visitData = {
      ...req.body,
      patientId: patient._id,
      visitNumber,
      statusOnDischarge,
      createdBy: req.user._id,
    };

    const visit = await Visit.create(visitData);

    // Synchronize active patient identity status without overwriting historic visit history
    if (req.body.status || req.body.statusOnDischarge) {
      patient.status = statusOnDischarge;
      patient.statusOnDischarge = statusOnDischarge;
    }

    if (req.body.doctorName) {
      patient.doctorDetails.doctorName = req.body.doctorName;
    }
    if (req.body.departmentName) {
      patient.doctorDetails.departmentName = req.body.departmentName;
    }
    if (req.body.ward) {
      patient.wardDetails.ward = req.body.ward;
    }
    if (req.body.bedNumber) {
      patient.wardDetails.bedNumber = req.body.bedNumber;
    }
    await patient.save();

    await logAudit({
      userId: req.user._id,
      action: "VISIT_CREATED",
      resource: "Visit",
      resourceId: visit._id.toString(),
      metadata: { crNo: patient.crNo, visitType: visit.visitType, visitNumber },
    });

    return res.status(201).json({
      success: true,
      message: `Visit #${visitNumber} (${visit.visitType}) recorded successfully`,
      data: visit,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get specific visit record details
// @route   GET /api/patients/:id/visits/:visitId
// @access  Private
export const getVisitById = async (req, res, next) => {
  try {
    const { visitId } = req.params;

    const visit = await Visit.findById(visitId)
      .populate("patientId", "crNo personalDetails contactDetails hospitalDetails wardDetails doctorDetails")
      .populate("createdBy updatedBy", "name role")
      .lean();

    if (!visit) {
      return res.status(404).json({
        success: false,
        message: "Visit record not found",
        errors: {},
      });
    }

    const documents = await Document.find({ visitId: visit._id }).lean();

    return res.status(200).json({
      success: true,
      data: {
        ...visit,
        documents,
      },
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Update or patch existing visit record (OPD update, IPD Discharge, Clinical Notes)
// @route   PUT /api/patients/:id/visits/:visitId, PATCH /api/patients/:id/visits/:visitId
// @access  Private (Admin, Doctor)
export const updatePatientVisit = async (req, res, next) => {
  try {
    const { visitId } = req.params;

    const visit = await Visit.findById(visitId);

    if (!visit) {
      return res.status(404).json({
        success: false,
        message: "Visit record not found",
        errors: {},
      });
    }

    // Whitelist payload: block immutable fields
    const updateData = { ...req.body };
    delete updateData.patientId;
    delete updateData.visitNumber;
    delete updateData.createdBy;
    delete updateData.createdAt;
    updateData.updatedBy = req.user._id;

    const updatedVisit = await Visit.findByIdAndUpdate(
      visit._id,
      { $set: updateData },
      { new: true, runValidators: true }
    );

    // If discharge workflow executed, update patient main status as well
    if (updateData.statusOnDischarge === "Discharged" || updateData.status === "Discharged") {
      await Patient.findByIdAndUpdate(visit.patientId, {
        $set: {
          status: "Discharged",
          statusOnDischarge: "Discharged",
          "admissionDetails.dischargeDate": updateData.dischargeDate || new Date().toISOString().split("T")[0],
        },
      });
    }

    await logAudit({
      userId: req.user._id,
      action: "VISIT_UPDATED",
      resource: "Visit",
      resourceId: updatedVisit._id.toString(),
      metadata: { visitType: updatedVisit.visitType, visitNumber: updatedVisit.visitNumber },
    });

    return res.status(200).json({
      success: true,
      message: "Visit record updated successfully",
      data: updatedVisit,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Delete visit record
// @route   DELETE /api/patients/:id/visits/:visitId or DELETE /api/patients/visits/:visitId
// @access  Private (Admin, Doctor)
export const deletePatientVisit = async (req, res, next) => {
  try {
    const { visitId } = req.params;

    const visit = await Visit.findById(visitId);

    if (!visit) {
      return res.status(404).json({
        success: false,
        message: "Visit record not found",
      });
    }

    await Visit.findByIdAndDelete(visit._id);

    await logAudit({
      userId: req.user._id,
      action: "VISIT_DELETED",
      resource: "Visit",
      resourceId: visit._id.toString(),
      metadata: { visitType: visit.visitType, visitNumber: visit.visitNumber },
    });

    return res.status(200).json({
      success: true,
      message: "Visit episode deleted successfully",
    });
  } catch (error) {
    next(error);
  }
};
