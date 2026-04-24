const mongoose = require('mongoose');
const User = require('../models/User');
const Post = require('../models/Post');
const SecurityLog = require('../models/SecurityLog');
const { sendSecurityEmail } = require('./monitoringController');
const {
  buildPublicPrivacySettings,
  resolveConnectionRequestPermission,
  resolveSearchEngineVisibility
} = require('../utils/privacy');

const normalizeInterest = (value) => String(value || '').trim().toLowerCase();
const escapeRegex = (value) => String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const truncateText = (value, maxLength = 220) => {
  const text = String(value || '');
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 3)}...`;
};

const SEARCH_CATEGORIES = Object.freeze({
  PEOPLE: 'people',
  COMPANY: 'company',
  GROUPS: 'groups',
  NEWSLETTERS: 'newsletters',
  POSTS: 'posts',
  JOBS: 'jobs',
  INTERNSHIPS: 'internships'
});

const SEARCH_CATEGORY_SET = new Set(Object.values(SEARCH_CATEGORIES));
const SEARCH_RESULT_LIMIT = 40;

const normalizeSearchCategory = (value) => {
  const normalized = String(value || '').trim().toLowerCase();
  return SEARCH_CATEGORY_SET.has(normalized) ? normalized : SEARCH_CATEGORIES.PEOPLE;
};

const matchesCategoryKeywords = (content, category) => {
  const text = String(content || '');
  if (!text) return false;

  if (category === SEARCH_CATEGORIES.NEWSLETTERS) {
    return /newsletter|digest|roundup|bulletin|weekly\s+update/i.test(text);
  }
  if (category === SEARCH_CATEGORIES.JOBS) {
    return /hiring|job|career|opening|position|vacancy|role/i.test(text);
  }
  if (category === SEARCH_CATEGORIES.INTERNSHIPS) {
    return /internship|intern|summer\s+intern|graduate\s+intern/i.test(text);
  }
  return true;
};

const extractCompanyLabel = (profile = {}, regex = null) => {
  const candidates = [
    profile.experience,
    profile.qualification,
    profile.education,
    profile.jobTitle
  ]
    .map((value) => String(value || '').trim())
    .filter(Boolean);

  if (!candidates.length) {
    return '';
  }

  if (regex) {
    const exactMatch = candidates.find((candidate) => regex.test(candidate));
    if (exactMatch) return exactMatch;
  }

  return candidates[0];
};

const buildVisiblePostCandidates = async (req, regex, limit = 120) => {
  const candidatePosts = await Post.find({
    content: regex,
    user: { $ne: req.user._id }
  })
    .populate('user', 'username profile friends profileVisibility postVisibility messagePrivacy privacySettings')
    .sort({ createdAt: -1 })
    .limit(limit);

  const visiblePosts = [];
  for (const candidatePost of candidatePosts) {
    const owner = candidatePost.user;
    if (!owner || !resolveSearchEngineVisibility(owner)) {
      continue;
    }

    if (await req.canViewPost(candidatePost, owner)) {
      visiblePosts.push(candidatePost);
    }
  }

  return visiblePosts;
};

const mapPeopleResults = async (req, users = []) => {
  const mappedUsers = await Promise.all(users.map(async (user) => {
    if (!resolveSearchEngineVisibility(user)) {
      return null;
    }

    const sanitized = await req.sanitizeUser(user, {
      includeEmailForFriends: true,
      includePrivacy: true
    });

    if (!sanitized) {
      return null;
    }

    const privacy = sanitized.privacy || buildPublicPrivacySettings(user);
    return {
      _id: sanitized._id,
      username: sanitized.username,
      email: sanitized.email,
      profile: sanitized.profile || {},
      privacy,
      isFriend: sanitized.isFriend,
      isPrivate: sanitized.isPrivate,
      visible: true,
      resultType: SEARCH_CATEGORIES.PEOPLE
    };
  }));

  return mappedUsers.filter(Boolean);
};

const runPeopleSearch = async (req, query, regex) => {
  const queryLooksLikeObjectId = mongoose.Types.ObjectId.isValid(query);
  const queryObjectId = queryLooksLikeObjectId ? new mongoose.Types.ObjectId(query) : null;

  const visiblePosts = await buildVisiblePostCandidates(req, regex, 120);
  const matchedPostAuthorIds = [...new Set(
    visiblePosts
      .map((post) => post.user?._id?.toString())
      .filter(Boolean)
  )];

  const searchFilters = [
    { username: regex },
    { email: regex },
    { 'profile.jobTitle': regex },
    { 'profile.location': regex },
    { 'profile.bio': regex }
  ];

  if (queryObjectId) {
    searchFilters.push({ _id: queryObjectId });
  }
  if (matchedPostAuthorIds.length) {
    searchFilters.push({ _id: { $in: matchedPostAuthorIds } });
  }

  const users = await User.find({
    _id: { $ne: req.user._id },
    $or: searchFilters
  })
    .select('username email profile privacySettings friends profileVisibility postVisibility messagePrivacy')
    .limit(SEARCH_RESULT_LIMIT * 2);

  const results = await mapPeopleResults(req, users);
  return results.slice(0, SEARCH_RESULT_LIMIT);
};

const runCompanySearch = async (req, regex) => {
  const users = await User.find({
    _id: { $ne: req.user._id },
    $or: [
      { 'profile.experience': regex },
      { 'profile.qualification': regex },
      { 'profile.education': regex },
      { 'profile.jobTitle': regex }
    ]
  })
    .select('username profile privacySettings friends profileVisibility postVisibility messagePrivacy')
    .limit(SEARCH_RESULT_LIMIT * 3);

  const peopleMatches = await mapPeopleResults(req, users);
  const groupedCompanies = new Map();

  peopleMatches.forEach((person) => {
    const companyLabel = extractCompanyLabel(person.profile || {}, regex);
    if (!companyLabel) {
      return;
    }

    const normalizedKey = companyLabel.toLowerCase();
    const current = groupedCompanies.get(normalizedKey) || {
      id: `company-${normalizedKey.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'result'}`,
      name: companyLabel,
      memberCount: 0,
      sampleRoles: new Set(),
      sampleLocations: new Set()
    };

    current.memberCount += 1;
    if (person.profile?.jobTitle) {
      current.sampleRoles.add(person.profile.jobTitle);
    }
    if (person.profile?.location) {
      current.sampleLocations.add(person.profile.location);
    }
    groupedCompanies.set(normalizedKey, current);
  });

  return [...groupedCompanies.values()]
    .map((company) => ({
      _id: company.id,
      resultType: SEARCH_CATEGORIES.COMPANY,
      name: company.name,
      memberCount: company.memberCount,
      sampleRoles: [...company.sampleRoles].slice(0, 3),
      sampleLocations: [...company.sampleLocations].slice(0, 2)
    }))
    .sort((a, b) => {
      if (b.memberCount !== a.memberCount) {
        return b.memberCount - a.memberCount;
      }
      return a.name.localeCompare(b.name);
    })
    .slice(0, SEARCH_RESULT_LIMIT);
};

const runGroupSearch = async (req, regex) => {
  const users = await User.find({
    _id: { $ne: req.user._id },
    $or: [
      { 'profile.skills': regex },
      { 'profile.interests': regex }
    ]
  })
    .select('username profile privacySettings friends profileVisibility postVisibility messagePrivacy')
    .limit(SEARCH_RESULT_LIMIT * 3);

  const topicGroups = new Map();
  for (const user of users) {
    if (!resolveSearchEngineVisibility(user)) {
      continue;
    }
    if (!(await req.canViewProfile(user))) {
      continue;
    }

    const topics = [
      ...(user.profile?.skills || []),
      ...(user.profile?.interests || [])
    ]
      .map((topic) => String(topic || '').trim())
      .filter((topic) => topic && regex.test(topic));

    for (const topic of topics) {
      const normalizedTopic = topic.toLowerCase();
      const current = topicGroups.get(normalizedTopic) || {
        id: `group-${normalizedTopic.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'result'}`,
        name: topic,
        memberCount: 0
      };
      current.memberCount += 1;
      topicGroups.set(normalizedTopic, current);
    }
  }

  return [...topicGroups.values()]
    .map((topic) => ({
      _id: topic.id,
      resultType: SEARCH_CATEGORIES.GROUPS,
      name: topic.name,
      memberCount: topic.memberCount
    }))
    .sort((a, b) => {
      if (b.memberCount !== a.memberCount) {
        return b.memberCount - a.memberCount;
      }
      return a.name.localeCompare(b.name);
    })
    .slice(0, SEARCH_RESULT_LIMIT);
};

const runPostLikeSearch = async (req, regex, category) => {
  const visiblePosts = await buildVisiblePostCandidates(req, regex, 140);
  const filteredPosts = visiblePosts.filter((post) => (
    category === SEARCH_CATEGORIES.POSTS || matchesCategoryKeywords(post.content, category)
  ));

  const mappedPosts = await Promise.all(filteredPosts.slice(0, SEARCH_RESULT_LIMIT).map(async (post) => {
    const owner = post.user;
    const sanitizedOwner = owner
      ? await req.sanitizeUser(owner, { includeEmailForFriends: false, includePrivacy: false })
      : null;

    return {
      _id: post._id,
      resultType: category,
      content: post.content || '',
      snippet: truncateText(post.content || '', 220),
      createdAt: post.createdAt,
      visibility: post.visibility,
      author: {
        _id: owner?._id,
        username: owner?.username || 'Member',
        avatar: sanitizedOwner?.profile?.avatar || '',
        jobTitle: sanitizedOwner?.profile?.jobTitle || '',
        location: sanitizedOwner?.profile?.location || ''
      },
      stats: {
        likes: Array.isArray(post.likes) ? post.likes.length : 0,
        comments: Array.isArray(post.comments) ? post.comments.length : 0,
        views: Number(post.views || 0)
      }
    };
  }));

  return mappedPosts;
};

exports.getProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('-password -totpSecret');
    if (!user) return res.status(404).json({ msg: 'User not found' });
    const postsCount = await Post.countDocuments({ user: user._id });
    const hasStoredPostsCount = Number.isFinite(user.profile?.postsCount);
    const shouldPersistPostsCount = !hasStoredPostsCount || user.profile.postsCount !== postsCount;
    if (shouldPersistPostsCount) {
      user.profile = user.profile || {};
      user.profile.postsCount = postsCount;
      await user.save();
    }

    const userObj = user.toObject();
    userObj.profile = {
      ...userObj.profile,
      profileViews: userObj.profile?.profileViews || 0,
      postImpressions: userObj.profile?.postImpressions || 0,
      searchAppearances: userObj.profile?.searchAppearances || 0,
      postsCount
    };
    userObj.followers = user.friends?.length || 0;
    userObj.postsCount = postsCount;
    userObj.pendingSecurityAlert = user.securityAlerts?.find((alert) => alert.status === 'pending') || null;
    userObj.passwordResetRequired = user.passwordResetRequired || false;
    res.json({ profile: userObj });
  } catch (error) {
    res.status(500).json({ msg: error.message });
  }
};

exports.searchProfiles = async (req, res) => {
  try {
    const query = (req.query.q || '').trim();
    if (!query) {
      return res.status(400).json({ msg: 'Search query is required' });
    }
    const category = normalizeSearchCategory(req.query.category);
    const safeQuery = escapeRegex(query);
    const regex = new RegExp(safeQuery, 'i');

    let results = [];
    if (category === SEARCH_CATEGORIES.PEOPLE) {
      results = await runPeopleSearch(req, query, regex);
      if (results.length > 0) {
        const matchedUserIds = results.map((result) => result._id);
        await User.updateMany(
          { _id: { $in: matchedUserIds } },
          { $inc: { 'profile.searchAppearances': 1 } }
        );
      }
    } else if (category === SEARCH_CATEGORIES.COMPANY) {
      results = await runCompanySearch(req, regex);
    } else if (category === SEARCH_CATEGORIES.GROUPS) {
      results = await runGroupSearch(req, regex);
    } else if (
      category === SEARCH_CATEGORIES.POSTS
      || category === SEARCH_CATEGORIES.NEWSLETTERS
      || category === SEARCH_CATEGORIES.JOBS
      || category === SEARCH_CATEGORIES.INTERNSHIPS
    ) {
      results = await runPostLikeSearch(req, regex, category);
    }

    res.json({ category, results, total: results.length });
  } catch (error) {
    res.status(500).json({ msg: error.message });
  }
};

exports.getConnectionSuggestions = async (req, res) => {
  try {
    const parsedLimit = Number.parseInt(req.query.limit, 10);
    const limit = Number.isNaN(parsedLimit) ? 5 : Math.min(Math.max(parsedLimit, 1), 20);

    const currentUser = await User.findById(req.user._id).select(
      'friends connectionRequests profile.skills profile.interests'
    );
    if (!currentUser) {
      return res.status(404).json({ msg: 'User not found' });
    }

    const currentUserId = req.user._id.toString();
    const connectedIds = new Set((currentUser.friends || []).map((id) => id.toString()));
    const incomingRequestIds = new Set((currentUser.connectionRequests || []).map((id) => id.toString()));

    const userTopics = [...new Set(
      [
        ...(currentUser.profile?.skills || []),
        ...(currentUser.profile?.interests || [])
      ]
        .map(normalizeInterest)
        .filter(Boolean)
    )];

    const candidateUsers = await User.find({
      _id: { $ne: req.user._id, $nin: Array.from(connectedIds) },
      accountLocked: { $ne: true },
      'privacySettings.searchEngineVisibility': { $ne: false }
    })
      .select('username profile connectionRequests createdAt')
      .sort({ createdAt: -1 })
      .limit(80);

    const suggestions = candidateUsers
      .map((candidate) => {
        if (!resolveSearchEngineVisibility(candidate)) {
          return null;
        }

        const candidateId = candidate._id.toString();

        // If this user has already sent us a request, we surface that in notifications instead.
        if (incomingRequestIds.has(candidateId)) {
          return null;
        }

        const candidateTopics = [
          ...(candidate.profile?.skills || []),
          ...(candidate.profile?.interests || [])
        ];

        const normalizedToDisplay = new Map();
        candidateTopics.forEach((topic) => {
          const displayTopic = String(topic || '').trim();
          const normalizedTopic = normalizeInterest(displayTopic);
          if (!normalizedTopic) return;
          if (!normalizedToDisplay.has(normalizedTopic)) {
            normalizedToDisplay.set(normalizedTopic, displayTopic);
          }
        });

        const matchedTopics = [];
        normalizedToDisplay.forEach((displayTopic, normalizedTopic) => {
          const isMatch = userTopics.some((userTopic) => (
            normalizedTopic === userTopic
            || normalizedTopic.includes(userTopic)
            || userTopic.includes(normalizedTopic)
          ));
          if (isMatch) {
            matchedTopics.push(displayTopic);
          }
        });

        const sharedInterests = matchedTopics.slice(0, 3);
        const matchScore = matchedTopics.length;

        // Outgoing pending request means current user already requested this candidate.
        const requestPending = (candidate.connectionRequests || [])
          .some((requesterId) => requesterId.toString() === currentUserId);

        if (userTopics.length > 0 && matchScore === 0) {
          return null;
        }

        return {
          _id: candidate._id,
          username: candidate.username,
          avatar: candidate.profile?.avatar || '',
          jobTitle: candidate.profile?.jobTitle || '',
          location: candidate.profile?.location || '',
          sharedInterests,
          matchScore,
          requestPending,
          joinedAt: candidate.createdAt
        };
      })
      .filter(Boolean)
      .sort((a, b) => {
        if (b.matchScore !== a.matchScore) {
          return b.matchScore - a.matchScore;
        }
        return new Date(b.joinedAt).getTime() - new Date(a.joinedAt).getTime();
      })
      .slice(0, limit);

    res.json({ suggestions });
  } catch (error) {
    res.status(500).json({ msg: error.message });
  }
};

exports.getUserProfile = async (req, res) => {
  try {
    const targetUser = await User.findById(req.params.id).select('-password -totpSecret');
    if (!targetUser) return res.status(404).json({ msg: 'User not found' });

    const isOwner = req.isOwnerUser(targetUser);
    const isFriend = await req.isFriendWith(targetUser);
    const canViewProfile = await req.canViewProfile(targetUser);
    const connectionRequested = targetUser.connectionRequests.some((reqId) => reqId.toString() === req.user._id.toString());

    if (!canViewProfile) {
      return res.status(403).json({ msg: 'Profile is private', connectionRequested });
    }

    const postsCount = await Post.countDocuments({ user: targetUser._id });
    let shouldSaveTarget = false;
    targetUser.profile = targetUser.profile || {};

    if (!isOwner) {
      targetUser.profile.profileViews = (targetUser.profile.profileViews || 0) + 1;
      shouldSaveTarget = true;
    }

    if (!Number.isFinite(targetUser.profile.postsCount) || targetUser.profile.postsCount !== postsCount) {
      targetUser.profile.postsCount = postsCount;
      shouldSaveTarget = true;
    }

    if (shouldSaveTarget) {
      await targetUser.save();
    }

    const sanitized = await req.sanitizeUser(targetUser, {
      includeEmailForFriends: true,
      includePrivacy: true
    });
    const privacySettings = sanitized?.privacy || buildPublicPrivacySettings(targetUser);
    const canMessage = await req.canMessageUser(targetUser);
    privacySettings.allowMessages = canMessage;

    const responseProfile = {
      _id: targetUser._id,
      username: targetUser.username,
      profile: sanitized?.profile || {},
      privacySettings,
      friendsCount: targetUser.friends.length,
      followers: targetUser.friends.length,
      postsCount,
      email: sanitized?.email,
      isOwner,
      isFriend,
      connectionRequested
    };

    res.json({ profile: responseProfile, isOwner, isFriend });
  } catch (error) {
    res.status(500).json({ msg: error.message });
  }
};

exports.updateProfile = async (req, res) => {
  try {
    const updates = req.body;
    const allowedFields = ['username', 'bio', 'jobTitle', 'location', 'banner', 'avatar', 'qualification', 'experience', 'education', 'skills', 'interests', 'badges'];
    const profileUpdates = {};

    allowedFields.forEach((field) => {
      if (updates[field] !== undefined) {
        if (field === 'username') {
          profileUpdates.username = updates.username;
        } else {
          profileUpdates[`profile.${field}`] = updates[field];
        }
      }
    });

    const user = await User.findByIdAndUpdate(
      req.user._id,
      { $set: profileUpdates },
      { new: true, runValidators: true }
    ).select('-password -totpSecret');

    res.json({ profile: user, msg: 'Profile updated successfully' });
  } catch (error) {
    res.status(500).json({ msg: error.message });
  }
};

exports.requestConnection = async (req, res) => {
  try {
    const currentUser = await User.findById(req.user._id);
    const targetUser = await User.findById(req.params.id);
    if (!currentUser) return res.status(404).json({ msg: 'User not found' });
    if (!targetUser) return res.status(404).json({ msg: 'User not found' });
    if (targetUser._id.toString() === req.user._id.toString()) {
      return res.status(400).json({ msg: 'Cannot connect with yourself' });
    }

    const alreadyFriends = targetUser.friends.some((friendId) => friendId.toString() === req.user._id.toString());
    if (alreadyFriends) {
      return res.status(400).json({ msg: 'You are already connected' });
    }

    const hasIncomingRequestFromTarget = (currentUser.connectionRequests || [])
      .some((requesterId) => requesterId.toString() === targetUser._id.toString());

    if (hasIncomingRequestFromTarget) {
      currentUser.connectionRequests = (currentUser.connectionRequests || [])
        .filter((requesterId) => requesterId.toString() !== targetUser._id.toString());
      targetUser.connectionRequests = (targetUser.connectionRequests || [])
        .filter((requesterId) => requesterId.toString() !== currentUser._id.toString());

      if (!(currentUser.friends || []).some((friendId) => friendId.toString() === targetUser._id.toString())) {
        currentUser.friends.push(targetUser._id);
      }
      if (!(targetUser.friends || []).some((friendId) => friendId.toString() === currentUser._id.toString())) {
        targetUser.friends.push(currentUser._id);
      }

      currentUser.notifications = (currentUser.notifications || []).filter((notification) => !(
        notification.type === 'request'
        && notification.from
        && notification.from.toString() === targetUser._id.toString()
      ));
      targetUser.notifications = (targetUser.notifications || []).filter((notification) => !(
        notification.type === 'request'
        && notification.from
        && notification.from.toString() === currentUser._id.toString()
      ));

      targetUser.notifications.push({
        type: 'accepted',
        message: `${currentUser.username} connected with you`,
        from: currentUser._id,
        read: false,
        createdAt: new Date()
      });

      await Promise.all([currentUser.save(), targetUser.save()]);
      return res.json({ msg: 'Connection established' });
    }

    if (!resolveConnectionRequestPermission(targetUser)) {
      return res.status(403).json({ msg: 'This member is not accepting connection requests right now.' });
    }

    const alreadyRequested = targetUser.connectionRequests.some((requesterId) => requesterId.toString() === req.user._id.toString());
    if (alreadyRequested) {
      return res.status(400).json({ msg: 'Connection request already pending' });
    }

    targetUser.connectionRequests.push(req.user._id);
    targetUser.notifications.push({
      type: 'request',
      message: `${currentUser.username} sent you a connection request`,
      from: req.user._id,
      read: false,
      createdAt: new Date()
    });
    await targetUser.save();

    res.json({ msg: 'Connection request sent' });
  } catch (error) {
    res.status(500).json({ msg: error.message });
  }
};

exports.getConnectionRequests = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).populate('connectionRequests', 'username profile');
    const requests = (user.connectionRequests || []).map((requester) => ({
      _id: requester._id,
      username: requester.username,
      avatar: requester.profile?.avatar || ''
    }));

    res.json({ requests, count: requests.length });
  } catch (error) {
    res.status(500).json({ msg: error.message });
  }
};

exports.getConnections = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).populate(
      'friends',
      'username email profile privacySettings friends profileVisibility postVisibility messagePrivacy'
    );
    if (!user) return res.status(404).json({ msg: 'User not found' });

    const currentUserId = req.user._id.toString();
    const seenConnectionIds = new Set();
    const candidateConnections = (user.friends || [])
      .filter((friend) => {
        const friendId = friend?._id ? friend._id.toString() : '';
        if (!friendId || friendId === currentUserId || seenConnectionIds.has(friendId)) {
          return false;
        }

        seenConnectionIds.add(friendId);
        return true;
      });

    const mappedConnections = await Promise.all(candidateConnections.map(async (friend) => {
      const sanitized = await req.sanitizeUser(friend, {
        includeEmailForFriends: false,
        includePrivacy: true
      });
      if (!sanitized?.canViewProfile) {
        return null;
      }

      const canMessage = await req.canMessageUser(friend);
      return {
        _id: friend._id,
        username: friend.username,
        avatar: sanitized.profile?.avatar || '',
        jobTitle: sanitized.profile?.jobTitle || '',
        location: sanitized.profile?.location || '',
        privacy: {
          profile: sanitized.privacy?.profile || 'public',
          messagePrivacy: sanitized.privacy?.messagePrivacy || 'friends'
        },
        allowsMessages: canMessage
      };
    }));

    const connections = mappedConnections.filter(Boolean);

    res.json({ connections, count: connections.length });
  } catch (error) {
    res.status(500).json({ msg: error.message });
  }
};

exports.getNotifications = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).populate('notifications.from', 'username profile');
    if (!user) return res.status(404).json({ msg: 'User not found' });

    const pendingRequestIds = new Set((user.connectionRequests || []).map((id) => id.toString()));
    const connectedIds = new Set((user.friends || []).map((id) => id.toString()));

    const notifications = (user.notifications || []).map((notification) => {
      const fromId = notification.from?._id
        ? notification.from._id.toString()
        : notification.from
          ? notification.from.toString()
          : null;

      let requestState = null;
      if (notification.type === 'request' && fromId) {
        if (connectedIds.has(fromId)) {
          requestState = 'connected';
        } else if (pendingRequestIds.has(fromId)) {
          requestState = 'pending';
        } else {
          requestState = 'cleared';
        }
      }

      return {
        _id: notification._id,
        type: notification.type,
        message: notification.message,
        from: notification.from ? {
          _id: notification.from._id,
          username: notification.from.username,
          avatar: notification.from.profile?.avatar || ''
        } : null,
        read: notification.read,
        createdAt: notification.createdAt,
        requestState
      };
    })
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    res.json({ notifications });
  } catch (error) {
    res.status(500).json({ msg: error.message });
  }
};

exports.markNotificationAsRead = async (req, res) => {
  try {
    const { notificationId } = req.params;
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ msg: 'User not found' });

    const notification = user.notifications.id(notificationId);
    if (!notification) {
      return res.status(404).json({ msg: 'Notification not found' });
    }

    notification.read = true;
    await user.save();
    res.json({ msg: 'Notification marked as read' });
  } catch (error) {
    res.status(500).json({ msg: error.message });
  }
};

exports.deleteNotification = async (req, res) => {
  try {
    const { notificationId } = req.params;
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ msg: 'User not found' });

    const beforeCount = (user.notifications || []).length;
    user.notifications = (user.notifications || []).filter((notification) => (
      notification._id.toString() !== notificationId
    ));

    if ((user.notifications || []).length === beforeCount) {
      return res.status(404).json({ msg: 'Notification not found' });
    }

    await user.save();
    res.json({ msg: 'Notification deleted' });
  } catch (error) {
    res.status(500).json({ msg: error.message });
  }
};

exports.confirmSecurityAlert = async (req, res) => {
  try {
    const { alertId } = req.body;
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ msg: 'User not found' });

    const alert = (user.securityAlerts || []).find((a) => a.alertId === alertId && a.status === 'pending');
    if (!alert) {
      return res.status(404).json({ msg: 'Pending alert not found' });
    }

    alert.status = 'confirmed';
    alert.updatedAt = new Date();
    user.passwordResetRequired = false;
    await user.save();

    res.json({ msg: 'Unrecognized login confirmed and whitelisted' });
  } catch (error) {
    res.status(500).json({ msg: error.message });
  }
};

exports.secureAccount = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ msg: 'User not found' });

    const currentSessionId = req.sessionId;
    user.sessions = (user.sessions || []).map((session) => ({
      ...session.toObject ? session.toObject() : session,
      active: session.sessionId === currentSessionId ? true : false
    }));
    user.passwordResetRequired = false;
    user.accountLocked = false;
    user.accountLockedAt = null;
    user.tokenVersion += 1; // Invalidate all existing JWT tokens
    user.connectedApps = (user.connectedApps || []).map((app) => ({
      ...app,
      revoked: true,
      revokedAt: new Date()
    }));
    const pending = (user.securityAlerts || []).find((alert) => alert.status === 'pending');
    if (pending) {
      pending.status = 'revoked';
      pending.updatedAt = new Date();
    }

    await user.save();
    await sendSecurityEmail(
      user.email,
      'Trust node account secured',
      '<p>Your account security action completed. Other active sessions were signed out.</p><p>Your password was not changed automatically. Use Forgot Password if you want to reset it.</p>'
    );
    res.json({ msg: 'Account secured. Other sessions were signed out. Password remains unchanged until you reset it.' });
  } catch (error) {
    res.status(500).json({ msg: error.message });
  }
};

exports.rejectConnectionRequest = async (req, res) => {
  try {
    const requesterId = req.params.id;
    const currentUser = await User.findById(req.user._id).select('username');
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ msg: 'User not found' });

    const requestExists = user.connectionRequests.some((requester) => requester.toString() === requesterId);
    if (!requestExists) {
      return res.status(404).json({ msg: 'Connection request not found' });
    }

    user.connectionRequests = user.connectionRequests.filter((requester) => requester.toString() !== requesterId);
    user.notifications = (user.notifications || []).filter((notification) => !(
      notification.type === 'request'
      && notification.from
      && notification.from.toString() === requesterId
    ));
    await user.save();

    const requester = await User.findById(requesterId);
    if (requester) {
      requester.notifications.push({
        type: 'rejected',
        message: `${currentUser.username} rejected your connection request`,
        from: user._id,
        read: false,
        createdAt: new Date()
      });
      await requester.save();
    }

    res.json({ msg: 'Connection request rejected' });
  } catch (error) {
    res.status(500).json({ msg: error.message });
  }
};

exports.getSecurityLogs = async (req, res) => {
  try {
    const currentSessionId = req.sessionId;
    const sessions = (req.user.sessions || [])
      .filter((session) => session.active)
      .map((session) => ({
        sessionId: session.sessionId,
        ip: session.ip,
        device: session.device,
        browser: session.browser,
        os: session.os,
        location: session.location,
        createdAt: session.createdAt,
        lastActive: session.lastActive,
        active: session.active
      }))
      .sort((a, b) => new Date(b.lastActive) - new Date(a.lastActive));

    const logs = await SecurityLog.find({ user: req.user._id }).sort({ timestamp: -1 }).limit(100).lean();
    res.json({ logs, sessions, currentSessionId });
  } catch (error) {
    res.status(500).json({ msg: error.message });
  }
};

exports.logoutOtherSessions = async (req, res) => {
  try {
    const currentSessionId = req.sessionId;
    const user = req.user;

    user.sessions = (user.sessions || []).map((session) => {
      if (session.sessionId !== currentSessionId) {
        session.active = false;
      }
      return session;
    });

    await user.save();
    res.json({ msg: 'Logged out of all other devices' });
  } catch (error) {
    res.status(500).json({ msg: error.message });
  }
};

exports.logoutSession = async (req, res) => {
  try {
    const { sessionId } = req.params;
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ msg: 'User not found' });
    user.sessions = (user.sessions || []).map((session) => {
      if (session.sessionId === sessionId) {
        session.active = false;
      }
      return session;
    });
    await user.save();
    res.json({ msg: 'Session logged out' });
  } catch (error) {
    res.status(500).json({ msg: error.message });
  }
};

exports.exportSecurityData = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('-password -totpSecret');
    if (!user) return res.status(404).json({ msg: 'User not found' });

    const securityLogs = await SecurityLog.find({ user: req.user._id }).sort({ timestamp: -1 });
    const exportData = {
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        accountLocked: user.accountLocked,
        exportedAt: new Date()
      },
      securityAlerts: user.securityAlerts || [],
      securityLogs: securityLogs,
      trustedDevices: user.trustedDevices || [],
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
    };

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="security-data-${Date.now()}.json"`);
    res.send(exportData);
  } catch (error) {
    res.status(500).json({ msg: error.message });
  }
};

