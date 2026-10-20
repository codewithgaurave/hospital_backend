import Patient from "../models/Patient.js";
import Visit from "../models/Visit.js";

// @desc    Get dashboard summary with stats, recent patients, trends & clinical widgets
// @route   GET /api/dashboard/summary
// @access  Private
export const getDashboardSummary = async (req, res, next) => {
  try {
    // 1. Calculate overall counts using efficient MongoDB aggregation
    const statusCounts = await Patient.aggregate([
      { $match: { isArchived: false } },
      {
        $group: {
          _id: { $ifNull: ["$status", "$statusOnDischarge"] },
          count: { $sum: 1 },
        },
      },
    ]);

    let totalPatients = 0;
    let admittedPatients = 0;
    let dischargedPatients = 0;
    let underTreatmentPatients = 0;
    let pendingPatients = 0;

    statusCounts.forEach((item) => {
      totalPatients += item.count;
      const status = item._id ? item._id.trim() : "";
      if (status === "Admitted") admittedPatients += item.count;
      else if (status === "Discharged") dischargedPatients += item.count;
      else if (status === "Under Treatment") underTreatmentPatients += item.count;
      else if (status === "Pending") pendingPatients += item.count;
    });

    // Count pending reports (patients with missing investigation details or pending status)
    const pendingReportsCount = await Patient.countDocuments({
      isArchived: false,
      $or: [
        { status: "Pending" },
        { statusOnDischarge: "Pending" },
        { "investigationDetails": { $exists: false } },
        { "investigationDetails": "" },
      ],
    });

    // 2. Fetch Recent Patients (limit 5)
    const recentPatients = await Patient.find({ isArchived: false })
      .select("crNo personalDetails contactDetails doctorDetails admissionDetails status statusOnDischarge createdAt")
      .sort({ createdAt: -1 })
      .limit(5)
      .lean();

    // 3. Upcoming Follow-ups widget data
    const upcomingFollowUps = await Patient.find({
      isArchived: false,
      $or: [
        { "followUp.date": { $exists: true, $ne: "" } },
        { "followUp.followUpDate": { $exists: true, $ne: "" } },
      ],
    })
      .select("crNo personalDetails doctorDetails followUp status statusOnDischarge")
      .sort({ updatedAt: -1 })
      .limit(5)
      .lean();

    // 4. Current Admissions (IPD)
    const currentAdmissions = await Patient.find({
      isArchived: false,
      $or: [{ status: "Admitted" }, { statusOnDischarge: "Admitted" }],
    })
      .select("crNo personalDetails doctorDetails wardDetails admissionDetails status")
      .sort({ createdAt: -1 })
      .limit(5)
      .lean();

    // 5. Recent Discharges
    const recentDischarges = await Patient.find({
      isArchived: false,
      $or: [{ status: "Discharged" }, { statusOnDischarge: "Discharged" }],
    })
      .select("crNo personalDetails doctorDetails admissionDetails status")
      .sort({ updatedAt: -1 })
      .limit(5)
      .lean();

    // 6. Calculate Monthly Registration Trend (Aggregation for Recharts)
    const currentYear = new Date().getFullYear();
    const trendAggregation = await Patient.aggregate([
      {
        $match: {
          isArchived: false,
          createdAt: {
            $gte: new Date(`${currentYear}-01-01`),
            $lte: new Date(`${currentYear}-12-31T23:59:59.999Z`),
          },
        },
      },
      {
        $group: {
          _id: { $month: "$createdAt" },
          registrations: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    const monthNames = [
      "Jan", "Feb", "Mar", "Apr", "May", "Jun",
      "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
    ];

    const registrationTrend = monthNames.map((month, idx) => {
      const found = trendAggregation.find((t) => t._id === idx + 1);
      return {
        month,
        registrations: found ? found.registrations : 0,
      };
    });

    const statusDistribution = [
      { name: "Admitted", value: admittedPatients, color: "#ef4444" },
      { name: "Discharged", value: dischargedPatients, color: "#10b981" },
      { name: "Under Treatment", value: underTreatmentPatients, color: "#8b5cf6" },
      { name: "Pending", value: pendingPatients, color: "#f59e0b" },
    ];

    return res.status(200).json({
      success: true,
      data: {
        statistics: {
          totalPatients,
          admittedPatients,
          dischargedPatients,
          pendingReports: pendingReportsCount,
          underTreatmentPatients,
        },
        recentPatients,
        upcomingFollowUps,
        currentAdmissions,
        recentDischarges,
        registrationTrend,
        statusDistribution,
      },
    });
  } catch (error) {
    next(error);
  }
};
