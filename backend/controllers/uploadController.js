const multer = require('multer');
const crypto = require('crypto');
const fs = require('fs').promises;
const path = require('path');
const File = require('../models/File');
const { isValidFileType } = require('../middleware/fileValidate');
const {
  PRIVACY,
  PRIVACY_VALUES,
  normalizePrivacyValue
} = require('../utils/privacy');

const storage = multer.memoryStorage();
const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 } });
const postMediaUpload = multer({ storage, limits: { fileSize: 25 * 1024 * 1024 } });

const PRIVATE_UPLOAD_DIR = path.resolve(__dirname, '../storage/uploads');
const PRIVATE_POST_MEDIA_DIR = path.resolve(__dirname, '../storage/post-media');

const getEncryptionKey = () => {
  const explicitHexKey = String(process.env.FILE_KEY || '').trim();
  if (explicitHexKey) {
    const validHex = /^[0-9a-fA-F]+$/.test(explicitHexKey);
    if (!validHex || explicitHexKey.length !== 64) {
      throw new Error('Invalid FILE_KEY. Expected a 64-character hex key (32 bytes).');
    }
    return Buffer.from(explicitHexKey, 'hex');
  }

  const secretKey = String(
    process.env.FILE_UPLOAD_SECRET || process.env.ENCRYPTION_SECRET || ''
  ).trim();

  if (!secretKey) {
    throw new Error('Missing file encryption key. Set FILE_KEY or FILE_UPLOAD_SECRET.');
  }

  return crypto.createHash('sha256').update(secretKey).digest();
};

const encryptBuffer = (buffer) => {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', getEncryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(buffer), cipher.final()]);
  return { encrypted, iv };
};

const decryptBuffer = (buffer, iv) => {
  const decipher = crypto.createDecipheriv('aes-256-cbc', getEncryptionKey(), iv);
  return Buffer.concat([decipher.update(buffer), decipher.final()]);
};

const encryptPayload = (buffer) => {
  const { encrypted, iv } = encryptBuffer(buffer);
  return {
    payload: Buffer.concat([iv, encrypted]),
    iv
  };
};

const decryptPayload = (payloadBuffer) => {
  if (!Buffer.isBuffer(payloadBuffer) || payloadBuffer.length <= 16) {
    throw new Error('Encrypted payload is invalid or corrupted.');
  }
  const iv = payloadBuffer.subarray(0, 16);
  const encryptedContent = payloadBuffer.subarray(16);
  return decryptBuffer(encryptedContent, iv);
};

const getPostMediaConfig = (file) => {
  if (!file || !file.originalname) return null;

  const extension = file.originalname.split('.').pop().toLowerCase();
  const imageTypes = ['jpg', 'jpeg', 'png'];
  const videoTypes = ['mp4', 'webm'];

  if (imageTypes.includes(extension)) {
    const signatureType = extension === 'jpeg' ? 'jpg' : extension;
    if (!isValidFileType(file.buffer, signatureType)) {
      return null;
    }
    return { extension, mediaType: 'image' };
  }

  if (videoTypes.includes(extension)) {
    if (extension === 'mp4') {
      const hasFtyp = file.buffer.length > 12 && file.buffer.subarray(4, 8).toString('ascii') === 'ftyp';
      if (!hasFtyp) return null;
    }
    if (extension === 'webm') {
      const webmMagic = Buffer.from([0x1A, 0x45, 0xDF, 0xA3]);
      const hasWebmMagic = file.buffer.length >= webmMagic.length
        && file.buffer.subarray(0, webmMagic.length).equals(webmMagic);
      if (!hasWebmMagic) return null;
    }
    return { extension, mediaType: 'video' };
  }

  return null;
};

const parseVisibility = (value, fallback = PRIVACY.PRIVATE, strict = false) => {
  if (typeof value !== 'string' || !value.trim()) {
    return fallback;
  }

  const normalized = normalizePrivacyValue(value, fallback);
  if (PRIVACY_VALUES.includes(String(value).trim().toLowerCase())) {
    return normalized;
  }

  return strict ? null : fallback;
};

const canViewFile = async (req, fileDoc) => {
  const owner = fileDoc?.user;
  if (!owner || !req.user) {
    return false;
  }

  if (typeof req.isOwnerUser === 'function' && req.isOwnerUser(owner)) {
    return true;
  }

  const visibility = parseVisibility(fileDoc.visibility, PRIVACY.PRIVATE);
  if (visibility === PRIVACY.PUBLIC) {
    return true;
  }

  if (visibility === PRIVACY.FRIENDS) {
    if (typeof req.isFriendWith === 'function') {
      return req.isFriendWith(owner);
    }
    return false;
  }

  return false;
};

const sendDecryptedFile = async (res, fileDoc, payloadBuffer, inline = false) => {
  const decrypted = fileDoc.encrypted === false
    ? payloadBuffer
    : decryptPayload(payloadBuffer);

  res.set({
    'Content-Type': fileDoc.mimeType,
    'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename="${fileDoc.originalName}"`,
    'Content-Length': decrypted.length
  });

  return res.send(decrypted);
};

