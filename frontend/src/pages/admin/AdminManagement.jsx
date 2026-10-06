import { useEffect, useState, useMemo } from 'react';
import {
  getAdmins, updateAdmin, toggleAdminStatus,
  resetAdminPassword, deleteAdmin, promoteEmployee, demoteAdmin,
  getEmployees
} from '../../services/api';
import PageHeader from '../../components/PageHeader';
import Modal from '../../components/Modal';
import LoadingSpinner from '../../components/LoadingSpinner';
import { getInitials, avatarColor } from '../../utils/helpers';
import toast from 'react-hot-toast';
import { Plus, Edit2, Power, KeyRound, Trash2, ShieldCheck, Search, UserCheck, ArrowDownLeft, X } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { Navigate } from 'react-router-dom';

const ALL_PERMISSIONS = [
  { key: 'EMPLOYEE_VIEW',        label: 'View Employees',         group: 'Employees' },
  { key: 'EMPLOYEE_CREATE',      label: 'Add Employees',          group: 'Employees' },
  { key: 'EMPLOYEE_EDIT',        label: 'Edit Employees',         group: 'Employees' },
  { key: 'EMPLOYEE_DELETE',      label: 'Delete / Deactivate',    group: 'Employees' },
  { key: 'PROJECT_VIEW',         label: 'View Projects',          group: 'Projects' },
  { key: 'PROJECT_CREATE',       label: 'Create Projects',        group: 'Projects' },
  { key: 'PROJECT_EDIT',         label: 'Edit Projects',          group: 'Projects' },
  { key: 'PROJECT_DELETE',       label: 'Delete Projects',        group: 'Projects' },
  { key: 'TASK_VIEW',            label: 'View Tasks',             group: 'Tasks' },
  { key: 'TASK_CREATE',          label: 'Create Tasks',           group: 'Tasks' },
  { key: 'TASK_EDIT',            label: 'Edit Tasks',             group: 'Tasks' },
  { key: 'TASK_DELETE',          label: 'Delete Tasks',           group: 'Tasks' },
  { key: 'REPORTS_VIEW',         label: 'View Daily Reports',     group: 'Reports' },
  { key: 'REPORTS_REVIEW',       label: 'Review Reports',         group: 'Reports' },
  { key: 'LEAVE_VIEW',           label: 'View Leave Requests',    group: 'Leave' },
  { key: 'LEAVE_APPROVE',        label: 'Approve / Reject Leave', group: 'Leave' },
  { key: 'ANALYTICS_VIEW',       label: 'View Analytics',         group: 'Other' },
  { key: 'ANNOUNCEMENTS_MANAGE', label: 'Manage Announcements',   group: 'Other' },
];

const GROUPS = ['Employees', 'Projects', 'Tasks', 'Reports', 'Leave', 'Other'];

// Preset role templates
const PRESETS = [
  {
    label: 'HR Admin',
    perms: ['EMPLOYEE_VIEW','EMPLOYEE_CREATE','EMPLOYEE_EDIT','EMPLOYEE_DELETE','LEAVE_VIEW','LEAVE_APPROVE','REPORTS_VIEW']
  },
  {
    label: 'Project Manager',
    perms: ['EMPLOYEE_VIEW','PROJECT_VIEW','PROJECT_CREATE','PROJECT_EDIT','PROJECT_DELETE','TASK_VIEW','TASK_CREATE','TASK_EDIT','TASK_DELETE','REPORTS_VIEW','ANALYTICS_VIEW']
  },
  {
    label: 'Viewer Only',
    perms: ['EMPLOYEE_VIEW','PROJECT_VIEW','TASK_VIEW','REPORTS_VIEW','LEAVE_VIEW','ANALYTICS_VIEW']
  },
];

