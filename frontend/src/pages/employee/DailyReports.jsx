import { useEffect, useState } from 'react';
import { getReports, createReport, updateReport, getProjects, getTasks, replyToReview } from '../../services/api';
import PageHeader from '../../components/PageHeader';
import Modal from '../../components/Modal';
import LoadingSpinner from '../../components/LoadingSpinner';
import { formatDate, formatDateTime } from '../../utils/helpers';
import toast from 'react-hot-toast';
import { Plus, Edit2, Eye, CheckCircle, Clock, AlertCircle, MessageSquare, Send } from 'lucide-react';

const emptyForm = {
  project: '', workDescription: '', hoursWorked: '',
  status: 'in-progress', blockers: '', nextDayPlan: '',
  tasksCompleted: [], date: new Date().toISOString().slice(0, 10)
};

export default function DailyReports() {
  const [reports, setReports] = useState([]);
  const [projects, setProjects] = useState([]);
  const [myTasks, setMyTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [viewModal, setViewModal] = useState(null);
  const [editReport, setEditReport] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [replying, setReplying] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [rRes, pRes, tRes] = await Promise.all([
        getReports(),
        getProjects(),
        getTasks({ status: 'in-progress' })
      ]);
      setReports(rRes.data);
      setProjects(pRes.data);
      setMyTasks(tRes.data);
    } catch { toast.error('Failed to load'); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const openAdd = () => {
    setEditReport(null);
    // Always lock new reports to today
    setForm({ ...emptyForm, date: new Date().toISOString().slice(0, 10) });
    setShowModal(true);
  };

  const openEdit = (r) => {
    setEditReport(r);
    setForm({
      project: r.project?._id || r.project,
      workDescription: r.workDescription,
      hoursWorked: r.hoursWorked,
      status: r.status,
      blockers: r.blockers || '',
      nextDayPlan: r.nextDayPlan,
      tasksCompleted: r.tasksCompleted?.map(tc => tc.task?._id || tc.task) || [],
      date: r.date ? r.date.slice(0, 10) : new Date().toISOString().slice(0, 10)
    });
    setShowModal(true);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        ...form,
        hoursWorked: parseFloat(form.hoursWorked),
        tasksCompleted: form.tasksCompleted.map(id => ({ task: id }))
      };
      if (editReport) {
        await updateReport(editReport._id, payload);
        toast.success('Report updated');
      } else {
        await createReport(payload);
        toast.success('Report submitted successfully!');
      }
      setShowModal(false);
      load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to submit report');
    } finally { setSaving(false); }
  };

  const handleReply = async () => {
    if (!replyText.trim()) return;
    setReplying(true);
    try {
      await replyToReview(viewModal._id, { comment: replyText.trim() });
      toast.success('Reply submitted');
      setReplyText('');
      // Update the local viewModal state so it reflects immediately
      setViewModal(prev => ({
        ...prev,
        employeeReply: { comment: replyText.trim(), repliedAt: new Date().toISOString() }
      }));
      load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to submit reply');
    } finally {
      setReplying(false);
    }
  };

  const toggleTask = (taskId) => {    setForm(prev => ({
      ...prev,
      tasksCompleted: prev.tasksCompleted.includes(taskId)
        ? prev.tasksCompleted.filter(id => id !== taskId)
        : [...prev.tasksCompleted, taskId]
    }));
  };

  // Check today's submission
  const today = new Date().toISOString().slice(0, 10);
  const todayReport = reports.find(r => r.date?.slice(0, 10) === today);

  return (
    <div className="p-4 lg:p-8">
      <PageHeader
        title="Daily Reports"
        subtitle="Submit your daily work report"
        action={
          <button onClick={openAdd} className="btn-primary flex items-center gap-2">
            <Plus className="w-4 h-4" /> Submit Report
          </button>
        }
      />

      {/* Today status banner */}
      <div className={`flex flex-col sm:flex-row items-start sm:items-center gap-3 p-4 rounded-xl mb-4 lg:mb-6 ${todayReport ? 'bg-green-50 border border-green-200' : 'bg-orange-50 border border-orange-200'}`}>
        {todayReport ? (
          <>
            <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0" />
            <div>
              <p className="font-medium text-green-800 text-sm">Today's report submitted ✓</p>
              <p className="text-xs text-green-600">{todayReport.project?.name} · {todayReport.hoursWorked}h worked</p>
            </div>
          </>
        ) : (
          <>
            <AlertCircle className="w-5 h-5 text-orange-500 flex-shrink-0" />
            <div className="flex-1">
              <p className="font-medium text-orange-800 text-sm">No report submitted for today</p>
              <p className="text-xs text-orange-600">Please submit your daily report before end of day.</p>
            </div>
            <button onClick={openAdd} className="btn-primary text-sm self-start sm:self-auto flex-shrink-0">Submit Now</button>
          </>
        )}
      </div>

      {loading ? <LoadingSpinner /> : (
        <div className="space-y-3">
          {reports.length === 0 && (
            <div className="card text-center py-16 text-gray-400">No reports submitted yet</div>
          )}
          {reports.map(r => (
            <div key={r._id} className="card hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2 mb-1.5">
                    <p className="font-semibold text-gray-900 text-sm">{formatDate(r.date)}</p>
                    <span className={`badge-${r.status === 'completed' ? 'green' : r.status === 'blocked' ? 'red' : r.status === 'in-progress' ? 'blue' : 'yellow'}`}>
                      {r.status}
                    </span>
                    {r.adminReview?.reviewed
                      ? <span className="badge-green flex items-center gap-1"><CheckCircle className="w-3 h-3" />Reviewed</span>
                      : <span className="badge-yellow flex items-center gap-1"><Clock className="w-3 h-3" />Pending</span>
                    }
                  </div>
                  <p className="text-sm text-gray-600 mb-1">
                    <span className="font-medium">{r.project?.name}</span> · {r.hoursWorked}h worked
                  </p>
                  <p className="text-xs text-gray-500 line-clamp-1">{r.workDescription}</p>
                  {r.blockers && r.blockers !== 'None' && (
                    <p className="text-xs text-red-500 mt-1">🚫 {r.blockers}</p>
                  )}
                  {r.adminReview?.reviewed && r.adminReview?.comment && (
                    <p className="text-xs text-blue-600 mt-1 bg-blue-50 rounded px-2 py-1 line-clamp-1">
                      💬 {r.adminReview.comment}
                    </p>
                  )}
                </div>
                <div className="flex gap-1 flex-shrink-0">
                  <button onClick={() => { setViewModal(r); setReplyText(r.employeeReply?.comment || ''); }} className="p-1.5 rounded hover:bg-gray-100 text-gray-400 hover:text-blue-600">
                    <Eye className="w-4 h-4" />
                  </button>
                  {!r.adminReview?.reviewed && (
                    <button onClick={() => openEdit(r)} className="p-1.5 rounded hover:bg-gray-100 text-gray-400 hover:text-blue-600">
                      <Edit2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Submit/Edit Modal */}
      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title={editReport ? 'Edit Report' : 'Submit Today\'s Report'} size="lg">
        <form onSubmit={handleSave} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="label">Date</label>
              {editReport ? (
                /* Editing an existing report — show its original date (read-only) */
                <div className="input bg-gray-50 text-gray-500 cursor-not-allowed">
                  {formatDate(form.date)}
                </div>
              ) : (
                /* New report — always today, not editable */
                <div className="input bg-gray-50 text-gray-600 font-medium">
                  Today — {formatDate(form.date)}
                </div>
              )}
            </div>
            <div>
              <label className="label">Project *</label>
              <select className="input" required value={form.project} onChange={e => setForm({ ...form, project: e.target.value })}>
                <option value="">Select Project</option>
                {projects.map(p => <option key={p._id} value={p._id}>{p.name}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Hours Worked *</label>
              <input type="number" className="input" required min="0.5" max="24" step="0.5" value={form.hoursWorked} onChange={e => setForm({ ...form, hoursWorked: e.target.value })} placeholder="e.g. 8" />
            </div>
            <div>
              <label className="label">Status</label>
              <select className="input" value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}>
                <option value="in-progress">In Progress</option>
                <option value="completed">Completed</option>
                <option value="blocked">Blocked</option>
                <option value="pending">Pending</option>
              </select>
            </div>
          </div>

          <div>
            <label className="label">Work Done Today *</label>
            <textarea className="input" rows={4} required placeholder="Describe what you worked on today in detail..." value={form.workDescription} onChange={e => setForm({ ...form, workDescription: e.target.value })} />
          </div>

          {/* Tasks completed */}
          {myTasks.length > 0 && (
            <div>
              <label className="label">Tasks Completed Today</label>
              <div className="border border-gray-200 rounded-lg p-3 max-h-40 overflow-y-auto space-y-2">
                {myTasks.map(t => (
                  <label key={t._id} className="flex items-center gap-2 cursor-pointer hover:bg-gray-50 p-1 rounded">
                    <input
                      type="checkbox"
                      checked={form.tasksCompleted.includes(t._id)}
                      onChange={() => toggleTask(t._id)}
                      className="rounded"
                    />
                    <span className="text-sm">{t.title}</span>
                    <span className="text-xs text-gray-400">{t.project?.name}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          <div>
            <label className="label">Blockers / Issues</label>
            <textarea className="input" rows={2} placeholder="Any blockers or issues? (or type 'None')" value={form.blockers} onChange={e => setForm({ ...form, blockers: e.target.value })} />
          </div>

          <div>
            <label className="label">Next Day Plan *</label>
            <textarea className="input" rows={3} required placeholder="What do you plan to work on tomorrow?" value={form.nextDayPlan} onChange={e => setForm({ ...form, nextDayPlan: e.target.value })} />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => setShowModal(false)} className="btn-secondary">Cancel</button>
            <button type="submit" disabled={saving} className="btn-primary">
              {saving ? 'Submitting...' : editReport ? 'Update Report' : 'Submit Report'}
            </button>
          </div>
        </form>
      </Modal>

      {/* View Modal */}
      <Modal isOpen={!!viewModal} onClose={() => setViewModal(null)} title="Report Details" size="lg">
        {viewModal && (
          <div className="space-y-4 text-sm">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div><span className="text-gray-400">Date:</span> <strong>{formatDate(viewModal.date)}</strong></div>
              <div><span className="text-gray-400">Project:</span> <strong>{viewModal.project?.name}</strong></div>
              <div><span className="text-gray-400">Hours Worked:</span> <strong>{viewModal.hoursWorked}h</strong></div>
              <div><span className="text-gray-400">Status:</span> <strong className="capitalize">{viewModal.status}</strong></div>
            </div>
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Work Done</p>
              <p className="bg-gray-50 rounded-lg p-3 text-gray-700 whitespace-pre-wrap">{viewModal.workDescription}</p>
            </div>
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Blockers</p>
              <p className="bg-gray-50 rounded-lg p-3 text-gray-700">{viewModal.blockers || 'None'}</p>
            </div>
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Next Day Plan</p>
              <p className="bg-gray-50 rounded-lg p-3 text-gray-700 whitespace-pre-wrap">{viewModal.nextDayPlan}</p>
            </div>
            {viewModal.adminReview?.reviewed && (
              <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 space-y-3">
                {/* Admin review */}
                <div>
                  <p className="text-xs font-semibold text-blue-500 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                    <CheckCircle className="w-3.5 h-3.5" /> Admin Review
                  </p>
                  <p className="text-blue-800 text-sm bg-blue-100/60 rounded-lg p-3 whitespace-pre-wrap">
                    {viewModal.adminReview.comment || 'Reviewed without comment.'}
                  </p>
                  <p className="text-xs text-blue-400 mt-1">
                    {formatDateTime(viewModal.adminReview.reviewedAt)}
                  </p>
                </div>

                {/* Existing reply */}
                {viewModal.employeeReply?.comment ? (
                  <div>
                    <p className="text-xs font-semibold text-green-600 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                      <MessageSquare className="w-3.5 h-3.5" /> Your Reply
                    </p>
                    <p className="text-gray-700 text-sm bg-white rounded-lg p-3 border border-green-100 whitespace-pre-wrap">
                      {viewModal.employeeReply.comment}
                    </p>
                    <p className="text-xs text-gray-400 mt-1">
                      {formatDateTime(viewModal.employeeReply.repliedAt)}
                    </p>
                    <p className="text-xs text-gray-400 mt-2 italic">You've already replied to this review.</p>
                  </div>
                ) : (
                  /* Reply box */
                  <div>
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                      <MessageSquare className="w-3.5 h-3.5" /> Reply to Admin
                    </p>
                    <textarea
                      className="input text-sm"
                      rows={3}
                      placeholder="Write your reply to the admin's review..."
                      value={replyText}
                      onChange={e => setReplyText(e.target.value)}
                    />
                    <div className="flex justify-end mt-2">
                      <button
                        onClick={handleReply}
                        disabled={replying || !replyText.trim()}
                        className="btn-primary flex items-center gap-2 text-sm"
                      >
                        <Send className="w-3.5 h-3.5" />
                        {replying ? 'Sending...' : 'Send Reply'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
            {!viewModal.adminReview?.reviewed && (
              <div className="flex items-center gap-2 bg-yellow-50 border border-yellow-100 rounded-xl p-3 text-sm text-yellow-700">
                <Clock className="w-4 h-4 flex-shrink-0" />
                Waiting for admin to review this report.
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


