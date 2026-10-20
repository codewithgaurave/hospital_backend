import jwt from "jsonwebtoken";

export const generateToken = (res, userId) => {
  const secret = process.env.JWT_SECRET || "supersecret_jwt_key_2026_patient_record_management";
  const token = jwt.sign({ id: userId }, secret, {
    expiresIn: process.env.JWT_EXPIRES_IN || "7d",
  });

  const isProduction = process.env.NODE_ENV === "production";

  // Set JWT as HttpOnly, Secure, SameSite=None cookie for cross-site (Vercel <-> Render)
  res.cookie("token", token, {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? "none" : "lax",
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 Days
  });

  return token;
};
