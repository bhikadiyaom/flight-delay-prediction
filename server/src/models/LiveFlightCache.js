import mongoose from 'mongoose';

/**
 * Mongo cache for flight / weather / prediction / analytics payloads (Decision 3).
 *
 * Two timestamps on purpose: `freshUntil` is the logical TTL (5 / 30 / 10 min / 24 h by kind). `expiresAt` is the
 * PHYSICAL deletion time for the TTL index (expireAfterSeconds 0) = freshUntil + a stale grace window. Stale-if-error
 * needs expired-but-present entries, which a TTL index on freshUntil would delete within a minute.
 */
const schema = new mongoose.Schema({
  key: { type: String, required: true, unique: true },
  kind: { type: String, enum: ['flight', 'weather', 'prediction', 'analytics'], required: true, index: true },
  payload: { type: mongoose.Schema.Types.Mixed, required: true },
  fetchedAt: { type: Date, required: true },
  freshUntil: { type: Date, required: true },
  expiresAt: { type: Date, required: true, index: { expireAfterSeconds: 0 } },
});

export const LiveFlightCache = mongoose.model('LiveFlightCache', schema);
