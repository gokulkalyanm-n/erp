const express  = require('express');
const router   = express.Router();
const multer   = require('multer');
const Document = require('../models/Document');
const User     = require('../models/User');
const { protect } = require('../middleware/auth');
const { sendToPermission, sendToUsers } = require('../services/push');

// ─── multer: memory storage, 5 MB limit, allowed types ──────────────────────
const ALLOWED_MIME = new Set([
  'application/pdf',
  'image/jpeg', 'image/jpg', 'image/png',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIME.has(file.mimetype)) cb(null, true);
    else cb(new Error('Only PDF, JPG, PNG, DOC and DOCX files are allowed'));
  },
});

// ─── auth helpers ────────────────────────────────────────────────────────────
function canView(user) {
  return user.role === 'super_admin' ||
    (user.role === 'admin' && user.permissions?.includes('DOCUMENTS_VIEW'));
}
function canManage(user) {
  return user.role === 'super_admin' ||
    (user.role === 'admin' && user.permissions?.includes('DOCUMENTS_MANAGE'));
}

// ─── METADATA projection (never include fileData in lists) ───────────────────
const META = '-fileData';

// ─── POST /api/documents/employee ────────────────────────────────────────────
// Employee uploads their own document
router.post('/employee', protect, upload.single('file'), async (req, res) => {
  try {
    if (req.user.role !== 'employee') {
      return res.status(403).json({ message: 'Only employees can use this endpoint' });
    }
    if (!req.file) return res.status(400).json({ message: 'File is required' });

    const { title, category, note } = req.body;
    if (!title || !category) {
      return res.status(400).json({ message: 'Title and category are required' });
    }

    const doc = await Document.create({
      title,
      category,
      note:          note || '',
      fileName:      req.file.originalname,
      mimeType:      req.file.mimetype,
      fileSize:      req.file.size,
      fileData:      req.file.buffer,
      uploadedBy:    req.user._id,
      ownerEmployee: req.user._id,
      audience:      'owner',
    });

    // Notify admins with DOCUMENTS_VIEW — fire-and-forget
    sendToPermission(
      'DOCUMENTS_VIEW',
      'New Document Uploaded',
      `${req.user.name} uploaded "${title}" (${category}).`,
      { type: 'document', id: String(doc._id) }
    ).catch(err => console.error('Push error (doc upload):', err.message));

    const result = doc.toObject();
    delete result.fileData;
    res.status(201).json({ message: 'Document uploaded', document: result });
  } catch (err) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ message: 'File exceeds 5 MB limit' });
    }
    res.status(500).json({ message: err.message });
  }
});

// ─── POST /api/documents/admin ────────────────────────────────────────────────
// Admin shares a document with all employees or selected employees
router.post('/admin', protect, upload.single('file'), async (req, res) => {
  try {
    if (!canManage(req.user)) {
      return res.status(403).json({ message: 'Access denied. Required permission: DOCUMENTS_MANAGE' });
    }
    if (!req.file) return res.status(400).json({ message: 'File is required' });

    const { title, category, note, audience, audienceUsers } = req.body;
    if (!title || !category) {
      return res.status(400).json({ message: 'Title and category are required' });
    }
    if (!['all', 'selected'].includes(audience)) {
      return res.status(400).json({ message: 'audience must be all or selected' });
    }

    let parsedUsers = [];
    if (audience === 'selected') {
      try { parsedUsers = JSON.parse(audienceUsers || '[]'); }
      catch { return res.status(400).json({ message: 'audienceUsers must be a JSON array' }); }
      if (!parsedUsers.length) {
        return res.status(400).json({ message: 'Select at least one employee for a targeted document' });
      }
    }

    const doc = await Document.create({
      title,
      category,
      note:          note || '',
      fileName:      req.file.originalname,
      mimeType:      req.file.mimetype,
      fileSize:      req.file.size,
      fileData:      req.file.buffer,
      uploadedBy:    req.user._id,
      ownerEmployee: null,
      audience,
      audienceUsers: audience === 'selected' ? parsedUsers : [],
    });

    // Notify employees who can see this document
    const notifyIds = audience === 'all'
      ? (await User.find({ role: 'employee', isActive: true }, '_id')).map(u => String(u._id))
      : parsedUsers.map(String);

    // Exclude the uploader (admin isn't an employee but guard anyway)
    const recipients = notifyIds.filter(id => id !== String(req.user._id));
    if (recipients.length) {
      sendToUsers(
        recipients,
        'New Document Shared',
        `"${title}" has been shared with you by ${req.user.name}.`,
        { type: 'document', id: String(doc._id) }
      ).catch(err => console.error('Push error (doc share):', err.message));
    }

    const result = doc.toObject();
    delete result.fileData;
    res.status(201).json({ message: 'Document shared', document: result });
  } catch (err) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ message: 'File exceeds 5 MB limit' });
    }
    res.status(500).json({ message: err.message });
  }
});

