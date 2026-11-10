const express = require('express');
const router = express.Router();
const customerController = require('../controllers/customer.controller');
const authMiddleware = require('../middleware/auth');

// All customer routes require valid JWT auth and are scoped to req.businessId
router.use(authMiddleware);

router.get('/', customerController.getCustomers);
router.post('/', customerController.createCustomer);
router.get('/udhar/summary', customerController.getUdharSummary);
router.get('/:id', customerController.getCustomerById);
router.get('/:id/ledger', customerController.getCustomerLedger);
router.post('/:id/pay-udhar', customerController.payCustomerUdhar);

module.exports = router;
