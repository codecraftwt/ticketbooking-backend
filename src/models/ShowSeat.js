import mongoose from 'mongoose';

const showSeatSchema = new mongoose.Schema(
  {
    showId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Show',
      required: true,
      index: true,
    },
    seatId: {
      type: String, // e.g. "A1", "B4"
      required: true,
    },
    rowLabel: {
      type: String,
      required: true,
    },
    seatNumber: {
      type: Number,
      required: true,
    },
    tier: {
      type: String,
      required: true,
      enum: ['VIP', 'Premium', 'Standard', 'Recliner', 'Balcony'],
    },
    price: {
      type: Number,
      required: true,
    },
    x: { type: Number, required: true },
    y: { type: Number, required: true },
    isAccessible: { type: Boolean, default: false },
    isBlocked: { type: Boolean, default: false },
    status: {
      type: String,
      enum: ['AVAILABLE', 'HELD', 'BOOKED', 'BLOCKED'],
      default: 'AVAILABLE',
      index: true,
    },
    currentHoldId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'SeatHold',
    },
    bookingId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Booking',
    },
  },
  {
    timestamps: true,
  }
);

// Compound unique index ensuring no duplicate seatId in the same show
showSeatSchema.index({ showId: 1, seatId: 1 }, { unique: true });
showSeatSchema.index({ showId: 1, status: 1 });

export const ShowSeat = mongoose.model('ShowSeat', showSeatSchema);
