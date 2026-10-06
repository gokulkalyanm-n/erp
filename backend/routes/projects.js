const express = require('express');
const router = express.Router();
const Project = require('../models/Project');
const Task = require('../models/Task');
const { protect, adminOnly, hasPermission } = require('../middleware/auth');

// GET /api/projects — Admin: all, Employee: assigned only
router.get('/', protect, async (req, res) => {
  try {
    let projects;
    if (req.user.role === 'admin' || req.user.role === 'super_admin') {
      // Check PROJECT_VIEW permission for regular admins
      if (req.user.role === 'admin' && !req.user.permissions?.includes('PROJECT_VIEW')) {
        return res.status(403).json({ message: 'Access denied. Required permission: PROJECT_VIEW' });
      }
      const { status, priority, search } = req.query;
      const filter = {};
      if (status) filter.status = status;
      if (priority) filter.priority = priority;
      if (search) filter.name = { $regex: search, $options: 'i' };

      projects = await Project.find(filter)
        .populate('assignedEmployees.employee', 'name employeeId department')
        .populate('createdBy', 'name')
        .sort({ createdAt: -1 });
    } else {
      projects = await Project.find({
        'assignedEmployees.employee': req.user._id,
        status: { $ne: 'cancelled' }
      })
        .populate('assignedEmployees.employee', 'name employeeId')
        .populate('createdBy', 'name')
        .sort({ deadline: 1 });
    }
    res.json(projects);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/projects — Admin only
router.post('/', protect, hasPermission('PROJECT_CREATE'), async (req, res) => {
  try {
    const { name, description, client, department, startDate, deadline, priority, assignedEmployees } = req.body;

    if (!name || !startDate || !deadline)
      return res.status(400).json({ message: 'Name, start date and deadline are required' });

    const project = await Project.create({
      name,
      description,
      client,
      department,
      startDate,
      deadline,
      priority,
      assignedEmployees: assignedEmployees || [],
      createdBy: req.user._id
    });

    await project.populate('assignedEmployees.employee', 'name employeeId');
    res.status(201).json({ message: 'Project created successfully', project });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/projects/:id
router.get('/:id', protect, async (req, res) => {
  try {
    const project = await Project.findById(req.params.id)
      .populate('assignedEmployees.employee', 'name employeeId department designation')
      .populate('createdBy', 'name');

    if (!project) return res.status(404).json({ message: 'Project not found' });

    // Admin permission check
    if (req.user.role === 'admin' && !req.user.permissions?.includes('PROJECT_VIEW')) {
      return res.status(403).json({ message: 'Access denied. Required permission: PROJECT_VIEW' });
    }

    // Employees can only see their assigned projects
    if (req.user.role === 'employee') {
      const isAssigned = project.assignedEmployees.some(
        ae => ae.employee._id.toString() === req.user._id.toString()
      );
      if (!isAssigned) return res.status(403).json({ message: 'Access denied' });
    }

    res.json(project);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// PUT /api/projects/:id — Admin only
router.put('/:id', protect, hasPermission('PROJECT_EDIT'), async (req, res) => {
  try {
    const project = await Project.findByIdAndUpdate(
      req.params.id,
      { ...req.body },
      { new: true, runValidators: true }
    ).populate('assignedEmployees.employee', 'name employeeId');

    if (!project) return res.status(404).json({ message: 'Project not found' });

    res.json({ message: 'Project updated successfully', project });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// PATCH /api/projects/:id/status — Admin only
router.patch('/:id/status', protect, hasPermission('PROJECT_EDIT'), async (req, res) => {
  try {
    const { status } = req.body;
    const project = await Project.findByIdAndUpdate(
      req.params.id,
      { status },
      { new: true }
    );
    if (!project) return res.status(404).json({ message: 'Project not found' });
    res.json({ message: 'Status updated', project });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// PATCH /api/projects/:id/progress — Employee: update completion % of assigned project
router.patch('/:id/progress', protect, async (req, res) => {
  try {
    const { completionPercentage, workNote } = req.body;

    if (completionPercentage === undefined || completionPercentage < 0 || completionPercentage > 100)
      return res.status(400).json({ message: 'completionPercentage must be between 0 and 100' });

    const project = await Project.findById(req.params.id);
    if (!project) return res.status(404).json({ message: 'Project not found' });

    // Employees can only update their assigned projects; admins can always update
    if (req.user.role === 'employee') {
      const isAssigned = project.assignedEmployees.some(
        ae => ae.employee.toString() === req.user._id.toString()
      );
      if (!isAssigned) return res.status(403).json({ message: 'You are not assigned to this project' });
    }

    project.completionPercentage = Math.round(completionPercentage);

    // Auto-set status based on progress
    if (project.completionPercentage === 100 && project.status !== 'completed') {
      project.status = 'completed';
    } else if (project.completionPercentage > 0 && project.status === 'planning') {
      project.status = 'active';
    }

    await project.save();

    res.json({
      message: 'Progress updated successfully',
      completionPercentage: project.completionPercentage,
      status: project.status
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// DELETE /api/projects/:id — Admin only
router.delete('/:id', protect, hasPermission('PROJECT_DELETE'), async (req, res) => {
  try {
    const project = await Project.findById(req.params.id);
    if (!project) return res.status(404).json({ message: 'Project not found' });

    await Task.deleteMany({ project: req.params.id });
    await project.deleteOne();

    res.json({ message: 'Project deleted successfully' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
