import AuditLog from "../models/AuditLog.js";

export const logAudit = async ({
  userId,
  userName,
  action,
  module,
  resource,
  targetType,
  targetId,
  resourceId,
  description,
  ipAddress,
  userAgent,
  metadata,
  req,
}) => {
  try {
    const logData = {
      userId: userId || req?.user?._id || null,
      userName: userName || req?.user?.name || req?.user?.email || "System",
      action: action || "SYSTEM_ACTION",
      module: module || resource || "General",
      resource: resource || module || "General",
      targetType: targetType || resource || "System",
      targetId: targetId || resourceId || null,
      resourceId: resourceId || targetId || null,
      description: description || `${action} executed on ${resource || module || "resource"}`,
      ipAddress: ipAddress || req?.ip || req?.headers?.["x-forwarded-for"] || "127.0.0.1",
      userAgent: userAgent || req?.headers?.["user-agent"] || "System Agent",
      timestamp: new Date(),
      metadata: metadata || {},
    };

    // Sanitize metadata to never persist sensitive passwords, tokens, or secrets
    if (logData.metadata) {
      delete logData.metadata.password;
      delete logData.metadata.token;
      delete logData.metadata.secret;
    }

    await AuditLog.create(logData);
  } catch (error) {
    console.error("[AuditLog Error]:", error.message);
  }
};
