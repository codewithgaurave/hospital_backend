import User from "../models/User.js";
import { generateToken } from "../utils/generateToken.js";
import { logAudit } from "../utils/auditLogger.js";

// @desc    Auth user & set HttpOnly cookie
// @route   POST /api/auth/login
// @access  Public
export const loginUser = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    // Find user by email and explicitly select password field
    const user = await User.findOne({ email: email.toLowerCase() }).select("+password");

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "This email address is not registered. Please check your Email / ID.",
        errors: { email: "Email not registered" },
      });
    }

    // Verify bcrypt password
    const isMatch = await user.matchPassword(password);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: "Incorrect password. Please enter the correct password.",
        errors: { password: "Incorrect password" },
      });
    }

    if (!user.isActive) {
      return res.status(403).json({
        success: false,
        message: "Account disabled. Please contact hospital administrator.",
        errors: {},
      });
    }

    // Update lastLogin timestamp
    user.lastLogin = new Date();
    await user.save();

    // Generate JWT & set HttpOnly cookie
    const token = generateToken(res, user._id);

    // Audit Log
    await logAudit({
      userId: user._id,
      action: "LOGIN",
      resource: "User",
      resourceId: user._id,
      metadata: { ip: req.ip, userAgent: req.headers["user-agent"] },
    });

    // Return safe user information (NEVER return password)
    return res.status(200).json({
      success: true,
      message: "Login successful",
      token,
      data: {
        id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
        department: user.department,
        avatar: user.avatar,
        token,
      },
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Logout user & clear cookie
// @route   POST /api/auth/logout
// @access  Private
export const logoutUser = async (req, res, next) => {
  try {
    if (req.user) {
      await logAudit({
        userId: req.user._id,
        action: "LOGOUT",
        resource: "User",
        resourceId: req.user._id,
      });
    }

    const isProduction = process.env.NODE_ENV === "production";
    res.cookie("token", "", {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? "none" : "lax",
      expires: new Date(0),
    });

    return res.status(200).json({
      success: true,
      message: "Logged out successfully",
      data: {},
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get current authenticated user details
// @route   GET /api/auth/me
// @access  Private
export const getCurrentUser = async (req, res, next) => {
  try {
    return res.status(200).json({
      success: true,
      message: "Current user profile fetched",
      data: {
        id: req.user._id,
        name: req.user.name,
        email: req.user.email,
        phone: req.user.phone,
        role: req.user.role,
        department: req.user.department,
        avatar: req.user.avatar,
      },
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Change authenticated user password
// @route   POST /api/auth/change-password
// @access  Private
export const changePassword = async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;

    const user = await User.findById(req.user._id).select("+password");

    const isMatch = await user.matchPassword(currentPassword);
    if (!isMatch) {
      return res.status(400).json({
        success: false,
        message: "Current password is incorrect.",
        errors: { currentPassword: "Current password is incorrect" },
      });
    }

    user.password = newPassword;
    await user.save();

    await logAudit({
      userId: req.user._id,
      action: "CHANGE_PASSWORD",
      resource: "User",
      resourceId: req.user._id,
    });

    return res.status(200).json({
      success: true,
      message: "Password changed successfully",
      data: {},
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Update user profile
// @route   PUT /api/auth/profile
// @access  Private
export const updateProfile = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id);

    if (req.body.name) user.name = req.body.name;
    if (req.body.phone) user.phone = req.body.phone;
    if (req.body.department) user.department = req.body.department;
    if (req.body.avatar) user.avatar = req.body.avatar;

    const updated = await user.save();

    await logAudit({
      userId: req.user._id,
      action: "UPDATE_PROFILE",
      resource: "User",
      resourceId: req.user._id,
    });

    return res.status(200).json({
      success: true,
      message: "Profile updated successfully",
      data: {
        id: updated._id,
        name: updated.name,
        email: updated.email,
        phone: updated.phone,
        role: updated.role,
        department: updated.department,
        avatar: updated.avatar,
      },
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Change authenticated user Login ID (email) and invalidate session
// @route   POST /api/auth/change-email
// @access  Private
export const changeEmail = async (req, res, next) => {
  try {
    const { newEmail, currentPassword } = req.body;
    const normalizedEmail = newEmail.trim().toLowerCase();

    const user = await User.findById(req.user._id).select("+password");
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Verify current password
    const isMatch = await user.matchPassword(currentPassword);
    if (!isMatch) {
      return res.status(400).json({
        success: false,
        message: "Incorrect password. Cannot change Login ID without verifying password.",
        errors: { currentPassword: "Incorrect current password" },
      });
    }

    // Check if new email is identical to current email
    if (user.email === normalizedEmail) {
      return res.status(400).json({
        success: false,
        message: "New Login ID is identical to your current Login ID.",
        errors: { newEmail: "New ID must be different from current ID" },
      });
    }

    // Check if new email is already in use by another account
    const existing = await User.findOne({ email: normalizedEmail, _id: { $ne: user._id } });
    if (existing) {
      return res.status(409).json({
        success: false,
        message: "This Email / Login ID is already taken by another user.",
        errors: { newEmail: "Login ID already registered" },
      });
    }

    const previousEmail = user.email;
    user.email = normalizedEmail;
    await user.save();

    await logAudit({
      userId: req.user._id,
      action: "CHANGE_LOGIN_ID",
      resource: "User",
      resourceId: req.user._id,
      metadata: { previousEmail, newEmail: normalizedEmail },
    });

    // Invalidate session cookie immediately so user is logged out on the server
    const isProduction = process.env.NODE_ENV === "production";
    res.cookie("token", "", {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? "none" : "lax",
      expires: new Date(0),
    });

    return res.status(200).json({
      success: true,
      message: "Login ID changed successfully! Session ended. Please log in with your new ID.",
      data: { newEmail: normalizedEmail },
    });
  } catch (error) {
    next(error);
  }
};

