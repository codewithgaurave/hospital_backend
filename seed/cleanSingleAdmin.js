import dotenv from "dotenv";
import mongoose from "mongoose";
import User from "../models/User.js";
import { connectDB } from "../config/db.js";

dotenv.config();

const cleanToSingleAdmin = async () => {
  try {
    await connectDB();

    const targetEmail = "admin@digicoders-health.com";
    const targetPassword = "Admin@2026!";

    // Delete all other users
    const deleteResult = await User.deleteMany({ email: { $ne: targetEmail } });
    console.log(`[Clean]: Removed ${deleteResult.deletedCount} non-admin users.`);

    // Find or create the single administrator
    let admin = await User.findOne({ email: targetEmail });
    if (!admin) {
      admin = new User({
        email: targetEmail,
      });
    }

    admin.name = "Hospital Administrator";
    admin.password = targetPassword;
    admin.role = "admin";
    admin.department = "Hospital Administration";
    admin.isActive = true;
    admin.phone = "+91 98765 43210";
    admin.avatar = "https://images.unsplash.com/photo-1622253692010-333f2da6031d?w=300&auto=format&fit=crop";

    await admin.save();
    console.log("[Clean Success]: Single administrator account active and verified!");

    const remainingUsers = await User.find().select("email name role isActive");
    console.log("Current Users in Database:", remainingUsers);

    process.exit(0);
  } catch (err) {
    console.error("[Clean Error]:", err);
    process.exit(1);
  }
};

cleanToSingleAdmin();
