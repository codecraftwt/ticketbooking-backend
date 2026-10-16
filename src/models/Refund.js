import mongoose from 'mongoose';

const refundSchema = new mongoose.Schema(
  {
    bookingId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Booking',
      required: true,
      index: true,
    },
    stripeRefundId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    amount: {
      type: Number,
      required: true,
    },
    currency: {
      type: String,
      default: 'usd',
    },
    reason: {
      type: String,
      enum: ['requested_by_customer', 'duplicate', 'fraudulent', 'cancelled_event', 'other'],
      default: 'requested_by_customer',
    },
    note: {
      type: String,
    },
    status: {
      type: String,
      enum: ['succeeded', 'pending', 'failed'],
      default: 'succeeded',
    },
    processedByAdminId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Admin',
    },
  },
  {
    timestamps: true,
  }
);

export const Refund = mongoose.model('Refund', refundSchema);
