const jwt = require('jsonwebtoken');
const User = require('../models/User');

// Verify JWT token
exports.protect = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'Not authorized, no token' });
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const user = await User.findById(decoded.id).select('-password');
    if (!user) {
      return res.status(401).json({ message: 'User not found' });
    }
    if (!user.isActive) {
      return res.status(403).json({ message: 'Account deactivated. Contact admin.' });
    }

    req.user = user;
    next();
  } catch (err) {
    return res.status(401).json({ message: 'Token invalid or expired' });
  }
};

// Super admin only
exports.superAdminOnly = (req, res, next) => {
  if (req.user.role !== 'super_admin') {
    return res.status(403).json({ message: 'Super Admin access required' });
  }
  next();
};

// Admin or super_admin (any admin-level user)
exports.adminOnly = (req, res, next) => {
  if (req.user.role !== 'admin' && req.user.role !== 'super_admin') {
    return res.status(403).json({ message: 'Admin access required' });
  }
  next();
};

// Employee only
exports.employeeOnly = (req, res, next) => {
  if (req.user.role !== 'employee') {
    return res.status(403).json({ message: 'Employee access only' });
  }
  next();
};

/**
 * hasPermission(permission)
 * Middleware factory — super_admin bypasses all checks.
 * Regular admins must have the specified permission in their permissions array.
 * Employees are always rejected.
 */
exports.hasPermission = (permission) => (req, res, next) => {
  const { role, permissions } = req.user;

  // Super admin bypasses everything
  if (role === 'super_admin') return next();

  // Must be at least admin
  if (role !== 'admin') {
    return res.status(403).json({ message: 'Admin access required' });
  }

  // Admin must have the specific permission
  if (!permissions || !permissions.includes(permission)) {
    return res.status(403).json({
      message: `Access denied. Required permission: ${permission}`
    });
  }

  next();
};
