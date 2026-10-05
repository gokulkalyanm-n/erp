import { useEffect, useState } from 'react';
import { getEmployees, createEmployee, updateEmployee, toggleEmployeeStatus, resetPassword, deleteEmployee } from '../../services/api';
import PageHeader from '../../components/PageHeader';
import Modal from '../../components/Modal';
import LoadingSpinner from '../../components/LoadingSpinner';
import { formatDate, getInitials, avatarColor } from '../../utils/helpers';
import toast from 'react-hot-toast';
import { Plus, Search, Edit2, Power, KeyRound, Eye, Trash2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const emptyForm = {
  employeeId: '', name: '', email: '', password: '', department: '',
  designation: '', phone: '', joiningDate: '', address: '', skills: ''
};

export default function Employees() {
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterActive, setFilterActive] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editEmp, setEditEmp] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [resetModal, setResetModal] = useState(null);
  const [newPass, setNewPass] = useState('');
  const [deleteModal, setDeleteModal] = useState(null);
  const navigate = useNavigate();

  const load = async () => {
    setLoading(true);
    try {
      const params = {};
      if (search) params.search = search;
      if (filterActive !== '') params.isActive = filterActive;
      const res = await getEmployees(params);
      setEmployees(res.data);
    } catch { toast.error('Failed to load employees'); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [search, filterActive]);

  const openAdd = () => { setEditEmp(null); setForm(emptyForm); setShowModal(true); };
  const openEdit = (emp) => {
    setEditEmp(emp);
    setForm({
      employeeId: emp.employeeId || '',
      name: emp.name, email: emp.email, password: '',
      department: emp.department || '', designation: emp.designation || '',
      phone: emp.phone || '', joiningDate: emp.joiningDate ? emp.joiningDate.slice(0, 10) : '',
      address: emp.address || '', skills: (emp.skills || []).join(', ')
    });
    setShowModal(true);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = { ...form, skills: form.skills ? form.skills.split(',').map(s => s.trim()) : [] };
      if (editEmp) {
        delete payload.password;
        await updateEmployee(editEmp._id, payload);
        toast.success('Employee updated');
      } else {
        await createEmployee(payload);
        toast.success('Employee added successfully');
      }
      setShowModal(false);
      load();
    } catch (err) { toast.error(err.response?.data?.message || 'Save failed'); }
    finally { setSaving(false); }
  };

  const handleToggle = async (emp) => {
    try {
      await toggleEmployeeStatus(emp._id);
      toast.success(`Employee ${emp.isActive ? 'deactivated' : 'activated'}`);
      load();
    } catch { toast.error('Failed to update status'); }
  };

  const handleDelete = async () => {
    try {
      await deleteEmployee(deleteModal._id);
      toast.success(`${deleteModal.name} deleted permanently`);
      setDeleteModal(null);
      load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Delete failed');
    }
  };

  const handleResetPass = async () => {
    if (!newPass || newPass.length < 6) return toast.error('Min 6 characters');
    try {
      await resetPassword(resetModal._id, { newPassword: newPass });
      toast.success('Password reset successfully');
      setResetModal(null); setNewPass('');
    } catch (err) { toast.error(err.response?.data?.message || 'Reset failed'); }
  };

  return (
    <div className="p-4 lg:p-8">
      <PageHeader
        title="Employees"
        subtitle={`${employees.length} employees`}
        action={
          <button onClick={openAdd} className="btn-primary flex items-center gap-2">
            <Plus className="w-4 h-4" /> Add Employee
          </button>
        }
      />

      {/* Filters */}
      <div className="card mb-4 lg:mb-6">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input className="input pl-9" placeholder="Search by name, email, ID..." value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <select className="input sm:w-40" value={filterActive} onChange={e => setFilterActive(e.target.value)}>
            <option value="">All Status</option>
            <option value="true">Active</option>
            <option value="false">Inactive</option>
          </select>
        </div>
      </div>

      {/* Table — desktop / Cards — mobile */}
      {loading ? <LoadingSpinner /> : (
        <>
          {/* Mobile card list */}
          <div className="lg:hidden space-y-3">
            {employees.length === 0 && (
              <div className="card text-center text-gray-400 py-10">No employees found</div>
            )}
            {employees.map(emp => (
              <div key={emp._id} className="card">
                <div className="flex items-center gap-3 mb-3">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-bold flex-shrink-0 ${avatarColor(emp.name)}`}>
                    {getInitials(emp.name)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-gray-900 truncate">{emp.name}</p>
                    <p className="text-xs text-gray-400 truncate">{emp.email}</p>
                  </div>
                  {emp.isActive ? <span className="badge-green">Active</span> : <span className="badge-red">Inactive</span>}
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs text-gray-500 mb-3">
                  <div><span className="text-gray-400">ID: </span><span className="font-mono text-blue-600 font-medium">{emp.employeeId}</span></div>
                  <div><span className="text-gray-400">Dept: </span>{emp.department || '-'}</div>
                  <div><span className="text-gray-400">Role: </span>{emp.designation || '-'}</div>
                  <div><span className="text-gray-400">Joined: </span>{formatDate(emp.joiningDate)}</div>
                </div>
                <div className="flex items-center justify-end gap-1 pt-2 border-t border-gray-50">
                  <button onClick={() => navigate(`/admin/employees/${emp._id}`)} className="p-2 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-blue-600" title="View"><Eye className="w-4 h-4" /></button>
                  <button onClick={() => openEdit(emp)} className="p-2 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-blue-600" title="Edit"><Edit2 className="w-4 h-4" /></button>
                  <button onClick={() => { setResetModal(emp); setNewPass(''); }} className="p-2 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-orange-500" title="Reset Password"><KeyRound className="w-4 h-4" /></button>
                  <button onClick={() => handleToggle(emp)} className={`p-2 rounded-lg hover:bg-gray-100 ${emp.isActive ? 'text-gray-400 hover:text-red-500' : 'text-gray-400 hover:text-green-600'}`} title={emp.isActive ? 'Deactivate' : 'Activate'}><Power className="w-4 h-4" /></button>
                  <button onClick={() => setDeleteModal(emp)} className="p-2 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-600" title="Delete"><Trash2 className="w-4 h-4" /></button>
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
                    <th className="text-left px-4 py-3 font-medium text-gray-500">ID</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-500">Department</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-500">Designation</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-500">Joined</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-500">Status</th>
                    <th className="text-right px-4 py-3 font-medium text-gray-500">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {employees.length === 0 && (
                    <tr><td colSpan={7} className="text-center py-12 text-gray-400">No employees found</td></tr>
                  )}
                  {employees.map(emp => (
                    <tr key={emp._id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold ${avatarColor(emp.name)}`}>
                            {getInitials(emp.name)}
                          </div>
                          <div>
                            <p className="font-medium text-gray-900">{emp.name}</p>
                            <p className="text-gray-400 text-xs">{emp.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 font-mono text-blue-600 font-medium">{emp.employeeId}</td>
                      <td className="px-4 py-3 text-gray-600">{emp.department || '-'}</td>
                      <td className="px-4 py-3 text-gray-600">{emp.designation || '-'}</td>
                      <td className="px-4 py-3 text-gray-500">{formatDate(emp.joiningDate)}</td>
                      <td className="px-4 py-3">
                        {emp.isActive ? <span className="badge-green">Active</span> : <span className="badge-red">Inactive</span>}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <button onClick={() => navigate(`/admin/employees/${emp._id}`)} className="p-1.5 rounded hover:bg-gray-100 text-gray-400 hover:text-blue-600" title="View"><Eye className="w-4 h-4" /></button>
                          <button onClick={() => openEdit(emp)} className="p-1.5 rounded hover:bg-gray-100 text-gray-400 hover:text-blue-600" title="Edit"><Edit2 className="w-4 h-4" /></button>
                          <button onClick={() => { setResetModal(emp); setNewPass(''); }} className="p-1.5 rounded hover:bg-gray-100 text-gray-400 hover:text-orange-600" title="Reset Password"><KeyRound className="w-4 h-4" /></button>
                          <button onClick={() => handleToggle(emp)} className={`p-1.5 rounded hover:bg-gray-100 ${emp.isActive ? 'text-gray-400 hover:text-red-500' : 'text-gray-400 hover:text-green-600'}`} title={emp.isActive ? 'Deactivate' : 'Activate'}><Power className="w-4 h-4" /></button>
                          <button onClick={() => setDeleteModal(emp)} className="p-1.5 rounded hover:bg-red-50 text-gray-400 hover:text-red-600" title="Delete Employee"><Trash2 className="w-4 h-4" /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* Add/Edit Modal */}
      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title={editEmp ? 'Edit Employee' : 'Add New Employee'} size="lg">
        <form onSubmit={handleSave} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="label">Full Name *</label>
              <input className="input" required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
            </div>
            <div>
              <label className="label">Email *</label>
              <input type="email" className="input" required value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
            </div>
            {!editEmp ? (
              <>
                <div>
                  <label className="label">Employee ID *</label>
                  <input
                    className="input font-mono uppercase"
                    required
                    placeholder="e.g. EMP001"
                    value={form.employeeId}
                    onChange={e => setForm({ ...form, employeeId: e.target.value.toUpperCase() })}
                  />
                  <p className="text-xs text-gray-400 mt-1">Must be unique. Will be saved exactly as entered.</p>
                </div>
                <div>
                  <label className="label">Password *</label>
                  <input type="password" className="input" required value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} placeholder="Min 6 characters" />
                </div>
              </>
            ) : (
              <div>
                <label className="label">Employee ID *</label>
                <input
                  className="input font-mono uppercase"
                  required
                  placeholder="e.g. EMP001"
                  value={form.employeeId}
                  onChange={e => setForm({ ...form, employeeId: e.target.value.toUpperCase() })}
                />
                <p className="text-xs text-gray-400 mt-1">Must be unique across all employees.</p>
              </div>
            )}
            <div>
              <label className="label">Department</label>
              <input className="input" value={form.department} onChange={e => setForm({ ...form, department: e.target.value })} />
            </div>
            <div>
              <label className="label">Designation</label>
              <input className="input" value={form.designation} onChange={e => setForm({ ...form, designation: e.target.value })} />
            </div>
            <div>
              <label className="label">Phone</label>
              <input className="input" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} />
            </div>
            <div>
              <label className="label">Joining Date</label>
              <input type="date" className="input" value={form.joiningDate} onChange={e => setForm({ ...form, joiningDate: e.target.value })} />
            </div>
            <div>
              <label className="label">Skills (comma-separated)</label>
              <input className="input" placeholder="React, Node.js, Python" value={form.skills} onChange={e => setForm({ ...form, skills: e.target.value })} />
            </div>
          </div>
          <div>
            <label className="label">Address</label>
            <textarea className="input" rows={2} value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => setShowModal(false)} className="btn-secondary">Cancel</button>
            <button type="submit" disabled={saving} className="btn-primary">{saving ? 'Saving...' : editEmp ? 'Update' : 'Add Employee'}</button>
          </div>
        </form>
      </Modal>

      {/* Reset Password Modal */}
      <Modal isOpen={!!resetModal} onClose={() => setResetModal(null)} title="Reset Password" size="sm">
        <div className="space-y-4">
          <p className="text-sm text-gray-600">Reset password for <strong>{resetModal?.name}</strong></p>
          <div>
            <label className="label">New Password</label>
            <input type="password" className="input" value={newPass} onChange={e => setNewPass(e.target.value)} placeholder="Min 6 characters" />
          </div>
          <div className="flex justify-end gap-3">
            <button onClick={() => setResetModal(null)} className="btn-secondary">Cancel</button>
            <button onClick={handleResetPass} className="btn-primary">Reset Password</button>
          </div>
        </div>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal isOpen={!!deleteModal} onClose={() => setDeleteModal(null)} title="Delete Employee" size="sm">
        <div className="space-y-4">
          <div className="flex items-start gap-3 p-3 bg-red-50 rounded-lg border border-red-100">
            <Trash2 className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-medium text-red-800">This action is permanent</p>
              <p className="text-sm text-red-600 mt-0.5">
                Deleting <strong>{deleteModal?.name}</strong> ({deleteModal?.employeeId}) will permanently remove their account. This cannot be undone.
              </p>
            </div>
          </div>
          <p className="text-sm text-gray-500">
            Consider <strong>deactivating</strong> instead if you want to preserve their work history.
          </p>
          <div className="flex justify-end gap-3">
            <button onClick={() => setDeleteModal(null)} className="btn-secondary">Cancel</button>
            <button
              onClick={handleDelete}
              className="bg-red-600 hover:bg-red-700 text-white font-medium px-4 py-2 rounded-lg transition-colors flex items-center gap-2"
            >
              <Trash2 className="w-4 h-4" />
              Delete Permanently
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}


