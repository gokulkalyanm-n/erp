const express = require('express');
const router  = express.Router();
const Payroll = require('../models/Payroll');
const User    = require('../models/User');
const DailyReport = require('../models/DailyReport');
const Leave   = require('../models/Leave');
const AttendanceSettings = require('../models/AttendanceSettings');
const AttendanceCorrection = require('../models/AttendanceCorrection');
const { protect } = require('../middleware/auth');

// ─── IST helpers ──────────────────────────────────────────────────────────────
const IST = 'Asia/Kolkata';
function toISTDateStr(d) { return new Date(d).toLocaleDateString('en-CA', { timeZone: IST }); }
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

/**
 * Returns { workingDays, presentDays, absentDays, leaveDays }
 *
 * workingDays = ALL working days in the month (excluding weekly-off + holidays)
 *               — includes future days so the full salary denominator is correct
 *
 * For PAST days (≤ today):
 *   present  = report submitted OR approved correction
 *   leave    = approved leave (no report, no correction)
 *   absent   = none of the above
 *
 * For FUTURE working days (> today in the same month):
 *   → counted as present (assumed they will work)
 *
 * This way, generating on the 27th includes the 29th & 30th as present,
 * so deduction only covers confirmed past absences/leaves.
 */
function classifyDays(startStr, endStr, settings, reportDateSet, leaves, correctionSet) {
  const today      = todayIST();
  const holidaySet = new Set((settings.holidays || []).map(h => toISTDateStr(h.date)));
  let workingDays = 0, presentDays = 0, leaveDays = 0;

  for (const dateStr of dateRange(startStr, endStr)) {
    const weekday = new Date(dateStr + 'T00:00:00+05:30').getDay();
    // Skip weekly-off days and holidays (for the full month range)
    if ((settings.weeklyOffDays || [0]).includes(weekday) || holidaySet.has(dateStr)) continue;

    workingDays++;

    // Future working day → assumed present, no deduction
    if (dateStr > today) {
      presentDays++;
      continue;
    }

    // Past day — classify normally
    const hasReport     = reportDateSet.has(dateStr);
    const hasCorrection = correctionSet.has(dateStr);

    if (hasReport || hasCorrection) {
      presentDays++;
    } else {
      const onLeave = leaves.some(l =>
        l.status === 'approved' && l.stage === 'done' &&
        dateStr >= toISTDateStr(l.fromDate) && dateStr <= toISTDateStr(l.toDate)
      );
      if (onLeave) leaveDays++;
      // else: absent
    }
  }

  const absentDays    = workingDays - presentDays - leaveDays;
  const freeLeaves    = settings.freeLeavesPerMonth ?? 2;
  const paidLeaveDays = Math.min(leaveDays, freeLeaves);
  const extraLeaveDays = Math.max(0, leaveDays - freeLeaves);
  return { workingDays, presentDays, absentDays, leaveDays, paidLeaveDays, extraLeaveDays };
}

/**
 * Compute net salary from attendance snapshot + adjustments.
 * perDaySalary   = monthlySalary / workingDays  (0 if workingDays === 0)
 * deductedDays   = absentDays + extraLeaveDays  (paid leaves are NOT deducted)
 * totalDeduction = deductedDays × perDaySalary
 * net = max(0, monthlySalary - totalDeduction + bonus - extraDeduction)
 */
function calcNet(salary, workingDays, absentDays, extraLeaveDays, adjustments = []) {
  const perDay    = workingDays > 0 ? salary / workingDays : 0;
  const deducted  = absentDays + extraLeaveDays;
  const totalDed  = parseFloat((deducted * perDay).toFixed(2));
  const adjDelta  = adjustments.reduce((acc, a) =>
    a.type === 'bonus' ? acc + a.amount : acc - a.amount, 0);
  const net = Math.max(0, parseFloat((salary - totalDed + adjDelta).toFixed(2)));
  return { perDaySalary: parseFloat(perDay.toFixed(2)), deductedDays: deducted, totalDeduction: totalDed, netSalary: net };
}

// ─── auth helper ──────────────────────────────────────────────────────────────
function canManage(user) {
  return user.role === 'super_admin' ||
    (user.role === 'admin' && user.permissions?.includes('PAYROLL_MANAGE'));
}