// ─── GET /api/documents/my ────────────────────────────────────────────────────
// Employee: their own uploads
router.get('/my', protect, async (req, res) => {
  try {
    if (req.user.role !== 'employee') {
      return res.status(403).json({ message: 'Employee access only' });
    }
    const docs = await Document.find({ ownerEmployee: req.user._id })
      .select(META)
      .populate('uploadedBy', 'name')
      .sort({ createdAt: -1 });
    res.json(docs);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ─── GET /api/documents/shared ────────────────────────────────────────────────
// Employee: documents shared specifically with them (not company-wide)
router.get('/shared', protect, async (req, res) => {
  try {
    if (req.user.role !== 'employee') {
      return res.status(403).json({ message: 'Employee access only' });
    }
    const docs = await Document.find({
      audience: 'selected',
      audienceUsers: req.user._id,
    })
      .select(META)
      .populate('uploadedBy', 'name')
      .sort({ createdAt: -1 });
    res.json(docs);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ─── GET /api/documents/company ───────────────────────────────────────────────
// All authenticated users: company-wide documents (audience = all)
router.get('/company', protect, async (req, res) => {
  try {
    const docs = await Document.find({ audience: 'all' })
      .select(META)
      .populate('uploadedBy', 'name')
      .sort({ createdAt: -1 });
    res.json(docs);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ─── GET /api/documents/admin ─────────────────────────────────────────────────
// Admin: list all employee-uploaded documents (metadata only)
router.get('/admin', protect, async (req, res) => {
  try {
    if (!canView(req.user)) {
      return res.status(403).json({ message: 'Access denied. Required permission: DOCUMENTS_VIEW' });
    }
    const { employeeId, category, search, startDate, endDate } = req.query;
    const filter = { ownerEmployee: { $ne: null } }; // employee uploads only

    if (employeeId) filter.ownerEmployee = employeeId;
    if (category)   filter.category = category;
    if (search)     filter.title = { $regex: search, $options: 'i' };
    if (startDate || endDate) {
      filter.createdAt = {};
      if (startDate) filter.createdAt.$gte = new Date(startDate);
      if (endDate)   filter.createdAt.$lte = new Date(endDate);
    }

    const docs = await Document.find(filter)
      .select(META)
      .populate('ownerEmployee', 'name employeeId department')
      .populate('uploadedBy', 'name')
      .sort({ createdAt: -1 });
    res.json(docs);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ─── GET /api/documents/admin/shared ──────────────────────────────────────────
// Admin: list admin-shared documents
router.get('/admin/shared', protect, async (req, res) => {
  try {
    if (!canView(req.user)) {
      return res.status(403).json({ message: 'Access denied. Required permission: DOCUMENTS_VIEW' });
    }
    const docs = await Document.find({ ownerEmployee: null })
      .select(META)
      .populate('uploadedBy', 'name')
      .populate('audienceUsers', 'name employeeId')
      .sort({ createdAt: -1 });
    res.json(docs);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ─── GET /api/documents/:id/download ─────────────────────────────────────────
// Authenticated download — serves raw file, no public URL
router.get('/:id/download', protect, async (req, res) => {
  try {
    const doc = await Document.findById(req.params.id).select('+fileData');
    if (!doc) return res.status(404).json({ message: 'Document not found' });

    const uid  = String(req.user._id);
    const role = req.user.role;

    // Access check
    let allowed = false;
    if (role === 'super_admin' || canView(req.user)) {
      allowed = true; // admins with DOCUMENTS_VIEW can download anything
    } else if (role === 'employee') {
      if (String(doc.ownerEmployee) === uid) allowed = true;
      else if (doc.audience === 'all') allowed = true;
      else if (doc.audience === 'selected' && doc.audienceUsers.some(u => String(u) === uid)) allowed = true;
    }

    if (!allowed) return res.status(403).json({ message: 'Access denied' });

    res.set('Content-Type', doc.mimeType);
    res.set('Content-Disposition', `attachment; filename="${encodeURIComponent(doc.fileName)}"`);
    res.set('Content-Length', doc.fileSize);
    res.send(doc.fileData);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ─── DELETE /api/documents/:id ────────────────────────────────────────────────
router.delete('/:id', protect, async (req, res) => {
  try {
    const doc = await Document.findById(req.params.id);
    if (!doc) return res.status(404).json({ message: 'Document not found' });

    const uid = String(req.user._id);

    // Employees can only delete their own uploads
    if (req.user.role === 'employee') {
      if (String(doc.ownerEmployee) !== uid) {
        return res.status(403).json({ message: 'You can only delete your own documents' });
      }
    } else if (!canManage(req.user)) {
      return res.status(403).json({ message: 'Access denied. Required permission: DOCUMENTS_MANAGE' });
    }

    await doc.deleteOne();
    res.json({ message: 'Document deleted' });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

module.exports = router;
