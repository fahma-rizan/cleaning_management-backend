// This is a centralized error handling middleware for Express.
// It catches errors and formats them into user-friendly JSON responses.

const errorHandler = (err, req, res, next) => {
  // Log the full error to the console for debugging purposes
  console.error(err);

  let customError = {
    // Set default error message and status code
    statusCode: err.statusCode || 500,
    message: err.message || 'An unexpected error occurred on the server.',
  };

  // Handle Mongoose Bad ObjectId Error (CastError)
  // This happens when an ID is in the wrong format.
  if (err.name === 'CastError') {
    customError.message = `The resource ID '${err.value}' is invalid.`;
    customError.statusCode = 400; // Bad Request
  }

  // Handle Mongoose Duplicate Key Error
  // This happens when a unique field (like email) is duplicated.
  if (err.code && err.code === 11000) {
    const field = Object.keys(err.keyValue);
    customError.message = `The value for the '${field}' field is already in use. Please choose another.`;
    customError.statusCode = 400; // Bad Request
  }

  // Handle Mongoose Validation Error
  // This happens when required fields are missing or data is invalid.
  if (err.name === 'ValidationError') {
    customError.message = Object.values(err.errors)
      .map((item) => item.message)
      .join(' | ');
    customError.statusCode = 400; // Bad Request
  }

  // Send the final, user-friendly error response
  res.status(customError.statusCode).json({
    success: false,
    message: customError.message,
  });
};

module.exports = errorHandler;