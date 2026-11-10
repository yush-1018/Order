const express = require('express');
const router = express.Router();
const dashboardController = require('../controllers/dashboard.controller');
const authMiddleware = require('../middleware/auth');

router.use(authMiddleware);

router.get('/summary', dashboardController.getDashboardSummary);

module.exports = router;
