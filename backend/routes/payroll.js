const express = require('express');
const router  = express.Router();
const Payroll = require('../models/Payroll');
const User    = require('../models/User');
const DailyReport = require('../models/DailyReport');
const Leave   = require('../models/Leave');
const AttendanceSettings = require('../models/AttendanceSettings');
const { protect } = require('../middleware/auth');

// ─── IST helpers (duplicated from attendance.js — no shared module yet) ──────

const IST = 'Asia/Kolkata';

function toISTDateStr(d) {
  return new Date(d).toLocaleDateString('en-CA', { timeZone: IST });
}
function todayIST() { return toISTDateStr(new Date()); }

function parseISTDate(str) {
  const [y, m, d] = str.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d) - 5.5 * 60 * 60 * 1000);
}

function dateRange(startStr, endStr) {
  const result = [];
  let cur = new Date(startStr + 'T00:00:00+05:30');
  const end = new Date(endStr + 'T00:00:00+05:30');
  while (cur <= end) {
    result.push(cur.toLocaleDateString('en-CA', { timeZone: IST }));
    cur = new Date(cur.getTime() + 24 * 60 * 60 * 1000);
  }
  return result;
}

async function getSettings() {
  let s = await AttendanceSettings.findOne();
  if (!s) s = await AttendanceSettings.create({});
  return s;
}

function classifyDays(startStr, endStr, settings, reportDateSet, leaves) {
  const today = todayIST();
  const holidaySet = new Set((settings.holidays || []).map(h => toISTDateStr(h.date)));
  let workingDays = 0, presentDays = 0, leaveDays = 0;

  for (const dateStr of dateRange(startStr, endStr)) {
    if (dateStr > today) break;
    const weekday = new Date(dateStr + 'T00:00:00+05:30').getDay();
    if ((settings.weeklyOffDays || [0]).includes(weekday) || holidaySet.has(dateStr)) continue;
    workingDays++;
    const hasReport = reportDateSet.has(dateStr);
    const onLeave   = !hasReport && leaves.some(l =>
      l.status === 'approved' && l.stage === 'done' &&
      dateStr >= toISTDateStr(l.fromDate) && dateStr <= toISTDateStr(l.toDate)
    );
    if (hasReport)   presentDays++;
    else if (onLeave) leaveDays++;
  }

  const freeLeaves    = settings.freeLeavesPerMonth || 2;
  const paidLeaveDays = Math.min(leaveDays, freeLeaves);
  const extraLeaveDays = Math.max(0, leaveDays - freeLeaves);
  return { workingDays, presentDays, leaveDays, paidLeaveDays, extraLeaveDays };
}

// ─── auth helper ─────────────────────────────────────────────────────────────
function canManage(user) {
  return user.role === 'super_admin' ||
    (user.role === 'admin' && user.permissions?.includes('PAYROLL_MANAGE'));
}

