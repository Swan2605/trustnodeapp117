const mongoose = require('mongoose');

const securityLogSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  action: { type: String, enum: ['login', 'logout', 'access', 'anomaly', 'failed_login', 'password_change', 'two_factor_enabled', 'suspicious_login', 'account_lockdown', 'stepup_required', 'alert_confirmed', 'alert_revoked'], required: true },
  ip: { type: String, required: true },
  device: { type: String },
  timestamp: { type: Date, default: Date.now },
  details: { type: mongoose.Schema.Types.Mixed }
});

module.exports = mongoose.model('SecurityLog', securityLogSchema);