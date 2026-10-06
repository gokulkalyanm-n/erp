/**
 * Run this once to create the super admin account:
 * node seed.js
 */
const mongoose = require('mongoose');
const dotenv = require('dotenv');
dotenv.config();

const User = require('./models/User');

async function seed() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log('Connected to MongoDB');

  // Upgrade existing admin to super_admin if present
  const existing = await User.findOne({ email: 'admin@mgsolutions.com' });
  if (existing) {
    if (existing.role !== 'super_admin') {
      existing.role = 'super_admin';
      existing.permissions = [];
      await existing.save();
      console.log('✅ Existing admin upgraded to super_admin');
    } else {
      console.log('Super admin already exists');
    }
    process.exit(0);
  }

  await User.create({
    name: 'MG Solutions Admin',
    email: 'admin@mgsolutions.com',
    password: 'Admin@123',
    role: 'super_admin',
    department: 'Management',
    designation: 'Super Administrator',
    isActive: true,
    permissions: []
  });

  console.log('✅ Super Admin created!');
  console.log('Email: admin@mgsolutions.com');
  console.log('Password: Admin@123');
  process.exit(0);
}

seed().catch(err => {
  console.error(err);
  process.exit(1);
});