// ─── GET /api/payroll/salaries ────────────────────────────────────────────────
router.get('/salaries', protect, async (req, res) => {
  try {
    if (!canManage(req.user)) return res.status(403).json({ message: 'Access denied. Required permission: PAYROLL_MANAGE' });
    const employees = await User.find({ role: 'employee', isActive: true })
      .select('name employeeId department monthlySalary').sort({ name: 1 });
    res.json(employees);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ─── PATCH /api/payroll/salaries/:id ─────────────────────────────────────────
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
router.post('/generate', protect, async (req, res) => {
  try {
    if (!canManage(req.user)) return res.status(403).json({ message: 'Access denied. Required permission: PAYROLL_MANAGE' });

    const month   = req.body.month || todayIST().slice(0, 7);
    const [y, m]  = month.split('-').map(Number);
    const lastDay = new Date(y, m, 0).getDate();
    // Use the full month range — future days are treated as present in classifyDays
    const startStr  = `${month}-01`;
    const endStr    = `${month}-${String(lastDay).padStart(2, '0')}`;

    const startDate = parseISTDate(startStr);
    const endDate   = new Date(parseISTDate(endStr).getTime() + 24 * 60 * 60 * 1000);

    // Single round-trip fetch
    const [settings, employees, reports, leaves, corrections] = await Promise.all([
      getSettings(),
      User.find({ role: 'employee', isActive: true })
        .select('name employeeId department monthlySalary joiningDate'),
      DailyReport.find({ date: { $gte: startDate, $lt: endDate } }).select('employee date'),
      Leave.find({ status: 'approved', stage: 'done',
        fromDate: { $lte: endDate }, toDate: { $gte: startDate } })
        .select('employee fromDate toDate status stage'),
      AttendanceCorrection.find({ status: 'approved',
        date: { $gte: startStr, $lte: endStr } }).select('employee date')
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
    const corrsByEmp = new Map();
    for (const c of corrections) {
      const id = String(c.employee);
      if (!corrsByEmp.has(id)) corrsByEmp.set(id, new Set());
      corrsByEmp.get(id).add(c.date);
    }

    for (const emp of employees) {
      const id       = String(emp._id);
      const joinStr  = toISTDateStr(emp.joiningDate || new Date(0));
      const effStart = startStr < joinStr ? joinStr : startStr;
      if (effStart > endStr) continue;

      const att = classifyDays(
        effStart, endStr, settings,
        reportsByEmp.get(id)  || new Set(),
        leavesByEmp.get(id)   || [],
        corrsByEmp.get(id)    || new Set()
      );

      const salary   = emp.monthlySalary || 0;
      const existing = await Payroll.findOne({ employee: emp._id, month });
      if (existing && existing.status === 'paid') continue; // locked

      const adjList = existing?.adjustments || [];
      const { perDaySalary, deductedDays, totalDeduction, netSalary } =
        calcNet(salary, att.workingDays, att.absentDays, att.extraLeaveDays, adjList);

      const data = {
        employee:       emp._id,
        month,
        workingDays:    att.workingDays,
        presentDays:    att.presentDays,
        absentDays:     att.absentDays,
        leaveDays:      att.leaveDays,
        extraLeaveDays: att.extraLeaveDays,
        monthlySalary:  salary,
        perDaySalary,
        deductedDays,
        totalDeduction,
        adjustments:    adjList,
        netSalary,
        status:         'not_released'
      };

      if (existing) {
        Object.assign(existing, data);
        await existing.save();
      } else {
        await Payroll.create(data);
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
router.patch('/:id/adjustments', protect, async (req, res) => {
  try {
    if (!canManage(req.user)) return res.status(403).json({ message: 'Access denied. Required permission: PAYROLL_MANAGE' });
    const record = await Payroll.findById(req.params.id);
    if (!record) return res.status(404).json({ message: 'Record not found' });
    if (record.status === 'paid') return res.status(400).json({ message: 'Cannot adjust a paid record' });

    const { adjustments } = req.body;
    if (!Array.isArray(adjustments)) return res.status(400).json({ message: 'adjustments must be an array' });
    for (const a of adjustments) {
      if (!['bonus', 'deduction'].includes(a.type)) return res.status(400).json({ message: 'type must be bonus or deduction' });
      if (!a.amount || a.amount <= 0) return res.status(400).json({ message: 'amount must be > 0' });
      if (!a.reason?.trim()) return res.status(400).json({ message: 'reason is required for each adjustment' });
    }

    record.adjustments = adjustments;
    const { perDaySalary, deductedDays, totalDeduction, netSalary } =
      calcNet(record.monthlySalary, record.workingDays, record.absentDays, record.extraLeaveDays || 0, adjustments);
    record.perDaySalary   = perDaySalary;
    record.deductedDays   = deductedDays;
    record.totalDeduction = totalDeduction;
    record.netSalary      = netSalary;
    await record.save();

    await record.populate('employee', 'name employeeId department');
    res.json({ message: 'Adjustments saved', record });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ─── PATCH /api/payroll/:id/status ───────────────────────────────────────────
// Set any status: not_released | on_hold | paid
router.patch('/:id/status', protect, async (req, res) => {
  try {
    if (!canManage(req.user)) return res.status(403).json({ message: 'Access denied. Required permission: PAYROLL_MANAGE' });
    const { status } = req.body;
    if (!['not_released', 'on_hold', 'paid'].includes(status)) {
      return res.status(400).json({ message: 'status must be not_released, on_hold, or paid' });
    }
    const record = await Payroll.findById(req.params.id);
    if (!record) return res.status(404).json({ message: 'Record not found' });

    record.status = status;
    if (status === 'paid') {
      record.paidOn = record.paidOn || new Date(); // keep original paidOn if already set
      record.paidBy = req.user._id;
    } else {
      // If reverting from paid, clear paidOn/paidBy
      record.paidOn = undefined;
      record.paidBy = undefined;
    }
    await record.save();
    await record.populate(['employee', 'paidBy']);
    res.json({ message: `Status updated to ${status}`, record });
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
      { month, status: { $in: ['not_released', 'on_hold'] } },
      { $set: { status: 'paid', paidOn: new Date(), paidBy: req.user._id } }
    );
    const records = await Payroll.find({ month })
      .populate('employee', 'name employeeId department')
      .populate('paidBy', 'name');
    res.json({ message: 'All pending records marked as paid', records });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ─── GET /api/payroll/my ──────────────────────────────────────────────────────
router.get('/my', protect, async (req, res) => {
  try {
    if (req.user.role !== 'employee') return res.status(403).json({ message: 'Employee access only' });
    const records = await Payroll.find({ employee: req.user._id })
      .populate('paidBy', 'name').sort({ month: -1 });
    res.json(records);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

module.exports = router;
