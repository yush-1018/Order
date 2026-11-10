const mongoose = require('mongoose');
const Order = require('../models/Order');
const Product = require('../models/Product');
const Customer = require('../models/Customer');
const Payment = require('../models/Payment');
const { recordLedgerEntry, getCustomerBalance } = require('./ledger.service');

/**
 * Preview and recalculate order totals strictly using prices from DB
 * @param {ObjectId} businessId - Merchant business identifier
 * @param {Array} rawItems - Array of { productId, quantity, name?, unitPrice? (for custom item) }
 */
async function previewOrder(businessId, rawItems = []) {
  if (!Array.isArray(rawItems) || rawItems.length === 0) {
    return { items: [], total: 0, totalMrp: 0, totalSavings: 0, warnings: [] };
  }

  const warnings = [];
  const processedItems = [];
  let grandTotal = 0;
  let totalMrp = 0;
  let totalSavings = 0;

  for (const raw of rawItems) {
    const qty = parseFloat(raw.quantity);
    if (isNaN(qty) || qty <= 0) {
      throw new Error('Item quantity must be greater than 0.');
    }

    const isCustomItem = Boolean(raw.custom || raw.isCustom || !raw.productId);

    if (isCustomItem) {
      const name = (raw.name || raw.productName || 'Custom Item').trim();
      const rawPrice =
        raw.price !== undefined && raw.price !== null && raw.price !== ''
          ? raw.price
          : (raw.unitPrice !== undefined && raw.unitPrice !== null && raw.unitPrice !== ''
            ? raw.unitPrice
            : raw.priceOverride);

      const customPrice = parseFloat(rawPrice);
      if (isNaN(customPrice) || customPrice <= 0) {
        throw new Error(`Selling price for custom item "${name}" must be greater than 0.`);
      }

      // Optional MRP for custom item; if empty or null, mrp = price
      let customMrp = customPrice;
      if (raw.mrp !== undefined && raw.mrp !== null && raw.mrp !== '') {
        const parsedMrp = parseFloat(raw.mrp);
        if (isNaN(parsedMrp) || parsedMrp <= 0) {
          throw new Error(`MRP for "${name}" must be greater than 0.`);
        }
        if (customPrice > parsedMrp) {
          throw new Error(`Selling price cannot exceed MRP for "${name}".`);
        }
        customMrp = parsedMrp;
      }

      const lineTotal = Math.round(qty * customPrice * 100) / 100;
      const itemSaving = Math.max(0, Math.round((customMrp - customPrice) * qty * 100) / 100);

      grandTotal += lineTotal;
      totalMrp += Math.round(qty * customMrp * 100) / 100;
      totalSavings += itemSaving;

      processedItems.push({
        productId: raw.productId || new mongoose.Types.ObjectId(), // Virtual ID for order item schema
        name,
        quantity: qty,
        unit: (raw.unit || 'piece').trim().toLowerCase(),
        mrp: customMrp,
        unitPrice: customPrice,
        lineTotal,
        saving: itemSaving,
        isCustom: true,
        isPriceEdited: false,
      });
      continue;
    }

    // Catalogue Product lookup (strictly scoped to businessId)
    const product = await Product.findOne({ _id: raw.productId, businessId });
    if (!product) {
      throw new Error(`Product "${raw.name || raw.productId}" not found in catalogue or unauthorized.`);
    }

    if (product.stock < qty) {
      warnings.push(`Low stock warning: ${product.name} has ${product.stock} in stock, but ${qty} requested.`);
    }

    const catMrp = product.mrp !== undefined && product.mrp !== null ? Number(product.mrp) : Number(product.price);
    const catPrice = Number(product.price);

    // Check if merchant provided an editable selling price / priceOverride
    let unitPrice = catPrice;
    let isPriceEdited = false;

    const providedPrice =
      raw.priceOverride !== undefined && raw.priceOverride !== null && raw.priceOverride !== ''
        ? raw.priceOverride
        : (raw.unitPrice !== undefined && raw.unitPrice !== null && raw.unitPrice !== '' && Number(raw.unitPrice) !== catPrice
          ? raw.unitPrice
          : (raw.price !== undefined && raw.price !== null && raw.price !== '' && Number(raw.price) !== catPrice
            ? raw.price
            : null));

    if (providedPrice !== null) {
      const parsedOverride = parseFloat(providedPrice);
      if (isNaN(parsedOverride) || parsedOverride <= 0) {
        throw new Error(`Selling price for "${product.name}" must be greater than 0.`);
      }
      if (parsedOverride > catMrp) {
        throw new Error(`Selling price (₹${parsedOverride}) cannot exceed MRP (₹${catMrp}) for "${product.name}".`);
      }
      unitPrice = Math.round(parsedOverride * 100) / 100;
      isPriceEdited = unitPrice !== catPrice;
    }

    const lineTotal = Math.round(qty * unitPrice * 100) / 100;
    const itemSaving = Math.max(0, Math.round((catMrp - unitPrice) * qty * 100) / 100);

    grandTotal += lineTotal;
    totalMrp += Math.round(qty * catMrp * 100) / 100;
    totalSavings += itemSaving;

    processedItems.push({
      productId: product._id,
      name: product.name,
      quantity: qty,
      unit: product.unit || 'piece',
      mrp: catMrp,
      unitPrice,
      lineTotal,
      saving: itemSaving,
      isCustom: false,
      isPriceEdited,
    });
  }

  grandTotal = Math.round(grandTotal * 100) / 100;
  totalMrp = Math.round(totalMrp * 100) / 100;
  totalSavings = Math.round(totalSavings * 100) / 100;

  return {
    items: processedItems,
    total: grandTotal,
    totalMrp,
    totalSavings,
    warnings,
  };
}

