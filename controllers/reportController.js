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

    // Run query and count in parallel for maximum performance
    const [patients, total] = await Promise.all([
      Patient.find(query)
        .populate("createdBy", "name role")
        .sort(sortOption)
        .skip(skip)
        .limit(limit)
        .lean(),
      Patient.countDocuments(query),
    ]);
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

// @desc    Generate Single-Page A4 PDF Document matching official Discharge Summary (Image 2)
// @route   GET /api/reports/patients/:id/pdf
// @access  Private
export const generatePatientPDF = async (req, res, next) => {
  try {
    const { id } = req.params;
    const isDownload = req.query.download === "true";

    const patient = (await Patient.findById(id)) || (await Patient.findOne({ crNo: id }));
    if (!patient) {
      return res.status(404).json({ success: false, message: "Patient record not found" });
    }

    const visits = await Visit.find({ patientId: patient._id }).sort({ visitDate: -1, createdAt: -1 }).lean();

    await logAudit({
      userId: req.user._id,
      action: "PATIENT_REPORT_DOWNLOADED",
      resource: "Patient",
      resourceId: patient._id.toString(),
      metadata: { crNo: patient.crNo },
    });

    // Create exact single-page A4 document (A4: 595.28 x 841.89 points)
    const doc = new PDFDocument({
      size: "A4",
      margins: { top: 15, bottom: 15, left: 20, right: 20 },
      bufferPages: true,
      autoFirstPage: true,
    });

    res.setHeader("Content-Type", "application/pdf");
    const disposition = isDownload ? "attachment" : "inline";
    res.setHeader("Content-Disposition", `${disposition}; filename="Discharge_Summary_${patient.crNo.replace(/\//g, "_")}.pdf"`);
    doc.pipe(res);

    // Extract clinical fields completely dynamically from patient and latest visit
    const latestVisit = (visits && visits.length > 0) ? visits[0] : {};

    const personal = patient.personalDetails || {};
    const contact = patient.contactDetails || {};
    const hospital = patient.hospitalDetails || {};
    const ward = patient.wardDetails || {};
    const doctor = patient.doctorDetails || {};
    const admission = patient.admissionDetails || {};
    const diagnosis = patient.diagnosis || {};
    const treatment = patient.treatment || {};
    const followUp = patient.followUp || {};
    const medications = (patient.medications && patient.medications.length > 0)
      ? patient.medications
      : (latestVisit.medications || []);

    const name = (personal.name || "N/A").toUpperCase();
    const age = personal.age ? String(personal.age) : "--";
    const gender = personal.gender || "--";
    const crNo = patient.crNo || "N/A";
    const ipNo = patient.ipNo || hospital.ipNumber || hospital.hospitalNumber || "—";
    const wardName = ward.ward || "General Ward";
    const bedNo = ward.bedNumber ? `Bed: ${ward.bedNumber}` : "Bed not allocated";
    const wardBed = `${wardName} / ${bedNo}`;
    const guardian = personal.fatherGuardianName ? personal.fatherGuardianName.toUpperCase() : "—";
    const phone = contact.mobile || "—";

    const rawAddress = contact.address || "";
    const addressParts = [
      rawAddress,
      contact.city,
      contact.state ? (contact.pincode ? `${contact.state} - ${contact.pincode}` : contact.state) : contact.pincode,
    ].filter(Boolean);
    const fullAddress = addressParts.length > 0 ? addressParts.join(", ") : "—";

    const doa = admission.admissionDate || (patient.createdAt ? new Date(patient.createdAt).toISOString().split("T")[0] : "—");
    const isDischarged = (patient.status === "Discharged" || patient.statusOnDischarge === "Discharged");
    const dod = admission.dischargeDate || (isDischarged ? (patient.updatedAt ? new Date(patient.updatedAt).toISOString().split("T")[0] : "Discharged") : (patient.status || "Active Inpatient"));

    const doctorIncharge = doctor.doctorName ? doctor.doctorName.toUpperCase() : "ATTENDING CONSULTANT";
    const deptName = doctor.departmentName ? doctor.departmentName.toUpperCase() : "NEUROSURGERY";
    const assistingDoc = doctor.assistingDoctor ? doctor.assistingDoctor.toUpperCase() : (doctor.doctorName ? `DR. ${doctor.doctorName.toUpperCase()}` : "RESIDENT INCHARGE");

    // =========================================================================
    // 1. HEADER (Discharge Summary, Department, Hospital, Non-Medicolegal)
    // =========================================================================
    let curY = 18;
    doc.fillColor("#000000");

    doc.font("Helvetica-Bold").fontSize(13).text("DISCHARGE SUMMARY", 20, curY, { align: "center", width: 555 });
    curY += 16;

    doc.font("Helvetica-Bold").fontSize(10).text(`DEPARTMENT OF ${deptName}`, 20, curY, { align: "center", width: 555 });
    curY += 13;

    doc.font("Helvetica-Bold").fontSize(9).text("PATIENT RECORD MANAGEMENT SYSTEM", 20, curY, { align: "center", width: 555 });
    curY += 12;

    doc.font("Helvetica-Bold").fontSize(8).text("NOT FOR MEDICOLEGAL PURPOSE", 20, curY, { align: "center", width: 555 });
    curY += 13;

    // Thin horizontal divider
    doc.lineWidth(0.8).strokeColor("#000000").moveTo(20, curY).lineTo(575, curY).stroke();
    curY += 6;

    // =========================================================================
    // 2. PATIENT DEMOGRAPHICS & ADMISSION DETAILS GRID (ONLY REAL SCHEMA FIELDS)
    // =========================================================================
    const rowH = 12;
    const col1X = 22;
    const col2X = 180;
    const col3X = 330;
    const col4X = 460;

    doc.fontSize(7.8).font("Helvetica");

    // Row 1: Name, Age/Gender, CR No, IP No
    doc.font("Helvetica-Bold").text("Patient Name: ", col1X, curY, { continued: true });
    doc.font("Helvetica").text(name, { continued: false });

    doc.font("Helvetica-Bold").text("Age / Gender: ", col2X, curY, { continued: true });
    doc.font("Helvetica").text(`${age} Yrs / ${gender}`, { continued: false });

    doc.font("Helvetica-Bold").text("CR No.: ", col3X, curY, { continued: true });
    doc.font("Helvetica-Bold").text(crNo, { continued: false });

    doc.font("Helvetica-Bold").text("IP No.: ", col4X, curY, { continued: true });
    doc.font("Helvetica").text(ipNo, { continued: false });
    curY += rowH;

    // Row 2: Father/Guardian, Mobile, Attending Doctor
    doc.font("Helvetica-Bold").text("Father/Guardian: ", col1X, curY, { continued: true });
    doc.font("Helvetica").text(guardian, { continued: false });

    doc.font("Helvetica-Bold").text("Mobile No.: ", col2X, curY, { continued: true });
    doc.font("Helvetica").text(phone, { continued: false });

    doc.font("Helvetica-Bold").text("Attending Doctor: ", col3X, curY, { continued: true });
    doc.font("Helvetica").text(`Dr. ${doctorIncharge}`, { continued: false });
    curY += rowH;

    // Row 3: Ward/Bed, DOA, DOD, Status
    doc.font("Helvetica-Bold").text("Ward / Bed: ", col1X, curY, { continued: true });
    doc.font("Helvetica").text(wardBed, { continued: false });

    doc.font("Helvetica-Bold").text("DOA: ", col2X, curY, { continued: true });
    doc.font("Helvetica").text(doa, { continued: false });

    doc.font("Helvetica-Bold").text("DOD: ", col3X, curY, { continued: true });
    doc.font("Helvetica").text(dod, { continued: false });

    const rawStatus = patient.statusOnDischarge || patient.status || latestVisit.statusOnDischarge || latestVisit.status || "Admitted";
    doc.font("Helvetica-Bold").text("Status: ", col4X, curY, { continued: true });
    doc.font("Helvetica").text(rawStatus, { continued: false });
    curY += rowH;

    // Row 4: Full Address
    doc.font("Helvetica-Bold").text("Residential Address: ", col1X, curY, { continued: true });
    doc.font("Helvetica").text(fullAddress, { continued: false, width: 490 });
    curY += rowH + 4;

    // Divider line between Demographics and Two-column Clinical section
    doc.lineWidth(0.8).strokeColor("#000000").moveTo(20, curY).lineTo(575, curY).stroke();
    const sectionStartY = curY + 6;
    const maxClinicalY = 560;

    // =========================================================================
    // 3. TWO-COLUMN CLINICAL BODY (COMPLETELY DYNAMIC WITH REAL CLINICAL DATA)
    // =========================================================================
    const leftX = 22;
    const leftW = 260;

    const rightX = 296;
    const rightW = 278;

    // Helper to render clinical subsections with strict vertical bounds
    const renderBlock = (colX, colW, startYpos, label, textVal, isUnderlined = false) => {
      doc.font("Helvetica-Bold").fontSize(8).fillColor("#000000");
      doc.text(label, colX, startYpos, { underline: isUnderlined, width: colW });
      const labelH = doc.heightOfString(label, { width: colW });
      const contentY = startYpos + labelH + 2;
      const availH = maxClinicalY - contentY;
      if (availH <= 4) return contentY;

      doc.font("Helvetica").fontSize(7.2).fillColor("#111111");
      const cleanText = (textVal || "—").trim();
      doc.text(cleanText, colX, contentY, {
        width: colW,
        height: availH,
        ellipsis: true,
        lineGap: 1,
      });
      const textH = Math.min(availH, doc.heightOfString(cleanText, { width: colW, lineGap: 1 }));
      return contentY + textH + 8;
    };

    // --- LEFT COLUMN (Real Dynamic Data) ---
    let leftY = sectionStartY;

    // 1. Final Diagnosis
    const finalDiagnosisText = diagnosis.diagnosisDetails || latestVisit.diagnosis || "Under clinical evaluation";
    leftY = renderBlock(leftX, leftW, leftY, "Final Diagnosis:", finalDiagnosisText, true);

    // 2. Presenting Complaints
    const complaintsText = diagnosis.presentingComplaints || latestVisit.presentingComplaints || "Admitted for clinical observation and symptomatic management";
    leftY = renderBlock(leftX, leftW, leftY, "Presenting Complaints:", complaintsText);

    // 3. Physical findings
    const physicalFindingsText = diagnosis.physicalFindings || latestVisit.physicalFindings || "Vitals within normal limits, neurological parameters stable";
    leftY = renderBlock(leftX, leftW, leftY, "Physical findings:", physicalFindingsText);

    // 4. Investigations
    const investigationsText = patient.investigationDetails || latestVisit.investigations || latestVisit.investigation || patient.histopathologyDetails || "Baseline and routine laboratory investigations within expected clinical range";
    leftY = renderBlock(leftX, leftW, leftY, "Investigations:", investigationsText);

    // --- RIGHT COLUMN (Real Dynamic Data) ---
    let rightY = sectionStartY;

    // 1. Treatment
    const treatmentText = treatment.operationProcedureDetails || treatment.treatmentDetails || latestVisit.operationProcedureDetails || latestVisit.treatmentDetails || latestVisit.operationDetails || "Conservative inpatient clinical therapy and medical protocol administered";
    rightY = renderBlock(rightX, rightW, rightY, "Treatment:", treatmentText);

    // 2. OP Finding
    const opFindingText = patient.opdFindings || latestVisit.opdFindings || treatment.operationProcedureDetails || "Non-operative / Clinical monitoring satisfactory";
    rightY = renderBlock(rightX, rightW, rightY, "OP Finding:", opFindingText);

    // 3. Course in Hospital
    const courseText = patient.courseInHospital || latestVisit.courseInHospital || "Patient managed conservatively with regular monitoring; vital signs remained stable throughout hospital admission";
    rightY = renderBlock(rightX, rightW, rightY, "Course in Hospital:", courseText);

    // 4. Status on Discharge
    let statusText = rawStatus;
    if (rawStatus === "Admitted") {
      statusText = "ACTIVE INPATIENT - UNDER CLINICAL OBSERVATION";
    } else if (rawStatus === "Discharged") {
      statusText = "DISCHARGED - STABLE CONDITION, ORALLY ACCEPTING, SELF VOIDING";
    } else if (rawStatus === "Under Treatment") {
      statusText = "UNDER TREATMENT - SHOWING CLINICAL PROGRESSION";
    }
    rightY = renderBlock(rightX, rightW, rightY, "Status on Discharge:", statusText);

    // 5. Comments
    const commentsText = patient.doctorComments || latestVisit.doctorComments || "To attend outpatient OPD consultation as scheduled. Report immediately in case of emergency or new symptoms.";
    rightY = renderBlock(rightX, rightW, rightY, "Comments:", commentsText);

    // 6. Advice (Prescriptions & Discharge Instructions - 100% Dynamic)
    let adviceText = "";
    if (medications && medications.length > 0) {
      adviceText = medications.map((m) => {
        const parts = [];
        if (m.medicine) parts.push(m.medicine.toUpperCase());
        if (m.dosage) parts.push(m.dosage);
        if (m.frequency) parts.push(m.frequency);
        if (m.duration) parts.push(`FOR ${m.duration.toUpperCase()}`);
        if (m.instructions) parts.push(`(${m.instructions})`);
        return parts.join(" ");
      }).join("\n");
    }
    const remarks = patient.dischargeRemarks || latestVisit.dischargeRemarks || latestVisit.advice || "";
    if (remarks) {
      adviceText = adviceText ? `${adviceText}\n${remarks}` : remarks;
    }
    if (!adviceText) {
      adviceText = "Take adequate rest as advised. Maintain routine prescribed diet and lifestyle precautions.";
    }
    rightY = renderBlock(rightX, rightW, rightY, "Advice:", adviceText);

    // Dynamic clinical bottom: only stretches to actual content height
    const clinicalBottomY = Math.max(leftY, rightY, 340);

    // Vertical line between Left and Right columns (stops cleanly at clinicalBottomY)
    doc.lineWidth(0.5).strokeColor("#777777").moveTo(290, sectionStartY - 6).lineTo(290, clinicalBottomY).stroke();

    // Horizontal divider at bottom of clinical columns
    doc.lineWidth(0.8).strokeColor("#000000").moveTo(20, clinicalBottomY).lineTo(575, clinicalBottomY).stroke();
    curY = clinicalBottomY + 8;

    // =========================================================================
    // 5. FOLLOW-UP & HISTOPATHOLOGY SECTION (COMPLETELY DYNAMIC)
    // =========================================================================
    const followUpDateText = followUp.date || latestVisit.followUpDate || latestVisit.followUp?.date || "As Advised by Doctor";
    const followUpInst = followUp.instructions || latestVisit.followUpInstructions || latestVisit.followUp?.instructions || "Report to OPD for review with all investigation reports";
    const histoText = patient.histopathologyDetails || latestVisit.histopathologyDetails || "Awaited";

    doc.font("Helvetica-Bold").fontSize(8).fillColor("#000000");
    doc.text("FOLLOW-UP RE-VISIT IN OPD / RE-CONSULTATION:", col1X, curY);
    doc.text(`TO REVIEW IN ${deptName} OPD:`, col3X, curY);
    curY += 12;

    doc.font("Helvetica").fontSize(7.5);
    doc.text(`NEXT FOLLOW-UP REVIEW:  ${followUpDateText.toUpperCase()}`, col1X, curY);
    doc.text(`${followUpDateText.toUpperCase()} (BETWEEN 9AM TO 12 NOON)`, col3X, curY);
    curY += 10;

    doc.text(`TIMING: 9:00 AM TO 12:00 NOON (${deptName} OPD)`, col1X, curY);
    doc.font("Helvetica-Bold").fontSize(7.8).text("HistoPathology: ", col3X, curY, { continued: true });
    doc.font("Helvetica").text(histoText.toUpperCase(), { continued: false });
    curY += 10;

    doc.font("Helvetica").fontSize(7.5).text(`INSTRUCTIONS: ${followUpInst.toUpperCase().slice(0, 56)}`, col1X, curY);
    curY += 22;

    // =========================================================================
    // 6. SIGNATURES BLOCK (DYNAMIC DOCTORS)
    // =========================================================================
    curY = Math.max(curY, 680);
    doc.font("Helvetica").fontSize(7).text("____________________________________________", col1X + 10, curY);
    doc.text("____________________________________________", col3X + 20, curY);
    curY += 11;

    doc.font("Helvetica-Bold").fontSize(8);
    doc.text("SIGNATURE OF SURGEON INCHARGE", col1X + 10, curY);
    doc.text("SIGNATURE OF RESIDENT INCHARGE", col3X + 20, curY);
    curY += 10;

    doc.font("Helvetica").fontSize(7.5).fillColor("#333333");
    doc.text(`Dr. ${doctorIncharge}`, col1X + 10, curY);
    doc.text(`Dr. ${assistingDoc}`, col3X + 20, curY);
    curY += 18;

    // =========================================================================
    // 7. BOTTOM DISCLAIMER (BORDERED BOX)
    // =========================================================================
    doc.rect(20, curY, 555, 18).strokeColor("#000000").lineWidth(0.8).stroke();
    doc.font("Helvetica-Bold").fontSize(6.8).fillColor("#000000").text(
      "REIMBURSEMENT CLAIMS IF ANY SHOULD BE SUBMITTED FOR VERIFICATION WITH REQUIRED DOCUMENTS WITHIN 30 DAYS/3 MONTHS OF DISCHARGE OR THEY WILL NOT BE ENTERTAINED.",
      24,
      curY + 5,
      { width: 547, align: "center" }
    );
    curY += 26;

    // =========================================================================
    // 8. SYSTEM FOOTER & TIMESTAMP (DYNAMIC PATIENT URL & DATE)
    // =========================================================================
    doc.font("Helvetica").fontSize(7.5).fillColor("#444444");
    const clientUrl = process.env.CLIENT_URL || "http://localhost:5173";
    const dynamicFooterUrl = `${clientUrl}/patients/${patient._id}?cr=${encodeURIComponent(crNo !== "N/A" ? crNo : "")}`;
    doc.text(dynamicFooterUrl, 20, curY);
    const todayFormatted = new Date().toLocaleDateString("en-GB");
    doc.text(todayFormatted, 500, curY, { align: "right", width: 75 });

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
