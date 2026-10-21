import { useEffect, useState } from 'react';
import {
  getPayrollSalaries, updateSalary,
  getPayroll, generatePayroll,
  updateAdjustments, markPaid, markAllPaid,
  getAttendanceSettings, updateAttendanceSettings
} from '../../services/api';
import PageHeader from '../../components/PageHeader';
import Modal from '../../components/Modal';
import LoadingSpinner from '../../components/LoadingSpinner';
import { getInitials, avatarColor, formatDate } from '../../utils/helpers';
import toast from 'react-hot-toast';
import { Edit2, Download, CheckCircle, RefreshCw, Plus, Trash2, IndianRupee, Settings } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { Navigate } from 'react-router-dom';

/* helpers */
function currentMonth() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }).slice(0, 7);
}
function monthLabel(ym) {
  const [y, m] = ym.split('-');
  return new Date(+y, +m - 1, 1).toLocaleString('en-IN', { month: 'long', year: 'numeric' });
}
function fmt(n) { return `₹${(n ?? 0).toLocaleString('en-IN')}`; }

function downloadCSV(month, records) {
  const header = ['Employee','ID','Dept','Salary','Working','Present','Leave','Extra Leave','Deduction/Day','Total Deduction','Bonus','Extra Deduct','Net Salary','Status'];
  const lines = [header.join(',')];
  for (const r of records) {
    const bonus    = r.adjustments.filter(a => a.type === 'bonus').reduce((s, a) => s + a.amount, 0);
    const extraDed = r.adjustments.filter(a => a.type === 'deduction').reduce((s, a) => s + a.amount, 0);
    lines.push([
      `"${r.employee?.name}"`, r.employee?.employeeId || '', `"${r.employee?.department || ''}"`,
      r.monthlySalary, r.workingDays, r.presentDays, r.leaveDays,
      r.extraLeaveDays, r.deductionPerDay, r.totalDeduction,
      bonus, extraDed, r.netSalary, r.status
    ].join(','));
  }
  const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = `payroll_${month}.csv`; a.click();
  URL.revokeObjectURL(url);
}

