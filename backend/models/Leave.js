const mongoose = require('mongoose');

const leaveSchema = new mongoose.Schema({
  employee: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  leaveType: {
    type: String,
    enum: ['sick', 'casual', 'earned', 'maternity', 'paternity', 'unpaid', 'other'],
    required: true
  },
  fromDate: { type: Date, required: true },
  toDate:   { type: Date, required: true },
  numberOfDays: { type: Number, required: true, min: 0.5 },
  reason: { type: String, required: true, trim: true },
  additionalInfo: { type: String, trim: true, default: '' },

  /**
   * Two-stage approval workflow
   *
   * stage: 'hr'           — newly submitted, visible only to HR
   * stage: 'super_admin'  — HR approved & forwarded, now visible to super admin
   * stage: 'done'         — super admin has acted (approved or rejected)
   *
   * status:
   *   'pending'  — awaiting action at current stage
   *   'approved' — fully approved by both stages
   *   'rejected' — rejected at either stage
   */
  stage: {
    type: String,
    enum: ['hr', 'super_admin', 'done'],
    default: 'hr'
  },
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected'],
    default: 'pending'
  },

  // Stage 1 — HR review
  hrReview: {
    action: { type: String, enum: ['approved', 'rejected', null], default: null },
    comment: { type: String, trim: true, default: '' },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    reviewedAt: { type: Date }
  },

  // Stage 2 — Super Admin review
  superAdminReview: {
    action: { type: String, enum: ['approved', 'rejected', null], default: null },
    comment: { type: String, trim: true, default: '' },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    reviewedAt: { type: Date }
  }

}, { timestamps: true });

module.exports = mongoose.model('Leave', leaveSchema);
