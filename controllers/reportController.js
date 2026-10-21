import Patient from "../models/Patient.js";
import Visit from "../models/Visit.js";
import DocumentModel from "../models/Document.js";
import { logAudit } from "../utils/auditLogger.js";
import PDFDocument from "pdfkit";

/**
 * Helper to build Date Filter from query string or presets
 */
const getDateRangeFilter = (from, to, preset) => {
  const now = new Date();
  let startDate, endDate;

  if (preset) {
    if (preset === "today") {
      startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
    } else if (preset === "yesterday") {
      startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
      endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 23, 59, 59, 999);
    } else if (preset === "7days") {
      startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      endDate = now;
    } else if (preset === "30days") {
      startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      endDate = now;
    } else if (preset === "thisMonth") {
      startDate = new Date(now.getFullYear(), now.getMonth(), 1);
      endDate = now;
    } else if (preset === "lastMonth") {
      startDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      endDate = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
    }
  }

  if (from) startDate = new Date(from);
  if (to) {
    endDate = new Date(to);
    endDate.setHours(23, 59, 59, 999);
  }

  const dateMatch = {};
  if (startDate) dateMatch.$gte = startDate;
  if (endDate) dateMatch.$lte = endDate;

  return Object.keys(dateMatch).length > 0 ? dateMatch : null;
};

