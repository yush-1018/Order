require('dotenv').config({ path: __dirname + '/../.env' });
const http = require('http');

let baseUrl = 'http://127.0.0.1:5000';

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

async function runPhase4Tests() {
  console.log('\n========================================');
  console.log('🧪 RUNNING PHASE 4 ACCEPTANCE TESTS');
  console.log('========================================\n');

  let passed = 0;
  let total = 0;

  function assert(condition, testName) {
    total++;
    if (condition) {
      console.log(`  ✅ [PASS] ${testName}`);
      passed++;
    } else {
      console.error(`  ❌ [FAIL] ${testName}`);
      throw new Error(`Test failed: ${testName}`);
    }
  }

  try {
    // 1. Authenticate with demo merchant
    console.log('[Step 1/7] Authenticating merchant...');
    let authRes = await request('POST', '/api/auth/login', {
      email: 'demo@kirana.store',
      password: 'kirana123',
    });

    if (authRes.status !== 200) {
      // If demo user does not exist, register one
      authRes = await request('POST', '/api/auth/register', {
        name: 'Demo Merchant',
        email: `merchant_${Date.now()}@kirana.store`,
        password: 'password123',
        businessName: 'Apna Kirana Store',
      });
    }

    assert(authRes.status === 200 || authRes.status === 201, 'Merchant authenticated with JWT');
    const token = authRes.body.token;

    // Fetch customer and product
    console.log('\n[Step 2/7] Fetching customer & catalogue products...');
    let custRes = await request('GET', '/api/customers', null, token);
    assert(custRes.status === 200 && custRes.body.customers.length > 0, 'Fetched customers for store');
    const customer = custRes.body.customers[0];

    const prodRes = await request('GET', '/api/products', null, token);
    assert(prodRes.status === 200 && prodRes.body.products.length > 0, 'Fetched active products');
    const product = prodRes.body.products[0];

    // 3. Create an order with partial payment
    console.log('\n[Step 3/7] Creating order with partial payment (Udhar balance)...');
    const orderItems = [
      { productId: product._id, quantity: 2 },
    ];
    const previewRes = await request('POST', '/api/orders/preview', { items: orderItems }, token);
    assert(previewRes.status === 200, 'Order preview calculated');
    const orderTotal = previewRes.body.total;

    // Partial payment: pay roughly half, remaining stays as Udhar
    const initialPaid = Math.floor(orderTotal / 2);
    const expectedRemaining = Math.round((orderTotal - initialPaid) * 100) / 100;

    const createOrderRes = await request('POST', '/api/orders', {
      customerId: customer._id,
      items: orderItems,
      paidAmount: initialPaid,
      paymentMethod: 'simulated_cash',
      transcript: '2 packet sample product',
      idempotencyKey: `init_pay_${Date.now()}`,
    }, token);

    assert(createOrderRes.status === 201, 'Order created with HTTP 201');
    const createdOrder = createOrderRes.body.order;
    assert(createdOrder.paymentStatus === 'partial', 'Order paymentStatus is "partial"');
    assert(createdOrder.remaining === expectedRemaining, `Remaining balance is ₹${expectedRemaining}`);

    // 4. Test Simulated Payment Modal API (/api/orders/:id/payments)
    console.log('\n[Step 4/7] Testing Simulated Payment Modal validations & idempotency...');
    // 4a. Overpayment rejection
    const overpayRes = await request('POST', `/api/orders/${createdOrder._id}/payments`, {
      amount: expectedRemaining + 100,
      method: 'simulated_cash',
      idempotencyKey: `overpay_${Date.now()}`,
    }, token);
    assert(overpayRes.status === 400, 'Server rejected overpayment amount > remaining with HTTP 400');

    // 4b. Invalid amount rejection (negative / zero)
    const invalidAmtRes = await request('POST', `/api/orders/${createdOrder._id}/payments`, {
      amount: -10,
      method: 'simulated_cash',
    }, token);
    assert(invalidAmtRes.status === 400, 'Server rejected negative amount with HTTP 400');

    // 4c. Valid partial payment with idempotencyKey
    const partialPayAmt = Math.round((expectedRemaining / 2) * 100) / 100;
    const testIdempotencyKey = `idem_key_${createdOrder._id}_${Date.now()}`;

    const payRes1 = await request('POST', `/api/orders/${createdOrder._id}/payments`, {
      amount: partialPayAmt,
      method: 'simulated_upi',
      idempotencyKey: testIdempotencyKey,
    }, token);

    assert(payRes1.status === 200, 'Simulated payment succeeded with HTTP 200');
    assert(payRes1.body.payment.isSimulated === true, 'Payment record has isSimulated: true (Golden Rule 3)');
    assert(payRes1.body.payment.method === 'simulated_upi', 'Payment method is simulated_upi');
    assert(payRes1.body.order.paymentStatus === 'partial', 'Order status remains "partial"');

    // 4d. Idempotency test: submit SAME payment request with same idempotencyKey
    const payResDup = await request('POST', `/api/orders/${createdOrder._id}/payments`, {
      amount: partialPayAmt,
      method: 'simulated_upi',
      idempotencyKey: testIdempotencyKey,
    }, token);
    assert(payResDup.status === 200, 'Duplicate request returned HTTP 200');
    assert(payResDup.body.isDuplicate === true, 'Server detected duplicate idempotency key (no double-credit)');

    // 4e. Settle order to full PAID
    const remainingToSettle = payRes1.body.order.remaining;
    const payRes2 = await request('POST', `/api/orders/${createdOrder._id}/payments`, {
      amount: remainingToSettle,
      method: 'simulated_cash',
      idempotencyKey: `settle_${createdOrder._id}_${Date.now()}`,
    }, token);
    assert(payRes2.status === 200, 'Final settlement payment succeeded');
    assert(payRes2.body.order.remaining === 0, 'Order remaining balance is 0');
    assert(payRes2.body.order.paymentStatus === 'paid', 'Order paymentStatus updated to "paid"');

    // 5. Test Udhar & Append-only Ledger Endpoints
    console.log('\n[Step 5/7] Testing Udhar Summary & Customer Ledger...');
    // 5a. Create a new unpaid order for customer so there is outstanding Udhar
    const unpaidOrderRes = await request('POST', '/api/orders', {
      customerId: customer._id,
      items: orderItems,
      paidAmount: 0,
      paymentMethod: 'simulated_cash',
    }, token);
    assert(unpaidOrderRes.status === 201, 'Created unpaid credit order');
    const unpaidOrder = unpaidOrderRes.body.order;
    assert(unpaidOrder.paymentStatus === 'unpaid', 'Payment status is "unpaid"');

    // 5b. Check Udhar Summary
    const udharSumRes = await request('GET', '/api/customers/udhar/summary', null, token);
    assert(udharSumRes.status === 200, 'GET /api/customers/udhar/summary returned HTTP 200');
    assert(udharSumRes.body.totalUdhar > 0, 'Total Udhar is positive');
    const foundCust = udharSumRes.body.customers.find((c) => String(c._id) === String(customer._id));
    assert(foundCust !== undefined && foundCust.balance > 0, 'Customer has positive Udhar balance');

    // 5c. Check Customer Ledger History
    const ledgerRes = await request('GET', `/api/customers/${customer._id}/ledger`, null, token);
    assert(ledgerRes.status === 200, 'GET /api/customers/:id/ledger returned HTTP 200');
    assert(ledgerRes.body.entries.length >= 2, 'Ledger contains debits and credits');
    assert(ledgerRes.body.pendingOrders.length >= 1, 'Pending orders list contains unpaid order');

    // 5d. Pay against customer oldest unpaid order (/api/customers/:id/pay-udhar)
    const targetOldestOrder = ledgerRes.body.pendingOrders[0];
    const payUdharRes = await request('POST', `/api/customers/${customer._id}/pay-udhar`, {
      amount: targetOldestOrder.remaining,
      method: 'simulated_cash',
      idempotencyKey: `pay_udhar_${targetOldestOrder._id}_${Date.now()}`,
    }, token);
    assert(payUdharRes.status === 200, 'POST /api/customers/:id/pay-udhar succeeded with HTTP 200');
    assert(payUdharRes.body.order.paymentStatus === 'paid', 'Oldest unpaid order settled to "paid"');

    // 6. Test Dashboard Summary
    console.log('\n[Step 6/7] Testing Dashboard Summary API (/api/dashboard/summary)...');
    const dashRes = await request('GET', '/api/dashboard/summary', null, token);
    assert(dashRes.status === 200, 'GET /api/dashboard/summary returned HTTP 200');
    assert(dashRes.body.summary.todayOrdersCount > 0, "todayOrdersCount is recorded");
    assert(dashRes.body.summary.todayReceivedTotal > 0, "todayReceivedTotal is recorded");
    assert(Array.isArray(dashRes.body.summary.topCustomersByUdhar), "topCustomersByUdhar is an array");
    assert(Array.isArray(dashRes.body.summary.recentOrders), "recentOrders is an array");

    // 7. Multi-tenant Isolation Test
    console.log('\n[Step 7/7] Testing multi-tenant isolation...');
    const store2Auth = await request('POST', '/api/auth/register', {
      name: 'Store Two Owner',
      email: `store2_${Date.now()}@kirana.store`,
      password: 'password123',
      businessName: 'Store Two',
    });
    assert(store2Auth.status === 201, 'Registered second store');
    const token2 = store2Auth.body.token;

    // Store 2 orders must not contain Store 1's orders
    const store2Orders = await request('GET', '/api/orders', null, token2);
    assert(store2Orders.body.count === 0, 'Store 2 has 0 orders (cannot see Store 1 orders)');

    // Store 2 cannot view Store 1 order detail
    const store2ViewOrder1 = await request('GET', `/api/orders/${createdOrder._id}`, null, token2);
    assert(store2ViewOrder1.status === 404, 'Store 2 cannot access Store 1 order detail (returns 404)');

    // Store 2 cannot pay Store 1 order
    const store2PayOrder1 = await request('POST', `/api/orders/${createdOrder._id}/payments`, {
      amount: 10,
      method: 'simulated_cash',
    }, token2);
    assert(store2PayOrder1.status === 400 || store2PayOrder1.status === 404, 'Store 2 cannot pay Store 1 order');

    console.log('\n========================================');
    console.log(`🎉 ALL ${passed}/${total} PHASE 4 TESTS PASSED!`);
    console.log('========================================\n');
  } catch (err) {
    console.error('\n❌ Test suite failed:', err);
    process.exit(1);
  }
}

runPhase4Tests();
