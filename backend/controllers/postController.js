const fs = require('fs');
const path = require('path');
const Post = require('../models/Post');
const User = require('../models/User');
const File = require('../models/File');
const Notification = require('../models/Notification');
const { decryptPayload } = require('./uploadController');
const {
  PRIVACY_VALUES,
  normalizePrivacyValue,
  resolvePostVisibility
} = require('../utils/privacy');

const SECURE_POST_MEDIA_DIR = path.resolve(__dirname, '../storage/post-media');
const LEGACY_PUBLIC_MEDIA_DIR = path.resolve(__dirname, '../public/media');
const LEGACY_PUBLIC_IMAGES_DIR = path.resolve(__dirname, '../public/images');
const MEDIA_KEY_PATTERN = /^post_media_[a-f0-9]{24}_\d+_[a-f0-9]{16}\.(jpg|jpeg|png|mp4|webm)$/i;
const POST_EDIT_WINDOW_MS = 24 * 60 * 60 * 1000;

const resolveMimeTypeFromPath = (filePath = '', fallbackMediaType = 'image') => {
  const extension = path.extname(filePath).toLowerCase();
  if (extension === '.png') return 'image/png';
  if (extension === '.jpg' || extension === '.jpeg') return 'image/jpeg';
  if (extension === '.mp4') return 'video/mp4';
  if (extension === '.webm') return 'video/webm';
  return fallbackMediaType === 'video' ? 'video/mp4' : 'image/jpeg';
};

const isPathInside = (candidatePath, rootPath) => {
  const absoluteCandidate = path.resolve(candidatePath);
  const absoluteRoot = path.resolve(rootPath);
  return absoluteCandidate === absoluteRoot || absoluteCandidate.startsWith(`${absoluteRoot}${path.sep}`);
};

const getPostOwnerId = (post) => {
  if (!post?.user) return '';
  if (typeof post.user === 'object' && post.user._id) return String(post.user._id);
  return String(post.user);
};

const isPostOwner = (post, userId) => getPostOwnerId(post) === String(userId || '');

const isWithinEditWindow = (createdAt) => {
  const createdAtMs = new Date(createdAt).getTime();
  if (!Number.isFinite(createdAtMs)) {
    return false;
  }
  return Date.now() - createdAtMs <= POST_EDIT_WINDOW_MS;
};

const safeUnlinkFile = async (targetPath) => {
  if (!targetPath) return;
  try {
    await fs.promises.unlink(targetPath);
  } catch (error) {
    if (error?.code !== 'ENOENT') {
      console.warn(`Unable to delete file ${targetPath}: ${error.message}`);
    }
  }
};

const mapCommentForFeed = (comment) => ({
  _id: comment._id,
  text: comment.text,
  timestamp: comment.timestamp,
  user: {
    _id: comment.user?._id,
    username: comment.user?.username || 'Unknown',
    avatar: comment.user?.profile?.avatar || '',
    title: comment.user?.profile?.jobTitle || 'Security member'
  }
});

const getMediaUrlForFeed = (post) => {
  if (post?.mediaKey || post?.mediaUrl || post?.imageUrl) {
    return `/api/posts/${post._id}/media`;
  }
  return null;
};

const mapPostForFeed = (post, canViewPost = true) => {
  const mediaUrl = getMediaUrlForFeed(post);
  const canDownloadAttachment = Boolean(post.attachment && canViewPost);

  return {
    _id: post._id,
    content: post.content,
    visibility: post.visibility,
    mediaUrl,
    mediaType: post.mediaType || (mediaUrl ? 'image' : null),
    imageUrl: mediaUrl,
    attachmentName: post.attachment?.originalName || null,
    hasAttachment: !!post.attachment,
    downloadUrl: canDownloadAttachment ? `/api/posts/${post._id}/download` : null,
    createdAt: post.createdAt,
    views: Number(post.views || 0),
    likes: (post.likes || []).map((id) => id.toString()),
    shares: (post.shares || []).map((id) => id.toString()),
    comments: (post.comments || []).map(mapCommentForFeed),
    user: {
      _id: post.user?._id,
      username: post.user?.username || 'Unknown',
      title: post.user?.profile?.jobTitle || 'Security member',
      avatar: post.user?.profile?.avatar || ''
    }
  };
};

