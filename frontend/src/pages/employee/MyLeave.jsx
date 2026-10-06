import { useEffect, useState } from 'react';
import { getLeaves, applyLeave, deleteLeave } from '../../services/api';
import PageHeader from '../../components/PageHeader';
import Modal from '../../components/Modal';
import LoadingSpinner from '../../components/LoadingSpinner';
import { formatDate } from '../../utils/helpers';
import toast from 'react-hot-toast';
import { Plus, Eye, Trash2, CheckCircle, XCircle, Clock, CalendarOff } from 'lucide-react';

const LEAVE_TYPES = [
  { value: 'sick', label: 'Sick Leave' },
  { value: 'casual', label: 'Casual Leave' },
  { value: 'earned', label: 'Earned Leave' },
  { value: 'maternity', label: 'Maternity Leave' },
  { value: 'paternity', label: 'Paternity Leave' },
  { value: 'unpaid', label: 'Unpaid Leave' },
  { value: 'other', label: 'Other' },
];

const statusConfig = {
  pending:  { badge: 'badge-yellow', icon: Clock,         label: 'Pending' },
  approved: { badge: 'badge-green',  icon: CheckCircle,   label: 'Approved' },
  rejected: { badge: 'badge-red',    icon: XCircle,       label: 'Rejected' },
};

const emptyForm = {
  leaveType: 'sick', fromDate: '', toDate: '', reason: '', additionalInfo: ''
};

function calcDays(from, to) {
  if (!from || !to) return 0;
  const d = Math.ceil((new Date(to) - new Date(from)) / (1000 * 60 * 60 * 24)) + 1;
  return d > 0 ? d : 0;
}

