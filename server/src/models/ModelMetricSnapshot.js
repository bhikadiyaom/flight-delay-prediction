import mongoose from 'mongoose';

const schema = new mongoose.Schema(
  {
    modelName: { type: String, enum: ['logreg', 'random_forest', 'xgboost', 'neural_net'], required: true },
    task: { type: String, enum: ['classifier', 'regressor'], required: true },
    target: { type: String, default: null }, // delay | cancel | delay_minutes (extension: xgboost has two classifiers)
    version: { type: String, required: true },
    isProduction: { type: Boolean, default: false },
    metrics: {
      accuracy: Number, precision: Number, recall: Number, f1: Number, rocAuc: Number, prAuc: Number, brier: Number,
      mae: Number, rmse: Number, r2: Number,
    },
    perClass: mongoose.Schema.Types.Mixed,
    confusionMatrix: mongoose.Schema.Types.Mixed,
    threshold: Number,
    trainedAt: Date,
  },
  { timestamps: true }
);

schema.index({ modelName: 1, task: 1, target: 1, version: 1 }, { unique: true });

export const ModelMetricSnapshot = mongoose.model('ModelMetricSnapshot', schema);
