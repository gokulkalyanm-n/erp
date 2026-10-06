import { useEffect, useState } from 'react';
import {
  getAdmins, createAdmin, updateAdmin, toggleAdminStatus,
  resetAdminPassword, deleteAdmin
} from '../../services/api';
import PageHeader from '../../components/PageHeader';
import Modal from '../../components/Modal';
import LoadingSpinner from '../../components/LoadingSpinner';
import { getInitials, avatarColor } from '../../utils/helpers';
import toast from 'react-hot-toast';
import { Plus, Edit2, Power, KeyRound, Trash2, ShieldCheck } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { Navigate } from 'react-router-dom';

const ALL_PERMISSIONS = [
  { key: 'EMPLOYEE_VIEW',        label: 'View Employees',        group: 'Employees' },
  { key: 'EMPLOYEE_CREATE',      label: 'Add Employees',         group: 'Employees' },
  { key: 'EMPLOYEE_EDIT',        label: 'Edit Employees',        group: 'Employees' },
  { key: 'EMPLOYEE_DELETE',      label: 'Delete / Deactivate',   group: 'Employees' },
  { key: 'PROJECT_VIEW',         label: 'View Projects',         group: 'Projects' },
  { key: 'PROJECT_CREATE',       label: 'Create Projects',       group: 'Projects' },
  { key: 'PROJECT_EDIT',         label: 'Edit Projects',         group: 'Projects' },
  { key: 'PROJECT_DELETE',       label: 'Delete Projects',       group: 'Projects' },
  { key: 'TASK_VIEW',            label: 'View Tasks',            group: 'Tasks' },
  { key: 'TASK_CREATE',          label: 'Create Tasks',          group: 'Tasks' },
  { key: 'TASK_EDIT',            label: 'Edit Tasks',            group: 'Tasks' },
  { key: 'TASK_DELETE',          label: 'Delete Tasks',          group: 'Tasks' },
  { key: 'REPORTS_VIEW',         label: 'View Daily Reports',    group: 'Reports' },
  { key: 'REPORTS_REVIEW',       label: 'Review Reports',        group: 'Reports' },
  { key: 'LEAVE_VIEW',           label: 'View Leave Requests',   group: 'Leave' },
  { key: 'LEAVE_APPROVE',        label: 'Approve / Reject Leave',group: 'Leave' },
  { key: 'ANALYTICS_VIEW',       label: 'View Analytics',        group: 'Other' },
  { key: 'ANNOUNCEMENTS_MANAGE', label: 'Manage Announcements',  group: 'Other' },
];

const GROUPS = ['Employees', 'Projects', 'Tasks', 'Reports', 'Leave', 'Other'];

const emptyForm = { name: '', email: '', password: '', department: '', designation: '', phone: '', permissions: [] };

