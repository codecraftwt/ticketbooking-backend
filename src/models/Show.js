import mongoose from 'mongoose';

const tierPriceSchema = new mongoose.Schema(
  {
    tier: {
      type: String,
      required: true,
      enum: ['VIP', 'Premium', 'Standard', 'Recliner', 'Balcony'],
    },
    price: {
      type: Number,
      required: true,
      min: 0,
    },
  },
  { _id: false }
);

const showSchema = new mongoose.Schema(
  {
    eventId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Event',
      required: true,
      index: true,
    },
    venueId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Venue',
      required: true,
      index: true,
    },
    hallId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Hall',
      required: true,
      index: true,
    },
    // Versioned layout snapshot: protects show if hall template changes later
    layoutSnapshotId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'HallLayout',
      required: true,
    },
    startTime: {
      type: Date,
      required: true,
      index: true,
    },
    endTime: {
      type: Date,
      required: true,
      index: true,
    },
    pricing: [tierPriceSchema],
    bookingOpensAt: {
      type: Date,
    },
    bookingClosesAt: {
      type: Date,
    },
    totalSeats: {
      type: Number,
      default: 0,
    },
    bookedSeatsCount: {
      type: Number,
      default: 0,
    },
    status: {
      type: String,
      enum: ['Scheduled', 'Open', 'SoldOut', 'Completed', 'Cancelled'],
      default: 'Scheduled',
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

// Compound index to prevent double-booking the hall during overlapping times
showSchema.index({ hallId: 1, startTime: 1, endTime: 1 });

export const Show = mongoose.model('Show', showSchema);
