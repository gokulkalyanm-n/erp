const express = require('express');
const router = express.Router();
const DailyReport = require('../models/DailyReport');
const User = require('../models/User');
const { protect, adminOnly, hasPermission } = require('../middleware/auth');

// GET /api/reports — Admin: all reports, Employee: own reports
router.get('/', protect, async (req, res) => {
  try {
    const { employeeId, projectId, startDate, endDate, date } = req.query;
    // Admin permission check
    if (req.user.role === 'admin' && !req.user.permissions?.includes('REPORTS_VIEW')) {
      return res.status(403).json({ message: 'Access denied. Required permission: REPORTS_VIEW' });
    }
    const filter = {};

    if (req.user.role === 'employee') {
      filter.employee = req.user._id;
    } else if (employeeId) {
      filter.employee = employeeId;
    }

    if (projectId) filter.project = projectId;

    if (date) {
      const d = new Date(date);
      const start = new Date(d.setHours(0, 0, 0, 0));
      const end = new Date(d.setHours(23, 59, 59, 999));
      filter.date = { $gte: start, $lte: end };
    } else if (startDate || endDate) {
      filter.date = {};
      if (startDate) filter.date.$gte = new Date(startDate);
      if (endDate) filter.date.$lte = new Date(endDate);
    }

    const reports = await DailyReport.find(filter)
      .populate('employee', 'name employeeId department')
      .populate('project', 'name projectId')
      .populate('tasksCompleted.task', 'title taskId')
      .sort({ date: -1 });

    res.json(reports);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/reports — Employee submits report
router.post('/', protect, async (req, res) => {
  try {
    const { project, tasksCompleted, workDescription, hoursWorked, status, blockers, nextDayPlan, date } = req.body;

    if (!project || !workDescription || !hoursWorked || !nextDayPlan)
      return res.status(400).json({ message: 'Project, work description, hours worked, and next day plan are required' });

    const reportDate = date ? new Date(date) : new Date();
    const dayStart = new Date(reportDate.setHours(0, 0, 0, 0));
    const dayEnd = new Date(reportDate.setHours(23, 59, 59, 999));

    // Check for existing report for same employee/project/day
    const existing = await DailyReport.findOne({
      employee: req.user._id,
      project,
      date: { $gte: dayStart, $lte: dayEnd }
    });

    if (existing)
      return res.status(400).json({ message: 'Report already submitted for this project today. Edit the existing one.' });

    const report = await DailyReport.create({
      employee: req.user._id,
      project,
      date: new Date(date || Date.now()),
      tasksCompleted: tasksCompleted || [],
      workDescription,
      hoursWorked,
      status: status || 'in-progress',
      blockers: blockers || 'None',
      nextDayPlan
    });

    await report.populate([
      { path: 'employee', select: 'name employeeId' },
      { path: 'project', select: 'name projectId' }
    ]);

    res.status(201).json({ message: 'Report submitted successfully', report });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/reports/missing — Admin: employees who haven't submitted today
router.get('/missing', protect, hasPermission('REPORTS_VIEW'), async (req, res) => {
  try {
    const today = new Date();
    const start = new Date(today.setHours(0, 0, 0, 0));
    const end = new Date(today.setHours(23, 59, 59, 999));

    const allEmployees = await User.find({ role: 'employee', isActive: true }, 'name employeeId department');

    const todaysReports = await DailyReport.find({ date: { $gte: start, $lte: end } }, 'employee');
    const reportedIds = new Set(todaysReports.map(r => r.employee.toString()));

    const missing = allEmployees.filter(e => !reportedIds.has(e._id.toString()));
    res.json(missing);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/reports/:id
router.get('/:id', protect, async (req, res) => {
  try {
    const report = await DailyReport.findById(req.params.id)
      .populate('employee', 'name employeeId department')
      .populate('project', 'name projectId')
      .populate('tasksCompleted.task', 'title taskId');

    if (!report) return res.status(404).json({ message: 'Report not found' });

    if (req.user.role === 'employee' && report.employee._id.toString() !== req.user._id.toString())
      return res.status(403).json({ message: 'Access denied' });

    res.json(report);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// PUT /api/reports/:id — Employee: edit own report
router.put('/:id', protect, async (req, res) => {
  try {
    const report = await DailyReport.findById(req.params.id);
    if (!report) return res.status(404).json({ message: 'Report not found' });

    if (req.user.role === 'employee' && report.employee.toString() !== req.user._id.toString())
      return res.status(403).json({ message: 'Access denied' });

    Object.assign(report, req.body);
    await report.save();

    res.json({ message: 'Report updated', report });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// PATCH /api/reports/:id/review — Admin: review a report
router.patch('/:id/review', protect, hasPermission('REPORTS_REVIEW'), async (req, res) => {
  try {
    const { comment } = req.body;
    const report = await DailyReport.findByIdAndUpdate(
      req.params.id,
      {
        adminReview: {
          reviewed: true,
          comment: comment || '',
          reviewedAt: new Date(),
          reviewedBy: req.user._id
        }
      },
      { new: true }
    );
    if (!report) return res.status(404).json({ message: 'Report not found' });
    res.json({ message: 'Report reviewed', report });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// PATCH /api/reports/:id/reply — Employee: reply to admin review
router.patch('/:id/reply', protect, async (req, res) => {
  try {
    const { comment } = req.body;
    if (!comment || !comment.trim())
      return res.status(400).json({ message: 'Reply comment is required' });

    const report = await DailyReport.findById(req.params.id);
    if (!report) return res.status(404).json({ message: 'Report not found' });

    // Only the report owner can reply
    if (report.employee.toString() !== req.user._id.toString())
      return res.status(403).json({ message: 'Access denied' });

    // Can only reply once admin has reviewed
    if (!report.adminReview?.reviewed)
      return res.status(400).json({ message: 'Admin has not reviewed this report yet' });

    report.employeeReply = { comment: comment.trim(), repliedAt: new Date() };
    await report.save();

    res.json({ message: 'Reply submitted', report });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
