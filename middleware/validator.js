import { validationResult } from "express-validator";

export const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const formattedErrors = errors.array().reduce((acc, err) => {
      acc[err.path || err.param] = err.msg;
      return acc;
    }, {});

    return res.status(400).json({
      success: false,
      message: "Input validation failed. Please check your request fields.",
      errors: formattedErrors,
    });
  }
  next();
};
