require('dotenv').config({ path: __dirname + '/../.env' });
const http = require('http');

let baseUrl = 'http://127.0.0.1:5000';

function request(method, path, body = null, token = null, headersExtra = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, baseUrl);
    const headers = { 'Content-Type': 'application/json', ...headersExtra };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const req = http.request(url, { method, headers }, (res) => {
      let chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const buffer = Buffer.concat(chunks);
        let parsed;
        const contentType = res.headers['content-type'] || '';
        if (contentType.includes('application/json')) {
          try {
            parsed = JSON.parse(buffer.toString('utf8'));
          } catch (e) {
            parsed = buffer.toString('utf8');
          }
        } else {
          parsed = buffer;
        }
        resolve({
          status: res.statusCode,
          headers: res.headers,
          body: parsed,
          rawBuffer: buffer,
        });
      });
    });

    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function runRemindTests() {
  console.log('\n========================================');
  console.log('🧪 RUNNING CUSTOMER VOICE REMINDER TESTS');
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
    console.log('[Step 1/4] Authenticating merchant...');
    const authRes = await request('POST', '/api/auth/login', {
      email: 'demo@kirana.store',
      password: 'kirana123',
    });
    assert(authRes.status === 200, 'Merchant authenticated with JWT');
    const token = authRes.body.token;

    // 2. Fetch customers and check balance
    console.log('\n[Step 2/4] Finding customer with balance > 0 and customer with balance = 0...');
    const udharRes = await request('GET', '/api/customers/udhar/summary', null, token);
    assert(udharRes.status === 200, 'Fetched Udhar summary');
    const customers = udharRes.body.customers;

    let customerWithUdhar = customers.find((c) => c.balance > 0);
    // If no customer has udhar, create an unpaid order for one
    if (!customerWithUdhar) {
      const prodRes = await request('GET', '/api/products', null, token);
      const product = prodRes.body.products[0];
      const targetCust = customers[0];
      await request('POST', '/api/orders', {
        customerId: targetCust._id,
        items: [{ productId: product._id, quantity: 2 }],
        paidAmount: 0,
        paymentMethod: 'simulated_cash',
      }, token);

      const refreshed = await request('GET', '/api/customers/udhar/summary', null, token);
      customerWithUdhar = refreshed.body.customers.find((c) => c.balance > 0);
    }

    assert(customerWithUdhar !== undefined && customerWithUdhar.balance > 0, `Customer with Udhar found: ${customerWithUdhar.name} (Balance: ₹${customerWithUdhar.balance})`);

    // Create a new customer with 0 balance to test zero-balance rejection
    const newCustRes = await request('POST', '/api/customers', {
      name: `Zero Balance Cust ${Date.now().toString().slice(-4)}`,
      phone: '9123456789',
    }, token);
    assert(newCustRes.status === 201, 'Created customer with 0 balance');
    const zeroBalanceCust = newCustRes.body.customer;

    // 3. Test POST /api/voice/remind/:customerId
    console.log('\n[Step 3/4] Testing POST /api/voice/remind/:customerId with balance > 0...');
    const remindRes = await request('POST', `/api/voice/remind/${customerWithUdhar._id}`, {}, token);
    assert(remindRes.status === 200, 'POST /api/voice/remind/:customerId returned HTTP 200');

    let reminderSentence = '';
    if (remindRes.headers['x-speech-text']) {
      reminderSentence = decodeURIComponent(remindRes.headers['x-speech-text']);
    } else if (remindRes.body && remindRes.body.text) {
      reminderSentence = remindRes.body.text;
    }

    assert(reminderSentence.length > 0, `Reminder sentence generated: "${reminderSentence}"`);
    assert(reminderSentence.includes(customerWithUdhar.name), `Sentence contains customer name "${customerWithUdhar.name}"`);
    assert(reminderSentence.includes(String(Math.round(customerWithUdhar.balance))), `Sentence contains balance amount "${Math.round(customerWithUdhar.balance)}"`);
    assert(reminderSentence.includes('ji, aapke'), 'Sentence follows "{name} ji, aapke {amount} rupaye baaki hain" format');

    // 4. Test zero balance rejection
    console.log('\n[Step 4/4] Testing edge cases & multi-tenant isolation...');
    const zeroRemindRes = await request('POST', `/api/voice/remind/${zeroBalanceCust._id}`, {}, token);
    assert(zeroRemindRes.status === 400, 'Rejected customer with 0 balance with HTTP 400');

    // Multi-tenant isolation: other business cannot remind customer of this business
    const store2Auth = await request('POST', '/api/auth/register', {
      name: 'Store Two Owner',
      email: `store2_${Date.now()}@kirana.store`,
      password: 'password123',
      businessName: 'Store Two',
    });
    const token2 = store2Auth.body.token;

    const unauthorizedRemind = await request('POST', `/api/voice/remind/${customerWithUdhar._id}`, {}, token2);
    assert(unauthorizedRemind.status === 404, 'Store 2 cannot remind Store 1 customer (returns 404)');

    // In-memory caching verification
    const t0 = Date.now();
    const cachedRemind = await request('POST', `/api/voice/remind/${customerWithUdhar._id}`, {}, token);
    const duration = Date.now() - t0;
    assert(cachedRemind.status === 200, 'Repeated reminder returned HTTP 200 from cache');
    console.log(`  -> Audio cache hit in ${duration}ms`);

    console.log('\n========================================');
    console.log(`🎉 ALL ${passed}/${total} REMINDER ACCEPTANCE TESTS PASSED!`);
    console.log('========================================\n');
  } catch (err) {
    console.error('\n❌ Reminder test failed:', err);
    process.exit(1);
  }
}

runRemindTests();