/**
 * Confirm and save order in one logical operation:
 * 1. Validates quantities, stock, customer
 * 2. Creates Order
 * 3. Deducts stock
 * 4. Appends Ledger DEBIT
 * 5. If paidNow > 0: creates simulated Payment & appends Ledger CREDIT
 * 6. Computes payment status
 */
async function confirmOrder({
  businessId,
  customerId,
  items: rawItems,
  paidAmount = 0,
  paymentMethod = 'simulated_cash',
  transcript = '',
  idempotencyKey = null,
}) {
  if (!customerId) {
    throw new Error('Customer ID is required.');
  }

  const customer = await Customer.findOne({ _id: customerId, businessId });
  if (!customer) {
    throw new Error('Customer not found or unauthorized.');
  }

  // Recalculate everything securely from DB
  const preview = await previewOrder(businessId, rawItems);
  if (preview.items.length === 0) {
    throw new Error('Order must contain at least one valid item.');
  }

  const total = preview.total;
  const numPaid = parseFloat(paidAmount) || 0;
  if (numPaid < 0) {
    throw new Error('Paid amount cannot be negative.');
  }
  if (numPaid > total) {
    throw new Error(`Paid amount (₹${numPaid}) cannot exceed order total (₹${total}).`);
  }
  const remaining = Math.round((total - numPaid) * 100) / 100;

  let paymentStatus = 'unpaid';
  if (remaining === 0) {
    paymentStatus = 'paid';
  } else if (numPaid > 0) {
    paymentStatus = 'partial';
  }

  const orderNumber = `ORD-${Date.now().toString().slice(-6)}-${Math.floor(Math.random() * 90 + 10)}`;

  // 1. Create the Order
  const order = await Order.create({
    businessId,
    customerId,
    orderNumber,
    items: preview.items,
    total,
    totalSavings: preview.totalSavings || 0,
    paidAmount: numPaid,
    remaining,
    paymentStatus,
    status: 'confirmed',
    transcript: transcript.trim(),
  });

  // 2. Deduct stock for catalogue items
  for (const item of preview.items) {
    if (!item.isCustom) {
      await Product.findOneAndUpdate(
        { _id: item.productId, businessId },
        { $inc: { stock: -item.quantity } }
      );
    }
  }

  // 3. Write Ledger DEBIT for order total
  await recordLedgerEntry({
    businessId,
    customerId,
    orderId: order._id,
    type: 'debit',
    amount: total,
    note: `Order ${orderNumber} debited`,
  });

  // 4. If paidNow > 0, create simulated Payment and Ledger CREDIT
  let payment = null;
  if (numPaid > 0) {
    const paymentIdempotency = idempotencyKey || `pay_${order._id}_${Date.now()}`;

    // Check duplicate idempotency
    const existingPayment = await Payment.findOne({ idempotencyKey: paymentIdempotency });
    if (!existingPayment) {
      payment = await Payment.create({
        businessId,
        orderId: order._id,
        customerId,
        amount: numPaid,
        method: paymentMethod.startsWith('simulated_') ? paymentMethod : `simulated_${paymentMethod}`,
        status: 'confirmed',
        idempotencyKey: paymentIdempotency,
        isSimulated: true, // Non-negotiable Golden Rule 3
      });

      await recordLedgerEntry({
        businessId,
        customerId,
        orderId: order._id,
        paymentId: payment._id,
        type: 'credit',
        amount: numPaid,
        note: `Simulated payment for ${orderNumber} (${payment.method})`,
      });
    } else {
      payment = existingPayment;
    }
  }

  return {
    order,
    payment,
    total,
    totalMrp: preview.totalMrp || total,
    totalSavings: preview.totalSavings || 0,
    paidAmount: numPaid,
    remaining,
    paymentStatus,
  };
}

