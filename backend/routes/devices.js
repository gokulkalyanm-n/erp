const express = require('express');
const router = express.Router();
const User = require('../models/User');
const { protect } = require('../middleware/auth');

// App calls this after login to save the phone's token
router.post('/token', protect, async (req, res) => {
  try {
    const { token } = req.body;
    if (!token) return res.status(400).json({ message: 'Token required' });

    // If this phone was used by another account, move the token to this user
    await User.updateMany({ deviceTokens: token }, { $pull: { deviceTokens: token } });
    await User.findByIdAndUpdate(req.user._id, { $addToSet: { deviceTokens: token } });
    res.json({ message: 'Token saved' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// App calls this on logout to remove the phone's token
router.delete('/token', protect, async (req, res) => {
  try {
    const { token } = req.body;
    await User.findByIdAndUpdate(req.user._id, { $pull: { deviceTokens: token } });
    res.json({ message: 'Token removed' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;