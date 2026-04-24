const auth = require('./auth');

const authMedia = async (req, res, next) => {
  try {
    await auth.resolveSessionUser(req, { allowQueryToken: true });
    next();
  } catch (error) {
    res.status(error.status || 401).json({ msg: error.message || 'Token invalid' });
  }
};

module.exports = authMedia;
