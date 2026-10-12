const express = require('express');
const router = express.Router();
const Leave = require('../models/Leave');
const { protect } = require('../middleware/auth');
const { sendToPermission, sendToRoles, sendToUsers } = require('../services/push');

// Format applied date/time in Indian time — e.g. "07 Oct 2026, 05:20 pm"
const formatApplied = (d) =>
  new Date(d).toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: true,
  });

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
      // Super admin sees only what has been forwarded to them
      filter.stage = { $in: ['super_admin', 'done'] };
      if (employeeId) filter.employee = employeeId;

    } else if (role === 'admin' && permissions?.includes('LEAVE_VIEW')) {
      // HR admin sees:
      //   - employees' requests still at hr stage (if no employeeId filter or filtering others)
      //   - their own leave requests at any stage
      if (employeeId) {
        // Filtering by a specific person — if it's themselves, show all stages
        if (String(employeeId) === String(_id)) {
          filter.employee = _id;
        } else {
          filter.employee = employeeId;
          filter.stage = 'hr';
        }
      } else {
        // No filter — show employees' hr-stage requests AND their own requests
        filter.$or = [
          { stage: 'hr', employee: { $ne: _id } },
          { employee: _id }
        ];
      }

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
// Employee submits → stage='hr' (awaits HR review)
// HR admin submits → stage='super_admin' (goes directly to super admin)
router.post('/', protect, async (req, res) => {
  try {
    const { role } = req.user;

    // Only employees and HR admins (role=admin) can apply for leave
    if (role !== 'employee' && role !== 'admin') {
      return res.status(403).json({ message: 'Only employees and admins can apply for leave' });
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

    // HR admin leave skips HR stage — goes straight to super admin
    const isHR = role === 'admin';
    const stage = isHR ? 'super_admin' : 'hr';

    const leave = await Leave.create({
      employee: req.user._id,
      leaveType,
      fromDate: from,
      toDate:   to,
      numberOfDays: days,
      reason,
      additionalInfo: additionalInfo || '',
      stage,
      status: 'pending'
    });

    await leave.populate('employee', 'name employeeId department');

    const appliedAt = formatApplied(leave.createdAt);

    if (isHR) {
      // Notify super admin directly — no HR stage for admin leave
      sendToRoles(
        ['super_admin'],
        'New Leave Request (Admin)',
        `${req.user.name} applied for ${leaveType} leave (${days} day${days !== 1 ? 's' : ''}) on ${appliedAt}`,
        { type: 'leave', id: String(leave._id) }
      ).catch(err => console.error('Push error (admin leave apply):', err.message));
    } else {
      // Notify HR admins ONLY — super admin notified after HR forwards
      sendToPermission(
        'LEAVE_APPROVE',
        'New Leave Request',
        `${req.user.name} applied for ${leaveType} leave (${days} day${days !== 1 ? 's' : ''}) on ${appliedAt}`,
        { type: 'leave', id: String(leave._id) }
      ).catch(err => console.error('Push error (leave apply):', err.message));
    }

    res.status(201).json({
      message: isHR
        ? 'Leave request submitted. Awaiting Super Admin approval.'
        : 'Leave request submitted. Awaiting HR review.',
      leave
    });
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
      // HR admin can view: employees' requests they manage, or their own requests
      const isOwn = leave.employee._id.toString() === _id.toString();
      if (!isOwn && !permissions?.includes('LEAVE_VIEW'))
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

    // Notifications — fire-and-forget, one call per action
    if (action === 'approved') {
      // Notify super admins ONLY that HR has forwarded the request
      sendToRoles(
        ['super_admin'],
        'Leave Request Forwarded',
        `HR approved ${leave.employee.name}'s ${leave.leaveType} leave. Awaiting your decision.`,
        { type: 'leave', id: String(leave._id) }
      ).catch(err => console.error('Push error (hr forward):', err.message));
    } else {
      // Notify the employee — HR rejected, once
      sendToUsers(
        [leave.employee._id],
        'Leave Request Rejected',
        `Your ${leave.leaveType} leave request was rejected by HR.`,
        { type: 'leave', id: String(leave._id) }
      ).catch(err => console.error('Push error (hr reject):', err.message));
    }

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

    // Notify the employee of the final result — once, fire-and-forget
    const resultMsg = action === 'approved'
      ? `Your ${leave.leaveType} leave request has been approved.`
      : `Your ${leave.leaveType} leave request has been rejected.`;

    sendToUsers(
      [leave.employee._id],
      action === 'approved' ? 'Leave Approved ✅' : 'Leave Rejected',
      resultMsg,
      { type: 'leave', id: String(leave._id) }
    ).catch(err => console.error('Push error (sa review):', err.message));

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
    } else if (req.user.role === 'admin') {
      // HR admin can cancel only their own pending leave
      if (leave.employee.toString() !== req.user._id.toString())
        return res.status(403).json({ message: 'Access denied' });
      if (leave.status !== 'pending')
        return res.status(400).json({ message: 'Only pending requests can be cancelled' });
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
