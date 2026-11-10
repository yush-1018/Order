require('dotenv').config({ path: __dirname + '/../.env' });
const mongoose = require('mongoose');
const http = require('http');

let serverInstance;
let baseUrl = '';

// Helper to make JSON HTTP requests
function request(method, path, body = null, token = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, baseUrl);
    const headers = { 'Content-Type': 'application/json' };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const req = http.request(
      url,
      {
        method,
        headers,
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          let parsed;
          try {
            parsed = JSON.parse(data);
          } catch (e) {
            parsed = data;
          }
          resolve({ status: res.statusCode, body: parsed });
        });
      }
    );

    req.on('error', reject);
    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

async function runPhase1Checks() {
  console.log('\n========================================');
  console.log('🚀 RUNNING PHASE 1 ACCEPTANCE CHECKS');
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

  const testDbUri = 'mongodb://127.0.0.1:27017/orderpay_phase1_test';

  try {
    // 1. Connect to MongoDB
    console.log('[Step 1/6] Connecting to MongoDB Test Database...');
    await mongoose.connect(testDbUri);
    // Drop test database to ensure completely fresh run
    await mongoose.connection.dropDatabase();
    console.log('  -> Mongo connected & clean test DB ready at:', testDbUri);

    // Start Express app on ephemeral test port
    process.env.NODE_ENV = 'test';
    const app = require('../server');
    serverInstance = app.listen(0);
    const port = serverInstance.address().port;
    baseUrl = `http://127.0.0.1:${port}`;
    console.log(`  -> Test server listening on ${baseUrl}\n`);

    // 2. Health check test
    console.log('[Step 2/6] Testing Server Health Check...');
    const health = await request('GET', '/api/health');
    assert(health.status === 200 && health.body.status === 'ok', 'GET /api/health returns 200 ok');

    // 3. User A: Register & Login
    console.log('\n[Step 3/6] Testing User A Registration & Login...');
    const regResA = await request('POST', '/api/auth/register', {
      name: 'Sharma Ji',
      email: 'sharma@kirana.store',
      password: 'password123',
      businessName: 'Sharma General Kirana',
      businessType: 'kirana',
    });
    assert(regResA.status === 201, 'User A registered with HTTP 201');
    assert(regResA.body.token && regResA.body.user.businessId, 'User A has JWT token and businessId');
    const tokenA = regResA.body.token;
    const businessIdA = regResA.body.user.businessId;

    const loginResA = await request('POST', '/api/auth/login', {
      email: 'sharma@kirana.store',
      password: 'password123',
    });
    assert(loginResA.status === 200 && loginResA.body.token, 'User A logged in successfully with HTTP 200');

    // 4. User A creates products and customers
    console.log('\n[Step 4/6] Testing User A Product & Customer CRUD...');
    const prodA1 = await request(
      'POST',
      '/api/products',
      {
        name: 'Aashirvaad Atta 5kg',
        category: 'atta',
        aliases: ['atta', 'ashirvad'],
        price: 300,
        stock: 50,
        unit: 'packet',
      },
      tokenA
    );
    assert(prodA1.status === 201, 'User A created Product 1 (Atta 5kg, ₹300)');
    assert(prodA1.body.product.category === 'atta', 'Product 1 has category "atta"');

    const prodA2 = await request(
      'POST',
      '/api/products',
      {
        name: 'Fortune Sunflower Oil 1L',
        category: 'tel',
        aliases: ['tel', 'fortune tel'],
        price: 140,
        stock: 40,
        unit: 'litre',
      },
      tokenA
    );
    assert(prodA2.status === 201, 'User A created Product 2 (Fortune Oil, ₹140)');
    assert(prodA2.body.product.category === 'tel', 'Product 2 has category "tel"');

    const custA = await request(
      'POST',
      '/api/customers',
      {
        name: 'Ramesh Kumar',
        phone: '9876543210',
      },
      tokenA
    );
    assert(custA.status === 201, 'User A created synthetic Customer (Ramesh Kumar)');

    // 5. User B: Register, and verify multi-tenant businessId isolation
    console.log('\n[Step 5/6] Testing User B & Multi-Tenant Business Isolation (Check requirement)...');
    const regResB = await request('POST', '/api/auth/register', {
      name: 'Verma Ji',
      email: 'verma@kirana.store',
      password: 'password456',
      businessName: 'Verma Provision Store',
      businessType: 'kirana',
    });
    assert(regResB.status === 201, 'User B registered with HTTP 201');
    const tokenB = regResB.body.token;
    const businessIdB = regResB.body.user.businessId;
    assert(businessIdA !== businessIdB, 'User A and User B have separate unique businessIds');

    // User B adds their own product
    const prodB = await request(
      'POST',
      '/api/products',
      {
        name: 'Tata Salt 1kg',
        aliases: ['namak', 'tata namak'],
        price: 28,
        stock: 100,
        unit: 'packet',
      },
      tokenB
    );
    assert(prodB.status === 201, 'User B created Product (Tata Salt)');

    // ISOLATION VERIFICATION 1: User B calls GET /api/products -> should only see User B's products!
    const listB = await request('GET', '/api/products', null, tokenB);
    assert(listB.status === 200, 'User B fetched product list');
    assert(listB.body.products.length === 1, 'User B sees exactly 1 product');
    assert(listB.body.products[0].name === 'Tata Salt 1kg', 'User B sees Tata Salt');
    const hasUserAProductsInB = listB.body.products.some(
      (p) => p.name === 'Aashirvaad Atta 5kg' || p.name === 'Fortune Sunflower Oil 1L'
    );
    assert(!hasUserAProductsInB, 'SECURITY CHECK: User B CANNOT see User A products!');

    // ISOLATION VERIFICATION 2: User A calls GET /api/products -> should only see User A's 2 products!
    const listA = await request('GET', '/api/products', null, tokenA);
    assert(listA.status === 200, 'User A fetched product list');
    assert(listA.body.products.length === 2, 'User A sees exactly 2 products');
    const hasUserBProductInA = listA.body.products.some((p) => p.name === 'Tata Salt 1kg');
    assert(!hasUserBProductInA, 'SECURITY CHECK: User A CANNOT see User B products!');

    // 6. Test Seed Script
    console.log('\n[Step 6/6] Testing Seed Script (15 Kirana Products + 3 Customers)...');
    const seedData = require('../scripts/seed');
    const seedResult = await seedData(businessIdA);
    assert(seedResult.productsCount === 15, 'Seed script populated 15 synthetic kirana products');
    assert(seedResult.customersCount === 3, 'Seed script populated 3 synthetic customers');

    console.log('\n========================================');
    console.log(`🎉 ALL ${passedTests}/${totalTests} PHASE 1 ACCEPTANCE CHECKS PASSED!`);
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

runPhase1Checks();
