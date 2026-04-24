// E2EE Public Key Management Functions
const User = require('../models/User');

// Save or update user's public key for E2EE
exports.savePublicKey = async (req, res) => {
  try {
    const { publicKey } = req.body;
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
    if (!user || !user.publicKey) {
      return res.status(404).json({ msg: 'Public key not found' });
    }
    res.json({ publicKey: user.publicKey, username: user.username });
  } catch (error) {
    res.status(500).json({ msg: error.message });
  }
};
