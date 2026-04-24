const User = require('../models/User');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const { logSecurityEvent } = require('./monitoringController');

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

const PRODUCTION_FRONTEND_FALLBACK = 'https://trustnode117-2m38g664p-suhani-jaiswals-projects.vercel.app';

const normalizeFrontendUrl = (value = '') => String(value).trim().replace(/\/+$/, '');

const getFrontendUrl = () => {
  const configuredUrl = normalizeFrontendUrl(process.env.FRONTEND_URL || '');
  if (configuredUrl) {
    return configuredUrl;
  }

  return PRODUCTION_FRONTEND_FALLBACK;
};
const getEmailFrom = () => process.env.EMAIL_FROM || process.env.EMAIL_USER || process.env.NODE_MAILER_EMAIL || 'no-reply@trustnode.local';
const RECOVERY_TOKEN_TTL_MS = 10 * 60 * 1000;

const createRecoveryTokenForUser = (user, ttlMs = RECOVERY_TOKEN_TTL_MS) => {
  const token = crypto.randomBytes(32).toString('hex');
  const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

  user.recoveryTokens = user.recoveryTokens || [];
  user.recoveryTokens.push({
    token: hashedToken,
    expires: new Date(Date.now() + ttlMs)
  });

  return token;
};

const sendPasswordResetLinkEmail = async (
  user,
  {
    subject = 'Trust node password reset',
    heading = 'Click the button below to reset your Trust node password:',
    lead = 'Reset your Trust node password with the link below. The link is valid for 10 minutes:',
    footer = 'This link expires in 10 minutes and can only be used once.'
  } = {}
) => {
  if (!user?.email) return false;
  if (!hasEmailCredentials()) return false;

  const frontendUrl = getFrontendUrl();
  const emailFrom = getEmailFrom();
  const transporter = getTransporter();
  const token = createRecoveryTokenForUser(user, RECOVERY_TOKEN_TTL_MS);
  const resetUrl = `${frontendUrl}/reset/${token}`;
  await user.save();

  await transporter.sendMail({
    from: emailFrom,
    to: user.email,
    subject,
    text: `${lead}\n\nFor security, use the "Reset password" button in the HTML email view. This link expires in 10 minutes.`,
    html: `<p>${heading}</p>
      <p><a href="${resetUrl}" style="display:inline-block;padding:12px 18px;color:#fff;background:#2b7cff;border-radius:6px;text-decoration:none;">Reset password</a></p>
      <p style="margin-top:12px;color:#888;font-size:12px;">${footer}</p>`
  });

  return true;
};

if (process.env.NODE_ENV !== 'production') {
  console.log('SMTP config loaded:', {
    host: process.env.EMAIL_HOST || 'smtp.gmail.com',
    port: process.env.EMAIL_PORT ? Number(process.env.EMAIL_PORT) : 587,
    secure: process.env.EMAIL_SECURE === 'true',
    from: getEmailFrom(),
    hasCredentials: hasEmailCredentials()
  });
}

exports.forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ msg: 'User not found' });
    if (!hasEmailCredentials()) {
      return res.status(500).json({ msg: 'Email service is not configured. Set EMAIL_USER and EMAIL_PASS.' });
    }

    await sendPasswordResetLinkEmail(user);

    res.json({ msg: 'Reset email sent' });
  } catch (error) {
    res.status(500).json({ msg: error.message });
  }
};

exports.resetPassword = async (req, res) => {
  try {
    const { token, password } = req.body;
    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');
    const user = await User.findOne({
      'recoveryTokens.token': hashedToken,
      'recoveryTokens.expires': { $gt: new Date() }
    });

    if (!user) return res.status(400).json({ msg: 'Invalid/expired token' });

    user.password = password;
    user.passwordResetRequired = false;
    user.accountLocked = false;
    user.accountLockedAt = null;
    user.tokenVersion += 1;
    user.recoveryTokens = user.recoveryTokens.filter(t => t.token !== hashedToken);
    await user.save();
    await logSecurityEvent(user._id, 'password_change', req.ip, req.headers['user-agent']);

    res.json({ msg: 'Password reset success' });
  } catch (error) {
    res.status(500).json({ msg: error.message });
  }
};

exports.sendPasswordResetLinkEmail = sendPasswordResetLinkEmail;