// ─── GET /api/payroll/salaries ────────────────────────────────────────────────
// Returns all active employees with their monthlySalary field
router.get('/salaries', protect, async (req, res) => {
  try {
    if (!canManage(req.user)) return res.status(403).json({ message: 'Access denied. Required permission: PAYROLL_MANAGE' });
    const employees = await User.find({ role: 'employee', isActive: true })
      .select('name employeeId department monthlySalary')
      .sort({ name: 1 });
    res.json(employees);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ─── PATCH /api/payroll/salaries/:id ─────────────────────────────────────────
// Set / update an employee's monthly salary
router.patch('/salaries/:id', protect, async (req, res) => {
  try {
    if (!canManage(req.user)) return res.status(403).json({ message: 'Access denied. Required permission: PAYROLL_MANAGE' });
    const { monthlySalary } = req.body;
    if (monthlySalary === undefined || monthlySalary < 0)
      return res.status(400).json({ message: 'monthlySalary must be >= 0' });
    const emp = await User.findByIdAndUpdate(req.params.id, { monthlySalary }, { new: true })
      .select('name employeeId department monthlySalary');
    if (!emp) return res.status(404).json({ message: 'Employee not found' });
    res.json(emp);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ─── GET /api/payroll?month=YYYY-MM ──────────────────────────────────────────
// Admin: list of all payroll records for a month
router.get('/', protect, async (req, res) => {
  try {
    if (!canManage(req.user)) return res.status(403).json({ message: 'Access denied. Required permission: PAYROLL_MANAGE' });
    const month = req.query.month || todayIST().slice(0, 7);
    const records = await Payroll.find({ month })
      .populate('employee', 'name employeeId department')
      .populate('paidBy', 'name')
      .sort({ createdAt: 1 });
    res.json({ month, records });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ─── POST /api/payroll/generate ───────────────────────────────────────────────
// Generate (or regenerate pending) payroll for a month
router.post('/generate', protect, async (req, res) => {
  try {
    if (!canManage(req.user)) return res.status(403).json({ message: 'Access denied. Required permission: PAYROLL_MANAGE' });

    const month = req.body.month || todayIST().slice(0, 7);
    const today = todayIST();
    const [y, m] = month.split('-').map(Number);
    const lastDay = new Date(y, m, 0).getDate();
    let startStr  = `${month}-01`;
    let endStr    = `${month}-${String(lastDay).padStart(2, '0')}`;
    if (endStr > today) endStr = today;

    const startDate = parseISTDate(startStr);
    const endDate   = new Date(parseISTDate(endStr).getTime() + 24 * 60 * 60 * 1000);

    // Fetch everything in one round-trip
    const [settings, employees, reports, leaves] = await Promise.all([
      getSettings(),
      User.find({ role: 'employee', isActive: true }).select('name employeeId department monthlySalary joiningDate'),
      DailyReport.find({ date: { $gte: startDate, $lt: endDate } }).select('employee date'),
      Leave.find({ status: 'approved', stage: 'done', fromDate: { $lte: endDate }, toDate: { $gte: startDate } })
        .select('employee fromDate toDate status stage')
    ]);

    // Group by employee
    const reportsByEmp = new Map();
    for (const r of reports) {
      const id = String(r.employee);
      if (!reportsByEmp.has(id)) reportsByEmp.set(id, new Set());
      reportsByEmp.get(id).add(toISTDateStr(r.date));
    }
    const leavesByEmp = new Map();
    for (const l of leaves) {
      const id = String(l.employee);
      if (!leavesByEmp.has(id)) leavesByEmp.set(id, []);
      leavesByEmp.get(id).push(l);
    }

    const deductionPerDay = settings.deductionPerExtraLeave || 0;
    const generated = [];

    for (const emp of employees) {
      const id = String(emp._id);
      const joinStr   = toISTDateStr(emp.joiningDate || new Date(0));
      const effStart  = startStr < joinStr ? joinStr : startStr;
      if (effStart > endStr) continue;

      const att = classifyDays(effStart, endStr, settings, reportsByEmp.get(id) || new Set(), leavesByEmp.get(id) || []);
      const salary        = emp.monthlySalary || 0;
      const totalDeduction = att.extraLeaveDays * deductionPerDay;
      const net = Math.max(0, salary - totalDeduction);

      // Upsert — only if pending (or new)
      const existing = await Payroll.findOne({ employee: emp._id, month });
      if (existing && existing.status === 'paid') {
        generated.push({ employee: emp._id, skipped: true, reason: 'already paid' });
        continue;
      }

      const data = {
        employee: emp._id, month,
        workingDays:    att.workingDays,
        presentDays:    att.presentDays,
        leaveDays:      att.leaveDays,
        paidLeaveDays:  att.paidLeaveDays,
        extraLeaveDays: att.extraLeaveDays,
        monthlySalary:  salary,
        deductionPerDay,
        totalDeduction,
        adjustments: existing?.adjustments || [],
        netSalary:   Math.max(0, net - ((existing?.adjustments || [])
          .reduce((s, a) => a.type === 'deduction' ? s + a.amount : s - a.amount, 0))),
        status: 'pending'
      };

      // Recalculate net with existing adjustments
      const adjNet = (existing?.adjustments || []).reduce((acc, a) => {
        return a.type === 'bonus' ? acc + a.amount : acc - a.amount;
      }, net);
      data.netSalary = Math.max(0, adjNet);

      if (existing) {
        Object.assign(existing, data);
        await existing.save();
        generated.push(existing);
      } else {
        const rec = await Payroll.create(data);
        generated.push(rec);
      }
    }

    const records = await Payroll.find({ month })
      .populate('employee', 'name employeeId department')
      .populate('paidBy', 'name')
      .sort({ createdAt: 1 });

    res.json({ message: `Payroll generated for ${month}`, month, records });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ─── PATCH /api/payroll/:id/adjustments ──────────────────────────────────────
// Add / replace adjustments on a pending record
router.patch('/:id/adjustments', protect, async (req, res) => {
  try {
    if (!canManage(req.user)) return res.status(403).json({ message: 'Access denied. Required permission: PAYROLL_MANAGE' });
    const record = await Payroll.findById(req.params.id);
    if (!record) return res.status(404).json({ message: 'Record not found' });
    if (record.status === 'paid') return res.status(400).json({ message: 'Cannot adjust a paid record' });

    const { adjustments } = req.body;
    if (!Array.isArray(adjustments)) return res.status(400).json({ message: 'adjustments must be an array' });

    // Validate each
    for (const a of adjustments) {
      if (!['bonus', 'deduction'].includes(a.type)) return res.status(400).json({ message: 'type must be bonus or deduction' });
      if (!a.amount || a.amount <= 0) return res.status(400).json({ message: 'amount must be > 0' });
      if (!a.reason?.trim()) return res.status(400).json({ message: 'reason is required for each adjustment' });
    }

    record.adjustments = adjustments;
    // Recalculate net salary
    const base = record.monthlySalary - record.totalDeduction;
    const adjNet = adjustments.reduce((acc, a) => {
      return a.type === 'bonus' ? acc + a.amount : acc - a.amount;
    }, base);
    record.netSalary = Math.max(0, adjNet);
    await record.save();

    await record.populate('employee', 'name employeeId department');
    res.json({ message: 'Adjustments saved', record });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ─── PATCH /api/payroll/:id/mark-paid ────────────────────────────────────────
router.patch('/:id/mark-paid', protect, async (req, res) => {
  try {
    if (!canManage(req.user)) return res.status(403).json({ message: 'Access denied. Required permission: PAYROLL_MANAGE' });
    const record = await Payroll.findById(req.params.id);
    if (!record) return res.status(404).json({ message: 'Record not found' });
    if (record.status === 'paid') return res.status(400).json({ message: 'Already marked as paid' });

    record.status = 'paid';
    record.paidOn = new Date();
    record.paidBy = req.user._id;
    await record.save();
    await record.populate(['employee', 'paidBy']);
    res.json({ message: 'Marked as paid', record });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ─── PATCH /api/payroll/mark-all-paid ────────────────────────────────────────
router.patch('/mark-all-paid', protect, async (req, res) => {
  try {
    if (!canManage(req.user)) return res.status(403).json({ message: 'Access denied. Required permission: PAYROLL_MANAGE' });
    const month = req.body.month || todayIST().slice(0, 7);
    await Payroll.updateMany(
      { month, status: 'pending' },
      { $set: { status: 'paid', paidOn: new Date(), paidBy: req.user._id } }
    );
    const records = await Payroll.find({ month })
      .populate('employee', 'name employeeId department')
      .populate('paidBy', 'name');
    res.json({ message: 'All pending records marked as paid', records });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ─── GET /api/payroll/my ──────────────────────────────────────────────────────
// Employee: own payroll records only
router.get('/my', protect, async (req, res) => {
  try {
    if (req.user.role !== 'employee') return res.status(403).json({ message: 'Employee access only' });
    const records = await Payroll.find({ employee: req.user._id })
      .populate('paidBy', 'name')
      .sort({ month: -1 });
    res.json(records);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

module.exports = router;
