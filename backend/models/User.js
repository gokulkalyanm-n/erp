const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

// All available permissions for admins
const PERMISSIONS = [
  'EMPLOYEE_VIEW',
  'EMPLOYEE_CREATE',
  'EMPLOYEE_EDIT',
  'EMPLOYEE_DELETE',
  'PROJECT_VIEW',
  'PROJECT_CREATE',
  'PROJECT_EDIT',
  'PROJECT_DELETE',
  'TASK_VIEW',
  'TASK_CREATE',
  'TASK_EDIT',
  'TASK_DELETE',
  'REPORTS_VIEW',
  'REPORTS_REVIEW',
  'LEAVE_VIEW',
  'LEAVE_APPROVE',
  'ANALYTICS_VIEW',
  'ANNOUNCEMENTS_MANAGE',
];

const userSchema = new mongoose.Schema({
  employeeId: {
    type: String,
    unique: true,
    sparse: true
  },
  name: {
    type: String,
    required: true,
    trim: true
  },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true
  },
  password: {
    type: String,
    required: true
  },
  role: {
    type: String,
    enum: ['super_admin', 'admin', 'employee'],
    default: 'employee'
  },
  // Granular permissions — only meaningful for role=admin
  permissions: {
    type: [String],
    default: []
  },
  department: {
    type: String,
    trim: true
  },
  designation: {
    type: String,
    trim: true
  },
  phone: {
    type: String,
    trim: true
  },
  joiningDate: {
    type: Date,
    default: Date.now
  },
  isActive: {
    type: Boolean,
    default: true
  },
  profilePic: {
    type: String,
    default: ''
  },
  skills: [{ type: String }],
  address: { type: String }
}, { timestamps: true });

// Export the permissions list for use elsewhere
userSchema.statics.PERMISSIONS = PERMISSIONS;

// Hash password before saving
userSchema.pre('save', async function () {
  if (!this.isModified('password')) return;

  this.password = await bcrypt.hash(this.password, 12);
});

// Compare password
userSchema.methods.comparePassword = async function (candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

module.exports = mongoose.model('User', userSchema);
