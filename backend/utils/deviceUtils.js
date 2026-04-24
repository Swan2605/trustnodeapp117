const parseUserAgent = (userAgent = '') => {
  const ua = userAgent.toLowerCase();
  let device = 'Unknown device';
  let browser = 'Unknown browser';
  let os = 'Unknown OS';

  if (ua.includes('iphone')) device = 'iPhone';
  else if (ua.includes('ipad')) device = 'iPad';
  else if (ua.includes('android')) device = 'Android device';
  else if (ua.includes('macintosh')) device = 'Mac';
  else if (ua.includes('windows')) device = 'Windows PC';
  else if (ua.includes('linux')) device = 'Linux PC';

  if (ua.includes('edg/')) browser = 'Edge';
  else if (ua.includes('chrome/') && !ua.includes('chromium') && !ua.includes('edg/')) browser = 'Chrome';
  else if (ua.includes('firefox/')) browser = 'Firefox';
  else if (ua.includes('safari/') && !ua.includes('chrome/')) browser = 'Safari';
  else if (ua.includes('opr/') || ua.includes('opera')) browser = 'Opera';

  const versionMatch = ua.match(/(chrome|firefox|safari|edg|opr|opera)\/(\d+\.\d+)/);
  const browserVersion = versionMatch ? `${browser} ${versionMatch[2]}` : browser;

  if (ua.includes('windows nt 10.0')) os = 'Windows 10';
  else if (ua.includes('windows nt 6.1')) os = 'Windows 7';
  else if (ua.includes('mac os x 10')) os = 'Mac OS X';
  else if (ua.includes('android')) os = 'Android';
  else if (ua.includes('iphone') || ua.includes('ipad')) os = 'iOS';
  else if (ua.includes('linux')) os = 'Linux';

  return { device, browser: browserVersion, os };
};

const resolveLocation = (ip = '') => {
  const cleaned = ip.replace('::ffff:', '');
  if (cleaned === '127.0.0.1' || cleaned === '::1' || cleaned === 'localhost') {
    return 'Localhost';
  }
  return cleaned || 'Unknown location';
};

module.exports = {
  parseUserAgent,
  resolveLocation
};