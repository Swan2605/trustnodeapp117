const crypto = require('crypto');
const User = require('../models/User');
const jwt = require('jsonwebtoken');
const speakeasy = require('speakeasy');
const QRCode = require('qrcode');
const {
  logSecurityEvent,
  createSecurityAlert,
  sendSecurityEmail,
  sendSecurityAlertActionEmail,
  trustDevice,
  isDeviceTrusted
} = require('./monitoringController');
const { sendPasswordResetLinkEmail } = require('./recoveryController');
const { parseUserAgent, resolveLocation } = require('../utils/deviceUtils');

const LOGIN_CHALLENGE_TTL_MS = 10 * 60 * 1000;
const EMAIL_OTP_TTL_MS = 10 * 60 * 1000;
const normalizeEmail = (email = '') => String(email).trim().toLowerCase();
const normalizePhone = (phone = '') => String(phone).trim();
const normalizeUsername = (username = '') => String(username).trim();

const createSessionAndToken = async (user, req) => {
  const userAgent = req.headers['user-agent'] || 'Unknown agent';
  const { device, browser, os } = parseUserAgent(userAgent);
  const ip = req.ip || req.connection.remoteAddress || 'Unknown IP';
  const location = resolveLocation(ip);
  const sessionId = crypto.randomBytes(16).toString('hex');

  const session = {
    sessionId,
    ip,
    device,
    browser,
    os,
    location,
    userAgent,
    createdAt: new Date(),
    lastActive: new Date(),
    active: true
  };

  user.sessions = user.sessions || [];
  user.sessions.push(session);
  user.lastLogin.ip = ip;
  user.lastLogin.device = device;
  user.lastLogin.browser = browser;
  user.lastLogin.timestamp = new Date();
  await user.save();

  await logSecurityEvent(user._id, 'login', ip, userAgent, {
    device,
    browser,
    os,
    location
  });

  const token = jwt.sign({ id: user._id, sessionId, version: user.tokenVersion }, process.env.JWT_SECRET || 'fallbacksecret', { expiresIn: '1h' });
  return { token, sessionId };
};

const generateOtp = () => Math.floor(100000 + Math.random() * 900000).toString();

const clearLoginChallenge = (user) => {
  user.pendingLoginChallenge = undefined;
};

const beginLoginChallenge = (user, details) => {
  const challengeId = crypto.randomBytes(16).toString('hex');
  user.pendingLoginChallenge = {
    challengeId,
    expiresAt: new Date(Date.now() + LOGIN_CHALLENGE_TTL_MS),
    ip: details.ip,
    device: details.device,
    browser: details.browser,
    os: details.os,
    location: details.location,
    riskLevel: details.riskLevel || 'low',
    suspicious: Boolean(details.suspicious)
  };
  return challengeId;
};

const getValidLoginChallenge = (user, challengeId) => {
  if (!challengeId) return null;
  const challenge = user.pendingLoginChallenge;
  if (!challenge || !challenge.challengeId || !challenge.expiresAt) {
    return null;
  }
  if (challenge.challengeId !== challengeId) {
    return null;
  }
  if (new Date(challenge.expiresAt) < new Date()) {
    return null;
  }
  return challenge;
};

const createEmailOtp = async (user) => {
  const otp = generateOtp();
  user.emailOtp = otp;
  user.emailOtpExpires = new Date(Date.now() + EMAIL_OTP_TTL_MS);
  await user.save();

  if (process.env.NODE_ENV !== 'production') {
    console.log(`\nOTP generated for ${user.email}: ${otp}`);
    console.log(`Expires at ${user.emailOtpExpires}\n`);
  }

  return otp;
};

const sendLoginOtpEmail = async (user, otp, challenge = null) => {
  const suspiciousNotice = challenge?.suspicious
    ? '<p>This attempt looks unusual. If this was not you, reset your password immediately.</p>'
    : '';
  return sendSecurityEmail(
    user.email,
    'Trust node login verification code',
    `<p>Your one-time login code is <strong>${otp}</strong>.</p><p>It expires in 10 minutes.</p>${suspiciousNotice}`
  );
};

