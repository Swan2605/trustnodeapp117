const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  from: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  to: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  // Legacy plaintext field kept for backward compatibility/migration.
  message: { type: String, default: '' },
  // E2EE payload fields.
  encryptedMsg: { type: String, default: '' },
  encryptedAesKeyForRecipient: { type: String, default: '' },
  encryptedAesKeyForSender: { type: String, default: '' },
  iv: { type: String, default: '' },
  e2eeVersion: { type: Number, default: 0 },
  isEncrypted: { type: Boolean, default: false },
  timestamp: { type: Date, default: Date.now, index: true },
  read: { type: Boolean, default: false }
});

messageSchema.index({ from: 1, to: 1, timestamp: -1 });
messageSchema.index({ to: 1, read: 1 });

module.exports = mongoose.model('Message', messageSchema);
