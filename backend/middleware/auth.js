const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { createPrivacyContext } = require('../utils/privacy');

const SESSION_REFRESH_WINDOW_MS = 30 * 1000;

const authError = (status, message) => {
  const error = new Error(message);
  error.status = status;
  return error;
};

const attachPrivacyHelpers = (req, user) => {
  const privacyContext = createPrivacyContext(user);
  req.user = user;
  req.privacy = privacyContext;
  req.canViewProfile = privacyContext.canViewProfile;
  req.canViewPost = privacyContext.canViewPost;
  req.canMessageUser = privacyContext.canMessageUser;
  req.isFriendWith = privacyContext.isFriend;
  req.isOwnerUser = privacyContext.isOwner;
  req.sanitizeUser = privacyContext.sanitizeUser;
};

const getBearerToken = (req, allowQueryToken = false) => {
  const authHeaderToken = req.header('Authorization')?.replace('Bearer ', '').trim();
  if (authHeaderToken) {
    return authHeaderToken;
  }

  if (allowQueryToken) {
    const queryToken = typeof req.query?.token === 'string' ? req.query.token.trim() : '';
    return queryToken || '';
  }

  return '';
};

const resolveSessionUser = async (req, options = {}) => {
  const allowQueryToken = options.allowQueryToken === true;
  const token = getBearerToken(req, allowQueryToken);
  if (!token) {
    throw authError(401, 'No token, authorization denied');
  }

  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallbacksecret');
  } catch (error) {
    throw authError(401, 'Token invalid');
  }

  const user = await User.findById(decoded.id).select('-password');
  if (!user) {
    throw authError(401, 'Token invalid');
  }

  if (decoded.version !== user.tokenVersion) {
    throw authError(401, 'Token invalidated. Please log in again.');
  }

  if (user.accountLocked) {
    throw authError(403, 'Account is locked. Contact admin for unlock.');
  }

  if (!decoded.sessionId) {
    throw authError(401, 'Session invalid');
  }

  const session = (user.sessions || []).find((s) => s.sessionId === decoded.sessionId && s.active);
  if (!session) {
    throw authError(401, 'Session expired or invalid');
  }

  const now = Date.now();
  const lastActiveMs = new Date(session.lastActive || 0).getTime();
  if (now - lastActiveMs > SESSION_REFRESH_WINDOW_MS) {
    session.lastActive = new Date(now);
    await user.save();
  }

  req.sessionId = decoded.sessionId;
  req.authToken = token;
  attachPrivacyHelpers(req, user);
  return user;
};

const authMiddleware = async (req, res, next) => {
  try {
    await resolveSessionUser(req, { allowQueryToken: false });
    next();
  } catch (error) {
    res.status(error.status || 401).json({ msg: error.message || 'Token invalid' });
  }
};

authMiddleware.resolveSessionUser = resolveSessionUser;

module.exports = authMiddleware;
