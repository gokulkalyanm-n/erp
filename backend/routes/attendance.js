const express = require('express');
const router = express.Router();
const DailyReport = require('../models/DailyReport');
const Leave = require('../models/Leave');
const User = require('../models/User');
const AttendanceSettings = require('../models/AttendanceSettings');
const { protect } = require('../middleware/auth');

// ─── helpers ─────────────────────────────────────────────────────────────────

const IST = 'Asia/Kolkata';

/** Convert any date to YYYY-MM-DD string in IST */
function toISTDateStr(d) {
  return new Date(d).toLocaleDateString('en-CA', { timeZone: IST }); // en-CA gives YYYY-MM-DD
}

/** Today's date string in IST */
function todayIST() {
  return toISTDateStr(new Date());
}

/** Parse YYYY-MM-DD to a Date at IST midnight, expressed as UTC */
function parseISTDate(str) {
  // str = "2026-10-07"
  const [y, m, d] = str.split('-').map(Number);
  // IST is UTC+5:30 → midnight IST = 18:30 previous day UTC
  return new Date(Date.UTC(y, m - 1, d) - 5.5 * 60 * 60 * 1000);
}

/** Return an array of YYYY-MM-DD strings from startStr to endStr (inclusive, IST) */
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

/** Get-or-create the single settings document */
async function getSettings() {
  let s = await AttendanceSettings.findOne();
  if (!s) s = await AttendanceSettings.create({});
  return s;
}

/**
 * Classify each day in the range for one employee.
 *
 * @param {string} empId       - employee MongoDB _id string
 * @param {string} startStr    - YYYY-MM-DD (IST)
 * @param {string} endStr      - YYYY-MM-DD (IST)
 * @param {Object} settings
 * @param {Map}    reportDates - Set of date strings (YYYY-MM-DD) employee submitted a report
 * @param {Array}  leaves      - approved leaves for the employee (fromDate/toDate already as Dates)
 *
 * Returns { days[], totals{} }
 */
function classifyDays(startStr, endStr, settings, reportDateSet, leaves) {
  const today = todayIST();
  const holidaySet = new Set(
    (settings.holidays || []).map(h => toISTDateStr(h.date))
  );

  const days = [];
  let workingDays = 0, presentDays = 0, noReportDays = 0, leaveDays = 0;

  for (const dateStr of dateRange(startStr, endStr)) {
    if (dateStr > today) break; // never include future dates

    const jsDate = new Date(dateStr + 'T00:00:00+05:30');
    const weekday = jsDate.getDay(); // 0=Sun…6=Sat  (correct in IST)

    // ── Holiday / weekly off ──
    if ((settings.weeklyOffDays || [0]).includes(weekday) || holidaySet.has(dateStr)) {
      const holidayName = (settings.holidays || []).find(h => toISTDateStr(h.date) === dateStr)?.name;
      days.push({ date: dateStr, status: 'holiday', label: holidayName || 'Weekly Off' });
      continue;
    }

    workingDays++;

    const hasReport = reportDateSet.has(dateStr);

    // ── Check leave coverage ──
    // Leave is "on leave" only when: approved (stage=done, status=approved) AND date is in range
    // AND no report was submitted that day (report wins)
    const onLeave = !hasReport && leaves.some(l =>
      l.status === 'approved' &&
      l.stage === 'done' &&
      dateStr >= toISTDateStr(l.fromDate) &&
      dateStr <= toISTDateStr(l.toDate)
    );

    if (hasReport) {
      presentDays++;
      days.push({ date: dateStr, status: 'present' });
    } else if (onLeave) {
      leaveDays++;
      days.push({ date: dateStr, status: 'leave' });
    } else {
      noReportDays++;
      days.push({ date: dateStr, status: 'no_report' });
    }
  }

  const freeLeaves = settings.freeLeavesPerMonth || 2;
  const deductionRate = settings.deductionPerExtraLeave || 0;
  const paidLeaveDays = Math.min(leaveDays, freeLeaves);
  const extraLeaveDays = Math.max(0, leaveDays - freeLeaves);
  const deduction = extraLeaveDays * deductionRate;

  // sanity: presentDays + noReportDays + leaveDays === workingDays ✓

  return {
    days,
    totals: {
      workingDays,
      presentDays,
      noReportDays,
      leaveDays,
      paidLeaveDays,
      extraLeaveDays,
      deduction
    }
  };
}

