const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const PRIVACY_VALUES = ['public', 'friends', 'private'];

const normalizePrivacyValue = (value, fallback) => {
  const normalized = String(value || '').trim().toLowerCase();
  return PRIVACY_VALUES.includes(normalized) ? normalized : fallback;
};

const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true },
  phone: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  totpSecret: String,
  publicKey: String, // RSA public key for E2EE chat
  profile: {
    banner: { type: String, default: '' },
    avatar: { type: String, default: '/images/default-avatar.png' },
    bio: { type: String, default: '' },
    jobTitle: { type: String, default: '' },
    location: { type: String, default: '' },
    qualification: { type: String, default: '' },
    experience: { type: String, default: '' },
    education: { type: String, default: '' },
    skills: { type: [String], default: [] },
    interests: { type: [String], default: [] },
    badges: { type: [String], default: [] },
    profileViews: { type: Number, default: 0 },
    postImpressions: { type: Number, default: 0 },
    searchAppearances: { type: Number, default: 0 },
    postsCount: { type: Number, default: 0 }
  },
  profileVisibility: { type: String, enum: PRIVACY_VALUES, default: 'public' },
  postVisibility: { type: String, enum: PRIVACY_VALUES, default: 'public' },
  messagePrivacy: { type: String, enum: PRIVACY_VALUES, default: 'friends' },
  privacySettings: {
    profile: { type: String, enum: ['public', 'friends', 'private'], default: 'public' },
    posts: { type: String, enum: ['public', 'friends', 'private'], default: 'public' },
    messagePrivacy: { type: String, enum: ['public', 'friends', 'private'], default: 'friends' },
    searchEngineVisibility: { type: Boolean, default: true },
    activityStatus: { type: Boolean, default: true },
    allowMessages: { type: Boolean, default: true },
    allowConnectionRequests: { type: Boolean, default: true },
    allowTagging: { type: String, enum: ['everyone', 'friends', 'no one'], default: 'friends' },
    dataSharing: { type: Boolean, default: false },
    invitationsFromNetwork: { type: Boolean, default: true },
    messagesYouReceive: { type: Boolean, default: true },
    researchInvitations: { type: Boolean, default: false },
    marketingEmails: { type: Boolean, default: false },
    focusedInbox: { type: Boolean, default: false },
    deliveryIndicators: { type: Boolean, default: true },
    messagingSuggestions: { type: Boolean, default: true },
    messageNudges: { type: Boolean, default: false },
    harmfulMessageDetection: { type: Boolean, default: true },
    demographic: {
      gender: { type: String, default: 'Prefer not to say' },
      disability: { type: String, default: 'Prefer not to say' }
    },
    verifications: {
      identity: {
        type: { type: String, default: 'Identity' },
        enabled: { type: Boolean, default: false },
        verifiedBy: { type: String, default: '' },
        details: { type: String, default: '' },
        verificationDate: { type: String, default: '' }
      },
      workplace: {
        type: { type: String, default: 'Workplace' },
        enabled: { type: Boolean, default: false },
        organization: { type: String, default: '' },
        method: { type: String, default: '' },
        email: { type: String, default: '' },
        verificationDate: { type: String, default: '' },
        saveEmail: { type: Boolean, default: false }
      }
    }
  },
  friends: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  connectionRequests: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  notifications: [{
    type: { type: String, enum: ['request', 'accepted', 'rejected', 'security'], default: 'request' },
    message: String,
    from: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    read: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now }
  }],
  sessions: [{
    sessionId: { type: String, required: true },
    ip: String,
    device: String,
    browser: String,
    os: String,
    location: String,
    userAgent: String,
    createdAt: { type: Date, default: Date.now },
    lastActive: { type: Date, default: Date.now },
    active: { type: Boolean, default: true }
  }],
  securityAlerts: [{
    alertId: { type: String, required: true },
    status: { type: String, enum: ['pending', 'confirmed', 'revoked'], default: 'pending' },
    action: { type: String, default: 'anomaly' },
    ip: String,
    device: String,
    browser: String,
    os: String,
    location: String,
    sessionId: String,
    riskLevel: { type: String, enum: ['low', 'medium', 'high'], default: 'medium' },
    message: String,
    responseTokenHash: String,
    responseTokenExpires: Date,
    responseTokenUsedAt: Date,
    details: { type: mongoose.Schema.Types.Mixed },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
  }],
  trustedDevices: [{
    ip: String,
    device: String,
    browser: String,
    os: String,
    location: String,
    lastSeen: Date,
    whitelistedAt: Date
  }],
  connectedApps: [{
    name: String,
    authorizedAt: Date,
    revoked: { type: Boolean, default: false },
    revokedAt: Date
  }],
  passwordResetRequired: { type: Boolean, default: false },
  lastLogin: {
    ip: String,
    device: String,
    browser: String,
    timestamp: { type: Date, default: Date.now }
  },
  failedAttempts: { type: Number, default: 0 },
  lockUntil: Date,
  twoFactorEnabled: { type: Boolean, default: false },
  twoFactorOtp: String,
  twoFactorOtpExpires: Date,
  phoneOtp: String,
  phoneOtpExpires: Date,
  emailOtp: String,
  emailOtpExpires: Date,
  pendingLoginChallenge: {
    challengeId: String,
    expiresAt: Date,
    ip: String,
    device: String,
    browser: String,
    os: String,
    location: String,
    riskLevel: { type: String, enum: ['low', 'medium', 'high'], default: 'low' },
    suspicious: { type: Boolean, default: false }
  },
  recoveryTokens: [{
    token: String,
    expires: Date,
    used: { type: Boolean, default: false }
  }],
  tokenVersion: { type: Number, default: 0 },
  isAdmin: { type: Boolean, default: false },
  accountLocked: { type: Boolean, default: false },
  accountLockedAt: Date
}, { timestamps: true });

userSchema.pre('save', function syncCanonicalPrivacy(next) {
  this.privacySettings = this.privacySettings || {};

  const profileVisibility = normalizePrivacyValue(
    this.profileVisibility || this.privacySettings.profile,
    'public'
  );
  const postVisibility = normalizePrivacyValue(
    this.postVisibility || this.privacySettings.posts,
    'public'
  );
  const inferredMessagePrivacy = this.messagePrivacy
    || this.privacySettings.messagePrivacy
    || (this.privacySettings.allowMessages === false ? 'private' : undefined);
  const messagePrivacy = normalizePrivacyValue(inferredMessagePrivacy, 'friends');

  this.profileVisibility = profileVisibility;
  this.postVisibility = postVisibility;
  this.messagePrivacy = messagePrivacy;

  this.privacySettings.profile = profileVisibility;
  this.privacySettings.posts = postVisibility;
  this.privacySettings.messagePrivacy = messagePrivacy;
  this.privacySettings.allowMessages = messagePrivacy !== 'private';

  next();
});

// Hash password before save
userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

// Compare password
userSchema.methods.comparePassword = async function(password) {
  return await bcrypt.compare(password, this.password);
};

module.exports = mongoose.model('User', userSchema);
