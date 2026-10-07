const express = require('express');
const router = express.Router();
const Announcement = require('../models/Announcement');
const { protect, adminOnly, hasPermission } = require('../middleware/auth');
const { sendToAll } = require('../services/push');
// GET /api/announcements — all authenticated users see active announcements
router.get('/', protect, async (req, res) => {
  try {
    const filter = {};
    // Employees only see active ones; admin/super_admin sees all
    if (req.user.role === 'employee') {
      filter.isActive = true;
    }
    const announcements = await Announcement.find(filter)
      .populate('postedBy', 'name')
      .sort({ createdAt: -1 });
    res.json(announcements);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/announcements — admin with permission creates an announcement
router.post('/', protect, hasPermission('ANNOUNCEMENTS_MANAGE'), async (req, res) => {
  try {
    const { title, content, priority } = req.body;
    if (!title || !content) {
      return res.status(400).json({ message: 'Title and content are required' });
    }
    const announcement = await Announcement.create({
      title,
      content,
      priority: priority || 'normal',
      postedBy: req.user._id
    });
        const populated = await announcement.populate('postedBy', 'name');

    // Send push notification to all users (admin doesn't wait for it)
    sendToAll(
      `${announcement.priority === 'urgent' ? '🚨 ' : ''}${announcement.title}`,
      announcement.content.slice(0, 150),
      { type: 'announcement', id: String(announcement._id) }
    ).catch(err => console.error('Push failed:', err.message));

    res.status(201).json(populated);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// PUT /api/announcements/:id — admin edits an announcement
router.put('/:id', protect, hasPermission('ANNOUNCEMENTS_MANAGE'), async (req, res) => {
  try {
    const { title, content, priority, isActive } = req.body;
    const announcement = await Announcement.findByIdAndUpdate(
      req.params.id,
      { title, content, priority, isActive },
      { new: true, runValidators: true }
    ).populate('postedBy', 'name');
    if (!announcement) return res.status(404).json({ message: 'Announcement not found' });
    res.json(announcement);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// DELETE /api/announcements/:id — admin deletes an announcement
router.delete('/:id', protect, hasPermission('ANNOUNCEMENTS_MANAGE'), async (req, res) => {
  try {
    const announcement = await Announcement.findByIdAndDelete(req.params.id);
    if (!announcement) return res.status(404).json({ message: 'Announcement not found' });
    res.json({ message: 'Announcement deleted' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
