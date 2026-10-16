import mongoose from 'mongoose';

const hallSchema = new mongoose.Schema(
  {
    venueId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Venue',
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    screenType: {
      type: String,
      enum: ['Standard', 'IMAX', 'Dolby Cinema', '4DX', 'Open Air', 'Theatre Stage'],
      default: 'Standard',
    },
    capacity: {
      type: Number,
      default: 0,
    },
    totalRows: {
      type: Number,
      default: 0,
    },
    activeLayoutId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'HallLayout',
    },
    status: {
      type: String,
      enum: ['active', 'maintenance', 'inactive'],
      default: 'active',
    },
  },
  {
    timestamps: true,
  }
);

export const Hall = mongoose.model('Hall', hallSchema);
