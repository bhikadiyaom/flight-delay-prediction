import mongoose from 'mongoose';

const predictionLogSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    source: { type: String, enum: ['manual', 'live', 'bulk'], required: true },
    input: { type: mongoose.Schema.Types.Mixed, required: true },
    output: {
      delayProbability: Number,
      cancelProbability: Number,
      predictedDelayMinutes: { type: Number, default: null },
      riskLevel: { type: String, enum: ['low', 'medium', 'high'] },
      modelVersion: String,
    },
    actual: {
      wasDelayed: Boolean,
      delayMinutes: Number,
      resolvedAt: Date,
    },
    cached: { type: Boolean, default: false }, // served from the 10-minute prediction cache (extension)
    latencyMs: Number,
  },
  { timestamps: true }
);

predictionLogSchema.index({ createdAt: -1 });
predictionLogSchema.index({ 'output.modelVersion': 1 });

export const PredictionLog = mongoose.model('PredictionLog', predictionLogSchema);
