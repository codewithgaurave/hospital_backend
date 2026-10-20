import User from "../models/User.js";
import AuditLog from "../models/AuditLog.js";
import RolePermission from "../models/RolePermission.js";
import Notification from "../models/Notification.js";
import { ALL_PERMISSIONS, DEFAULT_ROLE_PERMISSIONS } from "../config/permissions.js";
import { logAudit } from "../utils/auditLogger.js";

// @desc    Get Admin Panel Dashboard Analytics & System Activity
// @route   GET /api/admin/dashboard
// @access  Private (Admin)
export const getAdminDashboardSummary = async (req, res, next) => {
  try {
    const totalUsers = await User.countDocuments();
    const activeUsers = await User.countDocuments({ isActive: true });
    const inactiveUsers = await User.countDocuments({ isActive: false });

    const doctorsCount = await User.countDocuments({ role: "doctor" });
    const staffCount = await User.countDocuments({ role: "staff" });
    const adminsCount = await User.countDocuments({ role: "admin" });

    const recentUsers = await User.find()
      .select("-password")
      .sort({ createdAt: -1 })
      .limit(5)
      .lean();

    const recentLoginActivities = await AuditLog.find({ action: { $in: ["LOGIN_SUCCESS", "LOGIN_FAILED", "LOGOUT"] } })
      .populate("userId", "name email role")
      .sort({ timestamp: -1 })
      .limit(6)
      .lean();

    const recentSystemActivities = await AuditLog.find()
      .populate("userId", "name role")
      .sort({ timestamp: -1 })
      .limit(8)
      .lean();

    const roleDistribution = [
      { name: "Doctors", value: doctorsCount, color: "#3b82f6" },
      { name: "Staff", value: staffCount, color: "#10b981" },
      { name: "Administrators", value: adminsCount, color: "#8b5cf6" },
    ];

    return res.status(200).json({
      success: true,
      data: {
        statistics: {
          totalUsers,
          activeUsers,
          inactiveUsers,
          doctorsCount,
          staffCount,
          adminsCount,
        },
        recentUsers,
        recentLoginActivities,
        recentSystemActivities,
        roleDistribution,
      },
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get paginated users with search & filters
// @route   GET /api/admin/users
// @access  Private (Admin)
export const getUsers = async (req, res, next) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 10;
    const skip = (page - 1) * limit;

    const { search, role, department, isActive, sortBy } = req.query;

    const query = {};

    if (search) {
      const searchRegex = new RegExp(search.trim(), "i");
      query.$or = [
        { name: searchRegex },
        { email: searchRegex },
        { phone: searchRegex },
      ];
    }

    if (role && role !== "All") {
      query.role = role.toLowerCase();
    }

    if (department && department !== "All") {
      query.department = department;
    }

    if (isActive !== undefined && isActive !== "All") {
      query.isActive = isActive === "true";
    }

    let sort = { createdAt: -1 };
    if (sortBy === "name") sort = { name: 1 };
    else if (sortBy === "lastLogin") sort = { lastLogin: -1 };

    const users = await User.find(query)
      .select("-password")
      .sort(sort)
      .skip(skip)
      .limit(limit)
      .lean();

    const total = await User.countDocuments(query);
    const totalPages = Math.ceil(total / limit) || 1;

    return res.status(200).json({
      success: true,
      data: {
        users,
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

// @desc    Create new user by Admin
// @route   POST /api/admin/users
// @access  Private (Admin)
export const createUser = async (req, res, next) => {
  try {
    const { name, email, phone, password, role, department, avatar } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({
        success: false,
        message: "Name, email, and password are required.",
        errors: {},
      });
    }

    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: `A user with email '${email}' already exists.`,
        errors: { email: "Email already registered" },
      });
    }

    const userRole = ["admin", "doctor", "staff"].includes(role?.toLowerCase())
      ? role.toLowerCase()
      : "staff";

    const user = await User.create({
      name: name.trim(),
      email: email.toLowerCase().trim(),
      phone: phone?.trim(),
      password,
      role: userRole,
      department: department || "General Medicine",
      avatar: avatar || undefined,
      isActive: true,
    });

    // Create welcoming notification for new user
    await Notification.create({
      userId: user._id,
      title: "Account Created",
      message: `Welcome ${user.name}! Your account has been registered with role '${user.role}'.`,
      type: "info",
    });

    await logAudit({
      userId: req.user._id,
      userName: req.user.name,
      action: "USER_CREATED",
      module: "User Management",
      resource: "User",
      resourceId: user._id.toString(),
      description: `Admin created user ${user.name} (${user.email}) with role '${user.role}'`,
      req,
    });

    const userResponse = user.toObject();
    delete userResponse.password;

    return res.status(201).json({
      success: true,
      message: `User '${user.name}' created successfully`,
      data: userResponse,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get user details by ID with activity log
// @route   GET /api/admin/users/:id
// @access  Private (Admin)
export const getUserById = async (req, res, next) => {
  try {
    const { id } = req.params;

    const user = await User.findById(id).select("-password").lean();

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    const recentActivity = await AuditLog.find({ userId: user._id })
      .sort({ timestamp: -1 })
      .limit(10)
      .lean();

    return res.status(200).json({
      success: true,
      data: {
        user,
        recentActivity,
      },
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Update user profile by Admin
// @route   PUT /api/admin/users/:id
// @access  Private (Admin)
export const updateUser = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, phone, role, department, avatar } = req.body;

    const user = await User.findById(id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    if (name) user.name = name.trim();
    if (phone !== undefined) user.phone = phone.trim();
    if (department) user.department = department;
    if (avatar) user.avatar = avatar;

    if (role && ["admin", "doctor", "staff"].includes(role.toLowerCase())) {
      user.role = role.toLowerCase();
    }

    await user.save();

    await logAudit({
      userId: req.user._id,
      userName: req.user.name,
      action: "USER_UPDATED",
      module: "User Management",
      resource: "User",
      resourceId: user._id.toString(),
      description: `Admin updated user details for ${user.name}`,
      req,
    });

    const userObj = user.toObject();
    delete userObj.password;

    return res.status(200).json({
      success: true,
      message: "User record updated successfully",
      data: userObj,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Activate or Deactivate User account
// @route   PATCH /api/admin/users/:id/status
// @access  Private (Admin)
export const toggleUserStatus = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { isActive } = req.body;

    const user = await User.findById(id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Safety rule: Prevent deactivating the last active administrator
    if (!isActive && user.role === "admin") {
      const activeAdminsCount = await User.countDocuments({ role: "admin", isActive: true });
      if (activeAdminsCount <= 1) {
        return res.status(400).json({
          success: false,
          message: "Safety constraint: Cannot deactivate the only remaining active administrator account.",
        });
      }
    }

    user.isActive = Boolean(isActive);
    await user.save();

    const action = user.isActive ? "USER_ACTIVATED" : "USER_DEACTIVATED";

    await logAudit({
      userId: req.user._id,
      userName: req.user.name,
      action,
      module: "User Management",
      resource: "User",
      resourceId: user._id.toString(),
      description: `User ${user.name} was ${user.isActive ? "activated" : "deactivated"} by admin`,
      req,
    });

    return res.status(200).json({
      success: true,
      message: `User '${user.name}' has been ${user.isActive ? "activated" : "deactivated"}`,
      data: { id: user._id, isActive: user.isActive },
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Reset User password by Admin
// @route   POST /api/admin/users/:id/reset-password
// @access  Private (Admin)
export const resetUserPassword = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { newPassword } = req.body;

    if (!newPassword || newPassword.length < 8) {
      return res.status(400).json({
        success: false,
        message: "New password must be at least 8 characters long.",
      });
    }

    const user = await User.findById(id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Password will be hashed in Mongoose pre-save hook
    user.password = newPassword;
    await user.save();

    // Security rule: Never log password in audit log
    await logAudit({
      userId: req.user._id,
      userName: req.user.name,
      action: "PASSWORD_RESET_BY_ADMIN",
      module: "Security",
      resource: "User",
      resourceId: user._id.toString(),
      description: `Admin reset password for user ${user.name} (${user.email})`,
      req,
    });

    return res.status(200).json({
      success: true,
      message: `Password for user '${user.name}' reset successfully`,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get Roles & System Permission Matrix
// @route   GET /api/admin/roles
// @access  Private (Admin)
export const getRolesAndPermissions = async (req, res, next) => {
  try {
    const rolesList = ["admin", "doctor", "staff"];

    const dbRolePerms = await RolePermission.find().lean();

    const roleMatrix = {};
    for (const r of rolesList) {
      const found = dbRolePerms.find((item) => item.role === r);
      if (found) {
        roleMatrix[r] = found.permissions;
      } else {
        roleMatrix[r] = DEFAULT_ROLE_PERMISSIONS[r] || [];
      }
    }

    return res.status(200).json({
      success: true,
      data: {
        allPermissions: ALL_PERMISSIONS,
        rolesMatrix: roleMatrix,
      },
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Update Role Permission Matrix
// @route   PUT /api/admin/roles/:role/permissions
// @access  Private (Admin)
export const updateRolePermissions = async (req, res, next) => {
  try {
    const { role } = req.params;
    const { permissions } = req.body;

    if (!["admin", "doctor", "staff"].includes(role.toLowerCase())) {
      return res.status(400).json({
        success: false,
        message: "Invalid role specified",
      });
    }

    if (!Array.isArray(permissions)) {
      return res.status(400).json({
        success: false,
        message: "Permissions must be an array of string keys",
      });
    }

    const roleKey = role.toLowerCase();

    const updated = await RolePermission.findOneAndUpdate(
      { role: roleKey },
      {
        role: roleKey,
        permissions,
        updatedBy: req.user._id,
      },
      { upsert: true, new: true }
    );

    await logAudit({
      userId: req.user._id,
      userName: req.user.name,
      action: "ROLE_PERMISSIONS_UPDATED",
      module: "Role Permissions",
      resource: "RolePermission",
      resourceId: roleKey,
      description: `Permissions updated for role '${roleKey}' by admin`,
      req,
    });

    return res.status(200).json({
      success: true,
      message: `Permissions updated for role '${roleKey}'`,
      data: updated,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get Audit Logs with server-side pagination & filters
// @route   GET /api/admin/audit-logs
// @access  Private (Admin)
export const getAuditLogs = async (req, res, next) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 15;
    const skip = (page - 1) * limit;

    const { search, action, module, userId, fromDate, toDate } = req.query;

    const query = {};

    if (search) {
      const searchRegex = new RegExp(search.trim(), "i");
      query.$or = [
        { userName: searchRegex },
        { action: searchRegex },
        { module: searchRegex },
        { description: searchRegex },
        { ipAddress: searchRegex },
      ];
    }

    if (action && action !== "All") {
      query.action = action;
    }

    if (module && module !== "All") {
      query.$or = [{ module }, { resource: module }];
    }

    if (userId) {
      query.userId = userId;
    }

    if (fromDate || toDate) {
      query.timestamp = {};
      if (fromDate) query.timestamp.$gte = new Date(fromDate);
      if (toDate) query.timestamp.$lte = new Date(`${toDate}T23:59:59.999Z`);
    }

    const auditLogs = await AuditLog.find(query)
      .populate("userId", "name email role")
      .sort({ timestamp: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    const total = await AuditLog.countDocuments(query);
    const totalPages = Math.ceil(total / limit) || 1;

    return res.status(200).json({
      success: true,
      data: {
        auditLogs,
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

// @desc    Get System Activity Feed Timeline
// @route   GET /api/admin/activity
// @access  Private (Admin)
export const getActivityFeed = async (req, res, next) => {
  try {
    const limit = parseInt(req.query.limit, 10) || 20;

    const activities = await AuditLog.find()
      .populate("userId", "name role avatar")
      .sort({ timestamp: -1 })
      .limit(limit)
      .lean();

    return res.status(200).json({
      success: true,
      data: activities,
    });
  } catch (error) {
    next(error);
  }
};