export default function AdminManagement() {
  const { isSuperAdmin } = useAuth();
  if (!isSuperAdmin) return <Navigate to="/admin" replace />;

  const [admins, setAdmins] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editAdmin, setEditAdmin] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [resetModal, setResetModal] = useState(null);
  const [newPass, setNewPass] = useState('');
  const [deleteModal, setDeleteModal] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const res = await getAdmins();
      setAdmins(res.data);
    } catch { toast.error('Failed to load admins'); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const openAdd = () => { setEditAdmin(null); setForm(emptyForm); setShowModal(true); };
  const openEdit = (a) => {
    setEditAdmin(a);
    setForm({ name: a.name, email: a.email, password: '', department: a.department || '', designation: a.designation || '', phone: a.phone || '', permissions: a.permissions || [] });
    setShowModal(true);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = { ...form };
      if (editAdmin) {
        delete payload.password;
        await updateAdmin(editAdmin._id, payload);
        toast.success('Admin updated');
      } else {
        await createAdmin(payload);
        toast.success('Admin created successfully');
      }
      setShowModal(false);
      load();
    } catch (err) { toast.error(err.response?.data?.message || 'Save failed'); }
    finally { setSaving(false); }
  };

  const togglePerm = (key) => {
    setForm(prev => ({
      ...prev,
      permissions: prev.permissions.includes(key)
        ? prev.permissions.filter(p => p !== key)
        : [...prev.permissions, key]
    }));
  };

  const selectGroup = (group) => {
    const groupKeys = ALL_PERMISSIONS.filter(p => p.group === group).map(p => p.key);
    const allSelected = groupKeys.every(k => form.permissions.includes(k));
    setForm(prev => ({
      ...prev,
      permissions: allSelected
        ? prev.permissions.filter(k => !groupKeys.includes(k))
        : [...new Set([...prev.permissions, ...groupKeys])]
    }));
  };

  const handleToggle = async (a) => {
    try {
      await toggleAdminStatus(a._id);
      toast.success(`Admin ${a.isActive ? 'deactivated' : 'activated'}`);
      load();
    } catch { toast.error('Failed'); }
  };

  const handleResetPass = async () => {
    if (!newPass || newPass.length < 6) return toast.error('Min 6 characters');
    try {
      await resetAdminPassword(resetModal._id, { newPassword: newPass });
      toast.success('Password reset');
      setResetModal(null); setNewPass('');
    } catch (err) { toast.error(err.response?.data?.message || 'Failed'); }
  };

  const handleDelete = async () => {
    try {
      await deleteAdmin(deleteModal._id);
      toast.success(`${deleteModal.name} deleted`);
      setDeleteModal(null);
      load();
    } catch (err) { toast.error(err.response?.data?.message || 'Failed'); }
  };

  return (
    <div className="p-4 lg:p-8">
      <PageHeader
        title="Admin Management"
        subtitle={`${admins.length} admins`}
        action={
          <button onClick={openAdd} className="btn-primary flex items-center gap-2">
            <Plus className="w-4 h-4" /> Add Admin
          </button>
        }
      />

      {loading ? <LoadingSpinner /> : (
        <>
          {admins.length === 0 && (
            <div className="card text-center text-gray-400 py-16">No admins created yet. Create your first admin.</div>
          )}

          {/* Mobile cards */}
          <div className="lg:hidden space-y-3">
            {admins.map(a => (
              <div key={a._id} className="card">
                <div className="flex items-center gap-3 mb-3">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-bold flex-shrink-0 ${avatarColor(a.name)}`}>
                    {getInitials(a.name)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-gray-900 truncate">{a.name}</p>
                    <p className="text-xs text-gray-400 truncate">{a.email}</p>
                  </div>
                  {a.isActive ? <span className="badge-green">Active</span> : <span className="badge-red">Inactive</span>}
                </div>
                <div className="flex flex-wrap gap-1 mb-3">
                  {(a.permissions || []).length === 0
                    ? <span className="text-xs text-gray-400 italic">No permissions assigned</span>
                    : (a.permissions || []).slice(0, 4).map(p => (
                        <span key={p} className="badge-blue text-xs">{p.replace(/_/g, ' ')}</span>
                      ))
                  }
                  {(a.permissions || []).length > 4 && (
                    <span className="badge-gray text-xs">+{a.permissions.length - 4} more</span>
                  )}
                </div>
                <div className="flex justify-end gap-1 pt-2 border-t border-gray-50">
                  <button onClick={() => openEdit(a)} className="p-2 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-blue-600" title="Edit"><Edit2 className="w-4 h-4" /></button>
                  <button onClick={() => { setResetModal(a); setNewPass(''); }} className="p-2 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-orange-500" title="Reset Password"><KeyRound className="w-4 h-4" /></button>
                  <button onClick={() => handleToggle(a)} className={`p-2 rounded-lg hover:bg-gray-100 ${a.isActive ? 'text-gray-400 hover:text-red-500' : 'text-gray-400 hover:text-green-600'}`} title={a.isActive ? 'Deactivate' : 'Activate'}><Power className="w-4 h-4" /></button>
                  <button onClick={() => setDeleteModal(a)} className="p-2 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-600" title="Delete"><Trash2 className="w-4 h-4" /></button>
                </div>
              </div>
            ))}
          </div>

          {/* Desktop table */}
          <div className="hidden lg:block card overflow-hidden p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="text-left px-4 py-3 font-medium text-gray-500">Admin</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-500">Department</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-500">Permissions</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-500">Status</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-500">Actions</th>
                </tr>
              </thead>
              <tbody>
                {admins.length === 0 && <tr><td colSpan={5} className="text-center py-12 text-gray-400">No admins found</td></tr>}
                {admins.map(a => (
                  <tr key={a._id} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold ${avatarColor(a.name)}`}>
                          {getInitials(a.name)}
                        </div>
                        <div>
                          <p className="font-medium text-gray-900">{a.name}</p>
                          <p className="text-xs text-gray-400">{a.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-600">{a.department || '-'}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {(a.permissions || []).length === 0
                          ? <span className="text-xs text-gray-400 italic">None</span>
                          : (a.permissions || []).slice(0, 3).map(p => (
                              <span key={p} className="badge-blue text-xs">{p.replace(/_/g, ' ')}</span>
                            ))
                        }
                        {(a.permissions || []).length > 3 && (
                          <span className="badge-gray">+{a.permissions.length - 3}</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {a.isActive ? <span className="badge-green">Active</span> : <span className="badge-red">Inactive</span>}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => openEdit(a)} className="p-1.5 rounded hover:bg-gray-100 text-gray-400 hover:text-blue-600" title="Edit"><Edit2 className="w-4 h-4" /></button>
                        <button onClick={() => { setResetModal(a); setNewPass(''); }} className="p-1.5 rounded hover:bg-gray-100 text-gray-400 hover:text-orange-600" title="Reset Password"><KeyRound className="w-4 h-4" /></button>
                        <button onClick={() => handleToggle(a)} className={`p-1.5 rounded hover:bg-gray-100 ${a.isActive ? 'text-gray-400 hover:text-red-500' : 'text-gray-400 hover:text-green-600'}`}><Power className="w-4 h-4" /></button>
                        <button onClick={() => setDeleteModal(a)} className="p-1.5 rounded hover:bg-red-50 text-gray-400 hover:text-red-600"><Trash2 className="w-4 h-4" /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Add/Edit Modal */}
      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title={editAdmin ? 'Edit Admin' : 'Create Admin'} size="lg">
        <form onSubmit={handleSave} className="space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="label">Full Name *</label>
              <input className="input" required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
            </div>
            <div>
              <label className="label">Email *</label>
              <input type="email" className="input" required value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
            </div>
            {!editAdmin && (
              <div>
                <label className="label">Password *</label>
                <input type="password" className="input" required placeholder="Min 6 characters" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} />
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
          </div>

          {/* Permissions */}
          <div>
            <label className="label flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-blue-500" />
              Permissions
            </label>
            <div className="border border-gray-200 rounded-xl p-4 space-y-4 max-h-72 overflow-y-auto">
              {GROUPS.map(group => {
                const groupPerms = ALL_PERMISSIONS.filter(p => p.group === group);
                const allSelected = groupPerms.every(p => form.permissions.includes(p.key));
                return (
                  <div key={group}>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">{group}</span>
                      <button type="button" onClick={() => selectGroup(group)} className="text-xs text-blue-600 hover:underline">
                        {allSelected ? 'Deselect all' : 'Select all'}
                      </button>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                      {groupPerms.map(p => (
                        <label key={p.key} className="flex items-center gap-2 cursor-pointer hover:bg-gray-50 px-2 py-1.5 rounded-lg">
                          <input
                            type="checkbox"
                            checked={form.permissions.includes(p.key)}
                            onChange={() => togglePerm(p.key)}
                            className="rounded text-blue-600"
                          />
                          <span className="text-sm text-gray-700">{p.label}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
            <p className="text-xs text-gray-400 mt-1">{form.permissions.length} permission{form.permissions.length !== 1 ? 's' : ''} selected</p>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => setShowModal(false)} className="btn-secondary">Cancel</button>
            <button type="submit" disabled={saving} className="btn-primary">
              {saving ? 'Saving...' : editAdmin ? 'Update Admin' : 'Create Admin'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Reset Password Modal */}
      <Modal isOpen={!!resetModal} onClose={() => setResetModal(null)} title="Reset Admin Password" size="sm">
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

      {/* Delete Modal */}
      <Modal isOpen={!!deleteModal} onClose={() => setDeleteModal(null)} title="Delete Admin" size="sm">
        <div className="space-y-4">
          <div className="flex items-start gap-3 p-3 bg-red-50 rounded-lg border border-red-100">
            <Trash2 className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-red-700">
              Delete <strong>{deleteModal?.name}</strong>? This cannot be undone.
            </p>
          </div>
          <div className="flex justify-end gap-3">
            <button onClick={() => setDeleteModal(null)} className="btn-secondary">Cancel</button>
            <button onClick={handleDelete} className="bg-red-600 hover:bg-red-700 text-white font-medium px-4 py-2 rounded-lg text-sm flex items-center gap-2">
              <Trash2 className="w-4 h-4" /> Delete
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
