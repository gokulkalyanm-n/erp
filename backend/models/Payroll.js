const mongoose = require('mongoose');

/**
 * One record per employee per month.
 * Frozen once generated — later salary / setting changes do NOT alter it.
 * Re-generation allowed only while status === 'pending'.
 */
const adjustmentSchema = new mongoose.Schema({
  type:   { type: String, enum: ['bonus', 'deduction'], required: true },
  amount: { type: Number, required: true, min: 0 },
  reason: { type: String, required: true, trim: true }
}, { _id: false });

const payrollSchema = new mongoose.Schema({
  employee: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  month:    { type: String, required: true },  // YYYY-MM

  // ── Attendance snapshot (frozen at generation time) ──
  workingDays:    { type: Number, required: true },
  presentDays:    { type: Number, required: true },
  leaveDays:      { type: Number, required: true },
  paidLeaveDays:  { type: Number, required: true },
  extraLeaveDays: { type: Number, required: true },

  // ── Salary snapshot ──
  monthlySalary:     { type: Number, required: true, min: 0 },
  deductionPerDay:   { type: Number, required: true, min: 0 }, // deductionPerExtraLeave at gen time
  totalDeduction:    { type: Number, required: true, min: 0 },

  // ── Optional adjustments ──
  adjustments: { type: [adjustmentSchema], default: [] },

  // ── Final figures ──
  netSalary: { type: Number, required: true, min: 0 },

  // ── Payment ──
  status:  { type: String, enum: ['pending', 'paid'], default: 'pending' },
  paidOn:  { type: Date },
  paidBy:  { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

// Unique: one record per employee per month
payrollSchema.index({ employee: 1, month: 1 }, { unique: true });

module.exports = mongoose.model('Payroll', payrollSchema);
