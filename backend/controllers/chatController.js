const mongoose = require('mongoose');
const Message = require('../models/Message');
const User = require('../models/User');

const isValidObjectId = (value) => mongoose.Types.ObjectId.isValid(value);

const isBase64String = (value) => (
  typeof value === 'string'
  && value.length >= 16
  && /^[A-Za-z0-9+/=\s]+$/.test(value)
);

const hasEncryptedPayload = (payload = {}) => (
  Boolean(payload.encryptedMsg)
  && Boolean(payload.encryptedAesKeyForRecipient)
  && Boolean(payload.encryptedAesKeyForSender)
  && Boolean(payload.iv)
);

const normalizeMessageForViewer = (message, viewerId) => {
  const raw = message?.toObject ? message.toObject() : { ...(message || {}) };
  const fromId = String(raw?.from?._id || raw?.from || '');
  const viewerIsSender = fromId === String(viewerId);
  const encryptedAesKey = viewerIsSender
    ? raw.encryptedAesKeyForSender
    : raw.encryptedAesKeyForRecipient;
  const isEncrypted = Boolean(raw.isEncrypted || raw.encryptedMsg);

  const normalized = {
    ...raw,
    message: isEncrypted ? '' : (raw.message || ''),
    encryptedMsg: raw.encryptedMsg || '',
    encryptedAesKey: encryptedAesKey || '',
    iv: raw.iv || '',
    e2eeVersion: Number(raw.e2eeVersion || 0),
    isEncrypted
  };

  delete normalized.encryptedAesKeyForSender;
  delete normalized.encryptedAesKeyForRecipient;
  return normalized;
};

// Get messages between two users
exports.getMessages = async (req, res) => {
  const otherUserId = req.params.userId;

  if (!isValidObjectId(otherUserId)) {
    return res.status(400).json({ msg: 'Invalid user id' });
  }

  try {
    const messages = await Message.find({
      $or: [
        { from: req.user._id, to: otherUserId },
        { from: otherUserId, to: req.user._id }
      ]
    })
      .populate('from', 'username avatar')
      .populate('to', 'username avatar')
      .sort({ timestamp: 1 })
      .lean();

    const normalizedMessages = messages.map((message) => (
      normalizeMessageForViewer(message, req.user._id)
    ));

    res.json(normalizedMessages);
  } catch (error) {
    res.status(500).json({ msg: error.message });
  }
};

// Get conversations list (last message from each user)
exports.getConversations = async (req, res) => {
  try {
    const conversations = await Message.aggregate([
      {
        $match: {
          $or: [{ from: req.user._id }, { to: req.user._id }]
        }
      },
      {
        $sort: { timestamp: -1 }
      },
      {
        $group: {
          _id: {
            otherUser: {
              $cond: [{ $eq: ['$from', req.user._id] }, '$to', '$from']
            }
          },
          lastMessage: { $first: '$$ROOT' },
          unreadCount: {
            $sum: {
              $cond: [
                { $and: [{ $eq: ['$to', req.user._id] }, { $eq: ['$read', false] }] },
                1,
                0
              ]
            }
          }
        }
      },
      {
        $sort: { 'lastMessage.timestamp': -1 }
      },
      {
        $lookup: {
          from: 'users',
          localField: '_id.otherUser',
          foreignField: '_id',
          as: 'otherUserData'
        }
      },
      {
        $unwind: '$otherUserData'
      },
      {
        $project: {
          _id: '$_id.otherUser',
          username: '$otherUserData.username',
          avatar: '$otherUserData.avatar',
          lastMessage: {
            $cond: [
              {
                $or: [
                  { $eq: ['$lastMessage.isEncrypted', true] },
                  {
                    $gt: [
                      { $strLenCP: { $ifNull: ['$lastMessage.encryptedMsg', ''] } },
                      0
                    ]
                  }
                ]
              },
              'Encrypted message',
              {
                $cond: [
                  {
                    $gt: [
                      { $strLenCP: { $ifNull: ['$lastMessage.message', ''] } },
                      0
                    ]
                  },
                  '$lastMessage.message',
                  'No messages yet'
                ]
              }
            ]
          },
          lastMessageTime: '$lastMessage.timestamp',
          unreadCount: 1
        }
      }
    ]);

    res.json(conversations);
  } catch (error) {
    res.status(500).json({ msg: error.message });
  }
};

