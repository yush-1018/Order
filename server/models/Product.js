const mongoose = require('mongoose');

const productSchema = new mongoose.Schema(
  {
    businessId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    category: {
      type: String,
      default: 'general',
      trim: true,
      lowercase: true,
    },
    aliases: {
      type: [String],
      default: [],
    },
    mrp: {
      type: Number,
      required: [true, 'MRP is required'],
      min: [0.01, 'MRP must be greater than 0'],
    },
    price: {
      type: Number,
      required: [true, 'Selling price is required'],
      min: [0.01, 'Selling price must be greater than 0'],
      validate: {
        validator: function (val) {
          if (this.mrp == null) return true;
          return val <= this.mrp;
        },
        message: 'Selling price cannot exceed MRP',
      },
    },
    stock: {
      type: Number,
      required: true,
      default: 0,
    },
    unit: {
      type: String,
      required: true,
      default: 'piece',
      trim: true,
    },
    active: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

// Index for business scoping and product search
productSchema.index({ businessId: 1, name: 1 });
productSchema.index({ businessId: 1, category: 1 });

module.exports = mongoose.model('Product', productSchema);
