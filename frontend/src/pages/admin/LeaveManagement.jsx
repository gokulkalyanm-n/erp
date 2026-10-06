import { useEffect, useState } from 'react';
import { getLeaves, hrReviewLeave, saReviewLeave, getEmployees } from '../../services/api';
import PageHeader from '../../components/PageHeader';
import Modal from '../../components/Modal';
import LoadingSpinner from '../../components/LoadingSpinner';
import { formatDate, formatDateTime } from '../../utils/helpers';
import toast from 'react-hot-toast';
import { Eye, CheckCircle, XCircle, Clock, Search, ArrowRight, ShieldCheck } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { Navigate } from 'react-router-dom';

const leaveTypeLabel = {
  sick: 'Sick Leave', casual: 'Casual Leave', earned: 'Earned Leave',
  maternity: 'Maternity', paternity: 'Paternity', unpaid: 'Unpaid', other: 'Other'
};

function stageBadge(stage, status) {
  if (status === 'rejected') return { cls: 'badge-red',    text: 'Rejected' };
  if (status === 'approved') return { cls: 'badge-green',  text: 'Approved' };
  if (stage  === 'hr')       return { cls: 'badge-yellow', text: 'Awaiting HR' };
  if (stage  === 'super_admin') return { cls: 'badge-blue', text: 'Awaiting Super Admin' };
  return { cls: 'badge-gray', text: stage };
}

// Approval timeline shown in the detail modal
function ApprovalTimeline({ leave, isHR, isSA }) {
  const hrDone   = !!leave.hrReview?.action;
  const saDone   = !!leave.superAdminReview?.action;

  return (
    <div className="border border-gray-100 rounded-xl p-4 space-y-4">
      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Approval Progress</p>

      {/* HR stage */}
      <div className="flex items-start gap-3">
        <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 ${
          hrDone
            ? leave.hrReview.action === 'approved' ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-500'
            : 'bg-yellow-100 text-yellow-600'
        }`}>
          {hrDone
            ? leave.hrReview.action === 'approved' ? <CheckCircle className="w-4 h-4" /> : <XCircle className="w-4 h-4" />
            : <Clock className="w-4 h-4" />}
        </div>
        <div className="flex-1">
          <p className="text-sm font-medium text-gray-800">
            HR Review
            {hrDone && <span className={`ml-2 text-xs font-normal ${leave.hrReview.action === 'approved' ? 'text-green-600' : 'text-red-500'}`}>
              — {leave.hrReview.action}
            </span>}
          </p>
          {hrDone && (
            <>
              {leave.hrReview.reviewedBy && (
                <p className="text-xs text-gray-400">by {leave.hrReview.reviewedBy.name} · {formatDateTime(leave.hrReview.reviewedAt)}</p>
              )}
              {leave.hrReview.comment && (
                <p className="text-xs text-gray-600 bg-gray-50 rounded px-2 py-1 mt-1">{leave.hrReview.comment}</p>
              )}
            </>
          )}
          {!hrDone && <p className="text-xs text-gray-400">Pending HR action</p>}
        </div>
      </div>

      {/* Arrow connector */}
      <div className="flex items-center gap-2 pl-3">
        <div className={`w-0.5 h-4 ${hrDone && leave.hrReview.action === 'approved' ? 'bg-blue-200' : 'bg-gray-100'}`} />
      </div>

      {/* Super Admin stage */}
      <div className="flex items-start gap-3">
        <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 ${
          !hrDone || leave.hrReview.action !== 'approved'
            ? 'bg-gray-100 text-gray-300'
            : saDone
              ? leave.superAdminReview.action === 'approved' ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-500'
              : 'bg-yellow-100 text-yellow-600'
        }`}>
          {saDone
            ? leave.superAdminReview.action === 'approved' ? <CheckCircle className="w-4 h-4" /> : <XCircle className="w-4 h-4" />
            : <ShieldCheck className="w-4 h-4" />}
        </div>
        <div className="flex-1">
          <p className={`text-sm font-medium ${!hrDone || leave.hrReview.action !== 'approved' ? 'text-gray-300' : 'text-gray-800'}`}>
            Super Admin Review
            {saDone && <span className={`ml-2 text-xs font-normal ${leave.superAdminReview.action === 'approved' ? 'text-green-600' : 'text-red-500'}`}>
              — {leave.superAdminReview.action}
            </span>}
          </p>
          {saDone && (
            <>
              {leave.superAdminReview.reviewedBy && (
                <p className="text-xs text-gray-400">by {leave.superAdminReview.reviewedBy.name} · {formatDateTime(leave.superAdminReview.reviewedAt)}</p>
              )}
              {leave.superAdminReview.comment && (
                <p className="text-xs text-gray-600 bg-gray-50 rounded px-2 py-1 mt-1">{leave.superAdminReview.comment}</p>
              )}
            </>
          )}
          {!saDone && hrDone && leave.hrReview.action === 'approved' && (
            <p className="text-xs text-gray-400">Awaiting Super Admin decision</p>
          )}
          {(!hrDone || leave.hrReview.action !== 'approved') && !saDone && (
            <p className="text-xs text-gray-300">Waiting for HR to forward</p>
          )}
        </div>
      </div>
    </div>
  );
}