// Mark messages as read
exports.markAsRead = async (req, res) => {
  const { userId } = req.body;

  if (!isValidObjectId(userId)) {
    return res.status(400).json({ msg: 'Invalid user id' });
  }

  try {
    const result = await Message.updateMany(
      { from: userId, to: req.user._id, read: false },
      { read: true }
    );

    res.json({
      msg: 'Messages marked as read',
      modifiedCount: result.modifiedCount || 0
    });
  } catch (error) {
    res.status(500).json({ msg: error.message });
  }
};

// Send a message (REST API)
exports.sendMessage = async (req, res) => {
  const {
    to,
    message,
    encryptedMsg,
    encryptedAesKeyForRecipient,
    encryptedAesKeyForSender,
    iv,
    e2eeVersion
  } = req.body;

  const trimmedMessage = typeof message === 'string' ? message.trim() : '';
  const encryptedPayloadProvided = hasEncryptedPayload(req.body);
  const allowPlaintextFallback = process.env.ALLOW_PLAINTEXT_CHAT === 'true';

  if (!isValidObjectId(to)) {
    return res.status(400).json({ msg: 'Invalid recipient id' });
  }

  if (String(to) === String(req.user._id)) {
    return res.status(400).json({ msg: 'Cannot send a message to yourself' });
  }

  if (!encryptedPayloadProvided && !trimmedMessage) {
    return res.status(400).json({ msg: 'Message cannot be empty' });
  }

  if (!encryptedPayloadProvided && !allowPlaintextFallback) {
    return res.status(400).json({
      msg: 'Encrypted payload required. Refresh and try again.'
    });
  }

  if (encryptedPayloadProvided) {
    const version = Number.parseInt(e2eeVersion, 10);
    const invalidPayload = !isBase64String(encryptedMsg)
      || !isBase64String(encryptedAesKeyForRecipient)
      || !isBase64String(encryptedAesKeyForSender)
      || !isBase64String(iv)
      || Number.isNaN(version)
      || version < 1;

    if (invalidPayload) {
      return res.status(400).json({ msg: 'Invalid encrypted message payload' });
    }
  }

  try {
    const recipient = await User.findById(to).select(
      'friends privacySettings publicKey profileVisibility postVisibility messagePrivacy'
    );
    if (!recipient) {
      return res.status(404).json({ msg: 'Recipient not found' });
    }

    if (!(await req.canMessageUser(recipient))) {
      return res.status(403).json({ msg: 'This member is not accepting messages right now.' });
    }

    if (encryptedPayloadProvided && !recipient.publicKey) {
      return res.status(409).json({
        msg: 'Recipient has not enabled encrypted chat yet.'
      });
    }

    const messageDoc = {
      from: req.user._id,
      to,
      read: false
    };

    if (encryptedPayloadProvided) {
      messageDoc.message = '';
      messageDoc.encryptedMsg = encryptedMsg;
      messageDoc.encryptedAesKeyForRecipient = encryptedAesKeyForRecipient;
      messageDoc.encryptedAesKeyForSender = encryptedAesKeyForSender;
      messageDoc.iv = iv;
      messageDoc.e2eeVersion = Number.parseInt(e2eeVersion, 10);
      messageDoc.isEncrypted = true;
    } else {
      messageDoc.message = trimmedMessage;
      messageDoc.e2eeVersion = 0;
      messageDoc.isEncrypted = false;
    }

    const savedMessage = await Message.create(messageDoc);

    const populatedMessage = await savedMessage.populate('from', 'username avatar');
    await populatedMessage.populate('to', 'username avatar');

    res.status(201).json(normalizeMessageForViewer(populatedMessage, req.user._id));
  } catch (error) {
    res.status(500).json({ msg: error.message });
  }
};

// Delete conversation
exports.deleteConversation = async (req, res) => {
  const { userId } = req.params;

  if (!isValidObjectId(userId)) {
    return res.status(400).json({ msg: 'Invalid user id' });
  }

  try {
    const result = await Message.deleteMany({
      $or: [
        { from: req.user._id, to: userId },
        { from: userId, to: req.user._id }
      ]
    });

    res.json({
      msg: 'Conversation deleted',
      deletedCount: result.deletedCount || 0
    });
  } catch (error) {
    res.status(500).json({ msg: error.message });
  }
};
