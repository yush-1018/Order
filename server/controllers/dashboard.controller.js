const Order = require('../models/Order');
const Payment = require('../models/Payment');
const Customer = require('../models/Customer');
const Product = require('../models/Product');
const ledgerService = require('../services/ledger.service');

/**
 * Dashboard Summary API for Phase 4
 * Returns:
 * - today's orders (count & total)
 * - total received today (simulated payments)
 * - total outstanding udhar
 * - top 5 customers by outstanding
 * - active products count & low stock count
 * - recent 5 orders
 * All filtered by req.businessId
 */
exports.getDashboardSummary = async (req, res) => {
  try {
    const businessId = req.businessId;

    // Time boundary for today
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
    const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

    // 1. Orders today
    const ordersToday = await Order.find({
      businessId,
      status: 'confirmed',
      createdAt: { $gte: startOfToday, $lte: endOfToday },
    });

    const todayOrdersCount = ordersToday.length;
    const todayOrdersTotal = Math.round(
      ordersToday.reduce((sum, ord) => sum + (ord.total || 0), 0) * 100
    ) / 100;

    // 2. Payments received today
    const paymentsToday = await Payment.find({
      businessId,
      status: 'confirmed',
      createdAt: { $gte: startOfToday, $lte: endOfToday },
    });

    const todayReceivedTotal = Math.round(
      paymentsToday.reduce((sum, p) => sum + (p.amount || 0), 0) * 100
    ) / 100;

    // 3. Outstanding Udhar across all customers
    const customers = await Customer.find({ businessId });
    let totalOutstandingUdhar = 0;
    const customerBalances = [];

    for (const cust of customers) {
      const balance = await ledgerService.getCustomerBalance(businessId, cust._id);
      if (balance > 0) {
        totalOutstandingUdhar += balance;
      }
      customerBalances.push({
        _id: cust._id,
        name: cust.name,
        phone: cust.phone,
        balance,
      });
    }

    totalOutstandingUdhar = Math.round(totalOutstandingUdhar * 100) / 100;

    // 4. Top 5 customers by outstanding balance
    const top5Customers = customerBalances
      .filter((c) => c.balance > 0)
      .sort((a, b) => b.balance - a.balance)
      .slice(0, 5);

    // 5. Products stats
    const totalProducts = await Product.countDocuments({ businessId, active: true });
    const lowStockCount = await Product.countDocuments({
      businessId,
      active: true,
      stock: { $lte: 10 },
    });

    // 6. Recent 5 orders
    const recentOrders = await Order.find({ businessId })
      .populate('customerId', 'name phone')
      .sort({ createdAt: -1 })
      .limit(5);

    return res.status(200).json({
      success: true,
      summary: {
        todayOrdersCount,
        todayOrdersTotal,
        todayReceivedTotal,
        totalOutstandingUdhar,
        totalCustomersWithUdhar: top5Customers.length,
        totalProducts,
        lowStockCount,
        topCustomersByUdhar: top5Customers,
        recentOrders,
      },
    });
  } catch (error) {
    console.error('[Dashboard Error - getDashboardSummary]:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch dashboard summary.' });
  }
};
