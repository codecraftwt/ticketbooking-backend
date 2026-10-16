import mongoose from 'mongoose';

const seatSchema = new mongoose.Schema(
  {
    id: { type: String, required: true }, // e.g. "A1", "sec1-B4"
    rowLabel: { type: String, required: true }, // "A", "B", etc.
    seatNumber: { type: Number, required: true }, // 1, 2, 3...
    tier: {
      type: String,
      enum: ['VIP', 'Premium', 'Standard', 'Recliner', 'Balcony'],
      default: 'Standard',
    },
    sectionId: { type: String, default: 'main' },
    x: { type: Number, required: true }, // canvas coordinate
    y: { type: Number, required: true }, // canvas coordinate
    isAccessible: { type: Boolean, default: false }, // wheelchair space
    isBlocked: { type: Boolean, default: false }, // obstructed/pillar
    isActive: { type: Boolean, default: true },
  },
  { _id: false }
);

const sectionSchema = new mongoose.Schema(
  {
    id: { type: String, required: true },
    name: { type: String, required: true },
    color: { type: String, default: '#6366f1' },
    defaultTier: { type: String, default: 'Standard' },
    basePriceMultiplier: { type: Number, default: 1.0 },
  },
  { _id: false }
);

const hallLayoutSchema = new mongoose.Schema(
  {
    hallId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Hall',
      required: true,
      index: true,
    },
    version: {
      type: Number,
      default: 1,
    },
    isPublished: {
      type: Boolean,
      default: false,
    },
    canvasWidth: {
      type: Number,
      default: 1000,
    },
    canvasHeight: {
      type: Number,
      default: 700,
    },
    stage: {
      label: { type: String, default: 'SCREEN / STAGE' },
      position: { type: String, enum: ['top', 'bottom', 'center'], default: 'top' },
      width: { type: Number, default: 600 },
      yOffset: { type: Number, default: 40 },
    },
    sections: [sectionSchema],
    seats: [seatSchema],
    totalSeats: {
      type: Number,
      default: 0,
    },
    accessibleSeatsCount: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
  }
);

export const HallLayout = mongoose.model('HallLayout', hallLayoutSchema);