const resolveLegacyMediaPath = (post) => {
  const legacyMediaUrl = post?.mediaUrl || post?.imageUrl || '';
  const fileName = path.basename(legacyMediaUrl);

  if (legacyMediaUrl.startsWith('/media/')) {
    const candidatePath = path.join(LEGACY_PUBLIC_MEDIA_DIR, fileName);
    if (!isPathInside(candidatePath, LEGACY_PUBLIC_MEDIA_DIR)) {
      return null;
    }
    return candidatePath;
  }

  if (legacyMediaUrl.startsWith('/images/') || legacyMediaUrl.startsWith('/public/images/')) {
    const candidatePath = path.join(LEGACY_PUBLIC_IMAGES_DIR, fileName);
    if (!isPathInside(candidatePath, LEGACY_PUBLIC_IMAGES_DIR)) {
      return null;
    }
    return candidatePath;
  }

  return null;
};

const resolvePostMediaPath = (post) => {
  if (post?.mediaKey) {
    const securePath = path.join(SECURE_POST_MEDIA_DIR, post.mediaKey);
    if (!isPathInside(securePath, SECURE_POST_MEDIA_DIR)) {
      return null;
    }
    return securePath;
  }

  return resolveLegacyMediaPath(post);
};

exports.getPosts = async (req, res) => {
  try {
    const currentUser = await User.findById(req.user._id).select('friends');
    if (!currentUser) {
      return res.status(401).json({ msg: 'User not found.' });
    }

    const posts = await Post.find({
      $or: [
        { user: req.user._id },
        { visibility: 'public' },
        { visibility: 'friends', user: { $in: currentUser.friends || [] } }
      ]
    })
      .sort({ createdAt: -1 })
      .populate('user', 'username profile.avatar profile.jobTitle friends profileVisibility postVisibility privacySettings')
      .populate('comments.user', 'username profile.avatar profile.jobTitle')
      .populate('attachment');

    const visibilityChecks = await Promise.all(posts.map((post) => req.canViewPost(post, post.user)));
    const visiblePosts = posts.filter((_, index) => visibilityChecks[index]);

    const viewerId = req.user._id.toString();
    const viewedPostIds = [];
    const ownerImpressionIncrements = new Map();

    visiblePosts.forEach((post) => {
      const ownerId = post.user?._id?.toString();
      if (!ownerId || ownerId === viewerId) {
        return;
      }
      viewedPostIds.push(post._id);
      ownerImpressionIncrements.set(ownerId, (ownerImpressionIncrements.get(ownerId) || 0) + 1);
      post.views = Number(post.views || 0) + 1;
    });

    if (viewedPostIds.length > 0) {
      const operations = [
        Post.updateMany(
          { _id: { $in: viewedPostIds } },
          { $inc: { views: 1 } }
        )
      ];

      if (ownerImpressionIncrements.size > 0) {
        operations.push(User.bulkWrite(
          Array.from(ownerImpressionIncrements.entries()).map(([ownerId, incrementBy]) => ({
            updateOne: {
              filter: { _id: ownerId },
              update: { $inc: { 'profile.postImpressions': incrementBy } }
            }
          }))
        ));
      }

      await Promise.all(operations);
    }

    const feed = visiblePosts.map((post) => mapPostForFeed(post, true));
    res.json(feed);
  } catch (error) {
    res.status(500).json({ msg: error.message });
  }
};