/**
 * Record a simulated payment against an existing order
 * Requirements:
 * - amount > 0 and <= remaining
 * - method simulated_cash or simulated_upi
 * - idempotencyKey generated per click so a double click never double-credits
 * - Creates Payment + ledger CREDIT, recomputes paymentStatus
 * - All validation on the server
 */
async function recordOrderPayment({
  businessId,
  orderId,
  amount,
  method = 'simulated_cash',
  idempotencyKey,
}) {
  if (!orderId) {
    throw new Error('Order ID is required.');
  }

  const order = await Order.findOne({ _id: orderId, businessId });
  if (!order) {
    throw new Error('Order not found or unauthorized.');
  }

  const numAmount = Math.round(parseFloat(amount) * 100) / 100;
  if (isNaN(numAmount) || numAmount <= 0) {
    throw new Error('Payment amount must be greater than 0.');
  }

  if (numAmount > order.remaining) {
    throw new Error(`Payment amount (₹${numAmount.toFixed(2)}) exceeds remaining balance (₹${order.remaining.toFixed(2)}).`);
  }

  const validMethods = ['simulated_cash', 'simulated_upi'];
  const formattedMethod = method.startsWith('simulated_') ? method : `simulated_${method}`;
  if (!validMethods.includes(formattedMethod)) {
    throw new Error(`Invalid payment method "${method}". Must be simulated_cash or simulated_upi.`);
  }

  const paymentKey = idempotencyKey || `pay_${order._id}_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;

  // Idempotency check: if payment with this key exists, return it without duplicate credit
  const existingPayment = await Payment.findOne({ idempotencyKey: paymentKey });
  if (existingPayment) {
    return {
      order,
      payment: existingPayment,
      isDuplicate: true,
      message: 'Payment already processed with this idempotency key.',
    };
  }

  // 1. Create simulated Payment
  const payment = await Payment.create({
    businessId,
    orderId: order._id,
    customerId: order.customerId,
    amount: numAmount,
    method: formattedMethod,
    status: 'confirmed',
    idempotencyKey: paymentKey,
    isSimulated: true, // Non-negotiable Golden Rule 3
  });

  // 2. Append Ledger CREDIT
  await recordLedgerEntry({
    businessId,
    customerId: order.customerId,
    orderId: order._id,
    paymentId: payment._id,
    type: 'credit',
    amount: numAmount,
    note: `Simulated payment for order ${order.orderNumber} (${formattedMethod})`,
  });

  // 3. Recompute order paidAmount, remaining, and paymentStatus
  const newPaidAmount = Math.round((order.paidAmount + numAmount) * 100) / 100;
  const newRemaining = Math.max(0, Math.round((order.total - newPaidAmount) * 100) / 100);

  // Backward compatibility: backfill missing mrp on older order items
  if (Array.isArray(order.items)) {
    for (const it of order.items) {
      if (it.mrp === undefined || it.mrp === null) {
        it.mrp = it.unitPrice || 0;
      }
    }
  }

  order.paidAmount = newPaidAmount;
  order.remaining = newRemaining;
  order.paymentStatus = newRemaining === 0 ? 'paid' : (newPaidAmount > 0 ? 'partial' : 'unpaid');
  await order.save();

  const customerBalance = await getCustomerBalance(businessId, order.customerId);

  return {
    order,
    payment,
    customerBalance,
    isDuplicate: false,
  };
}

/**
 * Record a payment against a customer's oldest unpaid order
 */
async function payOldestUnpaidOrder({
  businessId,
  customerId,
  amount,
  method = 'simulated_cash',
  idempotencyKey,
}) {
  if (!customerId) {
    throw new Error('Customer ID is required.');
  }

  const oldestOrder = await Order.findOne({
    businessId,
    customerId,
    status: 'confirmed',
    remaining: { $gt: 0 },
  }).sort({ createdAt: 1 });

  if (!oldestOrder) {
    throw new Error('Customer has no pending unpaid orders.');
  }

  const numAmount = Math.round(parseFloat(amount) * 100) / 100;
  if (isNaN(numAmount) || numAmount <= 0) {
    throw new Error('Payment amount must be greater than 0.');
  }

  // Pay up to the oldest order's remaining balance
  const payAmount = Math.min(numAmount, oldestOrder.remaining);

  return await recordOrderPayment({
    businessId,
    orderId: oldestOrder._id,
    amount: payAmount,
    method,
    idempotencyKey,
  });
}

module.exports = {
  previewOrder,
  confirmOrder,
  recordOrderPayment,
  payOldestUnpaidOrder,
};
