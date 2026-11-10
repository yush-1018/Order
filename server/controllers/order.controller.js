const orderService = require('../services/order.service');
const Order = require('../models/Order');
const Payment = require('../models/Payment');

// Preview and recalculate order with DB prices and stock check
exports.previewOrder = async (req, res) => {
  try {
    const { items } = req.body;
    const preview = await orderService.previewOrder(req.businessId, items);
    return res.status(200).json({ success: true, ...preview });
  } catch (err) {
    console.error('[Order Error - previewOrder]:', err.message);
    return res.status(400).json({ success: false, message: err.message });
  }
};

// Confirm order: creates order, deducts stock, writes ledger debit and credit
exports.confirmOrder = async (req, res) => {
  try {
    const { customerId, items, paidAmount, paymentMethod, transcript, idempotencyKey } = req.body;

    const result = await orderService.confirmOrder({
      businessId: req.businessId,
      customerId,
      items,
      paidAmount,
      paymentMethod,
      transcript,
      idempotencyKey,
    });

    return res.status(201).json({ success: true, ...result });
  } catch (err) {
    console.error('[Order Error - confirmOrder]:', err.message);
    return res.status(400).json({ success: false, message: err.message });
  }
};

// Get list of orders for merchant's business
exports.getOrders = async (req, res) => {
  try {
    const orders = await Order.find({ businessId: req.businessId })
      .populate('customerId', 'name phone')
      .sort({ createdAt: -1 });

    return res.status(200).json({ success: true, count: orders.length, orders });
  } catch (err) {
    console.error('[Order Error - getOrders]:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to fetch orders.' });
  }
};

// Get single order detail
exports.getOrderById = async (req, res) => {
  try {
    const order = await Order.findOne({ _id: req.params.id, businessId: req.businessId })
      .populate('customerId', 'name phone');

    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found.' });
    }

    return res.status(200).json({ success: true, order });
  } catch (err) {
    console.error('[Order Error - getOrderById]:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to fetch order detail.' });
  }
};

// Record a simulated payment for an order
exports.addOrderPayment = async (req, res) => {
  try {
    const { amount, method, idempotencyKey } = req.body;
    const result = await orderService.recordOrderPayment({
      businessId: req.businessId,
      orderId: req.params.id,
      amount,
      method,
      idempotencyKey,
    });

    return res.status(200).json({ success: true, ...result });
  } catch (err) {
    console.error('[Order Error - addOrderPayment]:', err.message);
    return res.status(400).json({ success: false, message: err.message });
  }
};

// Get all payments for an order
exports.getOrderPayments = async (req, res) => {
  try {
    const payments = await Payment.find({
      orderId: req.params.id,
      businessId: req.businessId,
    }).sort({ createdAt: -1 });

    return res.status(200).json({ success: true, count: payments.length, payments });
  } catch (err) {
    console.error('[Order Error - getOrderPayments]:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to fetch order payments.' });
  }
};