exports.createPost = async (req, res) => {
  try {
    const {
      content = '',
      visibility: requestedVisibility,
      attachment,
      mediaKey,
      mediaUrl,
      mediaType
    } = req.body;

    const trimmedContent = typeof content === 'string' ? content.trim() : '';
    const defaultVisibility = resolvePostVisibility(req.user);
    const explicitVisibility = typeof requestedVisibility === 'string' ? requestedVisibility.trim().toLowerCase() : '';
    if (explicitVisibility && !PRIVACY_VALUES.includes(explicitVisibility)) {
      return res.status(400).json({ msg: 'Invalid visibility value.' });
    }
    const visibility = normalizePrivacyValue(explicitVisibility || defaultVisibility, defaultVisibility);

    if (!PRIVACY_VALUES.includes(visibility)) {
      return res.status(400).json({ msg: 'Invalid visibility value.' });
    }

    const normalizedMediaKey = typeof mediaKey === 'string' ? mediaKey.trim() : '';
    const hasLegacyMediaUrl = typeof mediaUrl === 'string' && mediaUrl.trim().length > 0;
    if (!trimmedContent && !attachment && !normalizedMediaKey && !hasLegacyMediaUrl) {
      return res.status(400).json({ msg: 'Write something or attach media/file before posting.' });
    }

    let resolvedMediaKey = '';
    let resolvedLegacyMediaUrl;
    let resolvedMediaType;
    let resolvedMediaMimeType;

    if (normalizedMediaKey) {
      if (!MEDIA_KEY_PATTERN.test(normalizedMediaKey)) {
        return res.status(400).json({ msg: 'Invalid media key.' });
      }

      if (mediaType && !['image', 'video'].includes(mediaType)) {
        return res.status(400).json({ msg: 'Invalid media type.' });
      }

      const ownerPrefix = `post_media_${req.user._id}_`;
      if (!normalizedMediaKey.startsWith(ownerPrefix)) {
        return res.status(403).json({ msg: 'Unauthorized media reference.' });
      }

      const securePath = path.join(SECURE_POST_MEDIA_DIR, normalizedMediaKey);
      if (!isPathInside(securePath, SECURE_POST_MEDIA_DIR) || !fs.existsSync(securePath)) {
        return res.status(400).json({ msg: 'Uploaded media not found. Please upload again.' });
      }

      resolvedMediaKey = normalizedMediaKey;
      resolvedMediaType = mediaType === 'video' ? 'video' : 'image';
      resolvedMediaMimeType = resolveMimeTypeFromPath(securePath, resolvedMediaType);
    } else if (hasLegacyMediaUrl) {
      const normalizedLegacyUrl = mediaUrl.trim();
      const allowedPrefix = normalizedLegacyUrl.startsWith('/media/')
        || normalizedLegacyUrl.startsWith('/images/');
      if (!allowedPrefix) {
        return res.status(400).json({ msg: 'Media URL must come from a trusted upload route.' });
      }

      resolvedLegacyMediaUrl = normalizedLegacyUrl;
      if (mediaType && !['image', 'video'].includes(mediaType)) {
        return res.status(400).json({ msg: 'Invalid media type.' });
      }
      resolvedMediaType = mediaType || 'image';
      resolvedMediaMimeType = resolveMimeTypeFromPath(normalizedLegacyUrl, resolvedMediaType);
    }

    let attachmentRef;
    if (attachment) {
      const fileDoc = await File.findById(attachment);
      if (!fileDoc || fileDoc.user.toString() !== req.user._id.toString()) {
        return res.status(400).json({ msg: 'Invalid attachment or unauthorized upload.' });
      }
      attachmentRef = fileDoc._id;
    }

    const post = await Post.create({
      user: req.user._id,
      content: trimmedContent,
      visibility,
      mediaKey: resolvedMediaKey || undefined,
      mediaUrl: resolvedLegacyMediaUrl,
      mediaType: resolvedMediaType,
      mediaMimeType: resolvedMediaMimeType,
      imageUrl: resolvedLegacyMediaUrl && resolvedMediaType === 'image' ? resolvedLegacyMediaUrl : undefined,
      attachment: attachmentRef
    });

    await User.updateOne(
      { _id: req.user._id },
      { $inc: { 'profile.postsCount': 1 } }
    );

    const populatedPost = await Post.findById(post._id)
      .populate('user', 'username profile.avatar profile.jobTitle friends profileVisibility postVisibility privacySettings')
      .populate('comments.user', 'username profile.avatar profile.jobTitle')
      .populate('attachment');

    res.status(201).json(mapPostForFeed(populatedPost, true));
  } catch (error) {
    res.status(500).json({ msg: error.message });
  }
};

exports.toggleLike = async (req, res) => {
  try {
    const [currentUser, post] = await Promise.all([
      User.findById(req.user._id).select('friends username profile.avatar'),
      Post.findById(req.params.id).populate('user', '_id username profile.avatar profile.jobTitle friends profileVisibility postVisibility privacySettings')
    ]);

    if (!currentUser) {
      return res.status(401).json({ msg: 'User not found.' });
    }

    if (!post) {
      return res.status(404).json({ msg: 'Post not found.' });
    }

    if (!(await req.canViewPost(post, post.user))) {
      return res.status(403).json({ msg: 'You are not allowed to react on this post.' });
    }

    const currentUserId = req.user._id.toString();
    const postOwnerId = post.user._id.toString();
    const likeIndex = post.likes.findIndex((id) => id.toString() === currentUserId);
    const liked = likeIndex !== -1;

    if (liked) {
      post.likes.splice(likeIndex, 1);
    } else {
      post.likes.push(req.user._id);

      if (currentUserId !== postOwnerId) {
        const notification = await Notification.create({
          recipient: post.user._id,
          actor: req.user._id,
          type: 'like',
          post: post._id
        });

        if (global.io) {
          global.io.emit('new-notification', {
            _id: notification._id,
            type: 'like',
            actor: {
              _id: currentUser._id,
              username: currentUser.username,
              avatar: currentUser.profile?.avatar || ''
            },
            post: post._id,
            read: false,
            createdAt: notification.createdAt
          });
        }
      }
    }

    await post.save();

    res.json({
      liked: !liked,
      likes: post.likes.map((id) => id.toString()),
      likesCount: post.likes.length
    });
  } catch (error) {
    res.status(500).json({ msg: error.message });
  }
};

