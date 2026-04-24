const winston = require('winston');
const nodemailer = require('nodemailer');
const crypto = require('crypto');
const User = require('../models/User');
const SecurityLog = require('../models/SecurityLog');
const { parseUserAgent, resolveLocation } = require('../utils/deviceUtils');

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [
    new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
    new winston.transports.File({ filename: 'logs/combined.log' })
  ]
});

const getEmailAuth = () => ({
  user: process.env.EMAIL_USER || process.env.NODE_MAILER_EMAIL,
  pass: process.env.EMAIL_PASS || process.env.NODE_MAILER_PASS
});

const hasEmailCredentials = () => {
  const { user, pass } = getEmailAuth();
  return Boolean(user && pass);
};

const getTransporter = () => nodemailer.createTransport({
  host: process.env.EMAIL_HOST || 'smtp.gmail.com',
  port: process.env.EMAIL_PORT ? Number(process.env.EMAIL_PORT) : 587,
  secure: process.env.EMAIL_SECURE === 'true',
  auth: getEmailAuth()
});

const getEmailFrom = () => process.env.EMAIL_FROM || process.env.EMAIL_USER || process.env.NODE_MAILER_EMAIL || 'no-reply@trustnode.local';
const getBackendUrl = () => process.env.BACKEND_URL || process.env.API_BASE_URL || `http://localhost:${process.env.PORT || 5000}`;
const SECURITY_ALERT_TOKEN_TTL_MS = Number(process.env.SECURITY_ALERT_TOKEN_TTL_MS || (45 * 60 * 1000));

const buildSecurityAlertActionLink = (token, decision) => (
  `${getBackendUrl()}/api/auth/security-alert/respond?token=${encodeURIComponent(token)}&decision=${encodeURIComponent(decision)}`
);

const buildSecurityAlertEmailHtml = (alert, rawToken) => {
  const safeMessage = alert?.message || 'Suspicious activity was detected on your Trust node account.';
  const riskLevel = alert?.riskLevel || 'medium';
  const location = alert?.location || 'Unknown';
  const device = alert?.device || 'Unknown device';
  const browser = alert?.browser || 'Unknown browser';
  const ip = alert?.ip || 'Unknown IP';
  const confirmUrl = buildSecurityAlertActionLink(rawToken, 'confirm');
  const secureUrl = buildSecurityAlertActionLink(rawToken, 'secure');

  return `
    <p>${safeMessage}</p>
    <p><strong>Risk level:</strong> ${riskLevel}</p>
    <p><strong>Location:</strong> ${location}</p>
    <p><strong>Device:</strong> ${device}</p>
    <p><strong>Browser:</strong> ${browser}</p>
    <p><strong>IP:</strong> ${ip}</p>
    <p style="margin-top: 18px;">
      <a href="${confirmUrl}" style="display:inline-block;padding:10px 16px;margin-right:8px;border-radius:6px;background:#284dff;color:#ffffff;text-decoration:none;">Yes, this was me</a>
      <a href="${secureUrl}" style="display:inline-block;padding:10px 16px;border-radius:6px;background:#b42318;color:#ffffff;text-decoration:none;">No, secure my account</a>
    </p>
    <p style="margin-top:12px;color:#667085;">These links expire in 45 minutes and can only be used once.</p>
  `;
};

const sendSecurityEmail = async (to, subject, html) => {
  if (!to) return false;
  if (!hasEmailCredentials()) {
    logger.error('Failed to send security email: missing SMTP credentials. Set EMAIL_USER and EMAIL_PASS (or NODE_MAILER_EMAIL/NODE_MAILER_PASS).');
    return false;
  }

  const transporter = getTransporter();
  const emailFrom = getEmailFrom();

  try {
    const result = await transporter.sendMail({
      from: emailFrom,
      to,
      subject,
      html
    });
    console.log(`\nSecurity email sent to ${to}`);
    console.log(`Subject: ${subject}`);
    console.log(`Message ID: ${result.messageId}\n`);
    return true;
  } catch (error) {
    console.error(`\nFailed to send security email to ${to}`);
    console.error(`Error: ${error.message}\n`);
    logger.error('Failed to send security email', error);
    return false;
  }
};

const sendSecurityAlertActionEmail = async (user, alert) => {
  if (!user?.email || !alert?.responseToken) {
    return false;
  }

  const html = buildSecurityAlertEmailHtml(alert, alert.responseToken);
  return sendSecurityEmail(user.email, 'Trust node security alert', html);
};

const isDeviceTrusted = (user, ip, device, browser, os, location) => {
  if (!user.trustedDevices || !user.trustedDevices.length) return false;
  return user.trustedDevices.some((trusted) =>
    trusted.ip === ip && trusted.device === device && trusted.browser === browser && trusted.os === os && trusted.location === location
  );
};

const trustDevice = async (user, ip, device, browser, os, location) => {
  user.trustedDevices = user.trustedDevices || [];
  const existing = user.trustedDevices.find((trusted) =>
    trusted.ip === ip && trusted.device === device && trusted.browser === browser && trusted.os === os && trusted.location === location
  );
  if (existing) {
    existing.lastSeen = new Date();
    existing.whitelistedAt = new Date();
  } else {
    user.trustedDevices.push({
      ip,
      device,
      browser,
      os,
      location,
      lastSeen: new Date(),
      whitelistedAt: new Date()
    });
  }
  await user.save();
};

