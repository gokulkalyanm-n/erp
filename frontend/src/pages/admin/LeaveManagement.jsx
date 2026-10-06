import { useEffect, useState } from 'react';
import { getLeaves, reviewLeave, getEmployees } from '../../services/api';
import PageHeader from '../../components/PageHeader';
import Modal from '../../components/Modal';
import LoadingSpinner from '../../components/LoadingSpinner';
import { formatDate } from '../../utils/helpers';
import toast from 'react-hot-toast';
import { Eye, CheckCircle, XCircle, Clock, Search } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { Navigate } from 'react-router-dom';

const statusBadge = (s) => {
  if (s === 'approved') return 'badge-green';
  if (s === 'rejected') return 'badge-red';
  return 'badge-yellow';
};

const leaveTypeLabel = {
  sick: 'Sick Leave', casual: 'Casual Leave', earned: 'Earned Leave',
  maternity: 'Maternity', paternity: 'Paternity', unpaid: 'Unpaid', other: 'Other'
};

export default function LeaveManagement() {
  const { hasPermission } = useAuth();
  if (!hasPermission('LEAVE_VIEW')) return <Navigate to="/admin" replace />;

  const [leaves, setLeaves] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [viewLeave, setViewLeave] = useState(null);
  const [reviewComment, setReviewComment] = useState('');
  const [filterEmp, setFilterEmp] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [search, setSearch] = useState('');
  const canApprove = hasPermission('LEAVE_APPROVE');

  const load = async () => {
    setLoading(true);
    try {
      const params = {};
      if (filterEmp) params.employeeId = filterEmp;
      if (filterStatus) params.status = filterStatus;
      const [lRes, eRes] = await Promise.all([getLeaves(params), getEmployees({ isActive: 'true' })]);
      setLeaves(lRes.data);
      setEmployees(eRes.data);
    } catch { toast.error('Failed to load'); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [filterEmp, filterStatus]);

  const handleReview = async (status) => {
    try {
      await reviewLeave(viewLeave._id, { status, reviewComment });
      toast.success(`Leave request ${status}`);
      setViewLeave(null);
      setReviewComment('');
      load();
    } catch (err) { toast.error(err.response?.data?.message || 'Failed'); }
  };

  const filtered = leaves.filter(l =>
    !search ||
    l.employee?.name?.toLowerCase().includes(search.toLowerCase()) ||
    l.employee?.employeeId?.toLowerCase().includes(search.toLowerCase())
  );

  const pending = leaves.filter(l => l.status === 'pending').length;

  return (
    <div className="p-4 lg:p-8">
      <PageHeader
        title="Leave Management"
        subtitle={`${pending} pending · ${leaves.length} total`}
      />

      {/* Filters */}
      <div className="card mb-4 lg:mb-6">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
            <input className="input pl-9" placeholder="Search employee..." value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <select className="input" value={filterEmp} onChange={e => setFilterEmp(e.target.value)}>
            <option value="">All Employees</option>
            {employees.map(e => <option key={e._id} value={e._id}>{e.name}</option>)}
          </select>
          <select className="input" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
            <option value="">All Status</option>
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
          </select>
        </div>
      </div>

      {loading ? <LoadingSpinner /> : (
        <>
          {/* Mobile cards */}
          <div className="lg:hidden space-y-3">
            {filtered.length === 0 && <div className="card text-center text-gray-400 py-10">No leave requests found</div>}
            {filtered.map(l => (
              <div key={l._id} className="card">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div>
                    <p className="font-semibold text-gray-900">{l.employee?.name}</p>
                    <p className="text-xs text-gray-400">{l.employee?.employeeId} · {l.employee?.department}</p>
                  </div>
                  <button onClick={() => { setViewLeave(l); setReviewComment(l.reviewComment || ''); }} className="p-2 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-blue-600 flex-shrink-0">
                    <Eye className="w-4 h-4" />
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-1.5 text-xs text-gray-500 mb-2">
                  <div><span className="text-gray-400">Type: </span>{leaveTypeLabel[l.leaveType] || l.leaveType}</div>
                  <div><span className="text-gray-400">Days: </span><strong>{l.numberOfDays}</strong></div>
                  <div><span className="text-gray-400">From: </span>{formatDate(l.fromDate)}</div>
                  <div><span className="text-gray-400">To: </span>{formatDate(l.toDate)}</div>
                </div>
                <span className={statusBadge(l.status)}>{l.status}</span>
              </div>
            ))}
          </div>

          {/* Desktop table */}
          <div className="hidden lg:block card overflow-hidden p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100">
                    <th className="text-left px-4 py-3 font-medium text-gray-500">Employee</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-500">Leave Type</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-500">From</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-500">To</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-500">Days</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-500">Status</th>
                    <th className="text-right px-4 py-3 font-medium text-gray-500">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 && <tr><td colSpan={7} className="text-center py-12 text-gray-400">No leave requests found</td></tr>}
                  {filtered.map(l => (
                    <tr key={l._id} className="border-b border-gray-50 hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <p className="font-medium text-gray-900">{l.employee?.name}</p>
                        <p className="text-xs text-gray-400">{l.employee?.employeeId}</p>
                      </td>
                      <td className="px-4 py-3 text-gray-600">{leaveTypeLabel[l.leaveType] || l.leaveType}</td>
                      <td className="px-4 py-3 text-gray-600">{formatDate(l.fromDate)}</td>
                      <td className="px-4 py-3 text-gray-600">{formatDate(l.toDate)}</td>
                      <td className="px-4 py-3 font-medium text-gray-900">{l.numberOfDays}d</td>
                      <td className="px-4 py-3">
                        <span className={`${statusBadge(l.status)} flex items-center gap-1 w-fit`}>
                          {l.status === 'pending' && <Clock className="w-3 h-3" />}
                          {l.status === 'approved' && <CheckCircle className="w-3 h-3" />}
                          {l.status === 'rejected' && <XCircle className="w-3 h-3" />}
                          {l.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button onClick={() => { setViewLeave(l); setReviewComment(l.reviewComment || ''); }} className="p-1.5 rounded hover:bg-gray-100 text-gray-400 hover:text-blue-600">
                          <Eye className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* View / Review Modal */}
      <Modal isOpen={!!viewLeave} onClose={() => setViewLeave(null)} title="Leave Request Detail" size="md">
        {viewLeave && (
          <div className="space-y-4 text-sm">
            <div className="grid grid-cols-2 gap-3">
              <div><span className="text-gray-400 text-xs block">Employee</span><span className="font-medium">{viewLeave.employee?.name}</span></div>
              <div><span className="text-gray-400 text-xs block">Employee ID</span><span className="font-mono text-blue-600">{viewLeave.employee?.employeeId}</span></div>
              <div><span className="text-gray-400 text-xs block">Leave Type</span><span className="font-medium">{leaveTypeLabel[viewLeave.leaveType] || viewLeave.leaveType}</span></div>
              <div><span className="text-gray-400 text-xs block">Number of Days</span><span className="font-medium">{viewLeave.numberOfDays} day{viewLeave.numberOfDays !== 1 ? 's' : ''}</span></div>
              <div><span className="text-gray-400 text-xs block">From</span><span className="font-medium">{formatDate(viewLeave.fromDate)}</span></div>
              <div><span className="text-gray-400 text-xs block">To</span><span className="font-medium">{formatDate(viewLeave.toDate)}</span></div>
              <div className="col-span-2"><span className="text-gray-400 text-xs block">Status</span><span className={`${statusBadge(viewLeave.status)} mt-0.5`}>{viewLeave.status}</span></div>
            </div>

            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Reason</p>
              <p className="bg-gray-50 rounded-lg p-3 text-gray-700">{viewLeave.reason}</p>
            </div>

            {viewLeave.additionalInfo && (
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Additional Info</p>
                <p className="bg-gray-50 rounded-lg p-3 text-gray-700">{viewLeave.additionalInfo}</p>
              </div>
            )}

            {viewLeave.reviewComment && (
              <div className="bg-blue-50 border border-blue-100 rounded-lg p-3">
                <p className="text-xs font-semibold text-blue-600 mb-1">Review Comment</p>
                <p className="text-blue-800">{viewLeave.reviewComment}</p>
              </div>
            )}

            {canApprove && viewLeave.status === 'pending' && (
              <div className="border-t pt-4 space-y-3">
                <div>
                  <label className="label">Review Comment (optional)</label>
                  <textarea className="input" rows={2} placeholder="Add a comment..." value={reviewComment} onChange={e => setReviewComment(e.target.value)} />
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={() => handleReview('approved')}
                    className="flex-1 flex items-center justify-center gap-2 bg-green-600 hover:bg-green-700 text-white font-medium px-4 py-2 rounded-lg text-sm transition-colors"
                  >
                    <CheckCircle className="w-4 h-4" /> Approve
                  </button>
                  <button
                    onClick={() => handleReview('rejected')}
                    className="flex-1 flex items-center justify-center gap-2 bg-red-600 hover:bg-red-700 text-white font-medium px-4 py-2 rounded-lg text-sm transition-colors"
                  >
                    <XCircle className="w-4 h-4" /> Reject
                  </button>
                </div>
              </div>
            )}

            {!canApprove && viewLeave.status === 'pending' && (
              <p className="text-xs text-gray-400 italic border-t pt-3">You have view-only access. You cannot approve or reject leave requests.</p>
            )}

            <div className="flex justify-end">
              <button onClick={() => setViewLeave(null)} className="btn-secondary">Close</button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
