const mongoose = require('mongoose');

/**
 * One record per employee per month.
 * Frozen once generated — later salary / setting changes do NOT alter it.
 * Re-generation allowed only while status === 'pending'.
 *
 * Formula (new):
 *   perDaySalary   = monthlySalary / workingDays
 *   deductedDays   = absentDays + leaveDays
 *   totalDeduction = deductedDays * perDaySalary   (rounded to 2 dp)
 *   netSalary      = max(0, monthlySalary - totalDeduction + bonus - extraDeduction)
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
  absentDays:     { type: Number, default: 0 },
  leaveDays:      { type: Number, required: true },
  extraLeaveDays: { type: Number, default: 0 },  // leaveDays - freeLeavesPerMonth (≥0)

  // ── Salary snapshot ──
  monthlySalary:  { type: Number, required: true, min: 0 },
  perDaySalary:   { type: Number, default: 0, min: 0 },
  deductedDays:   { type: Number, default: 0, min: 0 },
  totalDeduction: { type: Number, default: 0, min: 0 },

  // ── Optional adjustments ──
  adjustments: { type: [adjustmentSchema], default: [] },

  // ── Final figure ──
  netSalary: { type: Number, required: true, min: 0 },

  // ── Payment ──
  // 'pending' kept for backward compatibility with old records — treated same as 'not_released'
  status: { type: String, enum: ['not_released', 'on_hold', 'paid', 'pending'], default: 'not_released' },
  paidOn: { type: Date },
  paidBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

payrollSchema.index({ employee: 1, month: 1 }, { unique: true });

module.exports = mongoose.model('Payroll', payrollSchema);
