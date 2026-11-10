const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema(
  {
    businessId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    orderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Order',
      index: true,
    },
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Customer',
      required: true,
      index: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 0.01,
    },
    method: {
      type: String,
      enum: ['simulated_upi', 'simulated_cash'],
      default: 'simulated_cash',
    },
    status: {
      type: String,
      enum: ['confirmed'],
      default: 'confirmed',
    },
    idempotencyKey: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    isSimulated: {
      type: Boolean,
      default: true,
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

paymentSchema.index({ businessId: 1, createdAt: -1 });

module.exports = mongoose.model('Payment', paymentSchema);
