const express = require('express');
const router = express.Router();
const Task = require('../models/Task');
const Project = require('../models/Project');
const { protect, adminOnly, hasPermission } = require('../middleware/auth');
const { sendToUsers, sendToRoles } = require('../services/push');

// ─── GET /api/tasks ──────────────────────────────────────────────────────────
router.get('/', protect, async (req, res) => {
  try {
    const { project, status, priority, assignedTo } = req.query;
    const filter = {};

    if (project) filter.project = project;
    if (status) filter.status = status;
    if (priority) filter.priority = priority;

    if (req.user.role === 'employee') {
      filter.assignedTo = req.user._id;
    } else {
      if (req.user.role === 'admin' && !req.user.permissions?.includes('TASK_VIEW')) {
        return res.status(403).json({ message: 'Access denied. Required permission: TASK_VIEW' });
      }
      if (assignedTo) filter.assignedTo = assignedTo;
    }

    const tasks = await Task.find(filter)
      .populate('project', 'name projectId')
      .populate('assignedTo', 'name employeeId')
      .populate('assignedBy', 'name')
      .sort({ dueDate: 1 });

    res.json(tasks);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ─── POST /api/tasks ─────────────────────────────────────────────────────────
router.post('/', protect, hasPermission('TASK_CREATE'), async (req, res) => {
  try {
    const { title, description, project, assignedTo, priority, dueDate, estimatedHours } = req.body;

    if (!title || !project || !assignedTo || !dueDate)
      return res.status(400).json({ message: 'Title, project, assignee and due date are required' });

    const task = await Task.create({
      title,
      description,
      project,
      assignedTo,
      assignedBy: req.user._id,
      priority,
      dueDate,
      estimatedHours: estimatedHours || 0
    });

    await task.populate([
      { path: 'project', select: 'name projectId' },
      { path: 'assignedTo', select: 'name employeeId' }
    ]);

    // Notify the assigned employee
    sendToUsers(
      [assignedTo],
      'New Task Assigned',
      `"${title}" has been assigned to you in ${task.project?.name}. Due: ${new Date(dueDate).toLocaleDateString('en-IN')}.`,
      { type: 'task', id: String(task._id) }
    ).catch(err => console.error('Push error (task create):', err.message));

    res.status(201).json({ message: 'Task created successfully', task });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ─── GET /api/tasks/:id ──────────────────────────────────────────────────────
router.get('/:id', protect, async (req, res) => {
  try {
    const task = await Task.findById(req.params.id)
      .populate('project', 'name projectId')
      .populate('assignedTo', 'name employeeId')
      .populate('assignedBy', 'name')
      .populate('comments.author', 'name');

    if (!task) return res.status(404).json({ message: 'Task not found' });

    if (req.user.role === 'employee' && task.assignedTo._id.toString() !== req.user._id.toString())
      return res.status(403).json({ message: 'Access denied' });

    res.json(task);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ─── PUT /api/tasks/:id ──────────────────────────────────────────────────────
router.put('/:id', protect, hasPermission('TASK_EDIT'), async (req, res) => {
  try {
    const before = await Task.findById(req.params.id).select('assignedTo title');
    const oldAssignee = String(before?.assignedTo);

    const task = await Task.findByIdAndUpdate(req.params.id, req.body, { new: true })
      .populate('project', 'name projectId')
      .populate('assignedTo', 'name employeeId');

    if (!task) return res.status(404).json({ message: 'Task not found' });

    const newAssignee = String(task.assignedTo?._id || task.assignedTo);

    if (req.body.assignedTo && newAssignee !== oldAssignee) {
      // Notify newly assigned employee
      sendToUsers(
        [newAssignee],
        'Task Reassigned to You',
        `"${task.title}" has been reassigned to you in ${task.project?.name}.`,
        { type: 'task', id: String(task._id) }
      ).catch(err => console.error('Push error (task reassign):', err.message));
    } else {
      // Notify the current assignee of the update
      sendToUsers(
        [newAssignee],
        'Task Updated',
        `Your task "${task.title}" has been updated.`,
        { type: 'task', id: String(task._id) }
      ).catch(err => console.error('Push error (task update):', err.message));
    }

    res.json({ message: 'Task updated', task });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ─── PATCH /api/tasks/:id/status ─────────────────────────────────────────────
router.patch('/:id/status', protect, async (req, res) => {
  try {
    const { status, actualHours } = req.body;
    const task = await Task.findById(req.params.id)
      .populate('project', 'name projectId')
      .populate('assignedTo', 'name');

    if (!task) return res.status(404).json({ message: 'Task not found' });

    if (req.user.role === 'employee' && task.assignedTo._id.toString() !== req.user._id.toString())
      return res.status(403).json({ message: 'Access denied' });

    task.status = status;
    if (actualHours !== undefined) task.actualHours = actualHours;
    if (status === 'completed') task.completedAt = new Date();

    await task.save();

    // Employee marks task done → notify admins
    if (req.user.role === 'employee' && status === 'completed') {
      sendToRoles(
        ['admin', 'super_admin'],
        'Task Completed ✅',
        `${req.user.name} completed "${task.title}" in ${task.project?.name}.`,
        { type: 'task', id: String(task._id) }
      ).catch(err => console.error('Push error (task complete by employee):', err.message));
    }

    // Admin changes task status → notify the employee (if not completing themselves)
    if (req.user.role !== 'employee') {
      sendToUsers(
        [String(task.assignedTo._id)],
        'Task Status Updated',
        `Your task "${task.title}" has been marked as ${status} by an admin.`,
        { type: 'task', id: String(task._id) }
      ).catch(err => console.error('Push error (task status by admin):', err.message));
    }

    res.json({ message: 'Task status updated', task });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ─── POST /api/tasks/:id/comment ─────────────────────────────────────────────
router.post('/:id/comment', protect, async (req, res) => {
  try {
    const { text } = req.body;
    const task = await Task.findById(req.params.id)
      .populate('assignedTo', 'name')
      .populate('assignedBy', 'name');

    if (!task) return res.status(404).json({ message: 'Task not found' });

    task.comments.push({ author: req.user._id, text });
    await task.save();
    await task.populate('comments.author', 'name');

    // Employee comments → notify the admin who assigned it (assignedBy)
    if (req.user.role === 'employee') {
      if (task.assignedBy?._id && String(task.assignedBy._id) !== String(req.user._id)) {
        sendToUsers(
          [String(task.assignedBy._id)],
          'New Comment on Task',
          `${req.user.name} commented on "${task.title}": "${text.slice(0, 80)}${text.length > 80 ? '…' : ''}"`,
          { type: 'task', id: String(task._id) }
        ).catch(err => console.error('Push error (task comment by employee):', err.message));
      }
    } else {
      // Admin comments → notify the assigned employee
      const assigneeId = String(task.assignedTo?._id || task.assignedTo);
      if (assigneeId && assigneeId !== String(req.user._id)) {
        sendToUsers(
          [assigneeId],
          'New Comment on Your Task',
          `${req.user.name} commented on "${task.title}": "${text.slice(0, 80)}${text.length > 80 ? '…' : ''}"`,
          { type: 'task', id: String(task._id) }
        ).catch(err => console.error('Push error (task comment by admin):', err.message));
      }
    }

    res.json({ message: 'Comment added', comments: task.comments });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ─── DELETE /api/tasks/:id ───────────────────────────────────────────────────
router.delete('/:id', protect, hasPermission('TASK_DELETE'), async (req, res) => {
  try {
    const task = await Task.findById(req.params.id)
      .populate('assignedTo', 'name')
      .populate('project', 'name');

    if (!task) return res.status(404).json({ message: 'Task not found' });

    // Notify the assigned employee their task was deleted
    const assigneeId = String(task.assignedTo?._id || task.assignedTo);
    if (assigneeId && assigneeId !== String(req.user._id)) {
      sendToUsers(
        [assigneeId],
        'Task Removed',
        `Task "${task.title}" in ${task.project?.name} has been deleted.`,
        { type: 'task', id: String(task._id) }
      ).catch(err => console.error('Push error (task delete):', err.message));
    }

    await Task.findByIdAndDelete(req.params.id);
    res.json({ message: 'Task deleted' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
