import { useEffect, useState } from 'react';
import {
  getDailyAttendance, getMonthlyAttendance, getEmployeeAttendance,
  getAttendanceSettings, updateAttendanceSettings
} from '../../services/api';
import PageHeader from '../../components/PageHeader';
import Modal from '../../components/Modal';
import LoadingSpinner from '../../components/LoadingSpinner';
import StatCard from '../../components/StatCard';
import { formatDate } from '../../utils/helpers';
import toast from 'react-hot-toast';
import {
  CheckCircle, XCircle, AlertCircle, Calendar, Users,
  Download, Settings, Plus, Trash2, ChevronRight
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { Navigate } from 'react-router-dom';

/* ── small helpers ── */
function todayIST() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
}
function currentMonth() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }).slice(0, 7);
}
function monthLabel(ym) {
  const [y, m] = ym.split('-');
  return new Date(+y, +m - 1, 1).toLocaleString('en-IN', { month: 'long', year: 'numeric' });
}

const STATUS_CFG = {
  present:   { label: 'Present',          chip: 'badge-green',  icon: CheckCircle,  iconCls: 'text-green-500' },
  leave:     { label: 'On Leave',         chip: 'badge-red',    icon: XCircle,      iconCls: 'text-red-500'   },
  no_report: { label: 'Report Not Filed', chip: 'badge-yellow', icon: AlertCircle,  iconCls: 'text-amber-500' },
  holiday:   { label: 'Holiday / Off',    chip: 'badge-gray',   icon: Calendar,     iconCls: 'text-gray-400'  },
};

function StatusChip({ status, label }) {
  const cfg = STATUS_CFG[status] || STATUS_CFG.holiday;
  return <span className={`${cfg.chip} text-xs`}>{label || cfg.label}</span>;
}

