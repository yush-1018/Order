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
const Payment = require('../models/Payment');

const authRoutes = require('../routes/auth.routes');
const productRoutes = require('../routes/product.routes');
const orderRoutes = require('../routes/order.routes');
const customerRoutes = require('../routes/customer.routes');
const voiceRoutes = require('../routes/voice.routes');

function assert(condition, message) {
  if (!condition) {
    console.error(`  ❌ [FAIL] ${message}`);
    throw new Error(`Test failed: ${message}`);
  }
  console.log(`  ✅ [PASS] ${message}`);
}

async function runMrpTests() {
  console.log('\n========================================');
  console.log('🧪 RUNNING MRP & PRODUCT MODEL FEATURE TESTS');
  console.log('========================================\n');

  const mongoUri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/orderpay_mrp_test';
  await mongoose.connect(mongoUri);

  const app = express();
  app.use(cors());
  app.use(express.json());
  app.use('/api/auth', authRoutes);
  app.use('/api/products', productRoutes);
  app.use('/api/orders', orderRoutes);
  app.use('/api/customers', customerRoutes);
  app.use('/api/voice', voiceRoutes);

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
    // 1. Setup Merchant
    console.log('[Step 1/5] Registering merchant & seeding from products.seed.json...');
    const email = `test_mrp_${Date.now()}@kirana.store`;
    const regRes = await request('POST', '/api/auth/register', {
      name: 'Test Kirana',
      email,
      password: 'password123',
      businessName: 'Gupta Kirana Store',
    });
    assert(regRes.status === 201, 'Merchant registered successfully');
    const token = regRes.body.token;
    const businessId = regRes.body.user.businessId;

    const seedData = require('../scripts/seed');
    await seedData(businessId);
    console.log('  -> Seeded products from products.seed.json');

    // 2. Test Backend Validation (reject price > mrp, reject price <= 0, reject mrp <= 0)
    console.log('\n[Step 2/5] Testing validation constraints (price > mrp, price <= 0, mrp <= 0)...');

    // 2a. Reject price > mrp on create
    const invalidPriceRes = await request(
      'POST',
      '/api/products',
      {
        name: 'Overpriced Ghee',
        mrp: 500,
        price: 550, // > mrp
        category: 'tel',
        unit: 'packet',
      },
      token
    );
    assert(invalidPriceRes.status === 400, 'POST /api/products rejected price > mrp with HTTP 400');
    assert(
      invalidPriceRes.body.message.includes('MRP'),
      `Correct error message returned: "${invalidPriceRes.body.message}"`
    );

    // 2b. Reject price <= 0
    const zeroPriceRes = await request(
      'POST',
      '/api/products',
      {
        name: 'Free Sugar',
        mrp: 50,
        price: 0,
        category: 'chini',
      },
      token
    );
    assert(zeroPriceRes.status === 400, 'POST /api/products rejected price <= 0 with HTTP 400');

    // 2c. Reject mrp <= 0
    const zeroMrpRes = await request(
      'POST',
      '/api/products',
      {
        name: 'Invalid MRP Atta',
        mrp: 0,
        price: 100,
        category: 'atta',
      },
      token
    );
    assert(zeroMrpRes.status === 400, 'POST /api/products rejected mrp <= 0 with HTTP 400');

    // 2d. Create valid product with price == mrp
    const validCreateRes = await request(
      'POST',
      '/api/products',
      {
        name: 'Dairy Milk Chocolate 50g',
        mrp: 40,
        price: 40,
        category: 'snacks',
        unit: 'piece',
      },
      token
    );
    assert(validCreateRes.status === 201, 'POST /api/products created valid product where price == mrp');
    const createdProd = validCreateRes.body.product;

    // 2e. Reject update where price > mrp
    const invalidUpdateRes = await request(
      'PUT',
      `/api/products/${createdProd._id}`,
      { price: 60 }, // existing mrp is 40
      token
    );
    assert(invalidUpdateRes.status === 400, 'PUT /api/products/:id rejected price > mrp with HTTP 400');

    // 3. Test Order Preview and Savings Calculation
    console.log('\n[Step 3/5] Testing Order Preview & Per-Item Savings...');
    const attaProduct = await Product.findOne({ name: 'Aashirvaad Superior MP Atta 5kg', businessId });
    assert(attaProduct.mrp === 320 && attaProduct.price === 295, 'Seed data has MRP 320 and Selling Price 295 for Atta');

    const previewRes = await request(
      'POST',
      '/api/orders/preview',
      {
        items: [
          { productId: attaProduct._id, quantity: 2 }, // 2 * 295 = 590, MRP: 2 * 320 = 640. Saving = 50
          { productId: createdProd._id, quantity: 3 }, // 3 * 40 = 120, MRP: 3 * 40 = 120. Saving = 0
        ],
      },
      token
    );
    assert(previewRes.status === 200, 'POST /api/orders/preview returned HTTP 200');
    assert(previewRes.body.total === 710, `Order Total is ₹710 (got ₹${previewRes.body.total})`);
    assert(previewRes.body.totalMrp === 760, `Total MRP is ₹760 (got ₹${previewRes.body.totalMrp})`);
    assert(previewRes.body.totalSavings === 50, `Total savings is ₹50 (got ₹${previewRes.body.totalSavings})`);

    // 4. Test Order Creation and Snapshot Architecture
    console.log('\n[Step 4/5] Testing Order Creation and Snapshot in Order.items...');
    const custRes = await request('GET', '/api/customers', null, token);
    const customer = custRes.body.customers[0];

    const confirmRes = await request(
      'POST',
      '/api/orders',
      {
        customerId: customer._id,
        items: previewRes.body.items,
        paidAmount: 500,
        paymentMethod: 'simulated_cash',
      },
      token
    );

    assert(confirmRes.status === 201, 'Order confirmed with HTTP 201');
    const order = confirmRes.body.order;
    assert(order.items.length === 2, 'Order has 2 items');
    assert(order.items[0].mrp === 320, 'Order item 1 stores snapshot mrp: 320');
    assert(order.items[0].unitPrice === 295, 'Order item 1 stores snapshot unitPrice: 295');
    assert(order.items[0].lineTotal === 590, 'Order item 1 stores snapshot lineTotal: 590');
    assert(order.totalSavings === 50, 'Order stores snapshot totalSavings: 50');

    // 5. Test Immutability: Editing product later MUST NEVER change existing order or ledger
    console.log('\n[Step 5/5] Testing Immutability (Editing product later never changes past orders/ledger)...');
    await request(
      'PUT',
      `/api/products/${attaProduct._id}`,
      { mrp: 400, price: 380 },
      token
    );

    // Re-fetch the saved order from DB
    const fetchedOrder = await Order.findById(order._id);
    assert(fetchedOrder.total === 710, `Existing Order total remains strictly ₹710 (got ₹${fetchedOrder.total})`);
    assert(
      fetchedOrder.items[0].mrp === 320,
      `Existing Order item mrp snapshot remains ₹320 despite product updated to ₹400`
    );
    assert(
      fetchedOrder.items[0].unitPrice === 295,
      `Existing Order item unitPrice snapshot remains ₹295 despite product updated to ₹380`
    );
    assert(
      fetchedOrder.items[0].lineTotal === 590,
      `Existing Order item lineTotal snapshot remains ₹590`
    );

    // Verify ledger entries are unchanged
    const ledgerDebit = await LedgerEntry.findOne({ orderId: order._id, type: 'debit' });
    assert(ledgerDebit.amount === 710, `Ledger DEBIT remains strictly ₹710`);

    console.log('\n========================================');
    console.log('🎉 ALL MRP & SNAPSHOT IMMUTABILITY TESTS PASSED!');
    console.log('========================================\n');
  } finally {
    server.close();
    await mongoose.disconnect();
  }
}

if (require.main === module) {
  runMrpTests()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