export default function LeaveManagement() {
  const { hasPermission, isSuperAdmin } = useAuth();
  const isHR = hasPermission('LEAVE_VIEW');

  if (!isHR && !isSuperAdmin) return <Navigate to="/admin" replace />;

  const [leaves, setLeaves] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [viewLeave, setViewLeave] = useState(null);
  const [reviewComment, setReviewComment] = useState('');
  const [filterEmp, setFilterEmp] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [search, setSearch] = useState('');
  const canApproveHR = hasPermission('LEAVE_APPROVE');

  const load = async () => {
    setLoading(true);
    try {
      const params = {};
      if (filterEmp) params.employeeId = filterEmp;
      if (filterStatus) params.status = filterStatus;
      const [lRes, eRes] = await Promise.all([
        getLeaves(params),
        getEmployees({ isActive: 'true' })
      ]);
      setLeaves(lRes.data);
      setEmployees(eRes.data);
    } catch { toast.error('Failed to load'); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [filterEmp, filterStatus]);

  const handleHRAction = async (action) => {
    try {
      await hrReviewLeave(viewLeave._id, { action, comment: reviewComment });
      toast.success(action === 'approved'
        ? 'Approved & forwarded to Super Admin'
        : 'Leave request rejected');
      setViewLeave(null);
      setReviewComment('');
      load();
    } catch (err) { toast.error(err.response?.data?.message || 'Failed'); }
  };

  const handleSAAction = async (action) => {
    try {
      await saReviewLeave(viewLeave._id, { action, comment: reviewComment });
      toast.success(`Leave request ${action}`);
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

  const pageTitle = isSuperAdmin
    ? 'Leave Approvals (Super Admin)'
    : 'Leave Management (HR)';

  const emptyMsg = isSuperAdmin
    ? 'No leave requests forwarded to you yet.'
    : 'No leave requests from employees yet.';

  return (
    <div className="p-4 lg:p-8">
      <PageHeader
        title={pageTitle}
        subtitle={`${pending} pending · ${leaves.length} total`}
      />

      {/* Context banner */}
      <div className={`mb-4 px-4 py-3 rounded-xl text-sm flex items-center gap-2 ${
        isSuperAdmin
          ? 'bg-yellow-50 border border-yellow-100 text-yellow-800'
          : 'bg-blue-50 border border-blue-100 text-blue-800'
      }`}>
        {isSuperAdmin
          ? <><ShieldCheck className="w-4 h-4 flex-shrink-0" /> You see requests that HR has approved and forwarded. Your decision is final.</>
          : <><ArrowRight className="w-4 h-4 flex-shrink-0" /> You see new requests from employees. Approve to forward to Super Admin, or reject to close.</>
        }
      </div>

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
            {filtered.length === 0 && <div className="card text-center text-gray-400 py-10">{emptyMsg}</div>}
            {filtered.map(l => {
              const badge = stageBadge(l.stage, l.status);
              return (
                <div key={l._id} className="card">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div>
                      <p className="font-semibold text-gray-900">{l.employee?.name}</p>
                      <p className="text-xs text-gray-400">{l.employee?.employeeId} · {l.employee?.department}</p>
                    </div>
                    <button onClick={() => { setViewLeave(l); setReviewComment(''); }} className="p-2 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-blue-600 flex-shrink-0">
                      <Eye className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-1.5 text-xs text-gray-500 mb-2">
                    <div><span className="text-gray-400">Type: </span>{leaveTypeLabel[l.leaveType] || l.leaveType}</div>
                    <div><span className="text-gray-400">Days: </span><strong>{l.numberOfDays}</strong></div>
                    <div><span className="text-gray-400">From: </span>{formatDate(l.fromDate)}</div>
                    <div><span className="text-gray-400">To: </span>{formatDate(l.toDate)}</div>
                  </div>
                  <span className={`${badge.cls} text-xs`}>{badge.text}</span>
                </div>
              );
            })}
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
                  {filtered.length === 0 && <tr><td colSpan={7} className="text-center py-12 text-gray-400">{emptyMsg}</td></tr>}
                  {filtered.map(l => {
                    const badge = stageBadge(l.stage, l.status);
                    return (
                      <tr key={l._id} className="border-b border-gray-50 hover:bg-gray-50">
                        <td className="px-4 py-3">
                          <p className="font-medium text-gray-900">{l.employee?.name}</p>
                          <p className="text-xs text-gray-400">{l.employee?.employeeId}</p>
                        </td>
                        <td className="px-4 py-3 text-gray-600">{leaveTypeLabel[l.leaveType] || l.leaveType}</td>
                        <td className="px-4 py-3 text-gray-600">{formatDate(l.fromDate)}</td>
                        <td className="px-4 py-3 text-gray-600">{formatDate(l.toDate)}</td>
                        <td className="px-4 py-3 font-medium">{l.numberOfDays}d</td>
                        <td className="px-4 py-3"><span className={`${badge.cls} text-xs`}>{badge.text}</span></td>
                        <td className="px-4 py-3 text-right">
                          <button onClick={() => { setViewLeave(l); setReviewComment(''); }} className="p-1.5 rounded hover:bg-gray-100 text-gray-400 hover:text-blue-600">
                            <Eye className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* Detail / Review Modal */}
      <Modal isOpen={!!viewLeave} onClose={() => setViewLeave(null)} title="Leave Request Detail" size="md">
        {viewLeave && (
          <div className="space-y-4 text-sm">
            {/* Basic info */}
            <div className="grid grid-cols-2 gap-3">
              <div><span className="text-gray-400 text-xs block">Employee</span><span className="font-medium">{viewLeave.employee?.name}</span></div>
              <div><span className="text-gray-400 text-xs block">Employee ID</span><span className="font-mono text-blue-600">{viewLeave.employee?.employeeId}</span></div>
              <div><span className="text-gray-400 text-xs block">Leave Type</span><span className="font-medium">{leaveTypeLabel[viewLeave.leaveType] || viewLeave.leaveType}</span></div>
              <div><span className="text-gray-400 text-xs block">Days</span><span className="font-medium">{viewLeave.numberOfDays}</span></div>
              <div><span className="text-gray-400 text-xs block">From</span><span className="font-medium">{formatDate(viewLeave.fromDate)}</span></div>
              <div><span className="text-gray-400 text-xs block">To</span><span className="font-medium">{formatDate(viewLeave.toDate)}</span></div>
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

            {/* Approval timeline */}
            <ApprovalTimeline leave={viewLeave} isHR={!isSuperAdmin} isSA={isSuperAdmin} />

            {/* HR action buttons — only if at hr stage and user is HR with approve permission */}
            {!isSuperAdmin && canApproveHR && viewLeave.stage === 'hr' && (
              <div className="border-t pt-4 space-y-3">
                <div>
                  <label className="label">Comment (optional)</label>
                  <textarea className="input" rows={2} placeholder="Add a comment..." value={reviewComment} onChange={e => setReviewComment(e.target.value)} />
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={() => handleHRAction('approved')}
                    className="flex-1 flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-medium px-4 py-2 rounded-lg text-sm transition-colors"
                  >
                    <ArrowRight className="w-4 h-4" /> Approve & Forward
                  </button>
                  <button
                    onClick={() => handleHRAction('rejected')}
                    className="flex-1 flex items-center justify-center gap-2 bg-red-600 hover:bg-red-700 text-white font-medium px-4 py-2 rounded-lg text-sm transition-colors"
                  >
                    <XCircle className="w-4 h-4" /> Reject
                  </button>
                </div>
              </div>
            )}

            {/* Super admin action buttons — only if at super_admin stage */}
            {isSuperAdmin && viewLeave.stage === 'super_admin' && (
              <div className="border-t pt-4 space-y-3">
                <div>
                  <label className="label">Final Comment (optional)</label>
                  <textarea className="input" rows={2} placeholder="Add a comment..." value={reviewComment} onChange={e => setReviewComment(e.target.value)} />
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={() => handleSAAction('approved')}
                    className="flex-1 flex items-center justify-center gap-2 bg-green-600 hover:bg-green-700 text-white font-medium px-4 py-2 rounded-lg text-sm transition-colors"
                  >
                    <CheckCircle className="w-4 h-4" /> Final Approve
                  </button>
                  <button
                    onClick={() => handleSAAction('rejected')}
                    className="flex-1 flex items-center justify-center gap-2 bg-red-600 hover:bg-red-700 text-white font-medium px-4 py-2 rounded-lg text-sm transition-colors"
                  >
                    <XCircle className="w-4 h-4" /> Reject
                  </button>
                </div>
              </div>
            )}

            {/* Read-only states */}
            {!isSuperAdmin && !canApproveHR && viewLeave.stage === 'hr' && (
              <p className="text-xs text-gray-400 italic border-t pt-3">You have view-only access. Contact an HR admin with LEAVE_APPROVE permission.</p>
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
