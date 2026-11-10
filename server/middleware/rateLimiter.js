const rateLimit = require('express-rate-limit');

const voiceRateLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 minutes
  max: 40, // Limit each IP to 40 requests per window
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  message: {
    success: false,
    message: 'Too many voice requests. Please wait a few minutes before recording again.',
  },
});

module.exports = {
  voiceRateLimiter,
};