// ─── GET /api/attendance/settings ────────────────────────────────────────────
router.get('/settings', protect, async (req, res) => {
  try {
    res.json(await getSettings());
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ─── PUT /api/attendance/settings — super_admin only ─────────────────────────
router.put('/settings', protect, async (req, res) => {
  try {
    if (req.user.role !== 'super_admin') {
      return res.status(403).json({ message: 'Super Admin access required' });
    }
    const { weeklyOffDays, holidays, freeLeavesPerMonth, deductionPerExtraLeave } = req.body;
    let s = await AttendanceSettings.findOne();
    if (!s) s = new AttendanceSettings();
    if (weeklyOffDays !== undefined) s.weeklyOffDays = weeklyOffDays;
    if (holidays !== undefined) s.holidays = holidays;
    if (freeLeavesPerMonth !== undefined) s.freeLeavesPerMonth = freeLeavesPerMonth;
    if (deductionPerExtraLeave !== undefined) s.deductionPerExtraLeave = deductionPerExtraLeave;
    await s.save();
    res.json(s);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ─── GET /api/attendance/my?month=YYYY-MM ────────────────────────────────────
// Employee (or admin viewing their own) — personal monthly attendance
router.get('/my', protect, async (req, res) => {
  try {
    const { role, _id } = req.user;
    // Admins can also use this endpoint for their own attendance (via /admin/my-attendance)
    if (role === 'super_admin') {
      return res.status(403).json({ message: 'Super Admins do not have attendance records' });
    }

    const { month } = req.query; // YYYY-MM
    const today = todayIST();
    let startStr, endStr;

    if (month) {
      startStr = `${month}-01`;
      // last day of that month
      const [y, m] = month.split('-').map(Number);
      const lastDay = new Date(y, m, 0).getDate();
      endStr = `${month}-${String(lastDay).padStart(2, '0')}`;
    } else {
      const now = new Date().toLocaleDateString('en-CA', { timeZone: IST });
      startStr = now.slice(0, 8) + '01';
      endStr = now; // up to today
    }

    if (endStr > today) endStr = today;

    // Clamp to joining date
    const empUser = await User.findById(_id).select('joiningDate');
    if (empUser?.joiningDate) {
      const joinStr = toISTDateStr(empUser.joiningDate);
      if (startStr < joinStr) startStr = joinStr;
    }

    if (startStr > endStr) {
      return res.json({ days: [], totals: { workingDays:0, presentDays:0, noReportDays:0, leaveDays:0, paidLeaveDays:0, extraLeaveDays:0, deduction:0 } });
    }

    const startDate = parseISTDate(startStr);
    const endDate   = parseISTDate(endStr);
    // add 24h to endDate so the query is inclusive
    const endDateInclusive = new Date(endDate.getTime() + 24 * 60 * 60 * 1000);

    const [settings, reports, leaves] = await Promise.all([
      getSettings(),
      DailyReport.find({ employee: _id, date: { $gte: startDate, $lt: endDateInclusive } }).select('date'),
      Leave.find({ employee: _id, status: 'approved', stage: 'done',
        fromDate: { $lte: endDateInclusive }, toDate: { $gte: startDate } })
    ]);

    const reportDateSet = new Set(reports.map(r => toISTDateStr(r.date)));
    const result = classifyDays(startStr, endStr, settings, reportDateSet, leaves);

    res.json(result);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ─── GET /api/attendance/daily?date=YYYY-MM-DD ───────────────────────────────
// Admin: all active employees' status for a single date
router.get('/daily', protect, async (req, res) => {
  try {
    const { role, permissions } = req.user;
    if (role !== 'super_admin' && !(role === 'admin' && permissions?.includes('ATTENDANCE_VIEW'))) {
      return res.status(403).json({ message: 'Access denied. Required permission: ATTENDANCE_VIEW' });
    }

    const dateStr = req.query.date || todayIST();
    const settings = await getSettings();

    const jsDate = new Date(dateStr + 'T00:00:00+05:30');
    const weekday = jsDate.getDay();
    const holidaySet = new Set((settings.holidays || []).map(h => toISTDateStr(h.date)));

    const isHoliday = (settings.weeklyOffDays || [0]).includes(weekday) || holidaySet.has(dateStr);

    const dayStart = parseISTDate(dateStr);
    const dayEnd   = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);

    const [employees, reports, leaves] = await Promise.all([
      User.find({ role: 'employee', isActive: true }).select('name employeeId department joiningDate'),
      DailyReport.find({ date: { $gte: dayStart, $lt: dayEnd } }).select('employee'),
      Leave.find({
        status: 'approved', stage: 'done',
        fromDate: { $lte: dayEnd }, toDate: { $gte: dayStart }
      }).select('employee')
    ]);

    const reportSet = new Set(reports.map(r => String(r.employee)));
    const leaveSet  = new Set(leaves.map(l => String(l.employee)));

    let present = 0, onLeave = 0, noReport = 0;

    const rows = employees
      .filter(e => toISTDateStr(e.joiningDate || new Date()) <= dateStr)
      .map(e => {
        const id = String(e._id);
        let status;
        if (isHoliday) {
          status = 'holiday';
        } else if (reportSet.has(id)) {
          status = 'present'; present++;
        } else if (leaveSet.has(id)) {
          status = 'leave'; onLeave++;
        } else {
          status = 'no_report'; noReport++;
        }
        return { _id: e._id, name: e.name, employeeId: e.employeeId, department: e.department, status };
      });

    res.json({ date: dateStr, isHoliday, summary: { present, onLeave, noReport, total: rows.length }, employees: rows });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ─── GET /api/attendance/monthly?month=YYYY-MM ───────────────────────────────
// Admin: all active employees' monthly totals
router.get('/monthly', protect, async (req, res) => {
  try {
    const { role, permissions } = req.user;
    if (role !== 'super_admin' && !(role === 'admin' && permissions?.includes('ATTENDANCE_VIEW'))) {
      return res.status(403).json({ message: 'Access denied. Required permission: ATTENDANCE_VIEW' });
    }

    const today = todayIST();
    const month = req.query.month || today.slice(0, 7);
    const [y, m] = month.split('-').map(Number);
    const lastDay = new Date(y, m, 0).getDate();
    let startStr = `${month}-01`;
    let endStr   = `${month}-${String(lastDay).padStart(2, '0')}`;
    if (endStr > today) endStr = today;

    const startDate = parseISTDate(startStr);
    const endDate   = new Date(parseISTDate(endStr).getTime() + 24 * 60 * 60 * 1000);

    const [settings, employees, reports, leaves] = await Promise.all([
      getSettings(),
      User.find({ role: 'employee', isActive: true }).select('name employeeId department joiningDate'),
      DailyReport.find({ date: { $gte: startDate, $lt: endDate } }).select('employee date'),
      Leave.find({
        status: 'approved', stage: 'done',
        fromDate: { $lte: endDate }, toDate: { $gte: startDate }
      }).select('employee fromDate toDate status stage')
    ]);

    // Group reports by employee
    const reportsByEmp = new Map();
    for (const r of reports) {
      const id = String(r.employee);
      if (!reportsByEmp.has(id)) reportsByEmp.set(id, new Set());
      reportsByEmp.get(id).add(toISTDateStr(r.date));
    }

    // Group leaves by employee
    const leavesByEmp = new Map();
    for (const l of leaves) {
      const id = String(l.employee);
      if (!leavesByEmp.has(id)) leavesByEmp.set(id, []);
      leavesByEmp.get(id).push(l);
    }

    const rows = employees.map(e => {
      const id = String(e._id);
      // Clamp start to joining date
      const joinStr = toISTDateStr(e.joiningDate || new Date(0));
      const effStart = startStr < joinStr ? joinStr : startStr;
      if (effStart > endStr) {
        return { _id: e._id, name: e.name, employeeId: e.employeeId, department: e.department,
          totals: { workingDays:0, presentDays:0, noReportDays:0, leaveDays:0, paidLeaveDays:0, extraLeaveDays:0, deduction:0 } };
      }
      const { totals } = classifyDays(effStart, endStr, settings, reportsByEmp.get(id) || new Set(), leavesByEmp.get(id) || []);
      return { _id: e._id, name: e.name, employeeId: e.employeeId, department: e.department, totals };
    });

    res.json({ month, rows });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ─── GET /api/attendance/employee/:id?month=YYYY-MM ──────────────────────────
// Admin: day-by-day detail for a specific employee in a month
router.get('/employee/:id', protect, async (req, res) => {
  try {
    const { role, permissions } = req.user;
    if (role !== 'super_admin' && !(role === 'admin' && permissions?.includes('ATTENDANCE_VIEW'))) {
      return res.status(403).json({ message: 'Access denied. Required permission: ATTENDANCE_VIEW' });
    }

    const empId = req.params.id;
    const today = todayIST();
    const month = req.query.month || today.slice(0, 7);
    const [y, m] = month.split('-').map(Number);
    const lastDay = new Date(y, m, 0).getDate();
    let startStr = `${month}-01`;
    let endStr   = `${month}-${String(lastDay).padStart(2, '0')}`;
    if (endStr > today) endStr = today;

    const empUser = await User.findById(empId).select('name employeeId department joiningDate');
    if (!empUser) return res.status(404).json({ message: 'Employee not found' });

    const joinStr = toISTDateStr(empUser.joiningDate || new Date(0));
    if (startStr < joinStr) startStr = joinStr;

    if (startStr > endStr) {
      return res.json({ employee: empUser, days: [], totals: { workingDays:0, presentDays:0, noReportDays:0, leaveDays:0, paidLeaveDays:0, extraLeaveDays:0, deduction:0 } });
    }

    const startDate = parseISTDate(startStr);
    const endDate   = new Date(parseISTDate(endStr).getTime() + 24 * 60 * 60 * 1000);

    const [settings, reports, leaves] = await Promise.all([
      getSettings(),
      DailyReport.find({ employee: empId, date: { $gte: startDate, $lt: endDate } }).select('date'),
      Leave.find({ employee: empId, status: 'approved', stage: 'done',
        fromDate: { $lte: endDate }, toDate: { $gte: startDate } })
    ]);

    const reportDateSet = new Set(reports.map(r => toISTDateStr(r.date)));
    const result = classifyDays(startStr, endStr, settings, reportDateSet, leaves);

    res.json({ employee: empUser, ...result });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
