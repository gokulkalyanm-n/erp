const express = require('express');
const router  = express.Router();
const AttendanceCorrection = require('../models/AttendanceCorrection');
const { protect } = require('../middleware/auth');
const { sendToRoles, sendToUsers } = require('../services/push');

function canReview(user) {
  return user.role === 'super_admin' ||
    (user.role === 'admin' && user.permissions?.includes('ATTENDANCE_VIEW'));
}

// ─── POST /api/corrections ────────────────────────────────────────────────────
// Employee raises a correction request for a missed-report day
router.post('/', protect, async (req, res) => {
  try {
    if (req.user.role !== 'employee') {
      return res.status(403).json({ message: 'Only employees can raise correction requests' });
    }
    const { date, reason } = req.body;
    if (!date || !reason?.trim()) {
      return res.status(400).json({ message: 'Date and reason are required' });
    }

    // Upsert: one correction per employee per day
    const existing = await AttendanceCorrection.findOne({ employee: req.user._id, date });
    if (existing) {
      if (existing.status === 'approved') {
        return res.status(400).json({ message: 'This day is already approved as present' });
      }
      if (existing.status === 'pending') {
        return res.status(400).json({ message: 'A correction request for this day is already pending' });
      }
      // rejected → allow re-submit
      existing.reason    = reason.trim();
      existing.status    = 'pending';
      existing.adminNote = '';
      existing.reviewedBy  = undefined;
      existing.reviewedAt  = undefined;
      await existing.save();
      return res.json({ message: 'Correction request re-submitted', correction: existing });
    }

    const correction = await AttendanceCorrection.create({
      employee: req.user._id,
      date,
      reason: reason.trim()
    });

    // Notify admins with ATTENDANCE_VIEW permission + super admins
    sendToRoles(['super_admin'],
      'Attendance Correction Request',
      `${req.user.name} says they worked on ${date} but forgot to submit a report.`,
      { type: 'correction', id: String(correction._id) }
    ).catch(() => {});

    sendToUsers([], '', '', {}).catch(() => {}); // no-op to keep import used

    res.status(201).json({ message: 'Correction request submitted', correction });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ─── GET /api/corrections ─────────────────────────────────────────────────────
// Employee: own corrections · Admin: all pending (or filtered by status)
router.get('/', protect, async (req, res) => {
  try {
    const { status } = req.query;
    let filter = {};

    if (req.user.role === 'employee') {
      filter.employee = req.user._id;
    } else if (canReview(req.user)) {
      if (status) filter.status = status;
    } else {
      return res.status(403).json({ message: 'Access denied' });
    }

    const corrections = await AttendanceCorrection.find(filter)
      .populate('employee', 'name employeeId department')
      .populate('reviewedBy', 'name')
      .sort({ createdAt: -1 });

    res.json(corrections);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ─── PATCH /api/corrections/:id/review ───────────────────────────────────────
// Admin approves or rejects
router.patch('/:id/review', protect, async (req, res) => {
  try {
    if (!canReview(req.user)) {
      return res.status(403).json({ message: 'Access denied. Required permission: ATTENDANCE_VIEW' });
    }

    const { action, adminNote } = req.body;
    if (!['approved', 'rejected'].includes(action)) {
      return res.status(400).json({ message: 'action must be approved or rejected' });
    }

    const correction = await AttendanceCorrection.findById(req.params.id)
      .populate('employee', 'name employeeId');
    if (!correction) return res.status(404).json({ message: 'Correction not found' });
    if (correction.status !== 'pending') {
      return res.status(400).json({ message: 'This correction has already been reviewed' });
    }

    correction.status     = action;
    correction.adminNote  = adminNote?.trim() || '';
    correction.reviewedBy = req.user._id;
    correction.reviewedAt = new Date();
    await correction.save();

    // Notify the employee of the outcome
    sendToUsers(
      [String(correction.employee._id)],
      action === 'approved' ? 'Attendance Corrected ✅' : 'Attendance Correction Rejected',
      action === 'approved'
        ? `Your attendance for ${correction.date} has been marked as Present.`
        : `Your correction request for ${correction.date} was rejected.${adminNote ? ' Note: ' + adminNote : ''}`,
      { type: 'correction', id: String(correction._id) }
    ).catch(() => {});

    res.json({ message: `Correction ${action}`, correction });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