const revokeConnectedApps = async (user) => {
  user.connectedApps = (user.connectedApps || []).map((app) => ({
    ...app,
    revoked: true,
    revokedAt: new Date()
  }));
  await user.save();
};

const createSecurityAlert = async (user, alertData) => {
  const responseToken = crypto.randomBytes(32).toString('hex');
  const responseTokenHash = crypto.createHash('sha256').update(responseToken).digest('hex');
  user.securityAlerts = user.securityAlerts || [];
  const alert = {
    alertId: cryptoRandomId(),
    status: 'pending',
    createdAt: new Date(),
    updatedAt: new Date(),
    responseTokenHash,
    responseTokenExpires: new Date(Date.now() + SECURITY_ALERT_TOKEN_TTL_MS),
    ...alertData
  };
  user.securityAlerts.push(alert);
  user.notifications = user.notifications || [];
  user.notifications.unshift({
    type: 'security',
    message: alert.message,
    from: null,
    read: false,
    createdAt: new Date()
  });
  await user.save();
  return {
    ...alert,
    responseToken
  };
};

const cryptoRandomId = () => require('crypto').randomBytes(12).toString('hex');

if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: winston.format.simple()
  }));
}

// Middleware for logging access
exports.logAccess = async (req, res, next) => {
  const userId = req.user ? req.user._id : null;
  const ip = req.ip || req.connection.remoteAddress;
  const device = req.headers['user-agent'];
  const method = req.method;
  const url = req.originalUrl;

  // Log to file
  logger.info(`Access: ${method} ${url}`, { userId, ip, device });

  // Log to database only for authenticated users or key actions
  if (userId && (method !== 'GET' || url.includes('/profile') || url.includes('/posts'))) {
    await SecurityLog.create({
      user: userId,
      action: 'access',
      ip,
      device,
      details: { method, url }
    });
  }

  next();
};

// Anomaly detection
exports.checkAnomaly = async (req, res, next) => {
  if (!req.user) return next();

  const user = await User.findById(req.user._id);
  const ip = req.ip || req.connection.remoteAddress;
  const rawUserAgent = req.headers['user-agent'] || 'Unknown agent';
  const userAgentInfo = parseUserAgent(rawUserAgent);
  const device = userAgentInfo.device;
  const browser = userAgentInfo.browser;

  let anomalyDetected = false;
  let details = {};

  // Check for IP change
  if (user.lastLogin.ip && user.lastLogin.ip !== ip) {
    anomalyDetected = true;
    details.ipChange = { old: user.lastLogin.ip, new: ip };
  }

  // Check for device change
  if (user.lastLogin.device && user.lastLogin.device !== device) {
    anomalyDetected = true;
    details.deviceChange = { old: user.lastLogin.device, new: device };
  }

  // Check for browser change
  if (user.lastLogin.browser && user.lastLogin.browser !== browser) {
    anomalyDetected = true;
    details.browserChange = { old: user.lastLogin.browser, new: browser };
  }

  // Check for rapid failed logins (more than 3 in last hour)
  const recentFailedLogins = await SecurityLog.countDocuments({
    user: user._id,
    action: 'failed_login',
    timestamp: { $gte: new Date(Date.now() - 60 * 60 * 1000) }
  });
  if (recentFailedLogins > 3) {
    anomalyDetected = true;
    details.recentFailedLogins = recentFailedLogins;
  }

  // Check for unusual access times (e.g., login at odd hours)
  const hour = new Date().getHours();
  if (hour < 6 || hour > 22) { // Assuming normal hours 6am-10pm
    anomalyDetected = true;
    details.unusualTime = hour;
  }

  if (anomalyDetected) {
    logger.warn(`Anomaly detected for user ${user._id}`, { ip, device, details });

    // Log anomaly to database
    await SecurityLog.create({
      user: user._id,
      action: 'anomaly',
      ip,
      device,
      details
    });
    const shouldSendSecurityAlert = Boolean(details.deviceChange || details.browserChange);

    // Only send "Suspicious login/activity" alerts for new device or browser.
    if (shouldSendSecurityAlert) {
      const location = resolveLocation(ip);
      const message = `Suspicious activity detected from ${location} on ${userAgentInfo.device} / ${userAgentInfo.browser}. Please confirm whether this was you.`;

      const alert = await createSecurityAlert(user, {
        action: 'anomaly',
        ip,
        device: userAgentInfo.device,
        browser: userAgentInfo.browser,
        os: userAgentInfo.os,
        location,
        sessionId: req.sessionId || null,
        riskLevel: 'medium',
        message,
        details
      });

      await sendSecurityAlertActionEmail(user, alert);
    }
  }

  next();
};

// Function to log security events
exports.logSecurityEvent = async (userId, action, ip, device, details = {}) => {
  await SecurityLog.create({
    user: userId,
    action,
    ip,
    device,
    details
  });
  logger.info(`Security event: ${action} for user ${userId}`, { ip, device, details });
};

// Export helper functions
module.exports.sendSecurityEmail = sendSecurityEmail;
module.exports.sendSecurityAlertActionEmail = sendSecurityAlertActionEmail;
module.exports.isDeviceTrusted = isDeviceTrusted;
module.exports.trustDevice = trustDevice;
module.exports.createSecurityAlert = createSecurityAlert;
module.exports.revokeConnectedApps = revokeConnectedApps;
module.exports.logger = logger;
