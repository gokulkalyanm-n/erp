import { useEffect, useState } from 'react';
import { getMyAttendance, getCorrections, submitCorrection } from '../../services/api';
import PageHeader from '../../components/PageHeader';
import LoadingSpinner from '../../components/LoadingSpinner';
import Modal from '../../components/Modal';
import { CheckCircle, XCircle, AlertCircle, Calendar, Clock, MessageSquare } from 'lucide-react';
import toast from 'react-hot-toast';

/* ── helpers ── */
function currentMonth() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }).slice(0, 7);
}
function monthLabel(ym) {
  const [y, m] = ym.split('-');
  return new Date(+y, +m - 1, 1).toLocaleString('en-IN', { month: 'long', year: 'numeric' });
}

const STATUS = {
  present:   { label: 'Present',           bg: 'bg-green-100',  text: 'text-green-700',  icon: CheckCircle  },
  leave:     { label: 'On Leave',          bg: 'bg-red-100',    text: 'text-red-600',    icon: XCircle      },
  no_report: { label: 'Absent',            bg: 'bg-amber-100',  text: 'text-amber-700',  icon: AlertCircle  },
  holiday:   { label: 'Holiday / Day Off', bg: 'bg-gray-100',   text: 'text-gray-500',   icon: Calendar     },
};

function StatPill({ label, value, color }) {
  const colors = {
    green:  'bg-green-50 text-green-700',
    amber:  'bg-amber-50 text-amber-700',
    red:    'bg-red-50 text-red-600',
    gray:   'bg-gray-100 text-gray-600',
    blue:   'bg-blue-50 text-blue-700',
    orange: 'bg-orange-50 text-orange-700',
  };
  return (
    <div className={`rounded-xl p-3 text-center ${colors[color] || colors.gray}`}>
      <p className="text-xl font-bold leading-none">{value}</p>
      <p className="text-xs mt-1 font-medium">{label}</p>
    </div>
  );
}

// Badge shown on days where a correction was requested
function CorrectionBadge({ status }) {
  if (!status) return null;
  if (status === 'approved') return (
    <span className="inline-flex items-center gap-0.5 text-xs text-green-600 font-medium">
      <CheckCircle className="w-3 h-3" /> Corrected
    </span>
  );
  if (status === 'rejected') return (
    <span className="inline-flex items-center gap-0.5 text-xs text-red-500 font-medium">
      <XCircle className="w-3 h-3" /> Rejected
    </span>
  );
  return (
    <span className="inline-flex items-center gap-0.5 text-xs text-yellow-600 font-medium">
      <Clock className="w-3 h-3" /> Pending review
    </span>
  );
}

