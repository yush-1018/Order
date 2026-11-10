const jwt = require('jsonwebtoken');

const authMiddleware = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, message: 'Authentication required. No token provided.' });
  }

  const token = authHeader.split(' ')[1];

  try {
    const secret = process.env.JWT_SECRET || 'super_secret_orderpay_jwt_token_2026_dev';
    const decoded = jwt.verify(token, secret);

    if (!decoded.businessId) {
      return res.status(403).json({ success: false, message: 'Invalid token: missing business identifier.' });
    }

    // Set businessId and userId on req from verified JWT
    req.userId = decoded.userId;
    req.businessId = decoded.businessId;
    req.userRole = decoded.role;
    req.userEmail = decoded.email;

    next();
  } catch (error) {
    return res.status(401).json({ success: false, message: 'Invalid or expired authentication token.' });
  }
};

module.exports = authMiddleware;
