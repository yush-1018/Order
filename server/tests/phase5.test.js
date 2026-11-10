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

async function runPhase5Tests() {
  console.log('\n========================================');
  console.log('🧪 RUNNING PHASE 5 MINIMAL (TIMBRE VOICE) ACCEPTANCE TESTS');
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
    console.log('[Step 1/5] Authenticating merchant...');
    const authRes = await request('POST', '/api/auth/login', {
      email: 'demo@kirana.store',
      password: 'kirana123',
    });
    assert(authRes.status === 200, 'Merchant authenticated with JWT');
    const token = authRes.body.token;

    // 2. Fetch customer & product
    console.log('\n[Step 2/5] Fetching customer & catalogue products...');
    const custRes = await request('GET', '/api/customers', null, token);
    assert(custRes.status === 200 && custRes.body.customers.length > 0, 'Customer fetched');
    const customer = custRes.body.customers[0];

    const prodRes = await request('GET', '/api/products', null, token);
    assert(prodRes.status === 200 && prodRes.body.products.length > 0, 'Product fetched');
    const product = prodRes.body.products[0];

    // 3. Create a partial order to test dynamic Hindi synthesis
    console.log('\n[Step 3/5] Creating a test order with partial payment...');
    const orderItems = [{ productId: product._id, quantity: 2 }];
    const preview = await request('POST', '/api/orders/preview', { items: orderItems }, token);
    const orderTotal = preview.body.total;
    const paidAmount = Math.floor(orderTotal / 2);
    const remaining = Math.round((orderTotal - paidAmount) * 100) / 100;

    const orderRes = await request('POST', '/api/orders', {
      customerId: customer._id,
      items: orderItems,
      paidAmount,
      paymentMethod: 'simulated_cash',
    }, token);

    assert(orderRes.status === 201, 'Order created successfully');
    const orderId = orderRes.body.order._id;

    // 4. Test POST /api/voice/speak with orderId
    console.log('\n[Step 4/5] Testing POST /api/voice/speak with orderId...');
    const speakRes = await request('POST', '/api/voice/speak', { orderId }, token);

    assert(speakRes.status === 200, 'POST /api/voice/speak returned HTTP 200');

    // Check sentence text
    let sentenceText = '';
    if (speakRes.headers['x-speech-text']) {
      sentenceText = decodeURIComponent(speakRes.headers['x-speech-text']);
    } else if (speakRes.body && speakRes.body.text) {
      sentenceText = speakRes.body.text;
    }

    assert(sentenceText.length > 0, `Spoken sentence generated: "${sentenceText}"`);
    assert(sentenceText.includes(String(Math.round(orderTotal))), `Sentence includes total amount (${Math.round(orderTotal)})`);
    assert(sentenceText.includes(String(Math.round(paidAmount))), `Sentence includes paid amount (${Math.round(paidAmount)})`);
    assert(sentenceText.includes(String(Math.round(remaining))), `Sentence includes remaining amount (${Math.round(remaining)})`);
    assert(sentenceText.includes('rupaye'), 'Sentence is in conversational Hindi with "rupaye"');

    // 5. Test in-memory cache by sentence text
    console.log('\n[Step 5/5] Testing in-memory audio caching & multi-tenant isolation...');
    const startTime = Date.now();
    const speakResCached = await request('POST', '/api/voice/speak', { orderId }, token);
    const cachedDuration = Date.now() - startTime;
    assert(speakResCached.status === 200, 'Repeated TTS request returned HTTP 200');
    console.log(`  -> Cached response returned in ${cachedDuration}ms`);

    // Multi-tenant check: other business cannot access this order's TTS
    const store2Auth = await request('POST', '/api/auth/register', {
      name: 'Other Merchant',
      email: `other_${Date.now()}@kirana.store`,
      password: 'password123',
      businessName: 'Other Store',
    });
    const token2 = store2Auth.body.token;
    const unauthorizedSpeak = await request('POST', '/api/voice/speak', { orderId }, token2);
    assert(unauthorizedSpeak.status === 404, 'Other merchant cannot access audio for this order (returns 404)');

    console.log('\n========================================');
    console.log(`🎉 ALL ${passed}/${total} PHASE 5 MINIMAL TESTS PASSED!`);
    console.log('========================================\n');
  } catch (err) {
    console.error('\n❌ Test failed:', err);
    process.exit(1);
  }
}

runPhase5Tests();
