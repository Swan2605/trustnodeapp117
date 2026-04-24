// File type validation using magic numbers
const isValidFileType = (buffer, fileType) => {
  const types = {
    jpg: Buffer.from([0xFF, 0xD8, 0xFF]),
    png: Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
    pdf: Buffer.from([0x25, 0x50, 0x44, 0x46])
  };
  return types[fileType] && buffer.slice(0, types[fileType].length).equals(types[fileType]);
};

const fileValidate = (req, res, next) => {
  if (!req.file) return next();

  const mimeMap = {
    jpeg: 'jpg',
    jpg: 'jpg',
    png: 'png',
    pdf: 'pdf'
  };
  const rawType = req.file.mimetype.split('/')[1] || '';
  const type = mimeMap[rawType];

  const allowedTypes = Object.keys(mimeMap);
  if (!type || !isValidFileType(req.file.buffer, type)) {
    return res.status(400).json({ msg: 'Invalid file type. Please upload JPG, PNG, or PDF files only.' });
  }

  if (req.file.size > 5 * 1024 * 1024) {
    return res.status(400).json({ msg: 'File too large. Maximum 5MB allowed.' });
  }

  next();
};

module.exports = fileValidate;
module.exports.isValidFileType = isValidFileType;
