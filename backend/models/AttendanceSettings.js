const mongoose = require('mongoose');

/**
 * Single-document settings for the attendance module.
 * Created with defaults on first GET if it doesn't exist.
 */
const attendanceSettingsSchema = new mongoose.Schema({
  // Weekday numbers that are weekly off (0 = Sunday, 6 = Saturday)
  weeklyOffDays: {
    type: [Number],
    default: [0]  // Sunday off by default
  },
  // List of public / company holidays
  holidays: [
    {
      date: { type: Date, required: true },
      name: { type: String, required: true, trim: true }
    }
  ],
  // How many approved leave days per month are free (don't deduct salary)
  freeLeavesPerMonth: {
    type: Number,
    default: 2,
    min: 0
  }
  // NOTE: deductionPerExtraLeave removed — payroll deduction is now purely
  // calculated as (monthlySalary / workingDays) × deductedDays
}, { timestamps: true });

module.exports = mongoose.model('AttendanceSettings', attendanceSettingsSchema);
