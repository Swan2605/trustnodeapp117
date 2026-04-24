const { createPrivacyContext } = require('../utils/privacy');

const attachPrivacyContext = (req, _res, next) => {
  if (!req.user) {
    return next();
  }

  const privacy = createPrivacyContext(req.user);
  req.privacy = privacy;
  req.canViewProfile = privacy.canViewProfile;
  req.canViewPost = privacy.canViewPost;
  req.canMessageUser = privacy.canMessageUser;
  req.isFriendWith = privacy.isFriend;
  req.isOwnerUser = privacy.isOwner;
  req.sanitizeUser = privacy.sanitizeUser;
  return next();
};

module.exports = attachPrivacyContext;
