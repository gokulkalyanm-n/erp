const express = require('express');
const router = express.Router();
const User = require('../models/User');
const { protect, superAdminOnly } = require('../middleware/auth');

// All routes here require super_admin

// GET /api/admins — list all admins
router.get('/', protect, superAdminOnly, async (req, res) => {
  try {
    const admins = await User.find({ role: 'admin' })
      .select('-password')
      .sort({ createdAt: -1 });
    res.json(admins);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/admins — super_admin creates an admin
router.post('/', protect, superAdminOnly, async (req, res) => {
  try {
    const { name, email, password, department, designation, phone, permissions } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ message: 'Name, email and password are required' });
    }

    const emailExists = await User.findOne({ email: email.toLowerCase() });
    if (emailExists) return res.status(400).json({ message: 'Email already registered' });

    const admin = await User.create({
      name,
      email,
      password,
      role: 'admin',
      department: department || '',
      designation: designation || '',
      phone: phone || '',
      permissions: permissions || [],
      isActive: true
    });

    const result = admin.toObject();
    delete result.password;

    res.status(201).json({ message: 'Admin created successfully', admin: result });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/admins/:id
router.get('/:id', protect, superAdminOnly, async (req, res) => {
  try {
    const admin = await User.findOne({ _id: req.params.id, role: 'admin' }).select('-password');
    if (!admin) return res.status(404).json({ message: 'Admin not found' });
    res.json(admin);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// PUT /api/admins/:id — super_admin updates admin info + permissions
router.put('/:id', protect, superAdminOnly, async (req, res) => {
  try {
    const { name, email, department, designation, phone, permissions } = req.body;

    const admin = await User.findOne({ _id: req.params.id, role: 'admin' });
    if (!admin) return res.status(404).json({ message: 'Admin not found' });

    if (email && email.toLowerCase() !== admin.email) {
      const exists = await User.findOne({ email: email.toLowerCase() });
      if (exists) return res.status(400).json({ message: 'Email already in use' });
      admin.email = email.toLowerCase();
    }

    if (name) admin.name = name;
    if (department !== undefined) admin.department = department;
    if (designation !== undefined) admin.designation = designation;
    if (phone !== undefined) admin.phone = phone;
    if (permissions !== undefined) admin.permissions = permissions;

    await admin.save();
    const result = admin.toObject();
    delete result.password;

    res.json({ message: 'Admin updated successfully', admin: result });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// PATCH /api/admins/:id/toggle-status
router.patch('/:id/toggle-status', protect, superAdminOnly, async (req, res) => {
  try {
    const admin = await User.findOne({ _id: req.params.id, role: 'admin' });
    if (!admin) return res.status(404).json({ message: 'Admin not found' });

    admin.isActive = !admin.isActive;
    await admin.save();

    res.json({
      message: `Admin ${admin.isActive ? 'activated' : 'deactivated'} successfully`,
      isActive: admin.isActive
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// PATCH /api/admins/:id/reset-password
router.patch('/:id/reset-password', protect, superAdminOnly, async (req, res) => {
  try {
    const { newPassword } = req.body;
    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({ message: 'Password must be at least 6 characters' });
    }

    const admin = await User.findOne({ _id: req.params.id, role: 'admin' });
    if (!admin) return res.status(404).json({ message: 'Admin not found' });

    admin.password = newPassword;
    await admin.save();

    res.json({ message: 'Password reset successfully' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// DELETE /api/admins/:id
router.delete('/:id', protect, superAdminOnly, async (req, res) => {
  try {
    const admin = await User.findOne({ _id: req.params.id, role: 'admin' });
    if (!admin) return res.status(404).json({ message: 'Admin not found' });

    await admin.deleteOne();
    res.json({ message: `Admin ${admin.name} deleted` });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/admins/permissions/list — returns all available permissions
router.get('/permissions/list', protect, superAdminOnly, async (req, res) => {
  res.json(User.PERMISSIONS);
});

module.exports = router;
