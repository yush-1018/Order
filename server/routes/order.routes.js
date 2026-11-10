const express = require('express');
const router = express.Router();
const orderController = require('../controllers/order.controller');
const authMiddleware = require('../middleware/auth');

router.use(authMiddleware);

router.post('/preview', orderController.previewOrder);
router.post('/', orderController.confirmOrder);
router.get('/', orderController.getOrders);
router.get('/:id', orderController.getOrderById);
router.post('/:id/payments', orderController.addOrderPayment);
router.get('/:id/payments', orderController.getOrderPayments);

module.exports = router;
