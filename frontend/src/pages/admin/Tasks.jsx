import { useEffect, useState } from 'react';
import { getTasks, createTask, updateTask, deleteTask, getProjects, getEmployees } from '../../services/api';
import PageHeader from '../../components/PageHeader';
import Modal from '../../components/Modal';
import LoadingSpinner from '../../components/LoadingSpinner';
import { formatDate, statusColor, priorityColor, priorityDot } from '../../utils/helpers';
import toast from 'react-hot-toast';
import { Plus, Edit2, Trash2, Search, AlertCircle } from 'lucide-react';

const emptyForm = {
  title: '', description: '', project: '', assignedTo: '',
  priority: 'medium', dueDate: '', estimatedHours: ''
};

export default function Tasks() {
  const [tasks, setTasks] = useState([]);
  const [projects, setProjects] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editTask, setEditTask] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [filterStatus, setFilterStatus] = useState('');
  const [filterProject, setFilterProject] = useState('');
  const [search, setSearch] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const params = {};
      if (filterStatus) params.status = filterStatus;
      if (filterProject) params.project = filterProject;
      const [tRes, pRes, eRes] = await Promise.all([
        getTasks(params),
        getProjects(),
        getEmployees({ isActive: 'true' })
      ]);
      setTasks(tRes.data);
      setProjects(pRes.data);
      setEmployees(eRes.data);
    } catch { toast.error('Failed to load tasks'); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [filterStatus, filterProject]);

  const openAdd = () => { setEditTask(null); setForm(emptyForm); setShowModal(true); };
  const openEdit = (t) => {
    setEditTask(t);
    setForm({
      title: t.title, description: t.description || '',
      project: t.project?._id || t.project,
      assignedTo: t.assignedTo?._id || t.assignedTo,
      priority: t.priority, status: t.status,
      dueDate: t.dueDate ? t.dueDate.slice(0, 10) : '',
      estimatedHours: t.estimatedHours || ''
    });
    setShowModal(true);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (editTask) {
        await updateTask(editTask._id, form);
        toast.success('Task updated');
      } else {
        await createTask(form);
        toast.success('Task created');
      }
      setShowModal(false);
      load();
    } catch (err) { toast.error(err.response?.data?.message || 'Save failed'); }
    finally { setSaving(false); }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this task?')) return;
    try { await deleteTask(id); toast.success('Task deleted'); load(); }
    catch { toast.error('Delete failed'); }
  };

  const filtered = tasks.filter(t =>
    !search || t.title.toLowerCase().includes(search.toLowerCase())
  );

  const now = new Date();

  return (
    <div className="p-4 lg:p-8">
      <PageHeader
        title="Tasks"
        subtitle={`${tasks.length} tasks`}
        action={<button onClick={openAdd} className="btn-primary flex items-center gap-2"><Plus className="w-4 h-4" />New Task</button>}
      />

      <div className="card mb-4 lg:mb-6">
        <div className="flex flex-col sm:flex-row gap-3">
          <input className="input flex-1" placeholder="Search tasks..." value={search} onChange={e => setSearch(e.target.value)} />
          <select className="input sm:w-44" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
            <option value="">All Status</option>
            <option value="todo">Todo</option>
            <option value="in-progress">In Progress</option>
            <option value="review">Review</option>
            <option value="completed">Completed</option>
            <option value="cancelled">Cancelled</option>
          </select>
          <select className="input sm:w-44" value={filterProject} onChange={e => setFilterProject(e.target.value)}>
            <option value="">All Projects</option>
            {projects.map(p => <option key={p._id} value={p._id}>{p.name}</option>)}
          </select>
        </div>
      </div>

      {loading ? <LoadingSpinner /> : (
        <>
          {/* Mobile card list */}
          <div className="lg:hidden space-y-3">
            {filtered.length === 0 && (
              <div className="card text-center text-gray-400 py-10">No tasks found</div>
            )}
            {filtered.map(t => {
              const overdue = new Date(t.dueDate) < now && t.status !== 'completed' && t.status !== 'cancelled';
              return (
                <div key={t._id} className="card">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 mt-1 ${priorityDot(t.priority)}`} />
                      <div className="min-w-0">
                        <p className="font-medium text-gray-900 text-sm truncate">{t.title}</p>
                        <p className="text-xs text-gray-400 font-mono">{t.taskId}</p>
                      </div>
                    </div>
                    <div className="flex gap-1 flex-shrink-0">
                      <button onClick={() => openEdit(t)} className="p-1.5 rounded hover:bg-gray-100 text-gray-400 hover:text-blue-600"><Edit2 className="w-3.5 h-3.5" /></button>
                      <button onClick={() => handleDelete(t._id)} className="p-1.5 rounded hover:bg-gray-100 text-gray-400 hover:text-red-500"><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-1.5 text-xs text-gray-500 mb-2">
                    <div><span className="text-gray-400">Project: </span>{t.project?.name || '-'}</div>
                    <div><span className="text-gray-400">Assignee: </span>{t.assignedTo?.name || '-'}</div>
                    <div className="flex items-center gap-1">
                      {overdue && <AlertCircle className="w-3 h-3 text-red-500" />}
                      <span className={overdue ? 'text-red-500 font-medium' : ''}>Due: {formatDate(t.dueDate)}</span>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <span className={priorityColor(t.priority)}>{t.priority}</span>
                    <span className={statusColor(t.status)}>{t.status}</span>
                  </div>
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
                    <th className="text-left px-4 py-3 font-medium text-gray-500">Task</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-500">Project</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-500">Assigned To</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-500">Priority</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-500">Due Date</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-500">Status</th>
                    <th className="text-right px-4 py-3 font-medium text-gray-500">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 && (
                    <tr><td colSpan={7} className="text-center py-12 text-gray-400">No tasks found</td></tr>
                  )}
                  {filtered.map(t => {
                    const overdue = new Date(t.dueDate) < now && t.status !== 'completed' && t.status !== 'cancelled';
                    return (
                      <tr key={t._id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div className={`w-2 h-2 rounded-full flex-shrink-0 ${priorityDot(t.priority)}`} />
                            <div>
                              <p className="font-medium text-gray-900">{t.title}</p>
                              <p className="text-xs text-gray-400 font-mono">{t.taskId}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-gray-600">{t.project?.name || '-'}</td>
                        <td className="px-4 py-3">
                          <div>
                            <p className="text-gray-700">{t.assignedTo?.name}</p>
                            <p className="text-xs text-gray-400">{t.assignedTo?.employeeId}</p>
                          </div>
                        </td>
                        <td className="px-4 py-3"><span className={priorityColor(t.priority)}>{t.priority}</span></td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1">
                            {overdue && <AlertCircle className="w-3.5 h-3.5 text-red-500" />}
                            <span className={overdue ? 'text-red-500 font-medium' : 'text-gray-600'}>{formatDate(t.dueDate)}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3"><span className={statusColor(t.status)}>{t.status}</span></td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-1">
                            <button onClick={() => openEdit(t)} className="p-1.5 rounded hover:bg-gray-100 text-gray-400 hover:text-blue-600"><Edit2 className="w-4 h-4" /></button>
                            <button onClick={() => handleDelete(t._id)} className="p-1.5 rounded hover:bg-gray-100 text-gray-400 hover:text-red-500"><Trash2 className="w-4 h-4" /></button>
                          </div>
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

      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title={editTask ? 'Edit Task' : 'New Task'} size="lg">
        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <label className="label">Task Title *</label>
            <input className="input" required value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="label">Project *</label>
              <select className="input" required value={form.project} onChange={e => setForm({ ...form, project: e.target.value })}>
                <option value="">Select Project</option>
                {projects.map(p => <option key={p._id} value={p._id}>{p.name}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Assign To *</label>
              <select className="input" required value={form.assignedTo} onChange={e => setForm({ ...form, assignedTo: e.target.value })}>
                <option value="">Select Employee</option>
                {employees.map(e => <option key={e._id} value={e._id}>{e.name} ({e.employeeId})</option>)}
              </select>
            </div>
            <div>
              <label className="label">Priority</label>
              <select className="input" value={form.priority} onChange={e => setForm({ ...form, priority: e.target.value })}>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="critical">Critical</option>
              </select>
            </div>
            <div>
              <label className="label">Due Date *</label>
              <input type="date" className="input" required value={form.dueDate} onChange={e => setForm({ ...form, dueDate: e.target.value })} />
            </div>
            <div>
              <label className="label">Estimated Hours</label>
              <input type="number" className="input" min="0" value={form.estimatedHours} onChange={e => setForm({ ...form, estimatedHours: e.target.value })} />
            </div>
            {editTask && (
              <div>
                <label className="label">Status</label>
                <select className="input" value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}>
                  <option value="todo">Todo</option>
                  <option value="in-progress">In Progress</option>
                  <option value="review">Review</option>
                  <option value="completed">Completed</option>
                  <option value="cancelled">Cancelled</option>
                </select>
              </div>
            )}
          </div>
          <div>
            <label className="label">Description</label>
            <textarea className="input" rows={3} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => setShowModal(false)} className="btn-secondary">Cancel</button>
            <button type="submit" disabled={saving} className="btn-primary">{saving ? 'Saving...' : editTask ? 'Update' : 'Create Task'}</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}


