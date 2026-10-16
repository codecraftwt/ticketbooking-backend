import mongoose from 'mongoose';

const seatHoldSchema = new mongoose.Schema(
  {
    showId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Show',
      required: true,
      index: true,
    },
    seatIds: [
      {
        type: String,
        required: true,
      },
    ],
    reservationToken: {
      type: String,
      required: true,
      index: true,
    },
    expiresAt: {
      type: Date,
      required: true,
      index: true,
    },
    guestInfo: {
      name: { type: String, trim: true },
      email: { type: String, trim: true, lowercase: true },
      phone: { type: String, trim: true },
    },
    totalAmount: {
      type: Number,
      required: true,
      min: 0,
    },
    currency: {
      type: String,
      default: 'usd',
    },
    stripePaymentIntentId: {
      type: String,
    },
    status: {
      type: String,
      enum: ['ACTIVE', 'CONVERTED', 'EXPIRED', 'RELEASED'],
      default: 'ACTIVE',
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

export const SeatHold = mongoose.model('SeatHold', seatHoldSchema);
