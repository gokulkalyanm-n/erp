const express = require('express');
const router = express.Router();
const Project = require('../models/Project');
const Task = require('../models/Task');
const { protect, adminOnly, hasPermission } = require('../middleware/auth');
const { sendToUsers, sendToRoles } = require('../services/push');

// ─── GET /api/projects ───────────────────────────────────────────────────────
router.get('/', protect, async (req, res) => {
  try {
    let projects;
    if (req.user.role === 'admin' || req.user.role === 'super_admin') {
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

// ─── POST /api/projects ──────────────────────────────────────────────────────
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

    // Notify every assigned employee
    const assignedIds = (assignedEmployees || []).map(ae => ae.employee);
    if (assignedIds.length) {
      sendToUsers(
        assignedIds,
        'New Project Assigned',
        `You have been assigned to project "${name}". Deadline: ${new Date(deadline).toLocaleDateString('en-IN')}.`,
        { type: 'project', id: String(project._id) }
      ).catch(err => console.error('Push error (project create):', err.message));
    }

    res.status(201).json({ message: 'Project created successfully', project });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ─── GET /api/projects/:id ───────────────────────────────────────────────────
router.get('/:id', protect, async (req, res) => {
  try {
    const project = await Project.findById(req.params.id)
      .populate('assignedEmployees.employee', 'name employeeId department designation')
      .populate('createdBy', 'name');

    if (!project) return res.status(404).json({ message: 'Project not found' });

    if (req.user.role === 'admin' && !req.user.permissions?.includes('PROJECT_VIEW')) {
      return res.status(403).json({ message: 'Access denied. Required permission: PROJECT_VIEW' });
    }

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

// ─── PUT /api/projects/:id ───────────────────────────────────────────────────
router.put('/:id', protect, hasPermission('PROJECT_EDIT'), async (req, res) => {
  try {
    // Find old assigned IDs before update to detect newly added members
    const before = await Project.findById(req.params.id).select('assignedEmployees name');
    const oldIds = new Set((before?.assignedEmployees || []).map(ae => String(ae.employee)));

    const project = await Project.findByIdAndUpdate(
      req.params.id,
      { ...req.body },
      { new: true, runValidators: true }
    ).populate('assignedEmployees.employee', 'name employeeId');

    if (!project) return res.status(404).json({ message: 'Project not found' });

    // Notify employees who were newly added in this update
    const newIds = (req.body.assignedEmployees || [])
      .map(ae => String(ae.employee))
      .filter(id => !oldIds.has(id));

    if (newIds.length) {
      sendToUsers(
        newIds,
        'Added to Project',
        `You have been added to project "${project.name}".`,
        { type: 'project', id: String(project._id) }
      ).catch(err => console.error('Push error (project update — new members):', err.message));
    }

    // Notify all current members of general project update (excluding the admin who edited)
    const allMemberIds = (project.assignedEmployees || [])
      .map(ae => String(ae.employee?._id || ae.employee))
      .filter(id => id !== String(req.user._id));

    if (allMemberIds.length) {
      sendToUsers(
        allMemberIds,
        'Project Updated',
        `Project "${project.name}" has been updated.`,
        { type: 'project', id: String(project._id) }
      ).catch(err => console.error('Push error (project update):', err.message));
    }

    res.json({ message: 'Project updated successfully', project });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ─── PATCH /api/projects/:id/status ─────────────────────────────────────────
router.patch('/:id/status', protect, hasPermission('PROJECT_EDIT'), async (req, res) => {
  try {
    const { status } = req.body;
    const project = await Project.findByIdAndUpdate(
      req.params.id,
      { status },
      { new: true }
    ).populate('assignedEmployees.employee', 'name');

    if (!project) return res.status(404).json({ message: 'Project not found' });

    // Notify assigned employees of the status change
    const memberIds = (project.assignedEmployees || [])
      .map(ae => String(ae.employee?._id || ae.employee));

    if (memberIds.length) {
      sendToUsers(
        memberIds,
        'Project Status Changed',
        `Project "${project.name}" is now ${status}.`,
        { type: 'project', id: String(project._id) }
      ).catch(err => console.error('Push error (project status):', err.message));
    }

    res.json({ message: 'Status updated', project });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ─── PATCH /api/projects/:id/progress ───────────────────────────────────────
router.patch('/:id/progress', protect, async (req, res) => {
  try {
    const { completionPercentage } = req.body;

    if (completionPercentage === undefined || completionPercentage < 0 || completionPercentage > 100)
      return res.status(400).json({ message: 'completionPercentage must be between 0 and 100' });

    const project = await Project.findById(req.params.id)
      .populate('assignedEmployees.employee', 'name');
    if (!project) return res.status(404).json({ message: 'Project not found' });

    if (req.user.role === 'employee') {
      const isAssigned = project.assignedEmployees.some(
        ae => ae.employee.toString() === req.user._id.toString()
      );
      if (!isAssigned) return res.status(403).json({ message: 'You are not assigned to this project' });
    }

    const wasComplete = project.completionPercentage === 100;
    project.completionPercentage = Math.round(completionPercentage);

    if (project.completionPercentage === 100 && project.status !== 'completed') {
      project.status = 'completed';
    } else if (project.completionPercentage > 0 && project.status === 'planning') {
      project.status = 'active';
    }

    await project.save();

    // Notify admins when a project is marked 100% complete for the first time
    if (!wasComplete && project.completionPercentage === 100) {
      sendToRoles(
        ['admin', 'super_admin'],
        'Project Completed 🎉',
        `"${project.name}" has been marked as 100% complete by ${req.user.name}.`,
        { type: 'project', id: String(project._id) }
      ).catch(err => console.error('Push error (project complete):', err.message));
    }

    res.json({
      message: 'Progress updated successfully',
      completionPercentage: project.completionPercentage,
      status: project.status
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ─── DELETE /api/projects/:id ────────────────────────────────────────────────
router.delete('/:id', protect, hasPermission('PROJECT_DELETE'), async (req, res) => {
  try {
    const project = await Project.findById(req.params.id)
      .populate('assignedEmployees.employee', 'name');
    if (!project) return res.status(404).json({ message: 'Project not found' });

    // Notify assigned employees that the project was deleted
    const memberIds = (project.assignedEmployees || [])
      .map(ae => String(ae.employee?._id || ae.employee));

    if (memberIds.length) {
      sendToUsers(
        memberIds,
        'Project Removed',
        `Project "${project.name}" has been deleted.`,
        { type: 'project', id: String(project._id) }
      ).catch(err => console.error('Push error (project delete):', err.message));
    }

    await Task.deleteMany({ project: req.params.id });
    await project.deleteOne();

    res.json({ message: 'Project deleted successfully' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
