require('dotenv').config({ path: __dirname + '/../.env' });
const http = require('http');
const mongoose = require('mongoose');
const User = require('../models/User');
const Product = require('../models/Product');
const Customer = require('../models/Customer');
const Order = require('../models/Order');
const Payment = require('../models/Payment');
const LedgerEntry = require('../models/LedgerEntry');
const { getCustomerBalance } = require('../services/ledger.service');

let serverInstance;
let baseUrl = '';

function request(method, path, body = null, token = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, baseUrl);
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const req = http.request(url, { method, headers }, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => {
        let parsed;
        try {
          parsed = JSON.parse(data);
        } catch (e) {
          parsed = data;
        }
        resolve({ status: res.statusCode, body: parsed });
      });
    });

    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function runPhase3Checks() {
  console.log('\n========================================');
  console.log('🚀 RUNNING PHASE 3 ACCEPTANCE CHECKS');
  console.log('========================================\n');

  let passedTests = 0;
  let totalTests = 0;

  function assert(condition, testName) {
    totalTests++;
    if (condition) {
      console.log(`  ✅ [PASS] ${testName}`);
      passedTests++;
    } else {
      console.error(`  ❌ [FAIL] ${testName}`);
      throw new Error(`Test failed: ${testName}`);
    }
  }

  const testDbUri = 'mongodb://127.0.0.1:27017/orderpay_phase3_test';

  try {
    // 1. Setup in-memory / local test database
    console.log('[Step 1/6] Connecting to clean test database...');
    await mongoose.connect(testDbUri);
    await mongoose.connection.dropDatabase();
    process.env.NODE_ENV = 'test';
    const app = require('../server');
    serverInstance = app.listen(0);
    const port = serverInstance.address().port;
    baseUrl = `http://127.0.0.1:${port}`;
    console.log(`  -> Server listening on ${baseUrl}`);

    // 2. Register merchant and seed products with bilingual aliases
    console.log('\n[Step 2/6] Registering test merchant & seeding bilingual catalogue...');
    const regRes = await request('POST', '/api/auth/register', {
      name: 'Ramesh Sharma',
      email: 'ramesh@kirana.store',
      password: 'password123',
      businessName: 'Sharmaji Kirana Store',
    });
    assert(regRes.status === 201, 'Test merchant registered with HTTP 201');
    const token = regRes.body.token;
    const businessId = regRes.body.user.businessId;

    // Seed data for this business
    const seedData = require('../scripts/seed');
    await seedData(businessId);
    console.log('  -> Seeded 16 products with bilingual aliases & 3 customers.');

    const custRes = await request('GET', '/api/customers', null, token);
    assert(custRes.body.customers.length === 3, 'Fetched synthetic customers');
    const customer = custRes.body.customers[0];

    // 3. Test POST /api/voice/parse-order with code-mixed Devanagari text
    console.log('\n[Step 3/6] Testing POST /api/voice/parse-order with Devanagari code-mix...');
    const mixedTranscript = 'add 10 kg आशीर्वाद आटा, and 5 kg चीनी, and 1 kg मैदा।';
    const parseRes = await request('POST', '/api/voice/parse-order', { transcript: mixedTranscript }, token);

    assert(parseRes.status === 200, 'POST /api/voice/parse-order returned HTTP 200');
    assert(parseRes.body.items.length === 3, 'Parsed exactly 3 items from code-mixed transcript');
    assert(parseRes.body.items[0].productName.includes('Atta'), 'First item matched Atta');
    assert(parseRes.body.items[1].productName.includes('Sugar') || parseRes.body.items[1].productName.includes('चीनी'), 'Second item matched Sugar/Chini');
    assert(parseRes.body.items[2].productName.includes('Maida') || parseRes.body.items[2].productName.includes('मैदा'), 'Third item matched Maida');

    // Golden Rule 1 Check: Price comes strictly from DB
    const attaProduct = await Product.findOne({ name: 'Aashirvaad Superior MP Atta 5kg', businessId });
    const chiniProduct = await Product.findOne({ category: 'chini', businessId });
    const maidaProduct = await Product.findOne({ category: 'maida', businessId });
    const expectedTotal = 10 * attaProduct.price + 5 * chiniProduct.price + 1 * maidaProduct.price;
    assert(parseRes.body.total === expectedTotal, `Total ₹${parseRes.body.total} matches DB pricing (₹${expectedTotal})`);

    // 4. Test POST /api/orders/preview
    console.log('\n[Step 4/6] Testing POST /api/orders/preview...');
    const previewRes = await request(
      'POST',
      '/api/orders/preview',
      {
        items: parseRes.body.items,
      },
      token
    );
    assert(previewRes.status === 200, 'POST /api/orders/preview returned HTTP 200');
    assert(previewRes.body.total === expectedTotal, 'Preview total matches DB calculation');

    // 5. Test POST /api/orders (Order Confirmation, Stock Deduction & Ledger DEBIT/CREDIT)
    console.log('\n[Step 5/6] Testing POST /api/orders (Confirm, Stock deduction & Ledger)...');
    const attaProductBefore = attaProduct;
    const stockBefore = attaProductBefore.stock;
    const paidAmount = 2000;
    const expectedRemaining = expectedTotal - paidAmount;

    const confirmRes = await request(
      'POST',
      '/api/orders',
      {
        customerId: customer._id,
        items: parseRes.body.items,
        paidAmount,
        paymentMethod: 'simulated_cash',
        transcript: mixedTranscript,
      },
      token
    );

    assert(confirmRes.status === 201, 'POST /api/orders confirmed with HTTP 201');
    assert(confirmRes.body.order.status === 'confirmed', 'Order status is "confirmed"');
    assert(confirmRes.body.paymentStatus === 'partial', 'Payment status is "partial"');
    assert(confirmRes.body.remaining === expectedRemaining, `Remaining udhar balance is exactly ₹${expectedRemaining}`);

    // Verify stock deduction
    const attaProductAfter = await Product.findOne({ name: 'Aashirvaad Superior MP Atta 5kg', businessId });
    assert(
      attaProductAfter.stock === stockBefore - 10,
      `Stock deducted properly: from ${stockBefore} to ${attaProductAfter.stock}`
    );

    // Verify simulated payment record
    assert(confirmRes.body.payment.isSimulated === true, 'Payment record isSimulated is true (Golden Rule 3)');

    // Verify ledger entries (DEBIT for total, CREDIT for paid amount)
    const debits = await LedgerEntry.find({ customerId: customer._id, type: 'debit' });
    const credits = await LedgerEntry.find({ customerId: customer._id, type: 'credit' });
    assert(debits.length === 1 && debits[0].amount === expectedTotal, `Ledger DEBIT recorded for total ₹${expectedTotal}`);
    assert(credits.length === 1 && credits[0].amount === 2000, 'Ledger CREDIT recorded for paid amount ₹2000');

    // Customer balance verification: sum(debit) - sum(credit) = expectedTotal - 2000 = expectedRemaining
    const customerBalance = await getCustomerBalance(businessId, customer._id);
    assert(customerBalance === expectedRemaining, `Customer Udhar balance is exactly ₹${expectedRemaining} (got ${customerBalance})`);

    // 6. Test Alias Learning (Addition to Phase 3)
    console.log('\n[Step 6/6] Testing Alias Learning...');
    const newCustomAlias = 'special maida fine flour';

    const aliasRes = await request(
      'POST',
      `/api/products/${maidaProduct._id}/learn-alias`,
      { alias: newCustomAlias },
      token
    );
    assert(aliasRes.status === 200, 'Learned new alias successfully');
    assert(aliasRes.body.product.aliases.includes(newCustomAlias), 'New alias saved in product aliases');

    // Test that parser now matches this newly learned alias!
    const reParse = await request(
      'POST',
      '/api/voice/parse-order',
      { transcript: `2 kg ${newCustomAlias}` },
      token
    );
    assert(reParse.body.items.length === 1, 'Parser recognized newly learned alias!');
    assert(reParse.body.items[0].productId === maidaProduct._id.toString(), 'Matched to correct product via learned alias');

    console.log('\n========================================');
    console.log(`🎉 ALL ${passedTests}/${totalTests} PHASE 3 ACCEPTANCE CHECKS PASSED!`);
    console.log('========================================\n');
  } catch (err) {
    console.error('\n❌ Acceptance Check Failure:', err.message);
    process.exitCode = 1;
  } finally {
    if (serverInstance) serverInstance.close();
    if (mongoose.connection.readyState !== 0) {
      await mongoose.connection.dropDatabase();
      await mongoose.disconnect();
    }
    process.exit(process.exitCode || 0);
  }
}

runPhase3Checks();
