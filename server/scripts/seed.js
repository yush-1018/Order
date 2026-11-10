require('dotenv').config({ path: __dirname + '/../.env' });
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');
const User = require('../models/User');
const Product = require('../models/Product');
const Customer = require('../models/Customer');

/**
 * Synthetic Kirana Catalogue
 * Loaded from server/seed/products.seed.json
 */
function loadSeedProducts() {
  const seedFilePath = path.resolve(__dirname, '../seed/products.seed.json');
  if (fs.existsSync(seedFilePath)) {
    try {
      const data = JSON.parse(fs.readFileSync(seedFilePath, 'utf8'));
      return data;
    } catch (err) {
      console.error('[Seed Error] Failed to parse products.seed.json:', err.message);
    }
  }
  return [];
}

const SYNTHETIC_CUSTOMERS = [
  { name: 'Ramesh Kumar', phone: '9876543210' },
  { name: 'Sunita Sharma', phone: '9123456780' },
  { name: 'Rajesh Verma', phone: '9988776655' },
];

/**
 * Idempotent Seed Function
 * - Reads product definition from server/seed/products.seed.json
 * - Running it twice or repeatedly will NOT duplicate products or customers
 * - Uses upsert based on (businessId, name) for products and (businessId, phone) for customers
 */
async function seedData(targetBusinessId = null) {
  try {
    const mongoUri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/orderpay';
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(mongoUri);
    }

    let businessId = targetBusinessId;

    if (!businessId) {
      // Find or create a default demo user
      let demoUser = await User.findOne({ email: 'demo@kirana.store' });
      if (!demoUser) {
        const salt = await bcrypt.genSalt(10);
        const passwordHash = await bcrypt.hash('kirana123', salt);
        const newBusinessId = new mongoose.Types.ObjectId();

        demoUser = await User.create({
          businessId: newBusinessId,
          businessName: 'Sharma General Kirana Store',
          businessType: 'kirana',
          name: 'Sharma Ji',
          email: 'demo@kirana.store',
          passwordHash,
          role: 'owner',
        });
        console.log(`[Seed] Created default demo user: demo@kirana.store / kirana123`);
      }
      businessId = demoUser.businessId;
    }

    const syntheticProducts = loadSeedProducts();

    // Idempotent upsert of products (matching on businessId + name)
    const productPromises = syntheticProducts.map((prod) => {
      const mrp = prod.mrp !== undefined && prod.mrp !== null ? Number(prod.mrp) : Number(prod.price);
      const price = Number(prod.price);

      return Product.findOneAndUpdate(
        { businessId, name: prod.name },
        {
          $set: {
            businessId,
            name: prod.name,
            category: prod.category,
            aliases: (prod.aliases || []).map((a) => a.trim().toLowerCase()),
            mrp,
            price,
            stock: prod.stock !== undefined ? Number(prod.stock) : 50,
            unit: prod.unit || 'piece',
            active: prod.active !== false,
          },
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
    });

    const upsertedProducts = await Promise.all(productPromises);
    console.log(`[Seed] Idempotently synced ${upsertedProducts.length} synthetic kirana products from products.seed.json.`);

    // Clean up any old products not in products.seed.json
    const validNames = syntheticProducts.map((p) => p.name);
    await Product.deleteMany({
      businessId,
      name: { $nin: validNames },
    });

    // Idempotent upsert of customers (matching on businessId + phone)
    const customerPromises = SYNTHETIC_CUSTOMERS.map((cust) =>
      Customer.findOneAndUpdate(
        { businessId, phone: cust.phone },
        {
          $set: {
            businessId,
            name: cust.name.trim(),
            phone: cust.phone.trim(),
          },
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      )
    );

    const upsertedCustomers = await Promise.all(customerPromises);
    console.log(`[Seed] Idempotently synced ${upsertedCustomers.length} synthetic customers.`);

    return {
      businessId,
      productsCount: upsertedProducts.length,
      customersCount: upsertedCustomers.length,
    };
  } catch (error) {
    console.error('[Seed Error]:', error);
    throw error;
  }
}

if (require.main === module) {
  seedData()
    .then((res) => {
      console.log('[Seed Completed Successfully]', res);
      process.exit(0);
    })
    .catch((err) => {
      console.error('[Seed Failed]', err);
      process.exit(1);
    });
}

module.exports = seedData;
module.exports.seedData = seedData;
module.exports.SYNTHETIC_CUSTOMERS = SYNTHETIC_CUSTOMERS;