// @desc    Get complete dashboard analytics with MongoDB Aggregation
// @route   GET /api/reports/dashboard
// @access  Private
export const getDashboardAnalytics = async (req, res, next) => {
  try {
    const { from, to, preset } = req.query;
    const dateFilter = getDateRangeFilter(from, to, preset);

    const matchQuery = { isArchived: false };
    if (dateFilter) {
      matchQuery.createdAt = dateFilter;
    }

    // 1. Overall stats via MongoDB Aggregation
    const totalPatients = await Patient.countDocuments({ isArchived: false });
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const todayOpdVisits = await Visit.countDocuments({
      visitType: "OPD",
      visitDate: { $gte: todayStart },
    });

    const currentIpdAdmissions = await Patient.countDocuments({
      isArchived: false,
      $or: [{ status: "Admitted" }, { statusOnDischarge: "Admitted" }],
    });

    const todayDischarges = await Patient.countDocuments({
      isArchived: false,
      $or: [{ status: "Discharged" }, { statusOnDischarge: "Discharged" }],
      updatedAt: { $gte: todayStart },
    });

    const pendingFollowUpsCount = await Patient.countDocuments({
      isArchived: false,
      $or: [
        { "followUp.date": { $exists: true, $ne: "" } },
        { "followUp.followUpDate": { $exists: true, $ne: "" } },
      ],
    });

    const pendingReportsCount = await Patient.countDocuments({
      isArchived: false,
      $or: [
        { status: "Pending" },
        { statusOnDischarge: "Pending" },
        { investigationDetails: { $exists: false } },
        { investigationDetails: "" },
      ],
    });

    // 2. Registration Trend Aggregation (Monthly / Daily)
    const trendAggregation = await Patient.aggregate([
      { $match: matchQuery },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
          registrations: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
      { $limit: 30 },
    ]);

    // 3. OPD vs IPD Visit Type Distribution Aggregation
    const visitTypeDistribution = await Visit.aggregate([
      {
        $group: {
          _id: "$visitType",
          count: { $sum: 1 },
        },
      },
    ]);

    // 4. Department-wise Patients Distribution Aggregation
    const departmentDistribution = await Patient.aggregate([
      { $match: { isArchived: false } },
      {
        $group: {
          _id: { $ifNull: ["$doctorDetails.departmentName", "General"] },
          count: { $sum: 1 },
        },
      },
    ]);

    // 5. Recent Patient Registrations (Limit 5)
    const recentPatients = await Patient.find({ isArchived: false })
      .select("crNo personalDetails doctorDetails status statusOnDischarge createdAt")
      .sort({ createdAt: -1 })
      .limit(5)
      .lean();

    // 6. Today's OPD Visits (Limit 5)
    const todayOpdList = await Visit.find({
      visitType: "OPD",
      visitDate: { $gte: todayStart },
    })
      .populate("patientId", "crNo personalDetails")
      .sort({ visitDate: -1 })
      .limit(5)
      .lean();

    // 7. Current IPD Admissions with Days Admitted calculation
    const rawAdmissions = await Patient.find({
      isArchived: false,
      $or: [{ status: "Admitted" }, { statusOnDischarge: "Admitted" }],
    })
      .select("crNo personalDetails doctorDetails wardDetails admissionDetails status createdAt")
      .sort({ createdAt: -1 })
      .limit(5)
      .lean();

    const currentAdmissions = rawAdmissions.map((p) => {
      let admissionDateObj = new Date(p.createdAt);
      if (p.admissionDetails && p.admissionDetails.admissionDate) {
        const parsed = new Date(p.admissionDetails.admissionDate);
        if (!isNaN(parsed.getTime())) admissionDateObj = parsed;
      }
      const now = new Date();
      const diffTime = Math.max(0, now - admissionDateObj);
      const daysAdmitted = Math.floor(diffTime / (1000 * 60 * 60 * 24));
      return {
        ...p,
        daysAdmitted,
      };
    });

    // 8. Upcoming / Overdue Follow-ups widget data
    const rawFollowups = await Patient.find({
      isArchived: false,
      $or: [
        { "followUp.date": { $exists: true, $ne: "" } },
        { "followUp.followUpDate": { $exists: true, $ne: "" } },
      ],
    })
      .select("crNo personalDetails doctorDetails followUp status")
      .sort({ updatedAt: -1 })
      .limit(5)
      .lean();

    const todayStr = new Date().toISOString().split("T")[0];
    const upcomingFollowUps = rawFollowups.map((f) => {
      const fDate = f.followUp?.date || f.followUp?.followUpDate || "";
      let followUpStatus = "Upcoming";
      if (fDate === todayStr) followUpStatus = "Due Today";
      else if (fDate && fDate < todayStr) followUpStatus = "Overdue";
      return {
        ...f,
        followUpStatus,
      };
    });

    // 9. Status Distribution Aggregation from Real Database
    const statusAgg = await Patient.aggregate([
      { $match: { isArchived: false } },
      {
        $group: {
          _id: { $ifNull: ["$status", "Admitted"] },
          count: { $sum: 1 },
        },
      },
    ]);

    const statusMap = {
      Admitted: 0,
      Discharged: 0,
      "Under Treatment": 0,
      Pending: 0,
    };
    statusAgg.forEach((item) => {
      const key = item._id || "Admitted";
      if (statusMap[key] !== undefined) {
        statusMap[key] += item.count;
      } else {
        statusMap[key] = item.count;
      }
    });

    const statusDistribution = [
      { name: "Admitted", value: statusMap["Admitted"] || 0, color: "#0a6cf0" },
      { name: "Discharged", value: statusMap["Discharged"] || 0, color: "#12c6c0" },
      { name: "Under Treatment", value: statusMap["Under Treatment"] || 0, color: "#f59e0b" },
      { name: "Pending", value: statusMap["Pending"] || 0, color: "#ec4899" },
    ];

    // 10. Monthly Trend for Current Year from MongoDB
    const startOfYear = new Date(new Date().getFullYear(), 0, 1);
    const monthlyAgg = await Patient.aggregate([
      {
        $match: {
          isArchived: false,
          createdAt: { $gte: startOfYear },
        },
      },
      {
        $group: {
          _id: { $month: "$createdAt" },
          count: { $sum: 1 },
        },
      },
    ]);

    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const currentMonthIdx = new Date().getMonth();
    const monthlyTrend = monthNames
      .map((m, idx) => {
        const found = monthlyAgg.find((item) => item._id === idx + 1);
        return {
          month: m,
          registrations: found ? found.count : 0,
        };
      })
      .slice(0, currentMonthIdx + 1);

    return res.status(200).json({
      success: true,
      data: {
        lastUpdated: new Date(),
        statistics: {
          totalPatients,
          todayOpdVisits,
          currentIpdAdmissions,
          todayDischarges,
          pendingFollowUpsCount,
          pendingReportsCount,
        },
        registrationTrend: trendAggregation.map((item) => ({
          date: item._id,
          registrations: item.registrations,
        })),
        statusDistribution,
        monthlyTrend,
        visitTypeDistribution: visitTypeDistribution.map((item) => ({
          name: item._id || "Other",
          value: item.count,
        })),
        departmentDistribution: departmentDistribution.map((item) => ({
          name: item._id || "General",
          value: item.count,
        })),
        recentPatients,
        todayOpdList,
        currentAdmissions,
        upcomingFollowUps,
      },
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Advanced Multi-Field Patient Search with Pagination
// @route   GET /api/reports/search
// @access  Private
export const getAdvancedSearch = async (req, res, next) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 10;
    const skip = (page - 1) * limit;

    const {
      q,
      crNo,
      name,
      hospitalNumber,
      patientNumber,
      phone,
      mobile,
      email,
      doctor,
      department,
      diagnosis,
      ward,
      bed,
      visitNumber,
      status,
      visitType,
      fromDate,
      toDate,
      dateType = "created", // "created" or "admission"
      sort = "createdAt",
      order = "desc",
    } = req.query;

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
        { "hospitalDetails.patientNumber": qRegex },
        { "doctorDetails.doctorName": qRegex },
      ];
    }

    if (crNo) query.crNo = new RegExp(crNo.trim(), "i");
    if (req.query.ipNo) {
      query.$or = [
        { ipNo: new RegExp(req.query.ipNo.trim(), "i") },
        { "hospitalDetails.ipNumber": new RegExp(req.query.ipNo.trim(), "i") },
        { "hospitalDetails.hospitalNumber": new RegExp(req.query.ipNo.trim(), "i") },
      ];
    }
    if (name) query["personalDetails.name"] = new RegExp(name.trim(), "i");
    if (hospitalNumber) {
      query.$or = [
        { "hospitalDetails.hospitalNumber": new RegExp(hospitalNumber.trim(), "i") },
        { "hospitalDetails.ipNumber": new RegExp(hospitalNumber.trim(), "i") },
        { ipNo: new RegExp(hospitalNumber.trim(), "i") },
      ];
    }
    if (patientNumber) query["hospitalDetails.patientNumber"] = new RegExp(patientNumber.trim(), "i");

    const phoneVal = phone || mobile;
    if (phoneVal) query["contactDetails.mobile"] = new RegExp(phoneVal.trim(), "i");
    if (email) query["contactDetails.email"] = new RegExp(email.trim(), "i");
    if (doctor && doctor !== "All") query["doctorDetails.doctorName"] = new RegExp(doctor.trim(), "i");
    if (department && department !== "All") query["doctorDetails.departmentName"] = new RegExp(department.trim(), "i");
    if (diagnosis) query["diagnosis.diagnosisDetails"] = new RegExp(diagnosis.trim(), "i");
    if (ward && ward !== "All") query["wardDetails.ward"] = new RegExp(ward.trim(), "i");
    if (bed) query["wardDetails.bedNumber"] = new RegExp(bed.trim(), "i");
    if (status && status !== "All") {
      let statusCondition;
      if (status === "Admitted") {
        statusCondition = {
          $or: [
            { status: "Admitted" },
            { status: { $exists: false }, statusOnDischarge: "Admitted" },
          ],
          status: { $ne: "Discharged" },
          statusOnDischarge: { $ne: "Discharged" },
        };
      } else if (status === "Discharged") {
        statusCondition = {
          $or: [{ status: "Discharged" }, { statusOnDischarge: "Discharged" }],
        };
      } else {
        statusCondition = {
          $or: [{ status: status }, { statusOnDischarge: status }],
        };
      }

      if (query.$and) {
        query.$and.push(statusCondition);
      } else if (query.$or) {
        query.$and = [{ $or: query.$or }, statusCondition];
        delete query.$or;
      } else {
        Object.assign(query, statusCondition);
      }
    }

    if (fromDate || toDate) {
      if (dateType === "admission") {
        query["admissionDetails.admissionDate"] = {};
        if (fromDate) query["admissionDetails.admissionDate"].$gte = fromDate;
        if (toDate) query["admissionDetails.admissionDate"].$lte = toDate;
      } else {
        query.createdAt = {};
        if (fromDate) query.createdAt.$gte = new Date(fromDate);
        if (toDate) {
          const toObj = new Date(toDate);
          toObj.setHours(23, 59, 59, 999);
          query.createdAt.$lte = toObj;
        }
      }
    }

    // Handle Visit Number cross-query if supplied
    if (visitNumber) {
      const visit = await Visit.findOne({ visitNumber: parseInt(visitNumber, 10) });
      if (visit) {
        query._id = visit.patientId;
      } else {
        return res.status(200).json({
          success: true,
          data: { patients: [], pagination: { page, limit, total: 0, totalPages: 0 } },
        });
      }
    }

    const sortOption = {};
    sortOption[sort] = order === "asc" ? 1 : -1;

    const patients = await Patient.find(query)
      .populate("createdBy", "name role")
      .sort(sortOption)
      .skip(skip)
      .limit(limit)
      .lean();

    const total = await Patient.countDocuments(query);
    const totalPages = Math.ceil(total / limit) || 1;

    return res.status(200).json({
      success: true,
      data: {
        patients,
        pagination: { page, limit, total, totalPages },
      },
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Global Search Across Patients, Visits, Documents
// @route   GET /api/reports/global-search
// @access  Private
export const getGlobalSearch = async (req, res, next) => {
  try {
    const q = req.query.q ? req.query.q.trim() : "";

    if (!q || q.length < 2) {
      return res.status(200).json({
        success: true,
        data: { patients: [], visits: [], documents: [] },
      });
    }

    const qRegex = new RegExp(q, "i");

    // 1. Search Patients
    const patients = await Patient.find({
      isArchived: false,
      $or: [
        { crNo: qRegex },
        { "personalDetails.name": qRegex },
        { "contactDetails.mobile": qRegex },
        { "hospitalDetails.hospitalNumber": qRegex },
      ],
    })
      .select("crNo personalDetails doctorDetails status")
      .limit(5)
      .lean();

    // 2. Search Visits
    const visits = await Visit.find({
      $or: [
        { diagnosis: qRegex },
        { doctorName: qRegex },
        { departmentName: qRegex },
      ],
    })
      .populate("patientId", "crNo personalDetails")
      .select("visitNumber visitType visitDate diagnosis doctorName patientId")
      .limit(5)
      .lean();

    // 3. Search Documents
    const documents = await DocumentModel.find({
      originalName: qRegex,
    })
      .populate("patientId", "crNo personalDetails")
      .select("filename originalName mimeType category patientId createdAt")
      .limit(5)
      .lean();

    return res.status(200).json({
      success: true,
      data: {
        patients,
        visits,
        documents,
      },
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get OPD Visits Report
// @route   GET /api/reports/opd
// @access  Private
export const getOPDReport = async (req, res, next) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 15;
    const skip = (page - 1) * limit;

    const { from, to, doctor, department, status } = req.query;

    const query = { visitType: "OPD" };

    if (doctor && doctor !== "All") query.doctorName = new RegExp(doctor.trim(), "i");
    if (department && department !== "All") query.departmentName = new RegExp(department.trim(), "i");
    if (status && status !== "All") query.statusOnDischarge = status;

    if (from || to) {
      const dateFilter = getDateRangeFilter(from, to);
      if (dateFilter) query.visitDate = dateFilter;
    }

    const visits = await Visit.find(query)
      .populate("patientId", "crNo personalDetails contactDetails hospitalDetails")
      .sort({ visitDate: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    const total = await Visit.countDocuments(query);
    const totalPages = Math.ceil(total / limit) || 1;

    // Doctor & Department aggregations for OPD summary
    const doctorStats = await Visit.aggregate([
      { $match: query },
      { $group: { _id: "$doctorName", count: { $sum: 1 } } },
    ]);

    const departmentStats = await Visit.aggregate([
      { $match: query },
      { $group: { _id: "$departmentName", count: { $sum: 1 } } },
    ]);

    return res.status(200).json({
      success: true,
      data: {
        visits,
        summary: {
          totalOpdVisits: total,
          doctorStats,
          departmentStats,
        },
        pagination: { page, limit, total, totalPages },
      },
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get IPD Admissions & Discharges Report
// @route   GET /api/reports/ipd
// @access  Private
export const getIPDReport = async (req, res, next) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 15;
    const skip = (page - 1) * limit;

    const { from, to, ward, doctor, department, status } = req.query;

    const query = { isArchived: false };

    if (ward && ward !== "All") query["wardDetails.ward"] = new RegExp(ward.trim(), "i");
    if (doctor && doctor !== "All") query["doctorDetails.doctorName"] = new RegExp(doctor.trim(), "i");
    if (department && department !== "All") query["doctorDetails.departmentName"] = new RegExp(department.trim(), "i");
    if (status && status !== "All") {
      query.$or = [{ status: status }, { statusOnDischarge: status }];
    }

    if (from || to) {
      const dateFilter = getDateRangeFilter(from, to);
      if (dateFilter) query.createdAt = dateFilter;
    }

    const patients = await Patient.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    const total = await Patient.countDocuments(query);
    const totalPages = Math.ceil(total / limit) || 1;

    const currentAdmissionsCount = await Patient.countDocuments({
      isArchived: false,
      $or: [{ status: "Admitted" }, { statusOnDischarge: "Admitted" }],
    });

    const dischargesCount = await Patient.countDocuments({
      isArchived: false,
      $or: [{ status: "Discharged" }, { statusOnDischarge: "Discharged" }],
    });

    return res.status(200).json({
      success: true,
      data: {
        patients,
        summary: {
          totalIpdRecords: total,
          currentAdmissions: currentAdmissionsCount,
          totalDischarges: dischargesCount,
        },
        pagination: { page, limit, total, totalPages },
      },
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get Discharge Summaries Report
// @route   GET /api/reports/discharges
// @access  Private
export const getDischargeReport = async (req, res, next) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 15;
    const skip = (page - 1) * limit;

    const { from, to, doctor, department } = req.query;

    const query = {
      isArchived: false,
      $or: [{ status: "Discharged" }, { statusOnDischarge: "Discharged" }],
    };

    if (doctor && doctor !== "All") query["doctorDetails.doctorName"] = new RegExp(doctor.trim(), "i");
    if (department && department !== "All") query["doctorDetails.departmentName"] = new RegExp(department.trim(), "i");

    if (from || to) {
      const dateFilter = getDateRangeFilter(from, to);
      if (dateFilter) query.updatedAt = dateFilter;
    }

    const patients = await Patient.find(query)
      .sort({ updatedAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    const total = await Patient.countDocuments(query);
    const totalPages = Math.ceil(total / limit) || 1;

    return res.status(200).json({
      success: true,
      data: {
        patients,
        pagination: { page, limit, total, totalPages },
      },
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get Follow-ups Report with status categories
// @route   GET /api/reports/followups
// @access  Private
export const getFollowUpReport = async (req, res, next) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 15;
    const skip = (page - 1) * limit;

    const { statusFilter, doctor, department } = req.query;

    const query = {
      isArchived: false,
      $or: [
        { "followUp.date": { $exists: true, $ne: "" } },
        { "followUp.followUpDate": { $exists: true, $ne: "" } },
      ],
    };

    if (doctor && doctor !== "All") query["doctorDetails.doctorName"] = new RegExp(doctor.trim(), "i");
    if (department && department !== "All") query["doctorDetails.departmentName"] = new RegExp(department.trim(), "i");

    const rawPatients = await Patient.find(query).sort({ updatedAt: -1 }).lean();

    const todayStr = new Date().toISOString().split("T")[0];

    const processed = rawPatients.map((p) => {
      const fDate = p.followUp?.date || p.followUp?.followUpDate || "";
      let status = "Upcoming";
      if (fDate === todayStr) status = "Due Today";
      else if (fDate && fDate < todayStr) status = "Overdue";
      return {
        ...p,
        followUpStatus: status,
      };
    });

    let filtered = processed;
    if (statusFilter && statusFilter !== "All") {
      filtered = processed.filter((p) => p.followUpStatus === statusFilter);
    }

    const total = filtered.length;
    const paginated = filtered.slice(skip, skip + limit);
    const totalPages = Math.ceil(total / limit) || 1;

    return res.status(200).json({
      success: true,
      data: {
        followUps: paginated,
        summary: {
          total: processed.length,
          dueToday: processed.filter((p) => p.followUpStatus === "Due Today").length,
          overdue: processed.filter((p) => p.followUpStatus === "Overdue").length,
          upcoming: processed.filter((p) => p.followUpStatus === "Upcoming").length,
        },
        pagination: { page, limit, total, totalPages },
      },
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get Histopathology Report List
// @route   GET /api/reports/histopathology
// @access  Private
export const getHistopathologyReport = async (req, res, next) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 15;
    const skip = (page - 1) * limit;

    const query = {
      isArchived: false,
      histopathologyDetails: { $exists: true, $ne: "" },
    };

    const patients = await Patient.find(query)
      .sort({ updatedAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    const total = await Patient.countDocuments(query);
    const totalPages = Math.ceil(total / limit) || 1;

    return res.status(200).json({
      success: true,
      data: {
        reports: patients,
        pagination: { page, limit, total, totalPages },
      },
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Export CSV Report for Patients, OPD, IPD, Discharges
// @route   GET /api/reports/export
// @access  Private (Requires export permission or admin)
export const exportReportCSV = async (req, res, next) => {
  try {
    const { type = "patients", from, to, department, doctor, status } = req.query;

    const query = { isArchived: false };
    if (department && department !== "All") query["doctorDetails.departmentName"] = department;
    if (doctor && doctor !== "All") query["doctorDetails.doctorName"] = doctor;

    const dateFilter = getDateRangeFilter(from, to);
    if (dateFilter) query.createdAt = dateFilter;

    let records = [];
    let filename = `patient_record_${type}_report_${Date.now()}.csv`;
    let csvHeader = "";
    let csvRows = [];

    if (type === "patients" || type === "ipd" || type === "discharges") {
      records = await Patient.find(query).sort({ createdAt: -1 }).lean();
      csvHeader = "CR Number,Patient Name,Age,Gender,Mobile,Hospital No,Department,Doctor,Ward,Bed,Admission Date,Status\n";

      csvRows = records.map((p) => {
        const name = (p.personalDetails?.name || "").replace(/,/g, " ");
        const mobile = p.contactDetails?.mobile || "";
        const dept = (p.doctorDetails?.departmentName || "").replace(/,/g, " ");
        const doc = (p.doctorDetails?.doctorName || "").replace(/,/g, " ");
        const ward = (p.wardDetails?.ward || "").replace(/,/g, " ");
        const bed = p.wardDetails?.bedNumber || "";
        const admDate = p.admissionDetails?.admissionDate || p.createdAt ? new Date(p.createdAt).toISOString().split("T")[0] : "";
        const st = p.status || p.statusOnDischarge || "Admitted";

        return `${p.crNo},"${name}",${p.personalDetails?.age || ""},${p.personalDetails?.gender || ""},${mobile},"${p.hospitalDetails?.hospitalNumber || ""}","${dept}","${doc}","${ward}",${bed},${admDate},${st}`;
      });
    } else if (type === "opd") {
      records = await Visit.find({ visitType: "OPD" }).populate("patientId").sort({ visitDate: -1 }).lean();
      csvHeader = "Visit Date,Visit Number,CR Number,Patient Name,Department,Doctor,Diagnosis,Status\n";

      csvRows = records.map((v) => {
        const pName = (v.patientId?.personalDetails?.name || "").replace(/,/g, " ");
        const cr = v.patientId?.crNo || "";
        const dept = (v.departmentName || "").replace(/,/g, " ");
        const doc = (v.doctorName || "").replace(/,/g, " ");
        const diag = (v.diagnosis || "").replace(/,/g, " ");
        const vDate = v.visitDate ? new Date(v.visitDate).toISOString().split("T")[0] : "";

        return `${vDate},${v.visitNumber},${cr},"${pName}","${dept}","${doc}","${diag}",${v.statusOnDischarge || "OPD"}`;
      });
    }

    await logAudit({
      userId: req.user._id,
      action: `${type.toUpperCase()}_REPORT_EXPORTED`,
      resource: "Report",
      metadata: { type, count: records.length },
    });

    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    return res.status(200).send(csvHeader + csvRows.join("\n"));
  } catch (error) {
    next(error);
  }
};

// @desc    Generate PDF Document for Patient Summary Report
// @route   GET /api/reports/patients/:id/pdf
// @access  Private
export const generatePatientPDF = async (req, res, next) => {
  try {
    const { id } = req.params;

    const patient = (await Patient.findById(id)) || (await Patient.findOne({ crNo: id }));
    if (!patient) {
      return res.status(404).json({ success: false, message: "Patient record not found" });
    }

    const visits = await Visit.find({ patientId: patient._id }).sort({ visitDate: -1 }).lean();

    await logAudit({
      userId: req.user._id,
      action: "PATIENT_REPORT_DOWNLOADED",
      resource: "Patient",
      resourceId: patient._id.toString(),
      metadata: { crNo: patient.crNo },
    });

    // Single Page A4 Discharge Summary & Clinical Report
    const doc = new PDFDocument({ margin: 28, size: "A4" });

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="Discharge_Summary_${patient.crNo}.pdf"`);
    doc.pipe(res);

    const ipNumber = patient.ipNo || patient.hospitalDetails?.ipNumber || patient.hospitalDetails?.hospitalNumber || "N/A";
    const dischargeRemarks = patient.dischargeRemarks || patient.doctorComments || "Discharged in stable condition. Advised follow-up as prescribed.";

    // 1. HOSPITAL LETTERHEAD (Compact Single A4)
    doc.fillColor("#0284c7").fontSize(15).text("DIGICODERS SUPER SPECIALTY HOSPITAL", { align: "center", bold: true });
    doc.fillColor("#475569").fontSize(8).text("Tertiary Care & Multi-Specialty Clinical Research Network • Emergency & Trauma Center", { align: "center" });
    doc.fillColor("#0f172a").fontSize(11).text("PATIENT DISCHARGE SUMMARY", { align: "center", bold: true });
    doc.moveDown(0.2);
    doc.strokeColor("#0284c7").lineWidth(1.5).moveTo(28, doc.y).lineTo(567, doc.y).stroke();
    doc.moveDown(0.4);

    // 2. PATIENT IDENTIFICATION & ADMISSION GRID
    const startY = doc.y;
    doc.rect(28, startY, 539, 64).fillAndStroke("#f8fafc", "#cbd5e1");
    doc.fillColor("#0f172a").fontSize(8.5);

    // Row 1
    doc.font("Helvetica-Bold").text("CR Number :", 34, startY + 5);
    doc.font("Helvetica").text(patient.crNo || "N/A", 145, startY + 5);

    doc.font("Helvetica-Bold").text("IP Number :", 300, startY + 5);
    doc.font("Helvetica").text(ipNumber, 400, startY + 5);

    // Row 2
    doc.font("Helvetica-Bold").text("Patient Name:", 34, startY + 18);
    doc.font("Helvetica").text(`${patient.personalDetails?.name || "N/A"} (${patient.personalDetails?.age ?? "N/A"} Yrs / ${patient.personalDetails?.gender || "N/A"})`, 145, startY + 18);

    doc.font("Helvetica-Bold").text("Father/Guardian:", 300, startY + 18);
    doc.font("Helvetica").text(patient.personalDetails?.fatherGuardianName || "N/A", 400, startY + 18);

    // Row 3
    doc.font("Helvetica-Bold").text("Mobile / Contact:", 34, startY + 31);
    doc.font("Helvetica").text(patient.contactDetails?.mobile || "N/A", 145, startY + 31);

    doc.font("Helvetica-Bold").text("Ward / Bed No:", 300, startY + 31);
    doc.font("Helvetica").text(`${patient.wardDetails?.ward || "General Ward"} / ${patient.wardDetails?.bedNumber || "N/A"}`, 400, startY + 31);

    // Row 4
    doc.font("Helvetica-Bold").text("Admission Date:", 34, startY + 44);
    doc.font("Helvetica").text(patient.admissionDetails?.admissionDate || "N/A", 145, startY + 44);

    doc.font("Helvetica-Bold").text("Discharge Date:", 300, startY + 44);
    doc.font("Helvetica").text(patient.admissionDetails?.dischargeDate || "As on Discharge", 400, startY + 44);

    // Row 5
    doc.font("Helvetica-Bold").text("Consultant Doctor:", 34, startY + 55);
    doc.font("Helvetica").text(`${patient.doctorDetails?.doctorName || "N/A"} (${patient.doctorDetails?.departmentName || "General"})`, 145, startY + 55);

    doc.font("Helvetica-Bold").text("Status on Discharge:", 300, startY + 55);
    doc.font("Helvetica").text(patient.statusOnDischarge || patient.status || "Discharged / Stable", 400, startY + 55);

    doc.y = startY + 70;

    // Helper for clean bordered sections
    const renderSectionHeader = (title, hindiSub) => {
      doc.moveDown(0.3);
      const curY = doc.y;
      doc.rect(28, curY, 539, 14).fill("#f1f5f9");
      doc.fillColor("#0369a1").fontSize(8.5).font("Helvetica-Bold").text(`${title} ${hindiSub ? `[${hindiSub}]` : ""}`, 32, curY + 2.5);
      doc.y = curY + 17;
      doc.fillColor("#1e293b").font("Helvetica").fontSize(8);
    };

    // 3.  (CONDITION AT ADMISSION)
    renderSectionHeader("1. CLINICAL CONDITION AT ADMISSION");
    doc.font("Helvetica-Bold").text("Diagnosis : ", 32, doc.y, { continued: true });
    doc.font("Helvetica").text(patient.diagnosis?.diagnosisDetails || "Under Clinical Evaluation");

    doc.font("Helvetica-Bold").text("Presenting Complaints: ", 32, doc.y, { continued: true });
    doc.font("Helvetica").text(patient.diagnosis?.presentingComplaints || "Standard inpatient admission evaluation");

    if (patient.diagnosis?.physicalFindings) {
      doc.font("Helvetica-Bold").text("Physical Vitals at Admission: ", 32, doc.y, { continued: true });
      doc.font("Helvetica").text(patient.diagnosis.physicalFindings);
    }

    // 4. (COURSE IN HOSPITAL & INVESTIGATIONS)
    renderSectionHeader("2. HOSPITAL COURSE & DIAGNOSTIC PROGRESS");
    doc.font("Helvetica-Bold").text("Course in Hospital: ", 32, doc.y, { continued: true });
    doc.font("Helvetica").text(patient.courseInHospital || "Patient managed conservatively with IV fluids, antibiotics and clinical monitoring. Showed steady recovery.");

    if (patient.investigationDetails || patient.histopathologyDetails) {
      doc.font("Helvetica-Bold").text("Investigations & Findings: ", 32, doc.y, { continued: true });
      doc.font("Helvetica").text(patient.investigationDetails || patient.histopathologyDetails || "Routine Labs within normal clinical range.");
    }

    // 5.(TREATMENT & PROCEDURES GIVEN)
    renderSectionHeader("3. TREATMENT & PROCEDURAL SUMMARY");
    if (patient.treatment?.operationProcedureDetails) {
      doc.font("Helvetica-Bold").text("Surgery / Procedure Performed: ", 32, doc.y, { continued: true });
      doc.font("Helvetica").text(patient.treatment.operationProcedureDetails);
    }
    doc.font("Helvetica-Bold").text("Treatment Details Given: ", 32, doc.y, { continued: true });
    doc.font("Helvetica").text(patient.treatment?.treatmentDetails || "Inpatient medication protocol administered as per standard hospital clinical guidelines.");

    // Discharge Medications Table (if any)
    if (patient.medications && patient.medications.length > 0) {
      doc.moveDown(0.2);
      doc.font("Helvetica-Bold").text("Discharge Medications Prescribed :", 32, doc.y);
      doc.font("Helvetica");
      patient.medications.slice(0, 4).forEach((med, mIdx) => {
        doc.text(`   • ${med.medicine || "Medicine"} — Dosage: ${med.dosage || "1 Tab"} | Frequency: ${med.frequency || "OD"} | Duration: ${med.duration || "5 Days"} ${med.instructions ? `(${med.instructions})` : ""}`);
      });
    }

    // 6. डिस्चार्ज रिमार्क (DISCHARGE REMARKS & ADVICE)
    renderSectionHeader("4. DISCHARGE REMARKS & ADVICE");
    doc.font("Helvetica-Bold").fillColor("#b91c1c").text("Discharge Remarks: ", 32, doc.y, { continued: true });
    doc.font("Helvetica").fillColor("#0f172a").text(dischargeRemarks);

    if (patient.followUp?.date || patient.followUp?.instructions) {
      doc.font("Helvetica-Bold").text("Follow-up Consultation: ", 32, doc.y, { continued: true });
      doc.font("Helvetica").text(`Next Visit: ${patient.followUp.date || "After 7 Days"} | Instructions: ${patient.followUp.instructions || "Report to OPD for review."}`);
    }

    // 7. SIGNATURES & AUTHENTICATION BLOCK (Pinned neatly to bottom of single A4)
    doc.moveDown(1.2);
    const sigY = Math.max(doc.y, 735);
    doc.strokeColor("#cbd5e1").lineWidth(0.8).moveTo(28, sigY).lineTo(567, sigY).stroke();

    doc.fontSize(7.5).fillColor("#64748b");
    doc.text(`Generated: ${new Date().toLocaleString("en-IN")} | Computer Generated Official Discharge Record`, 28, sigY + 6);

    doc.fontSize(8).fillColor("#0f172a").font("Helvetica-Bold");
    doc.text("Prepared by (RMO / Nurse)", 50, sigY + 30);
    doc.text("Treating Consultant / Doctor's Signature & Seal", 360, sigY + 30);

    doc.end();
  } catch (error) {
    next(error);
  }
};

// @desc    Generate PDF for Detailed Visit Record
// @route   GET /api/reports/visits/:visitId/pdf
// @access  Private
export const generateVisitPDF = async (req, res, next) => {
  try {
    const { visitId } = req.params;

    const visit = await Visit.findById(visitId).populate("patientId");
    if (!visit) {
      return res.status(404).json({ success: false, message: "Visit record not found" });
    }

    const patient = visit.patientId;

    await logAudit({
      userId: req.user._id,
      action: "VISIT_REPORT_DOWNLOADED",
      resource: "Visit",
      resourceId: visit._id.toString(),
      metadata: { visitNumber: visit.visitNumber, crNo: patient?.crNo },
    });

    const doc = new PDFDocument({ margin: 40, size: "A4" });

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="Visit_Report_V${visit.visitNumber}.pdf"`);
    doc.pipe(res);

    // Header
    doc.fillColor("#0f172a").fontSize(20).text("PATIENT RECORD CLINICAL VISIT REPORT", { align: "center", bold: true });
    doc.fillColor("#64748b").fontSize(10).text(`Visit #${visit.visitNumber} — ${visit.visitType} Encounter`, { align: "center" });
    doc.moveDown(0.5);
    doc.strokeColor("#cbd5e1").lineWidth(1).moveTo(40, doc.y).lineTo(555, doc.y).stroke();
    doc.moveDown(1);

    // Patient & Visit Meta
    doc.fontSize(10).fillColor("#334155");
    doc.text(`Patient Name: ${patient?.personalDetails?.name || "N/A"} (CR: ${patient?.crNo || "N/A"})`);
    doc.text(`Visit Date: ${new Date(visit.visitDate).toLocaleString()}`);
    doc.text(`Attending Doctor: ${visit.doctorName || "N/A"} (${visit.departmentName || "General"})`);
    doc.text(`Ward/Bed: ${visit.ward || "N/A"} / ${visit.bedNumber || "N/A"}`);
    doc.moveDown(1);

    // Clinical Sections
    doc.fillColor("#1e293b").fontSize(12).text("Clinical Notes");
    doc.fontSize(10).fillColor("#334155");
    doc.text(`Presenting Complaints: ${visit.presentingComplaints || "N/A"}`);
    doc.text(`Diagnosis: ${visit.diagnosis || "N/A"}`);
    doc.text(`Physical Findings: ${visit.physicalFindings || "N/A"}`);
    doc.text(`Investigations: ${visit.investigations || "N/A"}`);
    doc.text(`Treatment: ${visit.treatmentDetails || "N/A"}`);
    doc.text(`Procedures: ${visit.operationProcedureDetails || "N/A"}`);
    doc.moveDown(1);

    // Footer
    doc.moveDown(2);
    doc.fontSize(9).fillColor("#94a3b8");
    doc.text(`Generated on: ${new Date().toLocaleString()} | Patient Record Management System`, { align: "center" });

    doc.end();
  } catch (error) {
    next(error);
  }
};