const confirmPendingSuspiciousAlert = (user) => {
  const pendingAlert = user.securityAlerts?.find((alert) => alert.status === 'pending' && alert.action === 'suspicious_login');
  if (!pendingAlert) {
    return false;
  }
  pendingAlert.status = 'confirmed';
  pendingAlert.updatedAt = new Date();
  return true;
};

const createLoginRiskAlert = async (user, details) => {
  const message = `Suspicious login detected from ${details.location} on ${details.device} / ${details.browser}. Please confirm whether this was you.`;
  const alert = await createSecurityAlert(user, {
    action: 'suspicious_login',
    ip: details.ip,
    device: details.device,
    browser: details.browser,
    os: details.os,
    location: details.location,
    sessionId: null,
    riskLevel: details.riskLevel || 'high',
    message,
    details
  });
  return sendSecurityAlertActionEmail(user, alert);
};

const PRODUCTION_FRONTEND_FALLBACK = 'https://trustnode117-2m38g664p-suhani-jaiswals-projects.vercel.app';

const normalizeFrontendUrl = (value = '') => String(value).trim().replace(/\/+$/, '');

const getSafeFrontendUrl = () => {
  const configuredUrl = normalizeFrontendUrl(process.env.FRONTEND_URL || '');
  if (configuredUrl) {
    return configuredUrl;
  }

  return PRODUCTION_FRONTEND_FALLBACK;
};

const renderEmailDecisionHtml = ({
  title,
  description,
  hint = '',
  isError = false
}) => `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${title}</title>
    <style>
      body { margin: 0; font-family: Arial, sans-serif; background: #050a1c; color: #eef2ff; }
      .card { max-width: 620px; margin: 64px auto; padding: 28px; border-radius: 14px; border: 1px solid rgba(125, 76, 255, 0.32); background: #0d1435; }
      h1 { margin: 0 0 12px; font-size: 28px; }
      p { margin: 0 0 10px; line-height: 1.5; color: #c9d2ff; }
      .status { color: ${isError ? '#ffb4bc' : '#8ee6a1'}; font-weight: 700; margin-bottom: 14px; }
      a { color: #9bb3ff; }
    </style>
  </head>
  <body>
    <main class="card">
      <h1>${title}</h1>
      <p class="status">${isError ? 'Action could not be completed' : 'Action completed'}</p>
      <p>${description}</p>
      <p>${hint}</p>
      <p><a href="${getSafeFrontendUrl()}">Open Trust node</a></p>
    </main>
  </body>
</html>`;

const getLoginContext = (req, user) => {
  const ip = req.ip || req.connection.remoteAddress || 'Unknown IP';
  const location = resolveLocation(ip);
  const userAgent = req.headers['user-agent'] || 'Unknown agent';
  const { device, browser, os } = parseUserAgent(userAgent);
  const hour = new Date().getHours();
  
  // Compare against last login - only mark as suspicious if ACTUALLY different
  const isNewIp = Boolean(user.lastLogin?.ip && user.lastLogin.ip !== ip);
  const isNewDevice = Boolean(user.lastLogin?.device && user.lastLogin.device !== device);
  const isNewBrowser = Boolean(user.lastLogin?.browser && user.lastLogin.browser !== browser);
  const isOddHour = Boolean(user.lastLogin?.timestamp && (hour < 6 || hour > 22));
  
  // Only mark as suspicious if there IS a previous login AND the device/browser changed
  // First login (no lastLogin) is never suspicious
  const suspicious = user.lastLogin ? (isNewDevice || isNewBrowser) : false;
  
  const trusted = isDeviceTrusted(user, ip, device, browser, os, location);
  const riskLevel = (isNewDevice || isNewBrowser) ? 'high' : 'low';

  return {
    ip,
    location,
    userAgent,
    device,
    browser,
    os,
    isNewIp,
    isNewDevice,
    isNewBrowser,
    isOddHour,
    riskLevel,
    suspicious,
    trusted
  };
};

