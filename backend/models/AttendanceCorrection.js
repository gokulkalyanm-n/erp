const mongoose = require('mongoose');

/**
 * An employee can raise a correction request for a day they forgot to submit
 * a report. If an admin approves it, that day counts as Present in attendance
 * calculations even without a daily report.
 */
const attendanceCorrectionSchema = new mongoose.Schema({
  employee: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  date: {
    type: String, // YYYY-MM-DD in IST — stored as string for fast lookup
    required: true
  },
  reason: {
    type: String,
    required: true,
    trim: true
  },
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected'],
    default: 'pending'
  },
  adminNote: {
    type: String,
    trim: true,
    default: ''
  },
  reviewedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  reviewedAt: { type: Date }
}, { timestamps: true });

// One correction request per employee per day
attendanceCorrectionSchema.index({ employee: 1, date: 1 }, { unique: true });

module.exports = mongoose.model('AttendanceCorrection', attendanceCorrectionSchema);
