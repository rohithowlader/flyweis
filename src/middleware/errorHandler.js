function errorHandler(err, req, res, next) {
  const status = err.status || 500;
  const payload = {
    error: status === 500 ? "Internal Server Error" : err.message,
    ...(process.env.NODE_ENV !== "production" && status === 500
      ? { detail: err.message, stack: err.stack }
      : {}),
  };
  res.status(status).json(payload);
}

module.exports = { errorHandler };