export default function MyAttendance() {
  const [month, setMonth]       = useState(currentMonth());
  const [data, setData]         = useState(null);
  const [corrections, setCorr]  = useState({}); // date → correction object
  const [loading, setLoading]   = useState(true);
  const [corrModal, setCorrModal] = useState(null); // { date } when open
  const [reason, setReason]     = useState('');
  const [submitting, setSubmitting] = useState(false);

  const load = async (m) => {
    setLoading(true);
    try {
      const [attRes, corrRes] = await Promise.all([
        getMyAttendance({ month: m }),
        getCorrections()           // employee only sees their own
      ]);
      setData(attRes.data);
      // Index corrections by date for fast lookup
      const map = {};
      for (const c of corrRes.data) map[c.date] = c;
      setCorr(map);
    } catch { toast.error('Failed to load attendance'); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(month); }, [month]);

  const handleSubmitCorrection = async () => {
    if (!reason.trim()) return toast.error('Please describe what you worked on');
    setSubmitting(true);
    try {
      await submitCorrection({ date: corrModal.date, reason: reason.trim() });
      toast.success('Correction request submitted');
      setCorrModal(null);
      setReason('');
      load(month);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to submit');
    } finally { setSubmitting(false); }
  };

  const days = data?.days || [];
  const t    = data?.totals || {};

  // Calendar grid helper
  const calRows = (() => {
    if (!days.length) return [];
    const firstDate = new Date(days[0].date + 'T00:00:00+05:30');
    const startPad  = firstDate.getDay();
    const cells = Array(startPad).fill(null).concat(days);
    const rows  = [];
    for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7));
    return rows;
  })();

  return (
    <div className="p-4 lg:p-8">
      <PageHeader title="My Attendance" subtitle={monthLabel(month)} />

      {/* Month picker */}
      <div className="card mb-4 lg:mb-6">
        <div className="flex items-center gap-3">
          <label className="text-sm font-medium text-gray-600">Month</label>
          <input type="month" className="input w-44" value={month}
            max={currentMonth()} onChange={e => setMonth(e.target.value)} />
        </div>
      </div>

      {loading ? <LoadingSpinner /> : !data ? null : (
        <>
          {/* Summary pills */}
          <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-7 gap-2 mb-4 lg:mb-6">
            <StatPill label="Working Days" value={t.workingDays}    color="blue"   />
            <StatPill label="Present"      value={t.presentDays}    color="green"  />
            <StatPill label="Absent"       value={t.noReportDays}   color="amber"  />
            <StatPill label="On Leave"     value={t.leaveDays}      color="red"    />
            <StatPill label="Paid Leave"   value={t.paidLeaveDays}  color="blue"   />
            <StatPill label="Extra Leave"  value={t.extraLeaveDays} color="orange" />
            <StatPill label="Deduction ₹"  value={t.deduction}      color={t.deduction > 0 ? 'red' : 'gray'} />
          </div>

          {/* Legend */}
          <div className="flex flex-wrap gap-2 mb-4 text-xs">
            {Object.entries(STATUS).map(([k, v]) => {
              const Icon = v.icon;
              return (
                <span key={k} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-medium ${v.bg} ${v.text}`}>
                  <Icon className="w-3 h-3" />{v.label}
                </span>
              );
            })}
          </div>

          {/* ── Calendar grid — desktop ── */}
          <div className="card hidden sm:block overflow-hidden p-0">
            <div className="grid grid-cols-7 border-b border-gray-100">
              {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d => (
                <div key={d} className="text-center text-xs font-semibold text-gray-400 py-2">{d}</div>
              ))}
            </div>
            {calRows.map((row, ri) => (
              <div key={ri} className="grid grid-cols-7 border-b border-gray-50 last:border-0">
                {Array(7).fill(null).map((_, ci) => {
                  const cell = row[ci];
                  if (!cell) return <div key={ci} className="p-2 min-h-[72px]" />;
                  const cfg  = STATUS[cell.status] || STATUS.holiday;
                  const corr = corrections[cell.date];
                  return (
                    <div key={ci} className={`p-2 min-h-[72px] border-r border-gray-50 last:border-0 ${cfg.bg}`}>
                      <p className="text-xs font-semibold text-gray-700">{cell.date.slice(8)}</p>
                      <p className={`text-xs mt-0.5 font-medium ${cfg.text}`}>
                        {cell.status === 'holiday' ? (cell.label || 'Off')
                          : cell.corrected ? 'Present*'
                          : cfg.label}
                      </p>
                      {corr && <CorrectionBadge status={corr.status} />}
                      {cell.status === 'no_report' && !corr && (
                        <button
                          onClick={() => { setCorrModal({ date: cell.date }); setReason(''); }}
                          className="mt-1 text-xs text-blue-600 hover:underline flex items-center gap-0.5"
                        >
                          <MessageSquare className="w-3 h-3" /> Request
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>

          {/* ── List view — mobile ── */}
          <div className="sm:hidden space-y-2">
            {days.map(d => {
              const cfg  = STATUS[d.status] || STATUS.holiday;
              const Icon = cfg.icon;
              const corr = corrections[d.date];
              const dayName = new Date(d.date + 'T00:00:00+05:30')
                .toLocaleString('en-IN', { weekday: 'short', timeZone: 'Asia/Kolkata' });
              return (
                <div key={d.date} className={`rounded-xl px-3 py-2.5 ${cfg.bg}`}>
                  <div className="flex items-center gap-3">
                    <div className="w-10 text-center flex-shrink-0">
                      <p className="text-base font-bold text-gray-800 leading-none">{d.date.slice(8)}</p>
                      <p className="text-xs text-gray-500">{dayName}</p>
                    </div>
                    <Icon className={`w-4 h-4 flex-shrink-0 ${cfg.text}`} />
                    <span className={`text-sm font-medium flex-1 ${cfg.text}`}>
                      {d.status === 'holiday' ? (d.label || 'Holiday / Day Off')
                        : d.corrected ? 'Present (corrected)'
                        : cfg.label}
                    </span>
                    {d.status === 'no_report' && !corr && (
                      <button
                        onClick={() => { setCorrModal({ date: d.date }); setReason(''); }}
                        className="text-xs text-blue-600 hover:underline flex items-center gap-0.5 flex-shrink-0"
                      >
                        <MessageSquare className="w-3 h-3" /> Request
                      </button>
                    )}
                  </div>
                  {corr && (
                    <div className="mt-1 pl-13">
                      <CorrectionBadge status={corr.status} />
                      {corr.adminNote && (
                        <p className="text-xs text-gray-500 mt-0.5">Note: {corr.adminNote}</p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* ── Correction request modal ── */}
      <Modal isOpen={!!corrModal} onClose={() => setCorrModal(null)} title="Request Attendance Correction" size="sm">
        {corrModal && (
          <div className="space-y-4">
            <div className="bg-amber-50 border border-amber-100 rounded-lg px-3 py-2 text-sm text-amber-800">
              You are requesting that <strong>{corrModal.date}</strong> be marked as <strong>Present</strong>.
            </div>
            <div>
              <label className="label">What did you work on that day? *</label>
              <textarea
                className="input"
                rows={4}
                placeholder="Describe the work you did on this day. This will be reviewed by your admin."
                value={reason}
                onChange={e => setReason(e.target.value)}
                autoFocus
              />
            </div>
            <div className="flex justify-end gap-3">
              <button onClick={() => setCorrModal(null)} className="btn-secondary">Cancel</button>
              <button onClick={handleSubmitCorrection} disabled={submitting || !reason.trim()} className="btn-primary">
                {submitting ? 'Submitting…' : 'Submit Request'}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