exports.sharePost = async (req, res) => {
  try {
    const [currentUser, post] = await Promise.all([
      User.findById(req.user._id).select('friends'),
      Post.findById(req.params.id).populate('user', '_id friends profileVisibility postVisibility privacySettings')
    ]);

    if (!currentUser) {
      return res.status(401).json({ msg: 'User not found.' });
    }

    if (!post) {
      return res.status(404).json({ msg: 'Post not found.' });
    }

    if (!(await req.canViewPost(post, post.user))) {
      return res.status(403).json({ msg: 'You are not allowed to share this post.' });
    }

    const currentUserId = req.user._id.toString();
    const alreadyShared = (post.shares || []).some((id) => id.toString() === currentUserId);

    if (!alreadyShared) {
      post.shares.push(req.user._id);
      await post.save();
    }

    res.json({
      shared: true,
      shares: (post.shares || []).map((id) => id.toString()),
      sharesCount: (post.shares || []).length
    });
  } catch (error) {
    res.status(500).json({ msg: error.message });
  }
};

exports.addComment = async (req, res) => {
  try {
    const text = typeof req.body.text === 'string' ? req.body.text.trim() : '';
    if (!text) {
      return res.status(400).json({ msg: 'Comment text is required.' });
    }

    if (text.length > 500) {
      return res.status(400).json({ msg: 'Comment is too long. Keep it under 500 characters.' });
    }

    const [currentUser, post] = await Promise.all([
      User.findById(req.user._id).select('friends username profile.avatar'),
      Post.findById(req.params.id).populate('user', '_id username profile.avatar profile.jobTitle friends profileVisibility postVisibility privacySettings')
    ]);

    if (!currentUser) {
      return res.status(401).json({ msg: 'User not found.' });
    }

    if (!post) {
      return res.status(404).json({ msg: 'Post not found.' });
    }

    if (!(await req.canViewPost(post, post.user))) {
      return res.status(403).json({ msg: 'You are not allowed to comment on this post.' });
    }

    post.comments.push({
      user: req.user._id,
      text
    });

    await post.save();
    await post.populate('comments.user', 'username profile.avatar profile.jobTitle');

    const savedComment = post.comments[post.comments.length - 1];
    const currentUserId = req.user._id.toString();
    const postOwnerId = post.user._id.toString();
    if (currentUserId !== postOwnerId) {
      const notification = await Notification.create({
        recipient: post.user._id,
        actor: req.user._id,
        type: 'comment',
        post: post._id,
        comment: text
      });

      if (global.io) {
        global.io.emit('new-notification', {
          _id: notification._id,
          type: 'comment',
          actor: {
            _id: currentUser._id,
            username: currentUser.username,
            avatar: currentUser.profile?.avatar || ''
          },
          post: post._id,
          comment: text,
          read: false,
          createdAt: notification.createdAt
        });
      }
    }

    res.status(201).json({
      comment: mapCommentForFeed(savedComment),
      commentsCount: post.comments.length
    });
  } catch (error) {
    res.status(500).json({ msg: error.message });
  }
};

exports.updatePost = async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);
    if (!post) {
      return res.status(404).json({ msg: 'Post not found.' });
    }

    if (!isPostOwner(post, req.user._id)) {
      return res.status(403).json({ msg: 'You can edit only your own posts.' });
    }

    if (!isWithinEditWindow(post.createdAt)) {
      return res.status(403).json({ msg: 'Post editing is allowed only within 24 hours of publishing.' });
    }

    const nextContent = typeof req.body?.content === 'string' ? req.body.content.trim() : '';
    const hasMedia = Boolean(post.mediaKey || post.mediaUrl || post.imageUrl);
    const hasAttachment = Boolean(post.attachment);
    if (!nextContent && !hasMedia && !hasAttachment) {
      return res.status(400).json({ msg: 'Post content cannot be empty unless media or attachment is present.' });
    }

    post.content = nextContent;
    await post.save();

    const populatedPost = await Post.findById(post._id)
      .populate('user', 'username profile.avatar profile.jobTitle friends profileVisibility postVisibility privacySettings')
      .populate('comments.user', 'username profile.avatar profile.jobTitle')
      .populate('attachment');

    return res.json({
      msg: 'Post updated successfully.',
      post: mapPostForFeed(populatedPost, true)
    });
  } catch (error) {
    return res.status(500).json({ msg: error.message });
  }
};

