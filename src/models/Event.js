import mongoose from 'mongoose';

const eventSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
    },
    slug: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
      index: true,
    },
    category: {
      type: String,
      enum: ['Movie', 'Concert', 'Theatre', 'Comedy', 'Sports', 'Function', 'Festival'],
      required: true,
    },
    genre: {
      type: String,
      trim: true,
    },
    description: {
      type: String,
      required: true,
    },
    posterImage: {
      type: String,
      default: 'https://images.unsplash.com/photo-1534447677768-be436bb09401?w=800&auto=format&fit=crop&q=80',
    },
    bannerImage: {
      type: String,
      default: 'https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?w=1600&auto=format&fit=crop&q=80',
    },
    durationMinutes: {
      type: Number,
      required: true,
      default: 120,
    },
    language: {
      type: String,
      default: 'English',
    },
    ageRating: {
      type: String,
      enum: ['G', 'PG', 'PG-13', 'R', 'NC-17', 'U', 'UA', 'A'],
      default: 'UA',
    },
    cancellationPolicy: {
      type: String,
      default: 'Free cancellation up to 4 hours before showtime. 100% refund processed to original payment method.',
    },
    status: {
      type: String,
      enum: ['Draft', 'Published', 'Archived'],
      default: 'Draft',
      index: true,
    },
    publishedAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
  }
);

export const Event = mongoose.model('Event', eventSchema);
