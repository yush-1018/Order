require('dotenv').config({ path: __dirname + '/../.env' });
const mongoose = require('mongoose');
const http = require('http');
const express = require('express');
const cors = require('cors');

const User = require('../models/User');
const Product = require('../models/Product');
const Order = require('../models/Order');
const Customer = require('../models/Customer');
const LedgerEntry = require('../models/LedgerEntry');

const authRoutes = require('../routes/auth.routes');
const productRoutes = require('../routes/product.routes');
const orderRoutes = require('../routes/order.routes');
const customerRoutes = require('../routes/customer.routes');

function assert(condition, message) {
  if (!condition) {
    console.error(`  ❌ [FAIL] ${message}`);
    throw new Error(`Test failed: ${message}`);
  }
  console.log(`  ✅ [PASS] ${message}`);
}

async function runReviewTests() {
  console.log('\n========================================');
  console.log('🧪 RUNNING ORDER REVIEW & EDITABLE PRICING TESTS');
  console.log('========================================\n');

  const mongoUri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/orderpay_review_test';
  await mongoose.connect(mongoUri);

  const app = express();
  app.use(cors());
  app.use(express.json());
  app.use('/api/auth', authRoutes);
  app.use('/api/products', productRoutes);
  app.use('/api/orders', orderRoutes);
  app.use('/api/customers', customerRoutes);

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;

  async function request(method, path, body = null, token = null) {
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const res = await fetch(`${baseUrl}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
    return { status: res.status, body: data };
  }

  try {
    // 1. Setup Merchant & seed
    console.log('[Step 1/5] Registering merchant & seeding...');
    const email = `review_test_${Date.now()}@kirana.store`;
    const regRes = await request('POST', '/api/auth/register', {
      name: 'Verma Kirana',
      email,
      password: 'password123',
      businessName: 'Verma General Store',
    });
    assert(regRes.status === 201, 'Merchant registered with HTTP 201');
    const token = regRes.body.token;
    const businessId = regRes.body.user.businessId;

    const seedData = require('../scripts/seed');
    await seedData(businessId);

    const custRes = await request('GET', '/api/customers', null, token);
    const customer = custRes.body.customers[0];

    const attaProduct = await Product.findOne({ name: 'Aashirvaad Superior MP Atta 5kg', businessId });
    const initialAttaStock = attaProduct.stock;
    // Atta: mrp = 320, price = 295

    // 2. Test Backend Price Override Validation
    console.log('\n[Step 2/5] Testing Price Override Validation (price <= 0 and price > mrp)...');

    // 2a. Reject price > mrp in preview
    const overMrpPreview = await request(
      'POST',
      '/api/orders/preview',
      {
        items: [{ productId: attaProduct._id, quantity: 1, priceOverride: 350 }], // mrp is 320
      },
      token
    );
    assert(overMrpPreview.status === 400, 'POST /api/orders/preview rejected price > mrp with HTTP 400');

    // 2b. Reject price <= 0 in preview
    const zeroPricePreview = await request(
      'POST',
      '/api/orders/preview',
      {
        items: [{ productId: attaProduct._id, quantity: 1, priceOverride: 0 }],
      },
      token
    );
    assert(zeroPricePreview.status === 400, 'POST /api/orders/preview rejected price <= 0 with HTTP 400');

    // 2c. Reject price > mrp in confirm
    const overMrpConfirm = await request(
      'POST',
      '/api/orders',
      {
        customerId: customer._id,
        items: [{ productId: attaProduct._id, quantity: 1, priceOverride: 350 }],
      },
      token
    );
    assert(overMrpConfirm.status === 400, 'POST /api/orders rejected price > mrp with HTTP 400');

    // 2d. Reject paidNow > total in confirm
    const overPaidConfirm = await request(
      'POST',
      '/api/orders',
      {
        customerId: customer._id,
        items: [{ productId: attaProduct._id, quantity: 1, priceOverride: 290 }],
        paidAmount: 500, // total is 290
      },
      token
    );
    assert(overPaidConfirm.status === 400, 'POST /api/orders rejected paidNow > total with HTTP 400');

    // 3. Test Preview with Decimal Quantity and Price Override
    console.log('\n[Step 3/5] Testing Preview with Decimals (0.5, 1.5) and Price Override...');
    const validPreview = await request(
      'POST',
      '/api/orders/preview',
      {
        items: [
          // Catalogue item with edited price 290 (down from 295) and decimal quantity 1.5
          { productId: attaProduct._id, quantity: 1.5, priceOverride: 290 },
          // Custom item with quantity 0.5, price 80, optional mrp 90
          { custom: true, name: 'Loose Moong Dal', unit: 'kg', quantity: 0.5, price: 80, mrp: 90 },
          // Custom item where MRP is empty (defaults to price)
          { custom: true, name: 'Special Masala Sachet', unit: 'packet', quantity: 2, price: 15 },
        ],
      },
      token
    );
    assert(validPreview.status === 200, 'POST /api/orders/preview returned HTTP 200');
    // Calculations:
    // Item 1: 1.5 * 290 = 435. MRP: 1.5 * 320 = 480. Saving = 45. isPriceEdited = true
    // Item 2: 0.5 * 80 = 40. MRP: 0.5 * 90 = 45. Saving = 5. isCustom = true
    // Item 3: 2 * 15 = 30. MRP: 2 * 15 = 30. Saving = 0. isCustom = true
    // Grand Total = 435 + 40 + 30 = 505
    // Total MRP = 480 + 45 + 30 = 555
    // Total Savings = 45 + 5 + 0 = 50
    assert(validPreview.body.total === 505, `Preview total is ₹505 (got ₹${validPreview.body.total})`);
    assert(validPreview.body.totalMrp === 555, `Preview totalMrp is ₹555 (got ₹${validPreview.body.totalMrp})`);
    assert(validPreview.body.totalSavings === 50, `Preview totalSavings is ₹50 (got ₹${validPreview.body.totalSavings})`);
    assert(validPreview.body.items[0].isPriceEdited === true, 'Catalogue item marked isPriceEdited: true');
    assert(validPreview.body.items[1].isCustom === true, 'Custom item 1 marked isCustom: true');
    assert(validPreview.body.items[2].mrp === 15, 'Custom item 2 defaults mrp to price: 15');

    // 4. Test Order Confirmation, Snapshot, and Stock Deduction rules
    console.log('\n[Step 4/5] Testing Order Confirmation, Snapshots & Stock Deduction...');
    const confirmRes = await request(
      'POST',
      '/api/orders',
      {
        customerId: customer._id,
        items: validPreview.body.items,
        paidAmount: 300,
        paymentMethod: 'simulated_cash',
      },
      token
    );
    assert(confirmRes.status === 201, 'Order confirmed with HTTP 201');
    const order = confirmRes.body.order;
    assert(order.total === 505, `Order total matches backend calculation: 505`);
    assert(order.items.length === 3, 'Order contains 3 items snapshot');

    // Snapshot checks on item 1 (catalogue with edited price)
    assert(order.items[0].isPriceEdited === true, 'Item 1 snapshot preserves isPriceEdited: true');
    assert(order.items[0].unitPrice === 290, 'Item 1 snapshot preserves edited unitPrice: 290');
    assert(order.items[0].mrp === 320, 'Item 1 snapshot preserves mrp: 320');
    assert(order.items[0].quantity === 1.5, 'Item 1 snapshot preserves decimal quantity: 1.5');
    assert(order.items[0].lineTotal === 435, 'Item 1 snapshot preserves lineTotal: 435');
    assert(order.items[0].isCustom === false, 'Item 1 snapshot isCustom: false');

    // Snapshot checks on item 2 (custom item)
    assert(order.items[1].isCustom === true, 'Item 2 snapshot preserves isCustom: true');
    assert(order.items[1].name === 'Loose Moong Dal', 'Item 2 snapshot preserves name');
    assert(order.items[1].quantity === 0.5, 'Item 2 snapshot preserves decimal quantity: 0.5');
    assert(order.items[1].unitPrice === 80, 'Item 2 snapshot preserves unitPrice: 80');
    assert(order.items[1].mrp === 90, 'Item 2 snapshot preserves mrp: 90');
    assert(order.items[1].lineTotal === 40, 'Item 2 snapshot preserves lineTotal: 40');

    // Snapshot checks on item 3 (custom item with mrp = price)
    assert(order.items[2].isCustom === true, 'Item 3 snapshot preserves isCustom: true');
    assert(order.items[2].mrp === 15 && order.items[2].unitPrice === 15, 'Item 3 mrp equals price: 15');

    // 5. Stock verification: Catalogue item stock deducted, custom items do not deduct stock
    console.log('\n[Step 5/5] Verifying Stock Deductions...');
    const attaAfter = await Product.findById(attaProduct._id);
    assert(
      attaAfter.stock === initialAttaStock - 1.5,
      `Catalogue stock deducted accurately: from ${initialAttaStock} to ${attaAfter.stock}`
    );

    console.log('\n========================================');
    console.log('🎉 ALL ORDER REVIEW & PRICING TESTS PASSED!');
    console.log('========================================\n');
  } finally {
    server.close();
    await mongoose.disconnect();
  }
}

if (require.main === module) {
  runReviewTests()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