/* ═══════════════════════════════════════════════════════════════
   SALARIES TAB
═══════════════════════════════════════════════════════════════ */
function SalariesTab() {
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading]     = useState(true);
  const [editEmp, setEditEmp]     = useState(null);
  const [salaryInput, setSalaryInput] = useState('');
  const [saving, setSaving]       = useState(false);

  const load = async () => {
    setLoading(true);
    try { setEmployees((await getPayrollSalaries()).data); }
    catch { toast.error('Failed to load'); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const openEdit = (emp) => { setEditEmp(emp); setSalaryInput(String(emp.monthlySalary || 0)); };

  const handleSave = async () => {
    const val = parseFloat(salaryInput);
    if (isNaN(val) || val < 0) return toast.error('Enter a valid salary');
    setSaving(true);
    try {
      await updateSalary(editEmp._id, { monthlySalary: val });
      toast.success('Salary updated');
      setEditEmp(null);
      load();
    } catch (err) { toast.error(err.response?.data?.message || 'Failed'); }
    finally { setSaving(false); }
  };

  return (
    <div className="space-y-4">
      {loading ? <LoadingSpinner /> : (
        <div className="card overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="text-left px-4 py-3 font-medium text-gray-500">Employee</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-500 hidden sm:table-cell">Department</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-500">Monthly Salary</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-500">Edit</th>
                </tr>
              </thead>
              <tbody>
                {employees.length === 0 && <tr><td colSpan={4} className="text-center py-10 text-gray-400">No employees</td></tr>}
                {employees.map(e => (
                  <tr key={e._id} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className={`w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0 ${avatarColor(e.name)}`}>
                          {getInitials(e.name)}
                        </div>
                        <div>
                          <p className="font-medium text-gray-900">{e.name}</p>
                          <p className="text-xs text-gray-400">{e.employeeId}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-600 hidden sm:table-cell">{e.department || '-'}</td>
                    <td className="px-4 py-3 text-right font-semibold text-gray-900">
                      {e.monthlySalary ? fmt(e.monthlySalary) : <span className="text-gray-400">Not set</span>}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button onClick={() => openEdit(e)} className="p-1.5 rounded hover:bg-gray-100 text-gray-400 hover:text-blue-600">
                        <Edit2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Modal isOpen={!!editEmp} onClose={() => setEditEmp(null)} title={`Set Salary — ${editEmp?.name}`} size="sm">
        <div className="space-y-4">
          <div>
            <label className="label">Monthly Salary (₹)</label>
            <input
              type="number" min="0" className="input"
              value={salaryInput}
              onChange={e => setSalaryInput(e.target.value)}
              placeholder="e.g. 30000"
              autoFocus
            />
          </div>
          <div className="flex justify-end gap-3">
            <button onClick={() => setEditEmp(null)} className="btn-secondary">Cancel</button>
            <button onClick={handleSave} disabled={saving} className="btn-primary">
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   MONTHLY PAYROLL TAB
═══════════════════════════════════════════════════════════════ */
function MonthlyPayrollTab({ isSuperAdmin }) {
  const [month, setMonth]     = useState(currentMonth());
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(false);
  const [generating, setGen]  = useState(false);
  const [adjModal, setAdj]    = useState(null);   // payroll record
  const [adjList, setAdjList] = useState([]);
  const [savingAdj, setSavingAdj] = useState(false);
  const [deductionRate, setDeductionRate] = useState(null);
  const [savingRate, setSavingRate] = useState(false);

  const load = async (m) => {
    setLoading(true);
    try {
      const [pr, sr] = await Promise.all([
        getPayroll({ month: m }),
        getAttendanceSettings()
      ]);
      setRecords(pr.data.records || []);
      setDeductionRate(sr.data.deductionPerExtraLeave ?? 0);
    } catch { toast.error('Failed to load'); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(month); }, [month]);

  const handleGenerate = async () => {
    setGen(true);
    try {
      const res = await generatePayroll({ month });
      setRecords(res.data.records || []);
      toast.success(`Payroll generated for ${monthLabel(month)}`);
    } catch (err) { toast.error(err.response?.data?.message || 'Failed'); }
    finally { setGen(false); }
  };

  const handleMarkPaid = async (id) => {
    try {
      await markPaid(id);
      toast.success('Marked as paid');
      load(month);
    } catch (err) { toast.error(err.response?.data?.message || 'Failed'); }
  };

  const handleMarkAllPaid = async () => {
    if (!window.confirm('Mark all pending records as paid for this month?')) return;
    try {
      await markAllPaid({ month });
      toast.success('All pending marked as paid');
      load(month);
    } catch (err) { toast.error(err.response?.data?.message || 'Failed'); }
  };

  const openAdj = (rec) => {
    setAdj(rec);
    setAdjList(rec.adjustments?.map(a => ({ ...a })) || []);
  };

  const saveAdj = async () => {
    for (const a of adjList) {
      if (!a.reason?.trim()) return toast.error('Every adjustment needs a reason');
      if (!a.amount || a.amount <= 0) return toast.error('Every adjustment needs an amount > 0');
    }
    setSavingAdj(true);
    try {
      await updateAdjustments(adjModal._id, { adjustments: adjList });
      toast.success('Adjustments saved');
      setAdj(null);
      load(month);
    } catch (err) { toast.error(err.response?.data?.message || 'Failed'); }
    finally { setSavingAdj(false); }
  };

  const saveDeductionRate = async () => {
    setSavingRate(true);
    try {
      await updateAttendanceSettings({ deductionPerExtraLeave: deductionRate });
      toast.success('Deduction rate saved');
    } catch { toast.error('Failed to save'); }
    finally { setSavingRate(false); }
  };

  const pendingCount = records.filter(r => r.status === 'pending').length;

  return (
    <div className="space-y-4">
      {/* Controls row */}
      <div className="card">
        <div className="flex flex-col sm:flex-row flex-wrap items-start sm:items-center gap-3">
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-gray-600">Month</label>
            <input type="month" className="input w-44" value={month}
              max={currentMonth()} onChange={e => setMonth(e.target.value)} />
          </div>
          <button onClick={handleGenerate} disabled={generating} className="btn-primary flex items-center gap-2">
            <RefreshCw className={`w-4 h-4 ${generating ? 'animate-spin' : ''}`} />
            {generating ? 'Generating…' : records.length ? 'Regenerate Pending' : 'Generate'}
          </button>
          {records.length > 0 && (
            <>
              <button onClick={() => downloadCSV(month, records)} className="btn-secondary flex items-center gap-2">
                <Download className="w-4 h-4" /> CSV
              </button>
              {pendingCount > 0 && (
                <button onClick={handleMarkAllPaid} className="btn-secondary flex items-center gap-2 text-green-700 hover:bg-green-50">
                  <CheckCircle className="w-4 h-4" /> Mark All Paid
                </button>
              )}
            </>
          )}
        </div>

        {/* Deduction rate — super admin only */}
        {isSuperAdmin && deductionRate !== null && (
          <div className="mt-3 pt-3 border-t border-gray-100 flex flex-col sm:flex-row items-start sm:items-center gap-3">
            <label className="text-sm font-medium text-gray-600 whitespace-nowrap">Deduction per extra leave day (₹)</label>
            <input type="number" min="0" className="input w-36"
              value={deductionRate} onChange={e => setDeductionRate(+e.target.value)} />
            <button onClick={saveDeductionRate} disabled={savingRate} className="btn-secondary flex items-center gap-1.5">
              <Settings className="w-3.5 h-3.5" />{savingRate ? 'Saving…' : 'Save Rate'}
            </button>
          </div>
        )}
      </div>

      {loading ? <LoadingSpinner /> : records.length === 0 ? (
        <div className="card text-center py-12 text-gray-400">
          <IndianRupee className="w-10 h-10 mx-auto mb-3 opacity-20" />
          <p className="font-medium">No payroll generated for {monthLabel(month)}</p>
          <p className="text-sm mt-1">Click "Generate" to create payroll records.</p>
        </div>
      ) : (
        <div className="card overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="text-left px-4 py-3 font-medium text-gray-500">Employee</th>
                  <th className="text-right px-3 py-3 font-medium text-gray-500 hidden md:table-cell">Salary</th>
                  <th className="text-center px-3 py-3 font-medium text-gray-500 hidden lg:table-cell">Extra Leave</th>
                  <th className="text-right px-3 py-3 font-medium text-gray-500 hidden md:table-cell">Deduction</th>
                  <th className="text-right px-3 py-3 font-medium text-gray-500 hidden sm:table-cell">Adjustments</th>
                  <th className="text-right px-3 py-3 font-medium text-gray-500">Net Salary</th>
                  <th className="text-center px-3 py-3 font-medium text-gray-500">Status</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-500">Actions</th>
                </tr>
              </thead>
              <tbody>
                {records.map(r => {
                  const bonus    = r.adjustments.filter(a => a.type === 'bonus').reduce((s, a) => s + a.amount, 0);
                  const extraDed = r.adjustments.filter(a => a.type === 'deduction').reduce((s, a) => s + a.amount, 0);
                  const adjSummary = bonus || extraDed
                    ? `${bonus ? `+₹${bonus}` : ''}${extraDed ? ` -₹${extraDed}` : ''}`
                    : '—';
                  return (
                    <tr key={r._id} className="border-b border-gray-50 hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <p className="font-medium text-gray-900">{r.employee?.name}</p>
                        <p className="text-xs text-gray-400">{r.employee?.employeeId}</p>
                      </td>
                      <td className="px-3 py-3 text-right text-gray-600 hidden md:table-cell">{fmt(r.monthlySalary)}</td>
                      <td className="px-3 py-3 text-center hidden lg:table-cell">
                        {r.extraLeaveDays > 0 ? <span className="badge-red">{r.extraLeaveDays}</span> : <span className="text-gray-300">0</span>}
                      </td>
                      <td className="px-3 py-3 text-right text-red-500 hidden md:table-cell">
                        {r.totalDeduction > 0 ? fmt(r.totalDeduction) : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-3 py-3 text-right text-sm hidden sm:table-cell">
                        <span className={r.adjustments.length ? 'text-blue-600' : 'text-gray-300'}>{adjSummary}</span>
                      </td>
                      <td className="px-3 py-3 text-right font-bold text-gray-900">{fmt(r.netSalary)}</td>
                      <td className="px-3 py-3 text-center">
                        {r.status === 'paid'
                          ? <span className="badge-green flex items-center gap-1 w-fit mx-auto"><CheckCircle className="w-3 h-3" />Paid</span>
                          : <span className="badge-yellow">Pending</span>}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          {r.status === 'pending' && (
                            <>
                              <button onClick={() => openAdj(r)} className="p-1.5 rounded hover:bg-gray-100 text-gray-400 hover:text-blue-600" title="Adjustments">
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                              <button onClick={() => handleMarkPaid(r._id)} className="p-1.5 rounded hover:bg-green-50 text-gray-400 hover:text-green-600" title="Mark paid">
                                <CheckCircle className="w-3.5 h-3.5" />
                              </button>
                            </>
                          )}
                          {r.status === 'paid' && r.paidOn && (
                            <span className="text-xs text-gray-400">{formatDate(r.paidOn)}</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Adjustments modal */}
      <Modal isOpen={!!adjModal} onClose={() => setAdj(null)} title={`Adjustments — ${adjModal?.employee?.name}`} size="md">
        {adjModal && (
          <div className="space-y-4">
            <div className="text-xs text-gray-500 bg-gray-50 rounded-lg px-3 py-2">
              Base: {fmt(adjModal.monthlySalary)} − deduction {fmt(adjModal.totalDeduction)} = <strong>{fmt(adjModal.monthlySalary - adjModal.totalDeduction)}</strong>
            </div>

            <div className="space-y-2 max-h-48 overflow-y-auto">
              {adjList.map((a, i) => (
                <div key={i} className="flex items-start gap-2">
                  <select className="input w-28 flex-shrink-0"
                    value={a.type} onChange={e => { const n=[...adjList]; n[i]={...n[i],type:e.target.value}; setAdjList(n); }}>
                    <option value="bonus">Bonus</option>
                    <option value="deduction">Deduction</option>
                  </select>
                  <input type="number" min="1" placeholder="Amount" className="input w-24 flex-shrink-0"
                    value={a.amount} onChange={e => { const n=[...adjList]; n[i]={...n[i],amount:+e.target.value}; setAdjList(n); }} />
                  <input placeholder="Reason (required)" className="input flex-1"
                    value={a.reason} onChange={e => { const n=[...adjList]; n[i]={...n[i],reason:e.target.value}; setAdjList(n); }} />
                  <button onClick={() => setAdjList(adjList.filter((_,j)=>j!==i))} className="p-1.5 rounded hover:bg-red-50 text-gray-400 hover:text-red-500 flex-shrink-0">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>

            <button onClick={() => setAdjList([...adjList, { type:'bonus', amount:0, reason:'' }])}
              className="btn-secondary flex items-center gap-1.5 text-sm">
              <Plus className="w-4 h-4" /> Add Adjustment
            </button>

            {adjList.length > 0 && (
              <div className="text-sm font-medium text-gray-700 bg-blue-50 rounded-lg px-3 py-2">
                Estimated net: {fmt(Math.max(0,
                  adjModal.monthlySalary - adjModal.totalDeduction +
                  adjList.filter(a=>a.type==='bonus').reduce((s,a)=>s+a.amount,0) -
                  adjList.filter(a=>a.type==='deduction').reduce((s,a)=>s+a.amount,0)
                ))}
              </div>
            )}

            <div className="flex justify-end gap-3 pt-2">
              <button onClick={() => setAdj(null)} className="btn-secondary">Cancel</button>
              <button onClick={saveAdj} disabled={savingAdj} className="btn-primary">
                {savingAdj ? 'Saving…' : 'Save Adjustments'}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   MAIN PAGE
═══════════════════════════════════════════════════════════════ */
export default function AdminPayroll() {
  const { hasPermission, isSuperAdmin } = useAuth();
  if (!hasPermission('PAYROLL_MANAGE') && !isSuperAdmin) {
    return <Navigate to="/admin" replace />;
  }

  const [tab, setTab] = useState('salaries');

  return (
    <div className="p-4 lg:p-8">
      <PageHeader title="Payroll" subtitle="Manage salaries and monthly payroll" />

      <div className="flex gap-1 mb-6 bg-gray-100 p-1 rounded-lg w-full sm:w-fit overflow-x-auto">
        {[{ key:'salaries', label:'Salaries' }, { key:'monthly', label:'Monthly Payroll' }].map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`flex-1 sm:flex-none px-3 py-2 rounded-md text-sm font-medium transition-colors whitespace-nowrap ${
              tab === t.key ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'salaries' && <SalariesTab />}
      {tab === 'monthly'  && <MonthlyPayrollTab isSuperAdmin={isSuperAdmin} />}
    </div>
  );
}
