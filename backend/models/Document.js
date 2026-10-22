const mongoose = require('mongoose');

/**
 * Files are stored as binary in MongoDB (no disk / no cloud storage).
 * The `fileData` field is excluded from all list queries — only fetched
 * on the authenticated download route.
 *
 * audience:
 *   'owner'    — visible only to the employee who uploaded it
 *   'selected' — visible to the employees listed in audienceUsers
 *   'all'      — visible to every active employee
 */
const documentSchema = new mongoose.Schema({
  title:    { type: String, required: true, trim: true },
  category: { type: String, required: true, trim: true },
  note:     { type: String, trim: true, default: '' },

  // File storage (binary in MongoDB — excluded from list queries)
  fileName:    { type: String, required: true },
  mimeType:    { type: String, required: true },
  fileSize:    { type: Number, required: true },  // bytes
  fileData:    { type: Buffer, required: true, select: false },

  // Who uploaded it
  uploadedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },

  // For employee-uploaded docs — the owning employee
  ownerEmployee: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },

  // Audience
  audience: {
    type: String,
    enum: ['owner', 'selected', 'all'],
    default: 'owner'
  },
  audienceUsers: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }]
}, { timestamps: true });

module.exports = mongoose.model('Document', documentSchema);
