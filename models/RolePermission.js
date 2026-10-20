import mongoose from "mongoose";

const rolePermissionSchema = new mongoose.Schema(
  {
    role: {
      type: String,
      required: true,
      unique: true,
      enum: ["admin", "doctor", "staff"],
      lowercase: true,
    },
    permissions: [
      {
        type: String,
        trim: true,
      },
    ],
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  },
  {
    timestamps: true,
  }
);

export const RolePermission = mongoose.model("RolePermission", rolePermissionSchema);
export default RolePermission;
