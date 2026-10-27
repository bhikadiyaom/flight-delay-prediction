import mongoose from 'mongoose';

const savedSearchSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    type: { type: String, enum: ['route', 'flight', 'airport'], required: true },
    label: { type: String, required: true, trim: true, maxlength: 80 },
    origin: { type: String, uppercase: true, trim: true },
    destination: { type: String, uppercase: true, trim: true },
    airline: { type: String, trim: true, maxlength: 60 },
    flightNumber: { type: String, uppercase: true, trim: true },
    isFavorite: { type: Boolean, default: false },
    alert: {
      enabled: { type: Boolean, default: false },
      threshold: { type: Number, default: 0.5, min: 0.05, max: 0.95 },
      lastRiskLevel: { type: String, enum: ['low', 'medium', 'high', null], default: null },
      lastNotifiedAt: Date,
    },
  },
  { timestamps: true }
);

savedSearchSchema.index({ user: 1, type: 1 });

export const SavedSearch = mongoose.model('SavedSearch', savedSearchSchema);
