import { NavLink, useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { getInitials, avatarColor } from '../utils/helpers';
import { getLeaves } from '../services/api';
import {
  LayoutDashboard, Users, FolderKanban, CheckSquare,
  FileText, BarChart3, LogOut, Building2, X,
  ShieldCheck, UserCog, Megaphone, CalendarOff, ShieldHalf
} from 'lucide-react';

const employeeLinks = [
  { to: '/employee', icon: LayoutDashboard, label: 'Dashboard', end: true },
  { to: '/employee/projects', icon: FolderKanban, label: 'My Projects' },
  { to: '/employee/tasks', icon: CheckSquare, label: 'My Tasks' },
  { to: '/employee/reports', icon: FileText, label: 'Daily Reports' },
  { to: '/employee/performance', icon: BarChart3, label: 'Performance' },
  { to: '/employee/leave', icon: CalendarOff, label: 'My Leave' },
];

export default function Sidebar({ open, onClose }) {
  const { user, logoutUser, hasPermission, isSuperAdmin } = useAuth();
  const navigate = useNavigate();
  const basePath = user?.role === 'employee' ? '/employee' : '/admin';
  const [pendingLeaveCount, setPendingLeaveCount] = useState(0);

  // Fetch pending leave count for admins who can view leave
  useEffect(() => {
    const canSeeLeave = isSuperAdmin || hasPermission('LEAVE_VIEW');
    if (!canSeeLeave || user?.role === 'employee') return;

    getLeaves({ status: 'pending' })
      .then(res => setPendingLeaveCount(res.data.length))
      .catch(() => {});

    // Refresh every 2 minutes
    const interval = setInterval(() => {
      getLeaves({ status: 'pending' })
        .then(res => setPendingLeaveCount(res.data.length))
        .catch(() => {});
    }, 120000);

    return () => clearInterval(interval);
  }, [user]);

  const handleLogout = () => {
    logoutUser();
    navigate('/login');
    onClose?.();
  };

  const handleNav = () => onClose?.();

  // Build dynamic admin links based on permissions
  const adminLinks = [
    { to: '/admin',                  icon: LayoutDashboard, label: 'Dashboard',        end: true, show: true },
    { to: '/admin/employees',        icon: Users,           label: 'Employees',         show: hasPermission('EMPLOYEE_VIEW') },
    { to: '/admin/projects',         icon: FolderKanban,    label: 'Projects',          show: hasPermission('PROJECT_VIEW') },
    { to: '/admin/tasks',            icon: CheckSquare,     label: 'Tasks',             show: hasPermission('TASK_VIEW') },
    { to: '/admin/reports',          icon: FileText,        label: 'Daily Reports',     show: hasPermission('REPORTS_VIEW') },
    { to: '/admin/analytics',        icon: BarChart3,       label: 'Analytics',         show: hasPermission('ANALYTICS_VIEW') },
    { to: '/admin/leave',            icon: CalendarOff,     label: 'Leave Management',  show: hasPermission('LEAVE_VIEW') || isSuperAdmin, badge: pendingLeaveCount },
    { to: '/admin/announcements',    icon: Megaphone,       label: 'Announcements',     show: hasPermission('ANNOUNCEMENTS_MANAGE') },
    { to: '/admin/admin-management', icon: ShieldHalf,      label: 'Admin Management',  show: isSuperAdmin },
  ].filter(l => l.show);

  const links = user?.role === 'employee' ? employeeLinks : adminLinks;

  return (
    <>
      {open && (
        <div className="fixed inset-0 bg-black/60 z-40 lg:hidden" onClick={onClose} />
      )}

      <aside className={`
        fixed top-0 left-0 h-full w-64 bg-gray-900 flex flex-col z-50
        transition-transform duration-300 ease-in-out
        ${open ? 'translate-x-0' : '-translate-x-full'}
        lg:translate-x-0 lg:static lg:z-auto
      `}>
        {/* Logo */}
        <div className="px-4 py-4 border-b border-gray-700 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center flex-shrink-0">
              <Building2 className="w-4 h-4 text-white" />
            </div>
            <div>
              <p className="text-white font-bold text-sm leading-tight">MG Solutions</p>
              <p className="text-gray-400 text-xs">ERP System</p>
            </div>
          </div>
          <button onClick={onClose} className="lg:hidden p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-gray-700 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Role badge */}
        {user?.role !== 'employee' && (
          <div className="px-4 py-2 border-b border-gray-700">
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
              isSuperAdmin ? 'bg-yellow-500/20 text-yellow-400' : 'bg-blue-500/20 text-blue-400'
            }`}>
              {isSuperAdmin ? '⭐ Super Admin' : 'Admin'}
            </span>
          </div>
        )}

        {/* Nav Links */}
        <nav className="flex-1 px-3 py-3 space-y-0.5 overflow-y-auto">
          {links.map(({ to, icon: Icon, label, end, badge }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              onClick={handleNav}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  isActive ? 'bg-blue-600 text-white' : 'text-gray-400 hover:bg-gray-800 hover:text-white'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <Icon className="w-4 h-4 flex-shrink-0" />
                  <span className="flex-1">{label}</span>
                  {/* Pending badge — hidden when on the leave page itself */}
                  {badge > 0 && !isActive && (
                    <span className="flex-shrink-0 min-w-[18px] h-[18px] px-1 rounded-full bg-orange-500 text-white text-xs font-bold flex items-center justify-center leading-none">
                      {badge > 99 ? '99+' : badge}
                    </span>
                  )}
                </>
              )}
            </NavLink>
          ))}
        </nav>

        {/* Bottom: user + account actions */}
        <div className="px-3 py-3 border-t border-gray-700 space-y-0.5 flex-shrink-0">
          <div className="flex items-center gap-3 px-3 py-2 mb-1">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0 ${avatarColor(user?.name)}`}>
              {getInitials(user?.name)}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-white text-sm font-medium truncate">{user?.name}</p>
              <p className="text-gray-400 text-xs capitalize">{user?.role?.replace('_', ' ')}</p>
            </div>
          </div>

          <NavLink
            to={`${basePath}/edit-profile`}
            onClick={handleNav}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                isActive ? 'bg-gray-700 text-white' : 'text-gray-400 hover:bg-gray-800 hover:text-white'
              }`
            }
          >
            <UserCog className="w-4 h-4 flex-shrink-0" />
            <span>Edit Profile</span>
          </NavLink>

          <NavLink
            to={`${basePath}/change-password`}
            onClick={handleNav}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                isActive ? 'bg-gray-700 text-white' : 'text-gray-400 hover:bg-gray-800 hover:text-white'
              }`
            }
          >
            <ShieldCheck className="w-4 h-4 flex-shrink-0" />
            <span>Change Password</span>
          </NavLink>

          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-gray-400 hover:bg-red-900/30 hover:text-red-400 transition-colors"
          >
            <LogOut className="w-4 h-4 flex-shrink-0" />
            Sign Out
          </button>
        </div>
      </aside>
    </>
  );
}
