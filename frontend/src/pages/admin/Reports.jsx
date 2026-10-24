import { useEffect, useState } from 'react';
import { getReports, getMissingReports, reviewReport, getEmployees } from '../../services/api';
import PageHeader from '../../components/PageHeader';
import Modal from '../../components/Modal';
import LoadingSpinner from '../../components/LoadingSpinner';
import { formatDate, formatDateTime } from '../../utils/helpers';
import toast from 'react-hot-toast';
import { Eye, CheckCircle, AlertTriangle, Clock, Search, MessageSquare } from 'lucide-react';

export default function Reports() {
  const [reports, setReports] = useState([]);
  const [missing, setMissing] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('all');
  const [viewReport, setViewReport] = useState(null);
  const [reviewComment, setReviewComment] = useState('');
  const [filterEmp, setFilterEmp] = useState('');
  const [filterDate, setFilterDate] = useState('');
  const [search, setSearch] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const params = {};
      if (filterEmp) params.employeeId = filterEmp;
      if (filterDate) params.date = filterDate;
      const [rRes, mRes, eRes] = await Promise.all([
        getReports(params),
        getMissingReports(),
        getEmployees({ isActive: 'true' }),
      ]);
      setReports(rRes.data);
      setMissing(mRes.data);
      setEmployees(eRes.data);
    } catch { toast.error('Failed to load'); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [filterEmp, filterDate]);

  const handleReview = async () => {
    try {
      await reviewReport(viewReport._id, { comment: reviewComment });
      toast.success('Report reviewed');
      setViewReport(null);
      setReviewComment('');
      load();
    } catch { toast.error('Review failed'); }
  };

  const filtered = reports.filter(r =>
    !search ||
    r.employee?.name?.toLowerCase().includes(search.toLowerCase()) ||
    r.project?.name?.toLowerCase().includes(search.toLowerCase())
  );

  const statusBadge = (status) => {
    if (status === 'completed') return 'badge-green';
    if (status === 'blocked') return 'badge-red';
    if (status === 'in-progress') return 'badge-blue';
    return 'badge-yellow';
  };

  return (
    <div className="p-4 lg:p-8">
      <PageHeader title="Daily Reports" subtitle="Employee work reports" />

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-gray-100 p-1 rounded-lg w-full sm:w-fit overflow-x-auto">
        {['all', 'missing'].map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`flex-1 sm:flex-none px-3 py-2 rounded-md text-sm font-medium transition-colors whitespace-nowrap ${
              tab === t ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'
            }`}>
            {t === 'all' ? `All Reports (${reports.length})` : `Missing Today (${missing.length})`}
          </button>
        ))}
      </div>

      {tab === 'missing' ? (
        <div className="card">
          <div className="flex items-center gap-2 mb-4">
            <AlertTriangle className="w-5 h-5 text-orange-500 flex-shrink-0" />
            <h3 className="font-semibold text-gray-900 text-sm lg:text-base">Employees who haven't submitted today's report</h3>
          </div>
          {missing.length === 0 ? (
            <div className="flex items-center gap-2 text-green-600">
              <CheckCircle className="w-5 h-5" />
              <span className="text-sm">All employees have submitted today's report!</span>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {missing.map(e => (
                <div key={e._id} className="flex items-center gap-3 p-3 bg-orange-50 rounded-lg border border-orange-100">
                  <AlertTriangle className="w-4 h-4 text-orange-500 flex-shrink-0" />
                  <div className="min-w-0">
                    <p className="font-medium text-gray-900 text-sm truncate">{e.name}</p>
                    <p className="text-xs text-gray-500 truncate">{e.employeeId} · {e.department}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <>
          {/* Filters */}
          <div className="card mb-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <input className="input sm:col-span-1" placeholder="Search employee or project..." value={search} onChange={e => setSearch(e.target.value)} />
              <select className="input" value={filterEmp} onChange={e => setFilterEmp(e.target.value)}>
                <option value="">All Employees</option>
                {employees.map(e => <option key={e._id} value={e._id}>{e.name}</option>)}
              </select>
              <input type="date" className="input" value={filterDate} onChange={e => setFilterDate(e.target.value)} />
            </div>
          </div>

          {loading ? <LoadingSpinner /> : (
            <>
              {/* Mobile card list */}
              <div className="lg:hidden space-y-3">
                {filtered.length === 0 && <div className="card text-center text-gray-400 py-10">No reports found</div>}
                {filtered.map(r => (
                  <div key={r._id} className="card">
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="min-w-0">
                        <p className="font-semibold text-gray-900">{r.employee?.name}</p>
                        <p className="text-xs text-gray-400">{r.employee?.employeeId}</p>
                      </div>
                      <button
                        onClick={() => { setViewReport(r); setReviewComment(r.adminReview?.comment || ''); }}
                        className="p-2 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-blue-600 flex-shrink-0"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                    </div>
                    <div className="grid grid-cols-2 gap-1.5 text-xs text-gray-500 mb-2">
                      <div><span className="text-gray-400">Project: </span><span className="font-medium text-gray-700">{r.project?.name}</span></div>
                      <div><span className="text-gray-400">Date: </span>{formatDate(r.date)}</div>
                      <div><span className="text-gray-400">Hours: </span><span className="font-semibold text-gray-900">{r.hoursWorked}h</span></div>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={statusBadge(r.status)}>{r.status}</span>
                      {r.adminReview?.reviewed
                        ? <span className="badge-green">Reviewed</span>
                        : <span className="badge-yellow flex items-center gap-1"><Clock className="w-3 h-3" />Pending</span>
                      }
                      {r.adminReview?.reviewed && r.employeeReply?.comment && (
                        <span className="badge-purple flex items-center gap-1"><MessageSquare className="w-3 h-3" />Replied</span>
                      )}
                    </div>
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
                        <th className="text-left px-4 py-3 font-medium text-gray-500">Project</th>
                        <th className="text-left px-4 py-3 font-medium text-gray-500">Date</th>
                        <th className="text-left px-4 py-3 font-medium text-gray-500">Hours</th>
                        <th className="text-left px-4 py-3 font-medium text-gray-500">Status</th>
                        <th className="text-left px-4 py-3 font-medium text-gray-500">Reviewed</th>
                        <th className="text-right px-4 py-3 font-medium text-gray-500">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.length === 0 && <tr><td colSpan={7} className="text-center py-12 text-gray-400">No reports found</td></tr>}
                      {filtered.map(r => (
                        <tr key={r._id} className="border-b border-gray-50 hover:bg-gray-50">
                          <td className="px-4 py-3">
                            <p className="font-medium text-gray-900">{r.employee?.name}</p>
                            <p className="text-xs text-gray-400">{r.employee?.employeeId}</p>
                          </td>
                          <td className="px-4 py-3 text-gray-600">{r.project?.name}</td>
                          <td className="px-4 py-3 text-gray-600">{formatDate(r.date)}</td>
                          <td className="px-4 py-3 font-medium text-gray-900">{r.hoursWorked}h</td>
                          <td className="px-4 py-3"><span className={statusBadge(r.status)}>{r.status}</span></td>
                          <td className="px-4 py-3">
                            {r.adminReview?.reviewed
                              ? <div className="flex flex-col gap-1">
                                  <span className="badge-green w-fit">Reviewed</span>
                                  {r.employeeReply?.comment && (
                                    <span className="badge-purple flex items-center gap-1 w-fit"><MessageSquare className="w-3 h-3" />Replied</span>
                                  )}
                                </div>
                              : <span className="badge-yellow flex items-center gap-1 w-fit"><Clock className="w-3 h-3" />Pending</span>}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <button onClick={() => { setViewReport(r); setReviewComment(r.adminReview?.comment || ''); }} className="p-1.5 rounded hover:bg-gray-100 text-gray-400 hover:text-blue-600">
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
        </>
      )}

      {/* View/Review Modal */}
      <Modal isOpen={!!viewReport} onClose={() => setViewReport(null)} title="Daily Report Detail" size="lg">
        {viewReport && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div><span className="text-gray-400 text-xs block">Employee</span><span className="font-medium">{viewReport.employee?.name}</span></div>
              <div><span className="text-gray-400 text-xs block">Date</span><span className="font-medium">{formatDate(viewReport.date)}</span></div>
              <div><span className="text-gray-400 text-xs block">Project</span><span className="font-medium">{viewReport.project?.name}</span></div>
              <div><span className="text-gray-400 text-xs block">Hours Worked</span><span className="font-medium">{viewReport.hoursWorked}h</span></div>
              <div><span className="text-gray-400 text-xs block">Status</span><span className="font-medium capitalize">{viewReport.status}</span></div>
            </div>
            <div className="border-t pt-3">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Work Done</p>
              <p className="text-sm text-gray-700 bg-gray-50 rounded-lg p-3 whitespace-pre-wrap">{viewReport.workDescription}</p>
            </div>
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Blockers</p>
              <p className="text-sm text-gray-700 bg-gray-50 rounded-lg p-3">{viewReport.blockers || 'None'}</p>
            </div>
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Next Day Plan</p>
              <p className="text-sm text-gray-700 bg-gray-50 rounded-lg p-3 whitespace-pre-wrap">{viewReport.nextDayPlan}</p>
            </div>
            <div className="border-t pt-3">
              <label className="label">Admin Review Comment</label>
              <textarea className="input" rows={3} placeholder="Add a review comment..." value={reviewComment} onChange={e => setReviewComment(e.target.value)} />
              {viewReport.adminReview?.reviewed && (
                <p className="text-xs text-gray-400 mt-1">Last reviewed: {formatDateTime(viewReport.adminReview.reviewedAt)}</p>
              )}
            </div>

            {/* Employee reply — shown after review exists */}
            {viewReport.adminReview?.reviewed && viewReport.employeeReply?.comment && (
              <div className="bg-green-50 border border-green-100 rounded-xl p-4">
                <p className="text-xs font-semibold text-green-600 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <MessageSquare className="w-3.5 h-3.5" />
                  Employee Reply
                </p>
                <p className="text-sm text-gray-700 whitespace-pre-wrap bg-white rounded-lg p-3 border border-green-100">
                  {viewReport.employeeReply.comment}
                </p>
                <p className="text-xs text-gray-400 mt-1.5">
                  Replied at: {formatDateTime(viewReport.employeeReply.repliedAt)}
                </p>
              </div>
            )}
            {viewReport.adminReview?.reviewed && !viewReport.employeeReply?.comment && (
              <p className="text-xs text-gray-400 italic">Employee has not replied yet.</p>
            )}

            <div className="flex flex-col sm:flex-row justify-end gap-3">
              <button onClick={() => setViewReport(null)} className="btn-secondary">Close</button>
              <button onClick={handleReview} className="btn-primary flex items-center justify-center gap-2">
                <CheckCircle className="w-4 h-4" />
                {viewReport.adminReview?.reviewed ? 'Update Review' : 'Mark as Reviewed'}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
