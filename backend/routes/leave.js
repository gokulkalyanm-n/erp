const express = require('express');
const router = express.Router();
const Leave = require('../models/Leave');
const { protect } = require('../middleware/auth');

// ─── GET /api/leave ──────────────────────────────────────────────────────────
// Employee  → own requests only
// HR admin  → only requests at stage='hr' (not yet forwarded)
// Super admin → requests at stage='super_admin' or 'done' (forwarded to them)
router.get('/', protect, async (req, res) => {
  try {
    const { role, permissions, _id } = req.user;
    const { employeeId, status, startDate, endDate } = req.query;

    let filter = {};

    if (role === 'employee') {
      filter.employee = _id;

    } else if (role === 'super_admin') {
      // Super admin sees only what HR has forwarded
      filter.stage = { $in: ['super_admin', 'done'] };
      if (employeeId) filter.employee = employeeId;

    } else if (role === 'admin' && permissions?.includes('LEAVE_VIEW')) {
      // HR admin sees requests still at hr stage
      filter.stage = 'hr';
      if (employeeId) filter.employee = employeeId;

    } else {
      return res.status(403).json({ message: 'Access denied. Required permission: LEAVE_VIEW' });
    }

    if (status) filter.status = status;
    if (startDate || endDate) {
      filter.fromDate = {};
      if (startDate) filter.fromDate.$gte = new Date(startDate);
      if (endDate)   filter.fromDate.$lte = new Date(endDate);
    }

    const leaves = await Leave.find(filter)
      .populate('employee', 'name employeeId department')
      .populate('hrReview.reviewedBy', 'name role')
      .populate('superAdminReview.reviewedBy', 'name role')
      .sort({ createdAt: -1 });

    res.json(leaves);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ─── POST /api/leave ─────────────────────────────────────────────────────────
// Employee submits a leave request → goes to HR (stage='hr')
router.post('/', protect, async (req, res) => {
  try {
    if (req.user.role !== 'employee') {
      return res.status(403).json({ message: 'Only employees can apply for leave' });
    }

    const { leaveType, fromDate, toDate, numberOfDays, reason, additionalInfo } = req.body;

    if (!leaveType || !fromDate || !toDate || !reason) {
      return res.status(400).json({ message: 'Leave type, dates, and reason are required' });
    }

    const from = new Date(fromDate);
    const to   = new Date(toDate);
    if (to < from) {
      return res.status(400).json({ message: 'To date cannot be before from date' });
    }

    const days = numberOfDays || Math.ceil((to - from) / (1000 * 60 * 60 * 24)) + 1;

    const leave = await Leave.create({
      employee: req.user._id,
      leaveType,
      fromDate: from,
      toDate:   to,
      numberOfDays: days,
      reason,
      additionalInfo: additionalInfo || '',
      stage:  'hr',
      status: 'pending'
    });

    await leave.populate('employee', 'name employeeId department');
    res.status(201).json({ message: 'Leave request submitted. Awaiting HR review.', leave });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ─── GET /api/leave/:id ──────────────────────────────────────────────────────
router.get('/:id', protect, async (req, res) => {
  try {
    const leave = await Leave.findById(req.params.id)
      .populate('employee', 'name employeeId department')
      .populate('hrReview.reviewedBy', 'name role')
      .populate('superAdminReview.reviewedBy', 'name role');

    if (!leave) return res.status(404).json({ message: 'Leave request not found' });

    const { role, permissions, _id } = req.user;

    if (role === 'employee') {
      if (leave.employee._id.toString() !== _id.toString())
        return res.status(403).json({ message: 'Access denied' });
    } else if (role === 'admin') {
      if (!permissions?.includes('LEAVE_VIEW'))
        return res.status(403).json({ message: 'Access denied. Required permission: LEAVE_VIEW' });
    }
    // super_admin can always view

    res.json(leave);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ─── PATCH /api/leave/:id/hr-review ─────────────────────────────────────────
// HR admin acts on a leave request:
//   action='approved' → forwards to super admin (stage becomes 'super_admin')
//   action='rejected' → closes request (stage='done', status='rejected')
router.patch('/:id/hr-review', protect, async (req, res) => {
  try {
    const { role, permissions } = req.user;

    if (role !== 'admin' || !permissions?.includes('LEAVE_APPROVE')) {
      return res.status(403).json({ message: 'Access denied. Required permission: LEAVE_APPROVE' });
    }

    const { action, comment } = req.body;
    if (!['approved', 'rejected'].includes(action)) {
      return res.status(400).json({ message: 'action must be approved or rejected' });
    }

    const leave = await Leave.findById(req.params.id);
    if (!leave) return res.status(404).json({ message: 'Leave request not found' });
    if (leave.stage !== 'hr') {
      return res.status(400).json({ message: 'This request is no longer at the HR stage' });
    }

    leave.hrReview = {
      action,
      comment:    comment || '',
      reviewedBy: req.user._id,
      reviewedAt: new Date()
    };

    if (action === 'approved') {
      // Forward to super admin
      leave.stage  = 'super_admin';
      leave.status = 'pending';
    } else {
      // HR rejected — close it
      leave.stage  = 'done';
      leave.status = 'rejected';
    }

    await leave.save();
    await leave.populate([
      { path: 'employee', select: 'name employeeId department' },
      { path: 'hrReview.reviewedBy', select: 'name role' }
    ]);

    res.json({ message: `Leave request ${action} by HR`, leave });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ─── PATCH /api/leave/:id/sa-review ─────────────────────────────────────────
// Super admin gives final decision
router.patch('/:id/sa-review', protect, async (req, res) => {
  try {
    if (req.user.role !== 'super_admin') {
      return res.status(403).json({ message: 'Super Admin access required' });
    }

    const { action, comment } = req.body;
    if (!['approved', 'rejected'].includes(action)) {
      return res.status(400).json({ message: 'action must be approved or rejected' });
    }

    const leave = await Leave.findById(req.params.id);
    if (!leave) return res.status(404).json({ message: 'Leave request not found' });
    if (leave.stage !== 'super_admin') {
      return res.status(400).json({ message: 'This request is not at the super admin stage' });
    }

    leave.superAdminReview = {
      action,
      comment:    comment || '',
      reviewedBy: req.user._id,
      reviewedAt: new Date()
    };

    leave.stage  = 'done';
    leave.status = action === 'approved' ? 'approved' : 'rejected';

    await leave.save();
    await leave.populate([
      { path: 'employee', select: 'name employeeId department' },
      { path: 'hrReview.reviewedBy', select: 'name role' },
      { path: 'superAdminReview.reviewedBy', select: 'name role' }
    ]);

    res.json({ message: `Leave request ${action} by Super Admin`, leave });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ─── DELETE /api/leave/:id ───────────────────────────────────────────────────
// Employee cancels their own pending (stage='hr') request only
router.delete('/:id', protect, async (req, res) => {
  try {
    const leave = await Leave.findById(req.params.id);
    if (!leave) return res.status(404).json({ message: 'Leave request not found' });

    if (req.user.role === 'employee') {
      if (leave.employee.toString() !== req.user._id.toString())
        return res.status(403).json({ message: 'Access denied' });
      if (leave.stage !== 'hr')
        return res.status(400).json({ message: 'Cannot cancel a request that has already been forwarded or decided' });
    } else if (req.user.role !== 'super_admin') {
      return res.status(403).json({ message: 'Access denied' });
    }

    await leave.deleteOne();
    res.json({ message: 'Leave request cancelled' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
