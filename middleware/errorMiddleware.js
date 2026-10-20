// 404 Handler for undefined API routes
export const notFoundHandler = (req, res, next) => {
  const error = new Error(`Route Not Found - ${req.originalUrl}`);
  res.status(404);
  next(error);
};

// Global Express Error Handler
export const errorHandler = (err, req, res, next) => {
  let statusCode = res.statusCode === 200 ? 500 : res.statusCode;
  let message = err.message || "Internal Server Error";
  let errors = {};

  // Mongoose bad ObjectId
  if (err.name === "CastError") {
    message = `Resource not found with id: ${err.value}`;
    statusCode = 404;
  }

  // Mongoose Duplicate Key Error
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue)[0];
    message = `Duplicate value entered for field '${field}'. Must be unique.`;
    statusCode = 409;
  }

  // Mongoose Validation Error
  if (err.name === "ValidationError") {
    message = "Validation Error";
    statusCode = 422;
    errors = Object.values(err.errors).reduce((acc, curr) => {
      acc[curr.path] = curr.message;
      return acc;
    }, {});
  }

  res.status(statusCode).json({
    success: false,
    message,
    errors,
    ...(process.env.NODE_ENV === "development" && { stack: err.stack }),
  });
};
