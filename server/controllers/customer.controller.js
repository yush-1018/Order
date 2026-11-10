const Customer = require('../models/Customer');
const Order = require('../models/Order');
const LedgerEntry = require('../models/LedgerEntry');
const ledgerService = require('../services/ledger.service');
const orderService = require('../services/order.service');

// Get all customers for the authenticated merchant's business
exports.getCustomers = async (req, res) => {
  try {
    const { search } = req.query;
    const filter = { businessId: req.businessId };

    if (search && search.trim()) {
      const searchRegex = new RegExp(search.trim(), 'i');
      filter.$or = [
        { name: searchRegex },
        { phone: searchRegex },
      ];
    }

    const customers = await Customer.find(filter).sort({ name: 1 });
    return res.status(200).json({ success: true, count: customers.length, customers });
  } catch (error) {
    console.error('[Customer Error - getCustomers]:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch customers.' });
  }
};

// Get single customer by id
exports.getCustomerById = async (req, res) => {
  try {
    const customer = await Customer.findOne({ _id: req.params.id, businessId: req.businessId });
    if (!customer) {
      return res.status(404).json({ success: false, message: 'Customer not found.' });
    }
    return res.status(200).json({ success: true, customer });
  } catch (error) {
    console.error('[Customer Error - getCustomerById]:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch customer.' });
  }
};

// Create a new synthetic customer
exports.createCustomer = async (req, res) => {
  try {
    const { name, phone } = req.body;

    if (!name || !phone) {
      return res.status(400).json({ success: false, message: 'Customer name and phone number are required.' });
    }

    const customer = await Customer.create({
      businessId: req.businessId,
      name: name.trim(),
      phone: phone.trim(),
    });

    return res.status(201).json({ success: true, customer });
  } catch (error) {
    console.error('[Customer Error - createCustomer]:', error);
    return res.status(500).json({ success: false, message: 'Failed to create customer.' });
  }
};

// Customer-wise outstanding balance list (Udhar summary)
exports.getUdharSummary = async (req, res) => {
  try {
    const businessId = req.businessId;
    const customers = await Customer.find({ businessId }).sort({ name: 1 });

    let totalUdhar = 0;
    let customersWithUdharCount = 0;

    const list = await Promise.all(
      customers.map(async (cust) => {
        const balance = await ledgerService.getCustomerBalance(businessId, cust._id);
        const pendingOrders = await Order.find({
          businessId,
          customerId: cust._id,
          status: 'confirmed',
          remaining: { $gt: 0 },
        }).sort({ createdAt: 1 });

        if (balance > 0) {
          totalUdhar += balance;
          customersWithUdharCount += 1;
        }

        return {
          _id: cust._id,
          name: cust.name,
          phone: cust.phone,
          balance,
          pendingOrdersCount: pendingOrders.length,
          oldestPendingOrder: pendingOrders[0] || null,
          totalOrdersCount: await Order.countDocuments({ businessId, customerId: cust._id }),
        };
      })
    );

    // Sort: customers with highest udhar first, then alphabetical
    list.sort((a, b) => b.balance - a.balance);

    return res.status(200).json({
      success: true,
      totalUdhar: Math.round(totalUdhar * 100) / 100,
      customersWithUdharCount,
      totalCustomers: customers.length,
      customers: list,
    });
  } catch (error) {
    console.error('[Customer Error - getUdharSummary]:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch Udhar summary.' });
  }
};

// Customer ledger history (orders as debits, payments as credits, running balance)
exports.getCustomerLedger = async (req, res) => {
  try {
    const { id } = req.params;
    const businessId = req.businessId;

    const customer = await Customer.findOne({ _id: id, businessId });
    if (!customer) {
      return res.status(404).json({ success: false, message: 'Customer not found.' });
    }

    const currentBalance = await ledgerService.getCustomerBalance(businessId, customer._id);

    // Append-only ledger entries, latest first
    const entries = await LedgerEntry.find({ businessId, customerId: customer._id })
      .populate('orderId', 'orderNumber total remaining paymentStatus')
      .populate('paymentId', 'method isSimulated')
      .sort({ createdAt: -1 });

    // Pending unpaid / partial orders
    const pendingOrders = await Order.find({
      businessId,
      customerId: customer._id,
      status: 'confirmed',
      remaining: { $gt: 0 },
    }).sort({ createdAt: 1 });

    return res.status(200).json({
      success: true,
      customer,
      balance: currentBalance,
      entries,
      pendingOrders,
    });
  } catch (error) {
    console.error('[Customer Error - getCustomerLedger]:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch customer ledger.' });
  }
};

// Record payment against customer's oldest unpaid order
exports.payCustomerUdhar = async (req, res) => {
  try {
    const { id } = req.params;
    const { amount, method, idempotencyKey } = req.body;

    const result = await orderService.payOldestUnpaidOrder({
      businessId: req.businessId,
      customerId: id,
      amount,
      method,
      idempotencyKey,
    });

    return res.status(200).json({ success: true, ...result });
  } catch (error) {
    console.error('[Customer Error - payCustomerUdhar]:', error.message);
    return res.status(400).json({ success: false, message: error.message });
  }
};