exports.deletePost = async (req, res) => {
  try {
    const post = await Post.findById(req.params.id).populate('attachment');
    if (!post) {
      return res.status(404).json({ msg: 'Post not found.' });
    }

    if (!isPostOwner(post, req.user._id)) {
      return res.status(403).json({ msg: 'You can delete only your own posts.' });
    }

    if (post.mediaKey) {
      const mediaPath = path.join(SECURE_POST_MEDIA_DIR, post.mediaKey);
      if (isPathInside(mediaPath, SECURE_POST_MEDIA_DIR)) {
        await safeUnlinkFile(mediaPath);
      }
    }

    if (post.attachment?._id) {
      const attachmentId = post.attachment._id;
      const otherPostsUsingAttachment = await Post.countDocuments({
        _id: { $ne: post._id },
        attachment: attachmentId
      });

      if (otherPostsUsingAttachment === 0) {
        await safeUnlinkFile(post.attachment.path);
        await File.deleteOne({ _id: attachmentId });
      }
    }

    await Promise.all([
      Post.deleteOne({ _id: post._id }),
      Notification.deleteMany({ post: post._id }),
      User.updateOne(
        { _id: req.user._id, 'profile.postsCount': { $gt: 0 } },
        { $inc: { 'profile.postsCount': -1 } }
      )
    ]);

    return res.json({
      msg: 'Post deleted successfully.',
      postId: post._id
    });
  } catch (error) {
    return res.status(500).json({ msg: error.message });
  }
};

exports.downloadAttachment = async (req, res) => {
  try {
    const post = await Post.findById(req.params.id)
      .populate('user', 'friends username profileVisibility postVisibility privacySettings')
      .populate('attachment');

    if (!post) {
      return res.status(404).json({ msg: 'Post not found.' });
    }

    if (!post.attachment) {
      return res.status(404).json({ msg: 'No attachment available for this post.' });
    }

    if (!(await req.canViewPost(post, post.user))) {
      return res.status(403).json({ msg: 'You are not authorized to download this attachment.' });
    }

    const fileDoc = post.attachment;
    const storedData = await fs.promises.readFile(fileDoc.path);
    let decrypted;
    if (fileDoc.encrypted === false) {
      decrypted = storedData;
    } else {
      decrypted = decryptPayload(storedData);
    }

    res.set({
      'Content-Type': fileDoc.mimeType,
      'Content-Disposition': `attachment; filename="${fileDoc.originalName}"`,
      'Content-Length': decrypted.length
    });

    res.send(decrypted);
  } catch (error) {
    res.status(500).json({ msg: 'Unable to decrypt or deliver attachment.' });
  }
};

exports.streamPostMedia = async (req, res) => {
  try {
    const post = await Post.findById(req.params.id)
      .populate('user', 'friends username profileVisibility postVisibility privacySettings');

    if (!post) {
      return res.status(404).json({ msg: 'Post not found.' });
    }

    if (!(await req.canViewPost(post, post.user))) {
      return res.status(403).json({ msg: 'You are not authorized to view this media.' });
    }

    const mediaPath = resolvePostMediaPath(post);
    if (!mediaPath || !fs.existsSync(mediaPath)) {
      return res.status(404).json({ msg: 'Media file not found.' });
    }

    const contentType = post.mediaMimeType || resolveMimeTypeFromPath(mediaPath, post.mediaType || 'image');
    const storedData = await fs.promises.readFile(mediaPath);
    let mediaBuffer = storedData;

    // New media files are encrypted at rest. Keep fallback for old plaintext files.
    if (post.mediaKey) {
      try {
        mediaBuffer = decryptPayload(storedData);
      } catch (error) {
        mediaBuffer = storedData;
      }
    }

    res.set('Content-Type', contentType);
    res.set('Content-Length', mediaBuffer.length);
    return res.send(mediaBuffer);
  } catch (error) {
    return res.status(500).json({ msg: 'Unable to deliver media.' });
  }
};