exports.logoutSession_OLD = async (req, res) => {
  try {
    const { sessionId } = req.params;
    const user = req.user;
    const session = (user.sessions || []).find((s) => s.sessionId === sessionId);

    if (!session) {
      return res.status(404).json({ msg: 'Session not found' });
    }
    if (session.sessionId === req.sessionId) {
      return res.status(400).json({ msg: 'Use regular logout for this session' });
    }

    session.active = false;
    await user.save();
    res.json({ msg: 'Logged out of selected device' });
  } catch (error) {
    res.status(500).json({ msg: error.message });
  }
};

exports.acceptConnectionRequest = async (req, res) => {
  try {
    const requesterId = req.params.id;
    const currentUser = await User.findById(req.user._id).select('username friends');
    if (!currentUser) return res.status(404).json({ msg: 'User not found' });

    // Claim this pending request exactly once and remove request notifications in the same update.
    const claimUpdate = await User.updateOne(
      { _id: req.user._id, connectionRequests: requesterId },
      {
        $pull: {
          connectionRequests: requesterId,
          notifications: { type: 'request', from: requesterId }
        },
        $addToSet: { friends: requesterId }
      }
    );

    if (!claimUpdate.modifiedCount) {
      const alreadyConnected = (currentUser.friends || []).some((friendId) => friendId.toString() === requesterId);
      if (alreadyConnected) {
        return res.json({ msg: 'Already connected' });
      }
      return res.status(404).json({ msg: 'Connection request not found' });
    }

    // Mirror friendship on requester side; notify only if this is the first time becoming connected.
    const requesterFriendAdd = await User.updateOne(
      { _id: requesterId, friends: { $ne: req.user._id } },
      { $addToSet: { friends: req.user._id } }
    );

    if (requesterFriendAdd.modifiedCount) {
      await User.updateOne(
        { _id: requesterId },
        {
          $push: {
            notifications: {
              type: 'accepted',
              message: `${currentUser.username} accepted your connection request`,
              from: req.user._id,
              read: false,
              createdAt: new Date()
            }
          }
        }
      );
    }

    res.json({ msg: 'Connection accepted' });
  } catch (error) {
    res.status(500).json({ msg: error.message });
  }
};

// Save or update user's public key for E2EE
exports.savePublicKey = async (req, res) => {
  try {
    const publicKey = typeof req.body?.publicKey === 'string'
      ? req.body.publicKey.trim()
      : '';

    if (!publicKey) {
      return res.status(400).json({ msg: 'Public key is required' });
    }

    const user = await User.findByIdAndUpdate(
      req.user._id,
      { publicKey },
      { new: true }
    ).select('-password -totpSecret');

    res.json({ msg: 'Public key saved', user });
  } catch (error) {
    res.status(500).json({ msg: error.message });
  }
};

// Get user's public key
exports.getPublicKey = async (req, res) => {
  try {
    const user = await User.findById(req.params.userId).select('publicKey username');
    if (!user) {
      return res.status(404).json({ msg: 'User not found' });
    }
    if (!user.publicKey) {
      return res.status(404).json({ msg: 'Public key not found for this user' });
    }

    res.json({ publicKey: user.publicKey, username: user.username });
  } catch (error) {
    res.status(500).json({ msg: error.message });
  }
};