/* ── CSV download (no extra library) ── */
function downloadCSV(month, rows) {
  const header = ['Employee','ID','Department','Working Days','Present','No Report','On Leave','Extra Leave','Deduction (₹)'];
  const lines = [header.join(',')];
  for (const r of rows) {
    const t = r.totals;
    lines.push([
      `"${r.name}"`, r.employeeId || '', `"${r.department || ''}"`,
      t.workingDays, t.presentDays, t.noReportDays, t.leaveDays,
      t.extraLeaveDays, t.deduction
    ].join(','));
  }
  const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `attendance_${month}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

/* ═══════════════════════════════════════════════════════════════
   DAILY TAB
═══════════════════════════════════════════════════════════════ */
function DailyTab() {
  const [date, setDate]       = useState(todayIST());
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);

  const load = async (d) => {
    setLoading(true);
    try {
      const res = await getDailyAttendance({ date: d });
      setData(res.data);
    } catch { toast.error('Failed to load daily attendance'); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(date); }, [date]);

  const employees = data?.employees || [];
  const s = data?.summary || {};

  return (
    <div className="space-y-4">
      {/* Date picker */}
      <div className="card">
        <div className="flex items-center gap-3">
          <label className="text-sm font-medium text-gray-600">Date</label>
          <input
            type="date"
            className="input w-44"
            value={date}
            max={todayIST()}
            onChange={e => setDate(e.target.value)}
          />
        </div>
      </div>

      {loading ? <LoadingSpinner /> : (
        <>
          {data?.isHoliday && (
            <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-600">
              <Calendar className="w-4 h-4 text-gray-400" />
              This date is a holiday or weekly off day.
            </div>
          )}

          {/* Summary cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatCard title="Total"          value={s.total   ?? 0} icon={Users}         color="blue"   />
            <StatCard title="Present"        value={s.present ?? 0} icon={CheckCircle}   color="green"  />
            <StatCard title="On Leave"       value={s.onLeave ?? 0} icon={XCircle}       color="red"    />
            <StatCard title="No Report"      value={s.noReport?? 0} icon={AlertCircle}   color="yellow" />
          </div>

          {/* Table */}
          <div className="card overflow-hidden p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100">
                    <th className="text-left px-4 py-3 font-medium text-gray-500">Employee</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-500 hidden sm:table-cell">Department</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-500">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {employees.length === 0 && (
                    <tr><td colSpan={3} className="text-center py-10 text-gray-400">No data</td></tr>
                  )}
                  {employees.map(e => (
                    <tr key={e._id} className="border-b border-gray-50 hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <p className="font-medium text-gray-900">{e.name}</p>
                        <p className="text-xs text-gray-400">{e.employeeId}</p>
                      </td>
                      <td className="px-4 py-3 text-gray-600 hidden sm:table-cell">{e.department || '-'}</td>
                      <td className="px-4 py-3"><StatusChip status={e.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   MONTHLY TAB
═══════════════════════════════════════════════════════════════ */
function MonthlyTab() {
  const [month, setMonth]         = useState(currentMonth());
  const [data, setData]           = useState(null);
  const [loading, setLoading]     = useState(true);
  const [detailEmp, setDetailEmp] = useState(null);   // { id, name }
  const [detail, setDetail]       = useState(null);
  const [detailLoading, setDL]    = useState(false);

  const load = async (m) => {
    setLoading(true);
    try {
      const res = await getMonthlyAttendance({ month: m });
      setData(res.data);
    } catch { toast.error('Failed to load'); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(month); }, [month]);

  const openDetail = async (emp) => {
    setDetailEmp(emp);
    setDL(true);
    try {
      const res = await getEmployeeAttendance(emp._id, { month });
      setDetail(res.data);
    } catch { toast.error('Failed to load detail'); }
    finally { setDL(false); }
  };

  const rows = data?.rows || [];

  const STATUS_DAY = {
    present:   { bg: 'bg-green-100', text: 'text-green-700', label: 'P'   },
    leave:     { bg: 'bg-red-100',   text: 'text-red-600',   label: 'L'   },
    no_report: { bg: 'bg-amber-100', text: 'text-amber-700', label: 'NR'  },
    holiday:   { bg: 'bg-gray-100',  text: 'text-gray-500',  label: 'Off' },
  };

  return (
    <div className="space-y-4">
      {/* Month picker + download */}
      <div className="card">
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
          <div className="flex items-center gap-3">
            <label className="text-sm font-medium text-gray-600">Month</label>
            <input
              type="month"
              className="input w-44"
              value={month}
              max={currentMonth()}
              onChange={e => setMonth(e.target.value)}
            />
          </div>
          <button
            onClick={() => rows.length && downloadCSV(month, rows)}
            className="btn-secondary flex items-center gap-2 text-sm"
            disabled={!rows.length}
          >
            <Download className="w-4 h-4" />
            Download CSV
          </button>
        </div>
      </div>

      {loading ? <LoadingSpinner /> : (
        <div className="card overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="text-left px-4 py-3 font-medium text-gray-500">Employee</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-500 hidden md:table-cell">Dept</th>
                  <th className="text-center px-3 py-3 font-medium text-gray-500">Working</th>
                  <th className="text-center px-3 py-3 font-medium text-gray-500">Present</th>
                  <th className="text-center px-3 py-3 font-medium text-gray-500">No Report</th>
                  <th className="text-center px-3 py-3 font-medium text-gray-500">Leave</th>
                  <th className="text-center px-3 py-3 font-medium text-gray-500 hidden sm:table-cell">Extra Leave</th>
                  <th className="text-center px-3 py-3 font-medium text-gray-500 hidden sm:table-cell">Deduction</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-500">Detail</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 && (
                  <tr><td colSpan={9} className="text-center py-10 text-gray-400">No data</td></tr>
                )}
                {rows.map(r => (
                  <tr key={r._id} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-900">{r.name}</p>
                      <p className="text-xs text-gray-400">{r.employeeId}</p>
                    </td>
                    <td className="px-4 py-3 text-gray-600 hidden md:table-cell">{r.department || '-'}</td>
                    <td className="px-3 py-3 text-center font-medium">{r.totals.workingDays}</td>
                    <td className="px-3 py-3 text-center text-green-600 font-medium">{r.totals.presentDays}</td>
                    <td className="px-3 py-3 text-center text-amber-600 font-medium">{r.totals.noReportDays}</td>
                    <td className="px-3 py-3 text-center text-red-500 font-medium">{r.totals.leaveDays}</td>
                    <td className="px-3 py-3 text-center hidden sm:table-cell">
                      {r.totals.extraLeaveDays > 0
                        ? <span className="badge-red">{r.totals.extraLeaveDays}</span>
                        : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-3 py-3 text-center hidden sm:table-cell">
                      {r.totals.deduction > 0
                        ? <span className="text-red-500 font-medium">₹{r.totals.deduction}</span>
                        : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => openDetail(r)}
                        className="p-1.5 rounded hover:bg-gray-100 text-gray-400 hover:text-blue-600"
                        title="View day-by-day"
                      >
                        <ChevronRight className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Detail modal */}
      <Modal
        isOpen={!!detailEmp}
        onClose={() => { setDetailEmp(null); setDetail(null); }}
        title={`${detailEmp?.name} — ${monthLabel(month)}`}
        size="lg"
      >
        {detailLoading ? <LoadingSpinner /> : detail && (
          <div className="space-y-4">
            {/* Mini totals */}
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 text-xs text-center">
              {[
                { l: 'Working',    v: detail.totals.workingDays,   c: 'bg-blue-50 text-blue-700'   },
                { l: 'Present',    v: detail.totals.presentDays,   c: 'bg-green-50 text-green-700' },
                { l: 'No Report',  v: detail.totals.noReportDays,  c: 'bg-amber-50 text-amber-700' },
                { l: 'Leave',      v: detail.totals.leaveDays,     c: 'bg-red-50 text-red-600'     },
                { l: 'Paid Leave', v: detail.totals.paidLeaveDays, c: 'bg-blue-50 text-blue-700'   },
                { l: 'Extra Leave',v: detail.totals.extraLeaveDays,c: 'bg-orange-50 text-orange-700'},
                { l: 'Deduction ₹',v: detail.totals.deduction,    c: detail.totals.deduction > 0 ? 'bg-red-50 text-red-600' : 'bg-gray-50 text-gray-500' },
              ].map(x => (
                <div key={x.l} className={`rounded-lg p-2 font-medium ${x.c}`}>
                  <p className="text-base font-bold leading-none">{x.v}</p>
                  <p className="text-xs mt-0.5">{x.l}</p>
                </div>
              ))}
            </div>

            {/* Day list */}
            <div className="max-h-64 overflow-y-auto space-y-1">
              {detail.days.map(d => {
                const cfg = STATUS_DAY[d.status] || STATUS_DAY.holiday;
                const dayName = new Date(d.date + 'T00:00:00+05:30')
                  .toLocaleString('en-IN', { weekday: 'short', timeZone: 'Asia/Kolkata' });
                return (
                  <div key={d.date} className={`flex items-center gap-3 px-3 py-2 rounded-lg ${cfg.bg}`}>
                    <span className="w-16 text-xs font-semibold text-gray-600">
                      {d.date.slice(8)} {dayName}
                    </span>
                    <span className={`text-xs font-medium ${cfg.text}`}>
                      {d.status === 'holiday' ? (d.label || 'Holiday / Off') : (STATUS_CFG[d.status]?.label || d.status)}
                    </span>
                  </div>
                );
              })}
            </div>
            <div className="flex justify-end">
              <button onClick={() => { setDetailEmp(null); setDetail(null); }} className="btn-secondary">Close</button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   SETTINGS TAB — super_admin only
═══════════════════════════════════════════════════════════════ */
const WEEKDAYS = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];

function SettingsTab() {
  const [settings, setSettings] = useState(null);
  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState(false);
  const [newHoliday, setNewHoliday] = useState({ date: '', name: '' });

  const load = async () => {
    try { setSettings((await getAttendanceSettings()).data); }
    catch { toast.error('Failed to load settings'); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const save = async () => {
    setSaving(true);
    try {
      const res = await updateAttendanceSettings(settings);
      setSettings(res.data);
      toast.success('Settings saved');
    } catch { toast.error('Save failed'); }
    finally { setSaving(false); }
  };

  const toggleWeekday = (d) => {
    setSettings(prev => ({
      ...prev,
      weeklyOffDays: prev.weeklyOffDays.includes(d)
        ? prev.weeklyOffDays.filter(x => x !== d)
        : [...prev.weeklyOffDays, d]
    }));
  };

  const addHoliday = () => {
    if (!newHoliday.date || !newHoliday.name.trim()) return toast.error('Enter date and name');
    setSettings(prev => ({
      ...prev,
      holidays: [...(prev.holidays || []), { date: newHoliday.date, name: newHoliday.name.trim() }]
        .sort((a, b) => a.date.localeCompare(b.date))
    }));
    setNewHoliday({ date: '', name: '' });
  };

  const removeHoliday = (idx) => {
    setSettings(prev => ({
      ...prev,
      holidays: prev.holidays.filter((_, i) => i !== idx)
    }));
  };

  if (loading) return <LoadingSpinner />;
  if (!settings) return null;

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Weekly off */}
      <div className="card">
        <h3 className="font-semibold text-gray-800 mb-3">Weekly Off Days</h3>
        <div className="flex flex-wrap gap-2">
          {WEEKDAYS.map((d, i) => (
            <button
              key={i}
              type="button"
              onClick={() => toggleWeekday(i)}
              className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                settings.weeklyOffDays?.includes(i)
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {d}
            </button>
          ))}
        </div>
      </div>

      {/* Leave thresholds */}
      <div className="card">
        <h3 className="font-semibold text-gray-800 mb-3">Leave Policy</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="label">Free Leaves Per Month</label>
            <input
              type="number" min="0" className="input"
              value={settings.freeLeavesPerMonth}
              onChange={e => setSettings({ ...settings, freeLeavesPerMonth: +e.target.value })}
            />
            <p className="text-xs text-gray-400 mt-1">Leaves within this count are not deducted</p>
          </div>
          <div>
            <label className="label">Deduction Per Extra Leave Day (₹)</label>
            <input
              type="number" min="0" className="input"
              value={settings.deductionPerExtraLeave}
              onChange={e => setSettings({ ...settings, deductionPerExtraLeave: +e.target.value })}
            />
          </div>
        </div>
      </div>

      {/* Holidays */}
      <div className="card">
        <h3 className="font-semibold text-gray-800 mb-3">Holiday List</h3>

        {/* Add row */}
        <div className="space-y-2 mb-4">
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="flex flex-col gap-1 sm:w-44 flex-shrink-0">
              <label className="text-xs font-medium text-gray-500">Date</label>
              <input
                type="date" className="input"
                value={newHoliday.date}
                onChange={e => setNewHoliday({ ...newHoliday, date: e.target.value })}
              />
            </div>
            <div className="flex flex-col gap-1 flex-1">
              <label className="text-xs font-medium text-gray-500">Holiday Name</label>
              <input
                className="input"
                placeholder="e.g. Diwali, Christmas…"
                value={newHoliday.name}
                onChange={e => setNewHoliday({ ...newHoliday, name: e.target.value })}
              />
            </div>
          </div>
          <button onClick={addHoliday} className="btn-primary flex items-center gap-1.5">
            <Plus className="w-4 h-4" /> Add Holiday
          </button>
        </div>

        {(!settings.holidays || settings.holidays.length === 0) && (
          <p className="text-sm text-gray-400 italic">No holidays added yet.</p>
        )}
        <div className="space-y-1.5">
          {(settings.holidays || []).map((h, i) => (
            <div key={i} className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg bg-gray-50">
              <span className="text-sm font-medium text-gray-700 font-mono">{formatDate(h.date)}</span>
              <span className="text-sm text-gray-600 flex-1">{h.name}</span>
              <button onClick={() => removeHoliday(i)} className="p-1 rounded hover:bg-red-50 text-gray-400 hover:text-red-500">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      </div>

      <button onClick={save} disabled={saving} className="btn-primary">
        {saving ? 'Saving…' : 'Save Settings'}
      </button>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   MAIN PAGE
═══════════════════════════════════════════════════════════════ */
export default function Attendance() {
  const { hasPermission, isSuperAdmin } = useAuth();
  if (!hasPermission('ATTENDANCE_VIEW') && !isSuperAdmin) {
    return <Navigate to="/admin" replace />;
  }

  const tabs = [
    { key: 'daily',   label: 'Daily' },
    { key: 'monthly', label: 'Monthly Report' },
    ...(isSuperAdmin ? [{ key: 'settings', label: 'Settings', icon: Settings }] : []),
  ];

  const [tab, setTab] = useState('daily');

  return (
    <div className="p-4 lg:p-8">
      <PageHeader title="Attendance" subtitle="Derived from daily reports and leave data" />

      {/* Tab bar */}
      <div className="flex gap-1 mb-6 bg-gray-100 p-1 rounded-lg w-full sm:w-fit overflow-x-auto">
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex-1 sm:flex-none px-3 py-2 rounded-md text-sm font-medium transition-colors whitespace-nowrap flex items-center gap-1.5 ${
              tab === t.key ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {t.icon && <t.icon className="w-3.5 h-3.5" />}
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'daily'    && <DailyTab />}
      {tab === 'monthly'  && <MonthlyTab />}
      {tab === 'settings' && isSuperAdmin && <SettingsTab />}
    </div>
  );
}
