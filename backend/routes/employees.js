const express = require('express');
const router = express.Router();
const User = require('../models/User');
const { protect, adminOnly, hasPermission } = require('../middleware/auth');

// GET /api/employees
router.get('/', protect, hasPermission('EMPLOYEE_VIEW'), async (req, res) => {
  try {
    const { department, isActive, search } = req.query;
    const filter = { role: 'employee' };

    if (department) filter.department = department;
    if (isActive !== undefined) filter.isActive = isActive === 'true';
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { employeeId: { $regex: search, $options: 'i' } }
      ];
    }

    const employees = await User.find(filter).select('-password').sort({ createdAt: -1 });
    res.json(employees);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/employees — Admin: add employee
router.post('/', protect, hasPermission('EMPLOYEE_CREATE'), async (req, res) => {
  try {
    const { employeeId, name, email, password, department, designation, phone, joiningDate, skills, address } = req.body;

    if (!employeeId || !employeeId.trim())
      return res.status(400).json({ message: 'Employee ID is required' });

    if (!name || !email || !password)
      return res.status(400).json({ message: 'Name, email and password are required' });

    // Check Employee ID uniqueness
    const idExists = await User.findOne({ employeeId: employeeId.trim().toUpperCase() });
    if (idExists)
      return res.status(400).json({ message: `Employee ID "${employeeId.trim().toUpperCase()}" is already taken` });

    // Check email uniqueness
    const emailExists = await User.findOne({ email: email.toLowerCase() });
    if (emailExists)
      return res.status(400).json({ message: 'Email already registered' });

    const employee = await User.create({
      employeeId: employeeId.trim().toUpperCase(),
      name,
      email,
      password,
      role: 'employee',
      department,
      designation,
      phone,
      joiningDate: joiningDate || Date.now(),
      skills: skills || [],
      address
    });

    const result = employee.toObject();
    delete result.password;

    res.status(201).json({ message: 'Employee created successfully', employee: result });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/employees/:id
router.get('/:id', protect, async (req, res) => {
  try {
    const employee = await User.findById(req.params.id).select('-password');
    if (!employee) return res.status(404).json({ message: 'Employee not found' });

    // Employees can only see their own profile
    if (req.user.role === 'employee' && req.user._id.toString() !== req.params.id)
      return res.status(403).json({ message: 'Access denied' });

    res.json(employee);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// PUT /api/employees/:id — Admin: update employee
router.put('/:id', protect, hasPermission('EMPLOYEE_EDIT'), async (req, res) => {
  try {
    const { employeeId, name, email, department, designation, phone, skills, address, joiningDate } = req.body;

    const employee = await User.findById(req.params.id);
    if (!employee) return res.status(404).json({ message: 'Employee not found' });

    // If employeeId is being changed, check uniqueness
    if (employeeId && employeeId.trim().toUpperCase() !== employee.employeeId) {
      const idExists = await User.findOne({
        employeeId: employeeId.trim().toUpperCase(),
        _id: { $ne: req.params.id }
      });
      if (idExists)
        return res.status(400).json({ message: `Employee ID "${employeeId.trim().toUpperCase()}" is already taken` });
      employee.employeeId = employeeId.trim().toUpperCase();
    }

    // If email is being changed, check uniqueness
    if (email && email !== employee.email) {
      const emailExists = await User.findOne({ email: email.toLowerCase() });
      if (emailExists) return res.status(400).json({ message: 'Email already in use' });
      employee.email = email.toLowerCase();
    }

    if (name) employee.name = name;
    if (department !== undefined) employee.department = department;
    if (designation !== undefined) employee.designation = designation;
    if (phone !== undefined) employee.phone = phone;
    if (skills !== undefined) employee.skills = skills;
    if (address !== undefined) employee.address = address;
    if (joiningDate !== undefined) employee.joiningDate = joiningDate;

    await employee.save();
    const result = employee.toObject();
    delete result.password;

    res.json({ message: 'Employee updated successfully', employee: result });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// PATCH /api/employees/:id/toggle-status — Admin: activate/deactivate
router.patch('/:id/toggle-status', protect, hasPermission('EMPLOYEE_DELETE'), async (req, res) => {
  try {
    const employee = await User.findById(req.params.id);
    if (!employee) return res.status(404).json({ message: 'Employee not found' });

    employee.isActive = !employee.isActive;
    await employee.save();

    res.json({
      message: `Employee ${employee.isActive ? 'activated' : 'deactivated'} successfully`,
      isActive: employee.isActive
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// PATCH /api/employees/:id/reset-password — Admin: reset password
router.patch('/:id/reset-password', protect, hasPermission('EMPLOYEE_EDIT'), async (req, res) => {
  try {
    const { newPassword } = req.body;
    if (!newPassword || newPassword.length < 6)
      return res.status(400).json({ message: 'Password must be at least 6 characters' });

    const employee = await User.findById(req.params.id);
    if (!employee) return res.status(404).json({ message: 'Employee not found' });

    employee.password = newPassword;
    await employee.save();

    res.json({ message: 'Password reset successfully' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// DELETE /api/employees/:id — Admin: permanently delete employee
router.delete('/:id', protect, hasPermission('EMPLOYEE_DELETE'), async (req, res) => {
  try {
    const employee = await User.findById(req.params.id);
    if (!employee) return res.status(404).json({ message: 'Employee not found' });
    if (employee.role === 'admin') return res.status(403).json({ message: 'Cannot delete admin account' });

    await employee.deleteOne();
    res.json({ message: `Employee ${employee.name} deleted permanently` });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
