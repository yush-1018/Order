const Product = require('../models/Product');

// Get all products for the authenticated merchant's business
exports.getProducts = async (req, res) => {
  try {
    const { search, active } = req.query;
    const filter = { businessId: req.businessId };

    if (active !== undefined) {
      filter.active = active === 'true';
    }

    if (search && search.trim()) {
      const searchRegex = new RegExp(search.trim(), 'i');
      filter.$or = [
        { name: searchRegex },
        { category: searchRegex },
        { aliases: searchRegex },
      ];
    }

    const products = await Product.find(filter).sort({ name: 1 });
    return res.status(200).json({ success: true, count: products.length, products });
  } catch (error) {
    console.error('[Product Error - getProducts]:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch products.' });
  }
};

// Get single product by id scoped to businessId
exports.getProductById = async (req, res) => {
  try {
    const product = await Product.findOne({ _id: req.params.id, businessId: req.businessId });
    if (!product) {
      return res.status(404).json({ success: false, message: 'Product not found.' });
    }
    return res.status(200).json({ success: true, product });
  } catch (error) {
    console.error('[Product Error - getProductById]:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch product.' });
  }
};

// Create a new product for the business
exports.createProduct = async (req, res) => {
  try {
    const { name, category, aliases, mrp, price, stock, unit, active } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, message: 'Product name is required.' });
    }

    const numMrp = Number(mrp);
    if (mrp === undefined || mrp === null || isNaN(numMrp) || numMrp <= 0) {
      return res.status(400).json({ success: false, message: 'MRP must be greater than 0.' });
    }

    const numPrice = Number(price);
    if (price === undefined || price === null || isNaN(numPrice) || numPrice <= 0) {
      return res.status(400).json({ success: false, message: 'Selling price must be greater than 0.' });
    }

    if (numPrice > numMrp) {
      return res.status(400).json({ success: false, message: 'Selling price cannot exceed MRP.' });
    }

    // Process aliases: accept array or comma-separated string
    let parsedAliases = [];
    if (Array.isArray(aliases)) {
      parsedAliases = aliases.map(a => String(a).trim().toLowerCase()).filter(Boolean);
    } else if (typeof aliases === 'string') {
      parsedAliases = aliases.split(',').map(a => a.trim().toLowerCase()).filter(Boolean);
    }

    const product = await Product.create({
      businessId: req.businessId, // strictly from JWT
      name: name.trim(),
      category: category ? category.trim().toLowerCase() : 'general',
      aliases: parsedAliases,
      mrp: numMrp,
      price: numPrice,
      stock: stock !== undefined ? Math.max(0, Number(stock)) : 0,
      unit: unit ? unit.trim().toLowerCase() : 'piece',
      active: active !== undefined ? Boolean(active) : true,
    });

    return res.status(201).json({ success: true, product });
  } catch (error) {
    console.error('[Product Error - createProduct]:', error);
    return res.status(500).json({ success: false, message: error.message || 'Failed to create product.' });
  }
};

// Update an existing product (strictly scoped to businessId)
exports.updateProduct = async (req, res) => {
  try {
    const { name, category, aliases, mrp, price, stock, unit, active } = req.body;

    const existing = await Product.findOne({ _id: req.params.id, businessId: req.businessId });
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Product not found or unauthorized.' });
    }

    const updateData = {};
    if (name !== undefined) updateData.name = name.trim();
    if (category !== undefined) updateData.category = category.trim().toLowerCase();
    if (stock !== undefined) updateData.stock = Math.max(0, Number(stock));
    if (unit !== undefined) updateData.unit = unit.trim().toLowerCase();
    if (active !== undefined) updateData.active = Boolean(active);

    const targetMrp = mrp !== undefined ? Number(mrp) : (existing.mrp || existing.price);
    const targetPrice = price !== undefined ? Number(price) : existing.price;

    if (mrp !== undefined || price !== undefined) {
      if (isNaN(targetMrp) || targetMrp <= 0) {
        return res.status(400).json({ success: false, message: 'MRP must be greater than 0.' });
      }
      if (isNaN(targetPrice) || targetPrice <= 0) {
        return res.status(400).json({ success: false, message: 'Selling price must be greater than 0.' });
      }
      if (targetPrice > targetMrp) {
        return res.status(400).json({ success: false, message: 'Selling price cannot exceed MRP.' });
      }
      updateData.mrp = targetMrp;
      updateData.price = targetPrice;
    }

    if (aliases !== undefined) {
      if (Array.isArray(aliases)) {
        updateData.aliases = aliases.map(a => String(a).trim().toLowerCase()).filter(Boolean);
      } else if (typeof aliases === 'string') {
        updateData.aliases = aliases.split(',').map(a => a.trim().toLowerCase()).filter(Boolean);
      }
    }

    const product = await Product.findOneAndUpdate(
      { _id: req.params.id, businessId: req.businessId },
      { $set: updateData },
      { new: true, runValidators: true }
    );

    return res.status(200).json({ success: true, product });
  } catch (error) {
    console.error('[Product Error - updateProduct]:', error);
    return res.status(500).json({ success: false, message: error.message || 'Failed to update product.' });
  }
};

// Delete a product (strictly scoped to businessId)
exports.deleteProduct = async (req, res) => {
  try {
    const product = await Product.findOneAndDelete({ _id: req.params.id, businessId: req.businessId });
    if (!product) {
      return res.status(404).json({ success: false, message: 'Product not found or unauthorized.' });
    }
    return res.status(200).json({ success: true, message: 'Product deleted successfully.' });
  } catch (error) {
    console.error('[Product Error - deleteProduct]:', error);
    return res.status(500).json({ success: false, message: 'Failed to delete product.' });
  }
};

// Alias learning: when merchant maps heard text to a product, save in aliases (deduplicated, lowercase)
exports.learnAlias = async (req, res) => {
  try {
    const { alias } = req.body;
    if (!alias || typeof alias !== 'string' || !alias.trim()) {
      return res.status(400).json({ success: false, message: 'Valid alias text is required.' });
    }

    const cleanAlias = alias.trim().toLowerCase();
    const product = await Product.findOne({ _id: req.params.id, businessId: req.businessId });

    if (!product) {
      return res.status(404).json({ success: false, message: 'Product not found.' });
    }

    if (!product.aliases.includes(cleanAlias)) {
      product.aliases.push(cleanAlias);
      await product.save();
    }

    return res.status(200).json({
      success: true,
      message: `Learned new alias "${cleanAlias}" for product "${product.name}".`,
      product,
    });
  } catch (error) {
    console.error('[Product Error - learnAlias]:', error);
    return res.status(500).json({ success: false, message: 'Failed to learn alias.' });
  }
};
