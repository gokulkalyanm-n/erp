const express = require('express');
const router = express.Router();
const Task = require('../models/Task');
const Project = require('../models/Project');
const { protect, adminOnly, hasPermission } = require('../middleware/auth');

// GET /api/tasks — Admin: all, Employee: assigned only
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
      // Admin needs TASK_VIEW permission
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

// POST /api/tasks — Admin only
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

    res.status(201).json({ message: 'Task created successfully', task });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/tasks/:id
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

// PUT /api/tasks/:id — Admin: full update
router.put('/:id', protect, hasPermission('TASK_EDIT'), async (req, res) => {
  try {
    const task = await Task.findByIdAndUpdate(req.params.id, req.body, { new: true })
      .populate('project', 'name projectId')
      .populate('assignedTo', 'name employeeId');

    if (!task) return res.status(404).json({ message: 'Task not found' });
    res.json({ message: 'Task updated', task });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// PATCH /api/tasks/:id/status — Employee: update own task status
router.patch('/:id/status', protect, async (req, res) => {
  try {
    const { status, actualHours } = req.body;
    const task = await Task.findById(req.params.id);

    if (!task) return res.status(404).json({ message: 'Task not found' });

    if (req.user.role === 'employee' && task.assignedTo.toString() !== req.user._id.toString())
      return res.status(403).json({ message: 'Access denied' });

    task.status = status;
    if (actualHours !== undefined) task.actualHours = actualHours;
    if (status === 'completed') task.completedAt = new Date();

    await task.save();
    res.json({ message: 'Task status updated', task });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/tasks/:id/comment
router.post('/:id/comment', protect, async (req, res) => {
  try {
    const { text } = req.body;
    const task = await Task.findById(req.params.id);
    if (!task) return res.status(404).json({ message: 'Task not found' });

    task.comments.push({ author: req.user._id, text });
    await task.save();
    await task.populate('comments.author', 'name');

    res.json({ message: 'Comment added', comments: task.comments });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// DELETE /api/tasks/:id — Admin only
router.delete('/:id', protect, hasPermission('TASK_DELETE'), async (req, res) => {
  try {
    const task = await Task.findByIdAndDelete(req.params.id);
    if (!task) return res.status(404).json({ message: 'Task not found' });
    res.json({ message: 'Task deleted' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