const finalizeSuspiciousLogin = async (user, req, challenge) => {
  if (!challenge?.suspicious) return;
  const fallbackAgent = parseUserAgent(req.headers['user-agent'] || 'Unknown agent');
  const fallbackIp = req.ip || req.connection.remoteAddress || 'Unknown IP';

  await trustDevice(
    user,
    challenge.ip || fallbackIp,
    challenge.device || fallbackAgent.device,
    challenge.browser || fallbackAgent.browser,
    challenge.os || fallbackAgent.os,
    challenge.location || resolveLocation(fallbackIp)
  );

  const alertConfirmed = confirmPendingSuspiciousAlert(user);
  await user.save();

  if (alertConfirmed) {
    await logSecurityEvent(
      user._id,
      'alert_confirmed',
      challenge.ip || fallbackIp,
      req.headers['user-agent'] || 'Unknown agent',
      {
        message: 'User completed second-factor verification for a suspicious login',
        device: challenge.device,
        browser: challenge.browser,
        os: challenge.os,
        location: challenge.location
      }
    );
  }
};

exports.register = async (req, res) => {
  try {
    const { username, email, phone, password } = req.body;
    const normalizedUsername = normalizeUsername(username);
    const normalizedEmail = normalizeEmail(email);
    const normalizedPhone = normalizePhone(phone);
    const normalizedPassword = typeof password === 'string' ? password : '';

    if (!normalizedUsername || !normalizedEmail || !normalizedPhone || !normalizedPassword) {
      return res.status(400).json({ msg: 'Username, email, phone, and password are required' });
    }

    const existingByEmail = await User.findOne({ email: normalizedEmail });
    if (existingByEmail) {
      return res.status(400).json({ msg: 'An account with this email already exists. Please sign in or use another email.' });
    }

    const existingByPhone = await User.findOne({ phone: normalizedPhone });
    if (existingByPhone) {
      return res.status(400).json({ msg: 'An account with this phone number already exists. Please sign in or use another phone number.' });
    }

    const totpSecret = speakeasy.generateSecret({ name: `Trust Node:${normalizedEmail}` });
    const user = new User({
      username: normalizedUsername,
      email: normalizedEmail,
      phone: normalizedPhone,
      password: normalizedPassword,
      totpSecret: totpSecret.base32,
      twoFactorEnabled: false
    });

    await user.save();

    const otpauthUrl = speakeasy.otpauthURL({
      secret: totpSecret.base32,
      label: `Trust Node:${normalizedEmail}`,
      issuer: 'Trust Node',
      encoding: 'base32'
    });
    const qr = await QRCode.toDataURL(otpauthUrl);

    res.json({
      msg: 'Registration successful. Scan this QR in your authenticator app to enable 2FA.',
      userId: user._id,
      qr
    });
  } catch (error) {
    if (error?.code === 11000) {
      const duplicateField = Object.keys(error.keyPattern || {})[0];
      if (duplicateField === 'email') {
        return res.status(400).json({ msg: 'An account with this email already exists. Please sign in or use another email.' });
      }
      if (duplicateField === 'phone') {
        return res.status(400).json({ msg: 'An account with this phone number already exists. Please sign in or use another phone number.' });
      }
      if (duplicateField === 'username') {
        return res.status(400).json({ msg: 'That username is already taken. Choose a different username.' });
      }
      return res.status(400).json({ msg: 'Account already exists. Please use different signup details.' });
    }

    res.status(500).json({ msg: error.message });
  }
};

exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;
    const normalizedEmail = normalizeEmail(email);
    const candidatePassword = typeof password === 'string' ? password : '';

    if (!normalizedEmail || !candidatePassword) {
      return res.status(400).json({ msg: 'Email and password are required' });
    }

    const user = await User.findOne({ email: normalizedEmail });
    if (!user || !(await user.comparePassword(candidatePassword))) {
      if (user) {
        user.failedAttempts += 1;
        if (user.failedAttempts >= 5) {
          user.lockUntil = new Date(Date.now() + 15 * 60 * 1000);
        }
        await user.save();
        await logSecurityEvent(user._id, 'failed_login', req.ip, req.headers['user-agent'], { email: normalizedEmail });
      }
      return res.status(400).json({ msg: 'Invalid credentials' });
    }

    if (user.lockUntil && user.lockUntil > new Date()) {
      return res.status(423).json({ msg: 'Account locked due to repeated login failures' });
    }

    const loginContext = getLoginContext(req, user);
    const suspicious = loginContext.suspicious && !loginContext.trusted;

    if (suspicious) {
      const alertEmailDelivered = await createLoginRiskAlert(user, {
        ip: loginContext.ip,
        device: loginContext.device,
        browser: loginContext.browser,
        os: loginContext.os,
        location: loginContext.location,
        riskLevel: loginContext.riskLevel,
        message: `Unrecognized login from ${loginContext.location} on ${loginContext.device} (${loginContext.browser}).`
      });

      await logSecurityEvent(user._id, 'stepup_required', loginContext.ip, loginContext.userAgent, {
        riskLevel: loginContext.riskLevel,
        isNewIp: loginContext.isNewIp,
        isNewDevice: loginContext.isNewDevice,
        isNewBrowser: loginContext.isNewBrowser,
        isOddHour: loginContext.isOddHour,
        alertEmailDelivered
      });
    }

    user.failedAttempts = 0;
    user.emailOtp = null;
    user.emailOtpExpires = null;
    const challengeId = beginLoginChallenge(user, {
      ip: loginContext.ip,
      device: loginContext.device,
      browser: loginContext.browser,
      os: loginContext.os,
      location: loginContext.location,
      riskLevel: loginContext.riskLevel,
      suspicious
    });
    await user.save();

    res.json({
      requiresSecondFactor: true,
      userId: user._id,
      challengeId,
      availableMethods: {
        emailOtp: true,
        authenticatorOtp: Boolean(user.twoFactorEnabled && user.totpSecret)
      },
      suspicious,
      msg: suspicious
        ? 'Suspicious login detected. Choose Email OTP or Authenticator OTP to continue.'
        : 'Choose Email OTP or Authenticator OTP to complete sign-in.'
    });
  } catch (error) {
    res.status(500).json({ msg: error.message });
  }
};

exports.sendEmailOtp = async (req, res) => {
  try {
    const { userId, challengeId } = req.body;
    const user = await User.findById(userId);
    if (!user) {
      return res.status(400).json({ msg: 'Invalid user' });
    }

    const challenge = getValidLoginChallenge(user, challengeId);
    if (!challenge) {
      clearLoginChallenge(user);
      user.emailOtp = null;
      user.emailOtpExpires = null;
      await user.save();
      return res.status(400).json({ msg: 'Verification session expired. Please sign in again.' });
    }

    const otp = await createEmailOtp(user);
    const emailDelivered = await sendLoginOtpEmail(user, otp, challenge);
    const message = emailDelivered
      ? 'OTP sent to your email address.'
      : process.env.NODE_ENV !== 'production'
        ? 'OTP email could not be delivered. Check SMTP credentials and backend logs.'
        : 'OTP email could not be delivered. Please try again shortly.';

    res.json({
      emailDelivered,
      msg: message
    });
  } catch (error) {
    res.status(500).json({ msg: error.message });
  }
};

exports.verifyTwoFactor = async (req, res) => {
  try {
    const { userId, challengeId, otp } = req.body;
    const user = await User.findById(userId);
    if (!user || !user.totpSecret || !user.twoFactorEnabled) {
      return res.status(400).json({ msg: 'Authenticator OTP is not enabled for this account' });
    }

    const challenge = getValidLoginChallenge(user, challengeId);
    if (!challenge) {
      clearLoginChallenge(user);
      user.emailOtp = null;
      user.emailOtpExpires = null;
      await user.save();
      return res.status(400).json({ msg: 'Verification session expired. Please sign in again.' });
    }

    const verified = speakeasy.totp.verify({
      secret: user.totpSecret,
      encoding: 'base32',
      token: otp,
      window: 1
    });

    if (!verified) {
      return res.status(400).json({ msg: 'Invalid authenticator code' });
    }

    user.emailOtp = null;
    user.emailOtpExpires = null;
    clearLoginChallenge(user);
    
    // Always auto-trust the device after successful 2FA verification
    await trustDevice(
      user,
      challenge.ip,
      challenge.device,
      challenge.browser,
      challenge.os,
      challenge.location
    );
    
    await finalizeSuspiciousLogin(user, req, challenge);
    if (!challenge.suspicious) {
      await user.save();
    }

    const { token } = await createSessionAndToken(user, req);
    res.json({ token, user });
  } catch (error) {
    res.status(500).json({ msg: error.message });
  }
};

