const express = require('express');
const router = express.Router();
const Leave = require('../models/Leave');
const { protect, hasPermission } = require('../middleware/auth');

// GET /api/leave
// - Employee: own requests only
// - Admin with LEAVE_VIEW or super_admin: all requests (filterable)
router.get('/', protect, async (req, res) => {
  try {
    const { role, permissions, _id } = req.user;
    const { employeeId, status, startDate, endDate } = req.query;

    let filter = {};

    if (role === 'employee') {
      // Employees only see their own
      filter.employee = _id;
    } else if (role === 'super_admin' || (role === 'admin' && permissions?.includes('LEAVE_VIEW'))) {
      // Admins/super_admin can filter by employee
      if (employeeId) filter.employee = employeeId;
    } else {
      return res.status(403).json({ message: 'Access denied. Required permission: LEAVE_VIEW' });
    }

    if (status) filter.status = status;
    if (startDate || endDate) {
      filter.fromDate = {};
      if (startDate) filter.fromDate.$gte = new Date(startDate);
      if (endDate) filter.fromDate.$lte = new Date(endDate);
    }

    const leaves = await Leave.find(filter)
      .populate('employee', 'name employeeId department')
      .populate('reviewedBy', 'name role')
      .sort({ createdAt: -1 });

    res.json(leaves);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/leave — Employee submits a leave request
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
    const to = new Date(toDate);
    if (to < from) {
      return res.status(400).json({ message: 'To date cannot be before from date' });
    }

    // Auto-calculate days if not provided
    const days = numberOfDays || Math.ceil((to - from) / (1000 * 60 * 60 * 24)) + 1;

    const leave = await Leave.create({
      employee: req.user._id,
      leaveType,
      fromDate: from,
      toDate: to,
      numberOfDays: days,
      reason,
      additionalInfo: additionalInfo || ''
    });

    await leave.populate('employee', 'name employeeId department');
    res.status(201).json({ message: 'Leave request submitted successfully', leave });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/leave/:id
router.get('/:id', protect, async (req, res) => {
  try {
    const leave = await Leave.findById(req.params.id)
      .populate('employee', 'name employeeId department')
      .populate('reviewedBy', 'name role');

    if (!leave) return res.status(404).json({ message: 'Leave request not found' });

    // Employee can only view their own
    if (req.user.role === 'employee' && leave.employee._id.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Access denied' });
    }

    // Admin must have LEAVE_VIEW
    if (req.user.role === 'admin' && !req.user.permissions?.includes('LEAVE_VIEW')) {
      return res.status(403).json({ message: 'Access denied. Required permission: LEAVE_VIEW' });
    }

    res.json(leave);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// PATCH /api/leave/:id/review — Admin with LEAVE_APPROVE or super_admin
router.patch('/:id/review', protect, hasPermission('LEAVE_APPROVE'), async (req, res) => {
  try {
    const { status, reviewComment } = req.body;

    if (!['approved', 'rejected'].includes(status)) {
      return res.status(400).json({ message: 'Status must be approved or rejected' });
    }

    const leave = await Leave.findByIdAndUpdate(
      req.params.id,
      {
        status,
        reviewComment: reviewComment || '',
        reviewedBy: req.user._id,
        reviewedAt: new Date()
      },
      { new: true }
    )
      .populate('employee', 'name employeeId department')
      .populate('reviewedBy', 'name role');

    if (!leave) return res.status(404).json({ message: 'Leave request not found' });

    res.json({ message: `Leave request ${status}`, leave });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// DELETE /api/leave/:id — Employee cancels own pending request / super_admin can delete any
router.delete('/:id', protect, async (req, res) => {
  try {
    const leave = await Leave.findById(req.params.id);
    if (!leave) return res.status(404).json({ message: 'Leave request not found' });

    if (req.user.role === 'employee') {
      if (leave.employee.toString() !== req.user._id.toString()) {
        return res.status(403).json({ message: 'Access denied' });
      }
      if (leave.status !== 'pending') {
        return res.status(400).json({ message: 'Only pending requests can be cancelled' });
      }
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
