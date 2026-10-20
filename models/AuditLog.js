import mongoose from "mongoose";

const auditLogSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      index: true,
    },
    userName: {
      type: String,
      trim: true,
    },
    action: {
      type: String,
      required: true,
      index: true,
    },
    module: {
      type: String,
      index: true,
    },
    resource: {
      type: String,
      index: true,
    },
    targetType: {
      type: String,
    },
    targetId: {
      type: String,
    },
    resourceId: {
      type: String,
    },
    description: {
      type: String,
    },
    ipAddress: {
      type: String,
    },
    userAgent: {
      type: String,
    },
    timestamp: {
      type: Date,
      default: Date.now,
      index: true,
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
    },
  },
  {
    timestamps: false,
  }
);

export const AuditLog = mongoose.model("AuditLog", auditLogSchema);
export default AuditLog;
