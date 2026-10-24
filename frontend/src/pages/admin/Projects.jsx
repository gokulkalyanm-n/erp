import { useEffect, useState, useMemo } from 'react';
import { getProjects, createProject, updateProject, deleteProject, getEmployees } from '../../services/api';
import PageHeader from '../../components/PageHeader';
import Modal from '../../components/Modal';
import LoadingSpinner from '../../components/LoadingSpinner';
import { formatDate, statusColor, priorityColor } from '../../utils/helpers';
import toast from 'react-hot-toast';
import { Plus, Edit2, Trash2, Users, Calendar, X } from 'lucide-react';

const emptyForm = {
  name: '', description: '', client: '', department: '',
  startDate: '', deadline: '', priority: 'medium', status: 'planning',
  assignedEmployees: []
};

export default function Projects() {
  const [projects, setProjects] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editProject, setEditProject] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterEmployee, setFilterEmployee] = useState('');
  const [filterMonth, setFilterMonth] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const params = {};
      if (search) params.search = search;
      if (filterStatus) params.status = filterStatus;
      const [pRes, eRes] = await Promise.all([getProjects(params), getEmployees({ isActive: 'true' })]);
      setProjects(pRes.data);
      setEmployees(eRes.data);
    } catch { toast.error('Failed to load'); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [search, filterStatus]);

  // Client-side filter by employee and month
  const filteredProjects = useMemo(() => {
    return projects.filter(p => {
      if (filterEmployee && !p.assignedEmployees?.some(ae =>
        (ae.employee?._id || ae.employee) === filterEmployee
      )) return false;
      if (filterMonth !== '') {
        const deadline = p.deadline ? new Date(p.deadline).getMonth() : null;
        if (deadline !== +filterMonth) return false;
      }
      return true;
    });
  }, [projects, filterEmployee, filterMonth]);

  const activeFiltersCount = [filterStatus, filterEmployee, filterMonth !== '' ? filterMonth : ''].filter(Boolean).length;

  const openAdd = () => { setEditProject(null); setForm(emptyForm); setShowModal(true); };
  const openEdit = (p) => {
    setEditProject(p);
    setForm({
      name: p.name, description: p.description || '', client: p.client || '',
      department: p.department || '',
      startDate: p.startDate ? p.startDate.slice(0, 10) : '',
      deadline: p.deadline ? p.deadline.slice(0, 10) : '',
      priority: p.priority, status: p.status,
      assignedEmployees: p.assignedEmployees?.map(ae => ({ employee: ae.employee?._id || ae.employee, role: ae.role })) || []
    });
    setShowModal(true);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (editProject) {
        await updateProject(editProject._id, form);
        toast.success('Project updated');
      } else {
        await createProject(form);
        toast.success('Project created');
      }
      setShowModal(false);
      load();
    } catch (err) { toast.error(err.response?.data?.message || 'Save failed'); }
    finally { setSaving(false); }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this project and all its tasks?')) return;
    try {
      await deleteProject(id);
      toast.success('Project deleted');
      load();
    } catch { toast.error('Delete failed'); }
  };

  const toggleEmployee = (empId) => {
    const exists = form.assignedEmployees.find(ae => ae.employee === empId);
    if (exists) {
      setForm({ ...form, assignedEmployees: form.assignedEmployees.filter(ae => ae.employee !== empId) });
    } else {
      setForm({ ...form, assignedEmployees: [...form.assignedEmployees, { employee: empId, role: 'member' }] });
    }
  };

  return (
    <div className="p-4 lg:p-8">
      <PageHeader
        title="Projects"
        subtitle={filterEmployee
          ? `${filteredProjects.length} of ${projects.length} projects`
          : `${projects.length} projects`
        }
        action={<button onClick={openAdd} className="btn-primary flex items-center gap-2"><Plus className="w-4 h-4" />New Project</button>}
      />

      <div className="card mb-4 lg:mb-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
          <input
            className="input sm:col-span-2 xl:col-span-1"
            placeholder="Search projects..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          {/* Status */}
          <select className="input" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
            <option value="">All Status</option>
            <option value="planning">Planning</option>
            <option value="active">Active</option>
            <option value="on-hold">On Hold</option>
            <option value="completed">Completed</option>
            <option value="cancelled">Cancelled</option>
          </select>

          {/* Employee */}
          <select className="input" value={filterEmployee} onChange={e => setFilterEmployee(e.target.value)}>
            <option value="">All Employees</option>
            {employees.map(emp => (
              <option key={emp._id} value={emp._id}>
                {emp.name}{emp.employeeId ? ` (${emp.employeeId})` : ''}
              </option>
            ))}
          </select>

          {/* Month */}
          <select className="input" value={filterMonth} onChange={e => setFilterMonth(e.target.value)}>
            <option value="">All Months</option>
            <option value="0">January</option>
            <option value="1">February</option>
            <option value="2">March</option>
            <option value="3">April</option>
            <option value="4">May</option>
            <option value="5">June</option>
            <option value="6">July</option>
            <option value="7">August</option>
            <option value="8">September</option>
            <option value="9">October</option>
            <option value="10">November</option>
            <option value="11">December</option>
          </select>
        </div>

        {/* Active filter chips */}
        {activeFiltersCount > 0 && (
          <div className="flex items-center gap-2 mt-3 pt-3 border-t border-gray-100">
            <span className="text-xs text-gray-400">Active filters:</span>
            {filterStatus && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 text-xs font-medium">
                {filterStatus}
                <button onClick={() => setFilterStatus('')} className="hover:text-blue-900"><X className="w-3 h-3" /></button>
              </span>
            )}
            {filterEmployee && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-purple-50 text-purple-700 text-xs font-medium">
                {employees.find(e => e._id === filterEmployee)?.name || 'Employee'}
                <button onClick={() => setFilterEmployee('')} className="hover:text-purple-900"><X className="w-3 h-3" /></button>
              </span>
            )}
            {filterMonth !== '' && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-50 text-green-700 text-xs font-medium">
                {['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][+filterMonth]}
                <button onClick={() => setFilterMonth('')} className="hover:text-green-900"><X className="w-3 h-3" /></button>
              </span>
            )}
            <button
              onClick={() => { setFilterStatus(''); setFilterEmployee(''); setFilterMonth(''); }}
              className="ml-auto text-xs text-gray-400 hover:text-red-500 transition-colors"
            >
              Clear all
            </button>
          </div>
        )}
      </div>

      {loading ? <LoadingSpinner /> : (
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
          {filteredProjects.length === 0 && (
            <div className="col-span-3 card text-center text-gray-400 py-12">No projects found</div>
          )}
          {filteredProjects.map(p => (
            <div key={p._id} className="card hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between mb-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-mono text-xs text-blue-600">{p.projectId}</span>
                    <span className={priorityColor(p.priority)}>{p.priority}</span>
                  </div>
                  <h3 className="font-semibold text-gray-900 truncate">{p.name}</h3>
                  {p.client && <p className="text-xs text-gray-400 mt-0.5">Client: {p.client}</p>}
                </div>
                <div className="flex gap-1 ml-2">
                  <button onClick={() => openEdit(p)} className="p-1.5 rounded hover:bg-gray-100 text-gray-400 hover:text-blue-600"><Edit2 className="w-3.5 h-3.5" /></button>
                  <button onClick={() => handleDelete(p._id)} className="p-1.5 rounded hover:bg-gray-100 text-gray-400 hover:text-red-500"><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
              </div>

              {p.description && <p className="text-sm text-gray-500 mb-3 line-clamp-2">{p.description}</p>}

              <div className="mb-3">
                <div className="flex justify-between text-xs text-gray-400 mb-1">
                  <span>Progress</span><span>{p.completionPercentage}%</span>
                </div>
                <div className="w-full bg-gray-100 rounded-full h-1.5">
                  <div className="bg-blue-500 h-1.5 rounded-full transition-all" style={{ width: `${p.completionPercentage}%` }} />
                </div>
              </div>

              <div className="flex items-center justify-between text-xs text-gray-500 mb-3">
                <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />Deadline: {formatDate(p.deadline)}</span>
                <span className="flex items-center gap-1"><Users className="w-3 h-3" />{p.assignedEmployees?.length || 0} members</span>
              </div>

              <div className="flex items-center justify-between">
                <span className={statusColor(p.status)}>{p.status}</span>
                <div className="flex -space-x-1">
                  {p.assignedEmployees?.slice(0, 4).map(ae => (
                    <div key={ae._id} className="w-6 h-6 rounded-full bg-blue-500 flex items-center justify-center text-white text-xs border border-white" title={ae.employee?.name}>
                      {ae.employee?.name?.[0] || '?'}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add/Edit Modal */}
      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title={editProject ? 'Edit Project' : 'New Project'} size="xl">
        <form onSubmit={handleSave} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className="label">Project Name *</label>
              <input className="input" required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
            </div>
            <div>
              <label className="label">Client</label>
              <input className="input" value={form.client} onChange={e => setForm({ ...form, client: e.target.value })} />
            </div>
            <div>
              <label className="label">Department</label>
              <input className="input" value={form.department} onChange={e => setForm({ ...form, department: e.target.value })} />
            </div>
            <div>
              <label className="label">Start Date *</label>
              <input type="date" className="input" required value={form.startDate} onChange={e => setForm({ ...form, startDate: e.target.value })} />
            </div>
            <div>
              <label className="label">Deadline *</label>
              <input type="date" className="input" required value={form.deadline} onChange={e => setForm({ ...form, deadline: e.target.value })} />
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
              <label className="label">Status</label>
              <select className="input" value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}>
                <option value="planning">Planning</option>
                <option value="active">Active</option>
                <option value="on-hold">On Hold</option>
                <option value="completed">Completed</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>
          </div>
          <div>
            <label className="label">Description</label>
            <textarea className="input" rows={3} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />
          </div>

          {/* Assign Employees */}
          <div>
            <label className="label">Assign Employees</label>
            <div className="border border-gray-200 rounded-lg p-3 max-h-48 overflow-y-auto space-y-2">
              {employees.map(emp => {
                const assigned = form.assignedEmployees.find(ae => ae.employee === emp._id);
                return (
                  <label key={emp._id} className="flex items-center justify-between cursor-pointer hover:bg-gray-50 px-2 py-1 rounded">
                    <div className="flex items-center gap-2">
                      <input type="checkbox" checked={!!assigned} onChange={() => toggleEmployee(emp._id)} className="rounded" />
                      <span className="text-sm">{emp.name}</span>
                      <span className="text-xs text-gray-400">{emp.employeeId}</span>
                    </div>
                    {assigned && (
                      <select
                        className="text-xs border border-gray-200 rounded px-1 py-0.5"
                        value={assigned.role}
                        onChange={e => setForm({
                          ...form,
                          assignedEmployees: form.assignedEmployees.map(ae =>
                            ae.employee === emp._id ? { ...ae, role: e.target.value } : ae
                          )
                        })}
                      >
                        <option value="member">Member</option>
                        <option value="lead">Lead</option>
                        <option value="developer">Developer</option>
                        <option value="designer">Designer</option>
                        <option value="tester">Tester</option>
                      </select>
                    )}
                  </label>
                );
              })}
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => setShowModal(false)} className="btn-secondary">Cancel</button>
            <button type="submit" disabled={saving} className="btn-primary">{saving ? 'Saving...' : editProject ? 'Update' : 'Create Project'}</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}