export default function MyLeave() {
  const [leaves, setLeaves] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [viewModal, setViewModal] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await getLeaves();
      setLeaves(res.data);
    } catch { toast.error('Failed to load leave requests'); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const days = calcDays(form.fromDate, form.toDate);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.fromDate || !form.toDate) return toast.error('Please select both dates');
    if (days <= 0) return toast.error('To date must be on or after from date');
    setSaving(true);
    try {
      await applyLeave({ ...form, numberOfDays: days });
      toast.success('Leave request submitted');
      setShowModal(false);
      setForm(emptyForm);
      load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to submit');
    } finally { setSaving(false); }
  };

  const handleCancel = async (leave) => {
    if (!window.confirm('Cancel this leave request?')) return;
    try {
      await deleteLeave(leave._id);
      toast.success('Leave request cancelled');
      load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to cancel');
    }
  };

  const pending = leaves.filter(l => l.status === 'pending').length;
  const approved = leaves.filter(l => l.status === 'approved').length;

  return (
    <div className="p-4 lg:p-8">
      <PageHeader
        title="My Leave"
        subtitle="Apply and track your leave requests"
        action={
          <button onClick={() => { setForm(emptyForm); setShowModal(true); }} className="btn-primary flex items-center gap-2">
            <Plus className="w-4 h-4" /> Apply Leave
          </button>
        }
      />

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-3 mb-4 lg:mb-6">
        <div className="card p-3 lg:p-4 text-center">
          <p className="text-2xl font-bold text-gray-900">{leaves.length}</p>
          <p className="text-xs text-gray-400 mt-0.5">Total</p>
        </div>
        <div className="card p-3 lg:p-4 text-center">
          <p className="text-2xl font-bold text-yellow-600">{pending}</p>
          <p className="text-xs text-gray-400 mt-0.5">Pending</p>
        </div>
        <div className="card p-3 lg:p-4 text-center">
          <p className="text-2xl font-bold text-green-600">{approved}</p>
          <p className="text-xs text-gray-400 mt-0.5">Approved</p>
        </div>
      </div>

      {loading ? <LoadingSpinner /> : (
        <div className="space-y-3">
          {leaves.length === 0 && (
            <div className="card text-center py-16 text-gray-400">
              <CalendarOff className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p className="font-medium">No leave requests yet</p>
              <p className="text-sm mt-1">Click "Apply Leave" to submit a request.</p>
            </div>
          )}
          {leaves.map(l => {
            const cfg = statusConfig[l.status] || statusConfig.pending;
            const Icon = cfg.icon;
            return (
              <div key={l._id} className="card hover:shadow-md transition-shadow">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-1.5">
                      <p className="font-semibold text-gray-900">{LEAVE_TYPES.find(t => t.value === l.leaveType)?.label || l.leaveType}</p>
                      <span className={`${cfg.badge} flex items-center gap-1`}>
                        <Icon className="w-3 h-3" />{cfg.label}
                      </span>
                    </div>
                    <p className="text-sm text-gray-500">
                      {formatDate(l.fromDate)} → {formatDate(l.toDate)}
                      <span className="ml-2 font-medium text-gray-700">({l.numberOfDays} day{l.numberOfDays !== 1 ? 's' : ''})</span>
                    </p>
                    <p className="text-xs text-gray-400 mt-1 line-clamp-1">{l.reason}</p>
                    {l.status !== 'pending' && l.reviewComment && (
                      <p className="text-xs mt-1.5 bg-gray-50 rounded px-2 py-1 text-gray-600 line-clamp-1">
                        💬 {l.reviewComment}
                      </p>
                    )}
                  </div>
                  <div className="flex gap-1 flex-shrink-0">
                    <button onClick={() => setViewModal(l)} className="p-1.5 rounded hover:bg-gray-100 text-gray-400 hover:text-blue-600">
                      <Eye className="w-4 h-4" />
                    </button>
                    {l.status === 'pending' && (
                      <button onClick={() => handleCancel(l)} className="p-1.5 rounded hover:bg-red-50 text-gray-400 hover:text-red-500">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Apply Leave Modal */}
      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title="Apply for Leave" size="md">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="label">Leave Type *</label>
            <select className="input" required value={form.leaveType} onChange={e => setForm({ ...form, leaveType: e.target.value })}>
              {LEAVE_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">From Date *</label>
              <input type="date" className="input" required value={form.fromDate} onChange={e => setForm({ ...form, fromDate: e.target.value })} />
            </div>
            <div>
              <label className="label">To Date *</label>
              <input type="date" className="input" required value={form.toDate} onChange={e => setForm({ ...form, toDate: e.target.value })} />
            </div>
          </div>

          {days > 0 && (
            <div className="bg-blue-50 border border-blue-100 rounded-lg px-3 py-2 text-sm text-blue-700 font-medium">
              📅 {days} day{days !== 1 ? 's' : ''} of leave
            </div>
          )}

          <div>
            <label className="label">Reason *</label>
            <textarea className="input" rows={3} required placeholder="Describe the reason for your leave..." value={form.reason} onChange={e => setForm({ ...form, reason: e.target.value })} />
          </div>
          <div>
            <label className="label">Additional Information</label>
            <textarea className="input" rows={2} placeholder="Any extra details (optional)..." value={form.additionalInfo} onChange={e => setForm({ ...form, additionalInfo: e.target.value })} />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => setShowModal(false)} className="btn-secondary">Cancel</button>
            <button type="submit" disabled={saving || days <= 0} className="btn-primary">
              {saving ? 'Submitting...' : 'Submit Request'}
            </button>
          </div>
        </form>
      </Modal>

      {/* View Modal */}
      <Modal isOpen={!!viewModal} onClose={() => setViewModal(null)} title="Leave Request Details" size="md">
        {viewModal && (
          <div className="space-y-4 text-sm">
            <div className="grid grid-cols-2 gap-3">
              <div><span className="text-gray-400 text-xs block">Leave Type</span><span className="font-medium">{LEAVE_TYPES.find(t => t.value === viewModal.leaveType)?.label}</span></div>
              <div><span className="text-gray-400 text-xs block">Status</span>
                <span className={`${statusConfig[viewModal.status]?.badge} flex items-center gap-1 mt-0.5 w-fit`}>
                  {viewModal.status}
                </span>
              </div>
              <div><span className="text-gray-400 text-xs block">From</span><span className="font-medium">{formatDate(viewModal.fromDate)}</span></div>
              <div><span className="text-gray-400 text-xs block">To</span><span className="font-medium">{formatDate(viewModal.toDate)}</span></div>
              <div><span className="text-gray-400 text-xs block">Days</span><span className="font-medium">{viewModal.numberOfDays}</span></div>
              <div><span className="text-gray-400 text-xs block">Applied On</span><span className="font-medium">{formatDate(viewModal.createdAt)}</span></div>
            </div>
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Reason</p>
              <p className="bg-gray-50 rounded-lg p-3 text-gray-700">{viewModal.reason}</p>
            </div>
            {viewModal.additionalInfo && (
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Additional Info</p>
                <p className="bg-gray-50 rounded-lg p-3 text-gray-700">{viewModal.additionalInfo}</p>
              </div>
            )}
            {viewModal.status !== 'pending' && (
              <div className={`rounded-xl p-4 border ${viewModal.status === 'approved' ? 'bg-green-50 border-green-100' : 'bg-red-50 border-red-100'}`}>
                <p className={`text-xs font-semibold uppercase tracking-wider mb-1 ${viewModal.status === 'approved' ? 'text-green-600' : 'text-red-600'}`}>
                  {viewModal.status === 'approved' ? '✅ Approved' : '❌ Rejected'}
                  {viewModal.reviewedBy && ` by ${viewModal.reviewedBy.name}`}
                </p>
                {viewModal.reviewComment && (
                  <p className={viewModal.status === 'approved' ? 'text-green-800' : 'text-red-800'}>{viewModal.reviewComment}</p>
                )}
              </div>
            )}
            <div className="flex justify-end">
              <button onClick={() => setViewModal(null)} className="btn-secondary">Close</button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