exports.uploadFile = [
  upload.single('file'),
  async (req, res) => {
    try {
      if (!req.file) return res.status(400).json({ msg: 'No file uploaded.' });
      if (!req.user) return res.status(401).json({ msg: 'Unauthorized upload.' });

      const allowedTypes = ['jpg', 'jpeg', 'png', 'pdf'];
      const extension = req.file.originalname.split('.').pop().toLowerCase();
      if (!allowedTypes.includes(extension)) {
        return res.status(400).json({ msg: 'Unsupported file type.' });
      }

      if (!isValidFileType(req.file.buffer, extension === 'jpeg' ? 'jpg' : extension)) {
        return res.status(400).json({ msg: 'Invalid file signature or corrupted file.' });
      }

      const visibility = parseVisibility(req.body?.visibility, PRIVACY.PRIVATE, true);
      if (!visibility) {
        return res.status(400).json({ msg: 'Invalid visibility value.' });
      }

      const storedName = `upload_${Date.now()}_${crypto.randomBytes(8).toString('hex')}.enc`;
      const filePath = path.join(PRIVATE_UPLOAD_DIR, storedName);
      const { payload, iv } = encryptPayload(req.file.buffer);

      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(filePath, payload, { mode: 0o600 });

      const fileDoc = await File.create({
        user: req.user._id,
        originalName: req.file.originalname,
        storedName,
        mimeType: req.file.mimetype,
        size: req.file.size,
        visibility,
        path: filePath,
        iv: iv.toString('hex'),
        encrypted: true
      });

      const tokenSuffix = req.authToken ? `?token=${encodeURIComponent(req.authToken)}` : '';
      res.json({
        msg: 'File uploaded securely.',
        fileId: fileDoc._id,
        visibility: fileDoc.visibility,
        downloadUrl: `/api/upload/download/${fileDoc._id}${tokenSuffix}`,
        mediaUrl: `/api/media/${fileDoc._id}${tokenSuffix}`
      });
    } catch (error) {
      res.status(500).json({ msg: error.message });
    }
  }
];

exports.downloadFile = async (req, res) => {
  try {
    const fileDoc = await File.findById(req.params.id).select(
      'user originalName mimeType path iv encrypted visibility'
    );
    if (!fileDoc) return res.status(404).json({ msg: 'File not found.' });

    const allowed = await canViewFile(req, fileDoc);
    if (!allowed) {
      return res.status(403).json({ msg: 'Access denied.' });
    }

    const encryptedData = await fs.readFile(fileDoc.path);
    return sendDecryptedFile(res, fileDoc, encryptedData, false);
  } catch (error) {
    if (error.code === 'ENOENT') {
      return res.status(404).json({ msg: 'Stored file is missing on server.' });
    }
    return res.status(500).json({ msg: 'Decryption failed or file is corrupted.' });
  }
};

exports.getMediaById = async (req, res) => {
  try {
    const fileDoc = await File.findById(req.params.id).select(
      'user originalName mimeType path iv encrypted visibility'
    );
    if (!fileDoc) return res.status(404).json({ msg: 'File not found.' });

    const allowed = await canViewFile(req, fileDoc);
    if (!allowed) {
      return res.status(403).json({ msg: 'Forbidden' });
    }

    const encryptedData = await fs.readFile(fileDoc.path);
    return sendDecryptedFile(res, fileDoc, encryptedData, true);
  } catch (error) {
    if (error.code === 'ENOENT') {
      return res.status(404).json({ msg: 'Stored file is missing on server.' });
    }
    return res.status(500).json({ msg: 'Unable to deliver media.' });
  }
};

exports.decryptBuffer = decryptBuffer;
exports.decryptPayload = decryptPayload;

exports.uploadProfileImage = [
  upload.single('file'),
  async (req, res) => {
    try {
      if (!req.file) return res.status(400).json({ msg: 'No file uploaded.' });
      if (!req.user) return res.status(401).json({ msg: 'Unauthorized upload.' });

      const allowedTypes = ['jpg', 'jpeg', 'png'];
      const extension = req.file.originalname.split('.').pop().toLowerCase();
      if (!allowedTypes.includes(extension)) {
        return res.status(400).json({ msg: 'Only JPEG/PNG images allowed for profile.' });
      }

      if (!isValidFileType(req.file.buffer, extension === 'jpeg' ? 'jpg' : extension)) {
        return res.status(400).json({ msg: 'Invalid file signature or corrupted file.' });
      }

      const storedName = `profile_${Date.now()}_${crypto.randomBytes(8).toString('hex')}.${extension}`;
      const filePath = path.join(__dirname, '../public/images', storedName);

      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(filePath, req.file.buffer, { mode: 0o644 });

      res.json({
        msg: 'Profile image uploaded successfully.',
        url: `/images/${storedName}`
      });
    } catch (error) {
      res.status(500).json({ msg: error.message });
    }
  }
];

exports.uploadPostMedia = [
  postMediaUpload.single('file'),
  async (req, res) => {
    try {
      if (!req.file) return res.status(400).json({ msg: 'No media file uploaded.' });
      if (!req.user) return res.status(401).json({ msg: 'Unauthorized upload.' });

      const mediaConfig = getPostMediaConfig(req.file);
      if (!mediaConfig) {
        return res.status(400).json({ msg: 'Invalid media type. Upload JPG, PNG, MP4, or WEBM only.' });
      }

      const storedName = `post_media_${req.user._id}_${Date.now()}_${crypto.randomBytes(8).toString('hex')}.${mediaConfig.extension}`;
      const filePath = path.join(PRIVATE_POST_MEDIA_DIR, storedName);
      const { payload } = encryptPayload(req.file.buffer);

      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(filePath, payload, { mode: 0o600 });

      res.json({
        msg: 'Post media uploaded securely.',
        mediaKey: storedName,
        type: mediaConfig.mediaType
      });
    } catch (error) {
      res.status(500).json({ msg: error.message });
    }
  }
];