exports.verifyStepUp = async (req, res) => {
  try {
    const { userId, challengeId, otp } = req.body;
    const user = await User.findById(userId);
    if (!user) {
      return res.status(400).json({ msg: 'Invalid user' });
    }

    const challenge = getValidLoginChallenge(user, challengeId);
    if (!challenge) {
      clearLoginChallenge(user);
      user.emailOtp = null;
      user.emailOtpExpires = null;
      await user.save();
      return res.status(400).json({ msg: 'Verification session expired. Please sign in again.' });
    }

    if (!user.emailOtp || user.emailOtpExpires < new Date()) {
      return res.status(400).json({ msg: 'OTP expired or invalid' });
    }
    if (user.emailOtp !== otp) {
      return res.status(400).json({ msg: 'Invalid OTP' });
    }

    user.emailOtp = null;
    user.emailOtpExpires = null;
    clearLoginChallenge(user);
    
    // Always auto-trust the device after successful 2FA verification
    await trustDevice(
      user,
      challenge.ip,
      challenge.device,
      challenge.browser,
      challenge.os,
      challenge.location
    );
    
    await finalizeSuspiciousLogin(user, req, challenge);
    if (!challenge.suspicious) {
      await user.save();
    }

    const { token } = await createSessionAndToken(user, req);
    res.json({ token, user });
  } catch (error) {
    res.status(500).json({ msg: error.message });
  }
};