function PermissionsEditor({ permissions, onChange }) {
  const togglePerm = (key) => {
    onChange(permissions.includes(key)
      ? permissions.filter(p => p !== key)
      : [...permissions, key]
    );
  };

  const selectGroup = (group) => {
    const groupKeys = ALL_PERMISSIONS.filter(p => p.group === group).map(p => p.key);
    const allSelected = groupKeys.every(k => permissions.includes(k));
    onChange(allSelected
      ? permissions.filter(k => !groupKeys.includes(k))
      : [...new Set([...permissions, ...groupKeys])]
    );
  };

  return (
    <div>
      {/* Presets */}
      <div className="flex flex-wrap gap-2 mb-3">
        <span className="text-xs text-gray-400 self-center">Quick presets:</span>
        {PRESETS.map(p => (
          <button
            key={p.label}
            type="button"
            onClick={() => onChange(p.perms)}
            className="text-xs px-2.5 py-1 rounded-full border border-blue-200 text-blue-600 hover:bg-blue-50 transition-colors"
          >
            {p.label}
          </button>
        ))}
        <button
          type="button"
          onClick={() => onChange([])}
          className="text-xs px-2.5 py-1 rounded-full border border-gray-200 text-gray-500 hover:bg-gray-50 transition-colors"
        >
          Clear all
        </button>
      </div>

      <div className="border border-gray-200 rounded-xl p-4 space-y-4 max-h-64 overflow-y-auto">
        {GROUPS.map(group => {
          const groupPerms = ALL_PERMISSIONS.filter(p => p.group === group);
          const allSelected = groupPerms.every(p => permissions.includes(p.key));
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
                      checked={permissions.includes(p.key)}
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
      <p className="text-xs text-gray-400 mt-1.5">
        {permissions.length} permission{permissions.length !== 1 ? 's' : ''} selected
      </p>
    </div>
  );
}

export default function AdminManagement() {
  const { isSuperAdmin } = useAuth();
  if (!isSuperAdmin) return <Navigate to="/admin" replace />;

  const [admins, setAdmins] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);

  // Promote modal (pick from employee list)
  const [showPromote, setShowPromote] = useState(false);
  const [empSearch, setEmpSearch] = useState('');
  const [selectedEmp, setSelectedEmp] = useState(null);
  const [promotePerms, setPromotePerms] = useState([]);
  const [promoting, setPromoting] = useState(false);

  // Edit permissions modal (existing admin)
  const [editAdmin, setEditAdmin] = useState(null);
  const [editPerms, setEditPerms] = useState([]);
  const [saving, setSaving] = useState(false);

  // Other modals
  const [resetModal, setResetModal] = useState(null);
  const [newPass, setNewPass] = useState('');
  const [deleteModal, setDeleteModal] = useState(null);
  const [demoteModal, setDemoteModal] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const [aRes, eRes] = await Promise.all([
        getAdmins(),
        getEmployees({ isActive: 'true' })
      ]);
      setAdmins(aRes.data);
      setEmployees(eRes.data);
    } catch { toast.error('Failed to load'); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  // Filter out employees who are already admins
  const adminIds = new Set(admins.map(a => a._id));
  const availableEmployees = useMemo(() => {
    return employees.filter(e =>
      !adminIds.has(e._id) &&
      (!empSearch ||
        e.name.toLowerCase().includes(empSearch.toLowerCase()) ||
        e.employeeId?.toLowerCase().includes(empSearch.toLowerCase()) ||
        e.department?.toLowerCase().includes(empSearch.toLowerCase())
      )
    );
  }, [employees, admins, empSearch]);

  const handlePromote = async () => {
    if (!selectedEmp) return toast.error('Select an employee first');
    setPromoting(true);
    try {
      await promoteEmployee(selectedEmp._id, { permissions: promotePerms });
      toast.success(`${selectedEmp.name} promoted to admin`);
      setShowPromote(false);
      setSelectedEmp(null);
      setPromotePerms([]);
      setEmpSearch('');
      load();
    } catch (err) { toast.error(err.response?.data?.message || 'Failed'); }
    finally { setPromoting(false); }
  };

  const openEdit = (a) => {
    setEditAdmin(a);
    setEditPerms(a.permissions || []);
  };

  const handleSavePerms = async () => {
    setSaving(true);
    try {
      await updateAdmin(editAdmin._id, { permissions: editPerms });
      toast.success('Permissions updated');
      setEditAdmin(null);
      load();
    } catch (err) { toast.error(err.response?.data?.message || 'Failed'); }
    finally { setSaving(false); }
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

  const handleDemote = async () => {
    try {
      await demoteAdmin(demoteModal._id);
      toast.success(`${demoteModal.name} demoted back to employee`);
      setDemoteModal(null);
      load();
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
        subtitle={`${admins.length} admin${admins.length !== 1 ? 's' : ''}`}
        action={
          <button onClick={() => { setShowPromote(true); setSelectedEmp(null); setPromotePerms([]); setEmpSearch(''); }} className="btn-primary flex items-center gap-2">
            <Plus className="w-4 h-4" /> Promote Employee to Admin
          </button>
        }
      />

      {loading ? <LoadingSpinner /> : (
        <>
          {admins.length === 0 && (
            <div className="card text-center py-16 text-gray-400">
              <ShieldCheck className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p className="font-medium">No admins yet</p>
              <p className="text-sm mt-1">Promote an employee to get started.</p>
            </div>
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
                    {a.employeeId && <p className="text-xs font-mono text-blue-600">{a.employeeId}</p>}
                  </div>
                  {a.isActive ? <span className="badge-green">Active</span> : <span className="badge-red">Inactive</span>}
                </div>
                <div className="flex flex-wrap gap-1 mb-3">
                  {(a.permissions || []).length === 0
                    ? <span className="text-xs text-gray-400 italic">No permissions</span>
                    : (a.permissions || []).slice(0, 3).map(p => (
                        <span key={p} className="badge-blue text-xs">{p.replace(/_/g, ' ')}</span>
                      ))
                  }
                  {(a.permissions || []).length > 3 && (
                    <span className="badge-gray text-xs">+{a.permissions.length - 3} more</span>
                  )}
                </div>
                <div className="flex justify-end gap-1 pt-2 border-t border-gray-50">
                  <button onClick={() => openEdit(a)} className="p-2 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-blue-600" title="Edit Permissions"><Edit2 className="w-4 h-4" /></button>
                  <button onClick={() => { setResetModal(a); setNewPass(''); }} className="p-2 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-orange-500" title="Reset Password"><KeyRound className="w-4 h-4" /></button>
                  <button onClick={() => handleToggle(a)} className={`p-2 rounded-lg hover:bg-gray-100 ${a.isActive ? 'text-gray-400 hover:text-red-500' : 'text-gray-400 hover:text-green-600'}`} title={a.isActive ? 'Deactivate' : 'Activate'}><Power className="w-4 h-4" /></button>
                  <button onClick={() => setDemoteModal(a)} className="p-2 rounded-lg hover:bg-yellow-50 text-gray-400 hover:text-yellow-600" title="Demote to Employee"><ArrowDownLeft className="w-4 h-4" /></button>
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
                          {a.employeeId && <p className="text-xs font-mono text-blue-500">{a.employeeId}</p>}
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
                          <span className="badge-gray text-xs">+{a.permissions.length - 3}</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {a.isActive ? <span className="badge-green">Active</span> : <span className="badge-red">Inactive</span>}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => openEdit(a)} className="p-1.5 rounded hover:bg-gray-100 text-gray-400 hover:text-blue-600" title="Edit Permissions"><Edit2 className="w-4 h-4" /></button>
                        <button onClick={() => { setResetModal(a); setNewPass(''); }} className="p-1.5 rounded hover:bg-gray-100 text-gray-400 hover:text-orange-600" title="Reset Password"><KeyRound className="w-4 h-4" /></button>
                        <button onClick={() => handleToggle(a)} className={`p-1.5 rounded hover:bg-gray-100 ${a.isActive ? 'text-gray-400 hover:text-red-500' : 'text-gray-400 hover:text-green-600'}`} title={a.isActive ? 'Deactivate' : 'Activate'}><Power className="w-4 h-4" /></button>
                        <button onClick={() => setDemoteModal(a)} className="p-1.5 rounded hover:bg-yellow-50 text-gray-400 hover:text-yellow-600" title="Demote to Employee"><ArrowDownLeft className="w-4 h-4" /></button>
                        <button onClick={() => setDeleteModal(a)} className="p-1.5 rounded hover:bg-red-50 text-gray-400 hover:text-red-600" title="Delete"><Trash2 className="w-4 h-4" /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* ── Promote Employee Modal ── */}
      <Modal isOpen={showPromote} onClose={() => setShowPromote(false)} title="Promote Employee to Admin" size="lg">
        <div className="space-y-5">
          {/* Step 1: pick employee */}
          {!selectedEmp ? (
            <div>
              <label className="label">Search & select an employee</label>
              <div className="relative mb-3">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                <input
                  className="input pl-9"
                  placeholder="Search by name, ID, or department..."
                  value={empSearch}
                  onChange={e => setEmpSearch(e.target.value)}
                  autoFocus
                />
              </div>
              <div className="border border-gray-200 rounded-xl overflow-hidden max-h-72 overflow-y-auto">
                {availableEmployees.length === 0 && (
                  <div className="text-center py-8 text-gray-400 text-sm">
                    {empSearch ? 'No employees match your search.' : 'All employees are already admins.'}
                  </div>
                )}
                {availableEmployees.map(emp => (
                  <button
                    key={emp._id}
                    type="button"
                    onClick={() => setSelectedEmp(emp)}
                    className="w-full flex items-center gap-3 px-4 py-3 hover:bg-blue-50 transition-colors border-b border-gray-50 last:border-0 text-left"
                  >
                    <div className={`w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-bold flex-shrink-0 ${avatarColor(emp.name)}`}>
                      {getInitials(emp.name)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-gray-900">{emp.name}</p>
                      <p className="text-xs text-gray-400">{emp.employeeId && <span className="font-mono text-blue-500 mr-2">{emp.employeeId}</span>}{emp.department} · {emp.designation}</p>
                    </div>
                    <UserCheck className="w-4 h-4 text-gray-300 flex-shrink-0" />
                  </button>
                ))}
              </div>
            </div>
          ) : (
            /* Step 2: selected — show info + assign permissions */
            <div className="space-y-4">
              {/* Selected employee card */}
              <div className="flex items-center gap-3 p-3 bg-blue-50 border border-blue-100 rounded-xl">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-bold flex-shrink-0 ${avatarColor(selectedEmp.name)}`}>
                  {getInitials(selectedEmp.name)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-gray-900">{selectedEmp.name}</p>
                  <p className="text-xs text-gray-500">
                    {selectedEmp.employeeId && <span className="font-mono text-blue-600 mr-2">{selectedEmp.employeeId}</span>}
                    {selectedEmp.department} · {selectedEmp.designation}
                  </p>
                  <p className="text-xs text-gray-400">{selectedEmp.email}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedEmp(null)}
                  className="p-1.5 rounded-lg hover:bg-blue-100 text-blue-400 hover:text-blue-600 flex-shrink-0"
                  title="Change selection"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Permissions */}
              <div>
                <label className="label flex items-center gap-2 mb-3">
                  <ShieldCheck className="w-4 h-4 text-blue-500" />
                  Assign Permissions
                </label>
                <PermissionsEditor permissions={promotePerms} onChange={setPromotePerms} />
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setShowPromote(false)} className="btn-secondary">Cancel</button>
                <button
                  onClick={handlePromote}
                  disabled={promoting}
                  className="btn-primary flex items-center gap-2"
                >
                  <UserCheck className="w-4 h-4" />
                  {promoting ? 'Promoting...' : `Promote ${selectedEmp.name.split(' ')[0]} to Admin`}
                </button>
              </div>
            </div>
          )}
        </div>
      </Modal>

      {/* ── Edit Permissions Modal ── */}
      <Modal isOpen={!!editAdmin} onClose={() => setEditAdmin(null)} title={`Edit Permissions — ${editAdmin?.name}`} size="lg">
        {editAdmin && (
          <div className="space-y-4">
            <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl border border-gray-100">
              <div className={`w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-bold flex-shrink-0 ${avatarColor(editAdmin.name)}`}>
                {getInitials(editAdmin.name)}
              </div>
              <div>
                <p className="font-medium text-gray-900">{editAdmin.name}</p>
                <p className="text-xs text-gray-400">{editAdmin.email} · {editAdmin.department || 'No dept'}</p>
              </div>
            </div>
            <PermissionsEditor permissions={editPerms} onChange={setEditPerms} />
            <div className="flex justify-end gap-3 pt-2">
              <button onClick={() => setEditAdmin(null)} className="btn-secondary">Cancel</button>
              <button onClick={handleSavePerms} disabled={saving} className="btn-primary">
                {saving ? 'Saving...' : 'Save Permissions'}
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* ── Reset Password Modal ── */}
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

      {/* ── Demote Modal ── */}
      <Modal isOpen={!!demoteModal} onClose={() => setDemoteModal(null)} title="Demote to Employee" size="sm">
        <div className="space-y-4">
          <div className="flex items-start gap-3 p-3 bg-yellow-50 rounded-lg border border-yellow-100">
            <ArrowDownLeft className="w-5 h-5 text-yellow-500 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-yellow-800">
              <strong>{demoteModal?.name}</strong> will lose all admin access and be reverted to a regular employee. Their data will stay intact.
            </p>
          </div>
          <div className="flex justify-end gap-3">
            <button onClick={() => setDemoteModal(null)} className="btn-secondary">Cancel</button>
            <button onClick={handleDemote} className="bg-yellow-500 hover:bg-yellow-600 text-white font-medium px-4 py-2 rounded-lg text-sm flex items-center gap-2">
              <ArrowDownLeft className="w-4 h-4" /> Demote
            </button>
          </div>
        </div>
      </Modal>

      {/* ── Delete Modal ── */}
      <Modal isOpen={!!deleteModal} onClose={() => setDeleteModal(null)} title="Delete Admin" size="sm">
        <div className="space-y-4">
          <div className="flex items-start gap-3 p-3 bg-red-50 rounded-lg border border-red-100">
            <Trash2 className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-red-700">
              Permanently delete <strong>{deleteModal?.name}</strong>? This cannot be undone. Consider demoting instead.
            </p>
          </div>
          <div className="flex justify-end gap-3">
            <button onClick={() => setDeleteModal(null)} className="btn-secondary">Cancel</button>
            <button onClick={handleDelete} className="bg-red-600 hover:bg-red-700 text-white font-medium px-4 py-2 rounded-lg text-sm flex items-center gap-2">
              <Trash2 className="w-4 h-4" /> Delete Permanently
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
