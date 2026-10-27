import mongoose from 'mongoose';

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, minlength: 2, maxlength: 60 },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true, maxlength: 254 },
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: ['user', 'admin'], default: 'user' },
    preferences: {
      theme: { type: String, enum: ['light', 'dark', 'system'], default: 'system' },
      alertsEnabled: { type: Boolean, default: true },
    },
    lastLoginAt: Date,
  },
  { timestamps: true } // NO refreshTokens (Decision 2)
);

userSchema.methods.toPublic = function toPublic() {
  return {
    id: String(this._id),
    name: this.name,
    email: this.email,
    role: this.role,
    preferences: { theme: this.preferences?.theme ?? 'system', alertsEnabled: this.preferences?.alertsEnabled ?? true },
    lastLoginAt: this.lastLoginAt ?? null,
    createdAt: this.createdAt,
  };
};

export const User = mongoose.model('User', userSchema);
