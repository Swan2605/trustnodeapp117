const User = require('../models/User');

const PRIVACY = Object.freeze({
  PUBLIC: 'public',
  FRIENDS: 'friends',
  PRIVATE: 'private'
});

const PRIVACY_VALUES = Object.values(PRIVACY);

const normalizePrivacyValue = (value, fallback = PRIVACY.PUBLIC) => {
  const normalized = String(value || '').trim().toLowerCase();
  return PRIVACY_VALUES.includes(normalized) ? normalized : fallback;
};

const toUserId = (value) => {
  if (!value) return '';
  if (typeof value === 'string') return value;
  if (value._id) return String(value._id);
  if (value.id) return String(value.id);
  return String(value);
};

const resolveProfileVisibility = (user = {}) => (
  normalizePrivacyValue(user.profileVisibility || user.privacySettings?.profile, PRIVACY.PUBLIC)
);

const resolvePostVisibility = (user = {}) => (
  normalizePrivacyValue(user.postVisibility || user.privacySettings?.posts, PRIVACY.PUBLIC)
);

const resolveMessagePrivacy = (user = {}) => {
  const explicitValue = user.messagePrivacy || user.privacySettings?.messagePrivacy;
  if (explicitValue) {
    return normalizePrivacyValue(explicitValue, PRIVACY.FRIENDS);
  }

  if (user.privacySettings?.allowMessages === false) {
    return PRIVACY.PRIVATE;
  }

  return PRIVACY.FRIENDS;
};

const resolveSearchEngineVisibility = (user = {}) => (
  user.privacySettings?.searchEngineVisibility !== false
);

const resolveConnectionRequestPermission = (user = {}) => (
  user.privacySettings?.allowConnectionRequests !== false
);

const buildPublicPrivacySettings = (user = {}) => {
  const profile = resolveProfileVisibility(user);
  const posts = resolvePostVisibility(user);
  const messagePrivacy = resolveMessagePrivacy(user);

  return {
    profile,
    posts,
    messagePrivacy,
    searchEngineVisibility: resolveSearchEngineVisibility(user),
    activityStatus: user.privacySettings?.activityStatus !== false,
    allowMessages: messagePrivacy !== PRIVACY.PRIVATE,
    allowConnectionRequests: resolveConnectionRequestPermission(user),
    allowTagging: user.privacySettings?.allowTagging || 'friends',
    dataSharing: user.privacySettings?.dataSharing === true
  };
};

const createPrivacyContext = (viewer = null) => {
  const viewerId = toUserId(viewer);
  const relationshipCache = new Map();

  const isOwner = (owner = null) => (
    Boolean(viewerId) && toUserId(owner) === viewerId
  );

  const isFriend = async (owner = null) => {
    const ownerId = toUserId(owner);
    if (!ownerId || !viewerId || ownerId === viewerId) {
      return false;
    }

    const cacheKey = `${ownerId}:${viewerId}`;
    if (relationshipCache.has(cacheKey)) {
      return relationshipCache.get(cacheKey);
    }

    const ownerFriends = owner?.friends;
    const viewerFriends = viewer?.friends;

    if (Array.isArray(ownerFriends) && ownerFriends.length > 0) {
      const ownerHasViewer = ownerFriends.some((friendId) => toUserId(friendId) === viewerId);
      if (ownerHasViewer) {
        relationshipCache.set(cacheKey, true);
        return true;
      }
    }

    if (Array.isArray(viewerFriends) && viewerFriends.length > 0) {
      const viewerHasOwner = viewerFriends.some((friendId) => toUserId(friendId) === ownerId);
      if (viewerHasOwner) {
        relationshipCache.set(cacheKey, true);
        return true;
      }
    }

    const isConnected = Boolean(await User.exists({
      $or: [
        { _id: ownerId, friends: viewerId },
        { _id: viewerId, friends: ownerId }
      ]
    }));
    relationshipCache.set(cacheKey, isConnected);
    return isConnected;
  };

  const canViewProfile = async (owner = null) => {
    if (!owner) return false;
    if (isOwner(owner)) return true;

    const profileVisibility = resolveProfileVisibility(owner);
    if (profileVisibility === PRIVACY.PUBLIC) return true;
    if (profileVisibility === PRIVACY.FRIENDS) {
      return isFriend(owner);
    }
    return false;
  };

  const canViewPost = async (post = null, ownerOverride = null) => {
    const owner = ownerOverride || post?.user;
    if (!post || !owner) return false;
    if (isOwner(owner)) return true;

    const postVisibility = normalizePrivacyValue(
      post.visibility,
      resolvePostVisibility(owner)
    );

    if (postVisibility === PRIVACY.PUBLIC) return true;
    if (postVisibility === PRIVACY.FRIENDS) {
      return isFriend(owner);
    }
    return false;
  };

  const canMessageUser = async (owner = null) => {
    if (!owner) return false;
    if (isOwner(owner)) return true;

    const messagePrivacy = resolveMessagePrivacy(owner);
    if (messagePrivacy === PRIVACY.PUBLIC) return true;
    if (messagePrivacy === PRIVACY.FRIENDS) {
      return isFriend(owner);
    }
    return false;
  };

  const sanitizeUser = async (owner = null, options = {}) => {
    if (!owner) return null;

    const includeEmailForFriends = options.includeEmailForFriends !== false;
    const includePrivacy = options.includePrivacy !== false;
    const ownerFlag = isOwner(owner);
    const friendFlag = ownerFlag ? false : await isFriend(owner);
    const canViewProfileFlag = ownerFlag ? true : await canViewProfile(owner);

    return {
      _id: owner._id,
      username: owner.username,
      email: ownerFlag || (includeEmailForFriends && friendFlag) ? owner.email : undefined,
      profile: canViewProfileFlag ? (owner.profile || {}) : {},
      privacy: includePrivacy ? buildPublicPrivacySettings(owner) : undefined,
      isOwner: ownerFlag,
      isFriend: friendFlag,
      isPrivate: !canViewProfileFlag,
      canViewProfile: canViewProfileFlag
    };
  };

  return {
    viewerId,
    isOwner,
    isFriend,
    canViewProfile,
    canViewPost,
    canMessageUser,
    sanitizeUser
  };
};

module.exports = {
  PRIVACY,
  PRIVACY_VALUES,
  normalizePrivacyValue,
  toUserId,
  resolveProfileVisibility,
  resolvePostVisibility,
  resolveMessagePrivacy,
  resolveSearchEngineVisibility,
  resolveConnectionRequestPermission,
  buildPublicPrivacySettings,
  createPrivacyContext
};
