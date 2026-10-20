import { body } from "express-validator";

export const validatePatientRegistration = [
  body("personalDetails.name")
    .trim()
    .notEmpty()
    .withMessage("Patient Name is required"),
  body("contactDetails.mobile")
    .trim()
    .notEmpty()
    .withMessage("Mobile Number is required")
    .matches(/^[6-9]\d{9}$/)
    .withMessage("Mobile number must be exactly 10 digits starting with 6, 7, 8, or 9"),
  body("contactDetails.email")
    .optional({ checkFalsy: true })
    .isEmail()
    .withMessage("Please enter a valid email address"),
  body("personalDetails.age")
    .optional({ checkFalsy: true })
    .isNumeric()
    .withMessage("Age must be a number"),
];