exports.respondToSecurityAlertEmail = async (req, res) => {
  try {
    const token = typeof req.query.token === 'string' ? req.query.token.trim() : '';
    const decision = typeof req.query.decision === 'string'
      ? req.query.decision.trim().toLowerCase()
      : '';

    if (!token || !['confirm', 'secure'].includes(decision)) {
      return res.status(400).send(renderEmailDecisionHtml({
        title: 'Security link is invalid',
        description: 'The security action link is missing required details or has expired.',
        hint: 'Open Trust node and trigger a fresh sign-in alert if you still need to secure your account.',
        isError: true
      }));
    }

    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const user = await User.findOne({
      'securityAlerts.responseTokenHash': tokenHash
    });

    if (!user) {
      return res.status(400).send(renderEmailDecisionHtml({
        title: 'Security link expired',
        description: 'This link is no longer valid or was already used.',
        hint: 'If this was not your activity, use Forgot password immediately from the login page.',
        isError: true
      }));
    }

    const now = new Date();
    const alert = (user.securityAlerts || []).find((entry) => (
      entry.responseTokenHash === tokenHash
      && entry.status === 'pending'
      && entry.responseTokenExpires
      && new Date(entry.responseTokenExpires) > now
    ));

    if (!alert) {
      return res.status(400).send(renderEmailDecisionHtml({
        title: 'Security link expired',
        description: 'This link is no longer valid or was already used.',
        hint: 'If this was not your activity, use Forgot password immediately from the login page.',
        isError: true
      }));
    }

    alert.responseTokenHash = undefined;
    alert.responseTokenExpires = undefined;
    alert.responseTokenUsedAt = now;
    alert.updatedAt = now;

    if (decision === 'confirm') {
      alert.status = 'confirmed';
      await user.save();
      await logSecurityEvent(user._id, 'alert_confirmed', req.ip, req.headers['user-agent'], {
        via: 'email_link',
        alertId: alert.alertId,
        action: alert.action
      });

      return res.send(renderEmailDecisionHtml({
        title: 'Thanks for confirming',
        description: 'We marked this alert as legitimate and no account lockdown was triggered.',
        hint: 'If you did not perform this activity, return to Trust node and reset your password immediately.'
      }));
    }

    alert.status = 'revoked';
    user.passwordResetRequired = false;
    user.accountLocked = false;
    user.accountLockedAt = undefined;
    user.tokenVersion += 1;

    (user.sessions || []).forEach((session) => {
      session.active = false;
      session.lastActive = now;
    });
    user.connectedApps = (user.connectedApps || []).map((app) => ({
      ...(app.toObject ? app.toObject() : app),
      revoked: true,
      revokedAt: now
    }));

    await user.save();

    let resetEmailSent = false;
    try {
      resetEmailSent = await sendPasswordResetLinkEmail(user, {
        subject: 'Trust node account security reset required',
        heading: 'A "secure my account" request was confirmed for your Trust node profile.',
        lead: 'Reset your password now using the link below. The link is valid for 10 minutes:',
        footer: 'All active sessions were signed out. After resetting, sign in again and review your security logs.'
      });
    } catch (emailError) {
      resetEmailSent = false;
    }

    await logSecurityEvent(user._id, 'account_lockdown', req.ip, req.headers['user-agent'], {
      via: 'email_link',
      alertId: alert.alertId,
      action: alert.action,
      resetEmailSent
    });

    return res.send(renderEmailDecisionHtml({
      title: 'Account secured',
      description: resetEmailSent
        ? 'We signed out active sessions and sent a password reset link to your email.'
        : 'We signed out active sessions, but we could not send the reset email. Use Forgot password on the login page now.',
      hint: 'Your current password is unchanged until you reset it yourself.'
    }));
  } catch (error) {
    return res.status(500).send(renderEmailDecisionHtml({
      title: 'Security action failed',
      description: 'We could not process this security request right now.',
      hint: 'Please try again, or use Forgot password from the login page immediately.',
      isError: true
    }));
  }
};

exports.logout = async (req, res) => {
  try {
    const user = req.user;
    if (user && req.sessionId) {
      const session = (user.sessions || []).find((s) => s.sessionId === req.sessionId);
      if (session) {
        session.active = false;
        await user.save();
      }
      await logSecurityEvent(user._id, 'logout', req.ip, req.headers['user-agent']);
    }
    res.json({ msg: 'Logged out successfully' });
  } catch (error) {
    res.status(500).json({ msg: error.message });
  }
};

exports.confirmTwoFactorSetup = async (req, res) => {
  try {
    const { userId, token } = req.body;
    const user = await User.findById(userId);
    if (!user || !user.totpSecret) {
      return res.status(404).json({ msg: 'User not found or 2FA secret missing' });
    }

    const verified = speakeasy.totp.verify({
      secret: user.totpSecret,
      encoding: 'base32',
      token,
      window: 1
    });
    if (!verified) {
      return res.status(400).json({ msg: 'Invalid authenticator code' });
    }

    user.twoFactorEnabled = true;
    await user.save();

    const { token: authToken } = await createSessionAndToken(user, req);
    res.json({ msg: '2FA enabled', token: authToken, user });
  } catch (error) {
    res.status(500).json({ msg: error.message });
  }
};

exports.enable2FA = async (req, res) => {
  try {
    const { token } = req.body;
    const user = await User.findById(req.user.id);
    if (!user || !user.totpSecret) {
      return res.status(400).json({ msg: 'Authenticator setup missing' });
    }

    const verified = speakeasy.totp.verify({
      secret: user.totpSecret,
      encoding: 'base32',
      token,
      window: 1
    });

    if (!verified) {
      return res.status(400).json({ msg: 'Invalid TOTP' });
    }

    user.twoFactorEnabled = true;
    await user.save();
    await logSecurityEvent(user._id, 'two_factor_enabled', req.ip, req.headers['user-agent']);
    res.json({ msg: '2FA enabled' });
  } catch (error) {
    res.status(500).json({ msg: error.message });
  }
};
