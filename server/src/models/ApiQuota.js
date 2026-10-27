import mongoose from 'mongoose';

const schema = new mongoose.Schema(
  {
    provider: { type: String, enum: ['aviationstack'], required: true },
    month: { type: String, required: true, match: /^\d{4}-\d{2}$/ }, // YYYY-MM (UTC)
    used: { type: Number, default: 0, min: 0 },
    limit: { type: Number, required: true },
  },
  { timestamps: true }
);

schema.index({ provider: 1, month: 1 }, { unique: true });

export const ApiQuota = mongoose.model('ApiQuota', schema);
