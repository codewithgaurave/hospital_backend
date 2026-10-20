import { body } from "express-validator";

export const validateLogin = [
  body("email")
    .trim()
    .notEmpty()
    .withMessage("Email is required")
    .isEmail()
    .withMessage("Please enter a valid email address"),
  body("password")
    .notEmpty()
    .withMessage("Password is required"),
];

export const validateChangePassword = [
  body("currentPassword")
    .notEmpty()
    .withMessage("Current password is required"),
  body("newPassword")
    .isLength({ min: 8 })
    .withMessage("New password must be at least 8 characters long")
    .matches(/[A-Z]/)
    .withMessage("New password must contain at least one uppercase letter")
    .matches(/[a-z]/)
    .withMessage("New password must contain at least one lowercase letter")
    .matches(/[0-9]/)
    .withMessage("New password must contain at least one number")
    .matches(/[^A-Za-z0-9]/)
    .withMessage("New password must contain at least one special character"),
  body("confirmPassword")
    .custom((value, { req }) => {
      if (value !== req.body.newPassword) {
        throw new Error("Confirm password does not match new password");
      }
      return true;
    }),
];

export const validateUpdateProfile = [
  body("name").optional().trim().notEmpty().withMessage("Name cannot be empty"),
  body("phone").optional().trim(),
  body("department").optional().trim(),
  body("avatar").optional().trim(),
];

export const validateChangeEmail = [
  body("newEmail")
    .trim()
    .notEmpty()
    .withMessage("New Login ID / Email is required")
    .isEmail()
    .withMessage("Please enter a valid email address"),
  body("currentPassword")
    .notEmpty()
    .withMessage("Current password is required to verify identity"),
];

