const mongoose = require('mongoose');

const customerSchema = new mongoose.Schema(
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
    phone: {
      type: String,
      required: true,
      trim: true,
    },
  },
  {
    timestamps: true,
  }
);

// Compound index for unique customer per business
customerSchema.index({ businessId: 1, phone: 1 });

module.exports = mongoose.model('Customer', customerSchema);
