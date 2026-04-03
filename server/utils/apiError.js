const DEFAULT_SERVER_ERROR_MESSAGE = "Something went wrong. Please try again later.";

const handleControllerError = (
  res,
  error,
  fallbackMessage = DEFAULT_SERVER_ERROR_MESSAGE
) => {
  const status =
    Number.isInteger(error?.status) && error.status >= 400 && error.status < 600
      ? error.status
      : 500;

  const payload = {
    message: status >= 500 ? fallbackMessage : String(error?.message || fallbackMessage).trim(),
  };

  if (status < 500 && error?.details) {
    payload.details = error.details;
  }

  return res.status(status).json(payload);
};

module.exports = {
  DEFAULT_SERVER_ERROR_MESSAGE,
  handleControllerError,
};
