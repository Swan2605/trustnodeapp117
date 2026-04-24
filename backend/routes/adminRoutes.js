const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const User = require('../models/User');

// Middleware to check if user is admin
const adminOnly = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user || !user.isAdmin) {
      return res.status(403).json({ msg: 'Admin access required' });
    }
    next();
  } catch (error) {
    res.status(500).json({ msg: error.message });
  }
};

// Unlock a user account
router.post('/unlock/:userId', auth, adminOnly, async (req, res) => {
  try {
    const targetUser = await User.findById(req.params.userId);
    if (!targetUser) {
      return res.status(404).json({ msg: 'User not found' });
    }

    targetUser.accountLocked = false;
    targetUser.accountLockedAt = null;
    targetUser.passwordResetRequired = false;
    await targetUser.save();

    res.json({
      msg: `User ${targetUser.username} has been unlocked`,
      user: {
        id: targetUser._id,
        username: targetUser.username,
        email: targetUser.email,
        accountLocked: targetUser.accountLocked
      }
    });
  } catch (error) {
    res.status(500).json({ msg: error.message });
  }
});

// Lock a user account (admin action)
router.post('/lock/:userId', auth, adminOnly, async (req, res) => {
  try {
    const targetUser = await User.findById(req.params.userId);
    if (!targetUser) {
      return res.status(404).json({ msg: 'User not found' });
    }

    targetUser.accountLocked = true;
    targetUser.accountLockedAt = new Date();
    targetUser.tokenVersion += 1; // Invalidate all sessions
    await targetUser.save();

    res.json({
      msg: `User ${targetUser.username} has been locked`,
      user: {
        id: targetUser._id,
        username: targetUser.username,
        email: targetUser.email,
        accountLocked: targetUser.accountLocked
      }
    });
  } catch (error) {
    res.status(500).json({ msg: error.message });
  }
});

// Get user security details (admin view)
router.get('/users/:userId/security', auth, adminOnly, async (req, res) => {
  try {
    const user = await User.findById(req.params.userId).select('-password -totpSecret');
    if (!user) {
      return res.status(404).json({ msg: 'User not found' });
    }

    res.json({
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        accountLocked: user.accountLocked,
        accountLockedAt: user.accountLockedAt,
        tokenVersion: user.tokenVersion,
        securityAlerts: user.securityAlerts || [],
        trustedDevices: user.trustedDevices || [],
        passwordResetRequired: user.passwordResetRequired,
        sessions: (user.sessions || []).map((s) => ({
          ip: s.ip,
          device: s.device,
          browser: s.browser,
          os: s.os,
          location: s.location,
          createdAt: s.createdAt,
          lastActive: s.lastActive,
          active: s.active
        }))
      }
    });
  } catch (error) {
    res.status(500).json({ msg: error.message });
  }
});

// Make user an admin (super-admin only)
router.post('/promote/:userId', auth, adminOnly, async (req, res) => {
  try {
    const targetUser = await User.findById(req.params.userId);
    if (!targetUser) {
      return res.status(404).json({ msg: 'User not found' });
    }

    targetUser.isAdmin = true;
    await targetUser.save();

    res.json({
      msg: `User ${targetUser.username} is now an admin`,
      user: { id: targetUser._id, username: targetUser.username, isAdmin: targetUser.isAdmin }
    });
  } catch (error) {
    res.status(500).json({ msg: error.message });
  }
});

// Revoke admin privileges
router.post('/demote/:userId', auth, adminOnly, async (req, res) => {
  try {
    const targetUser = await User.findById(req.params.userId);
    if (!targetUser) {
      return res.status(404).json({ msg: 'User not found' });
    }

    targetUser.isAdmin = false;
    await targetUser.save();

    res.json({
      msg: `User ${targetUser.username} is no longer an admin`,
      user: { id: targetUser._id, username: targetUser.username, isAdmin: targetUser.isAdmin }
    });
  } catch (error) {
    res.status(500).json({ msg: error.message });
  }
});

module.exports = router;
