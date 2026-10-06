import { useState } from 'react';
import { Outlet, NavLink } from 'react-router-dom';
import Sidebar from './Sidebar';
import AnnouncementBanner from './AnnouncementBanner';
import { useAuth } from '../context/AuthContext';
import {
  Menu, LayoutDashboard, Users, FolderKanban,
  CheckSquare, FileText, BarChart3, Building2,
  ShieldCheck, UserCog, CalendarOff
} from 'lucide-react';

const employeeBottomLinks = [
  { to: '/employee', icon: LayoutDashboard, label: 'Home', end: true },
  { to: '/employee/projects', icon: FolderKanban, label: 'Projects' },
  { to: '/employee/tasks', icon: CheckSquare, label: 'Tasks' },
  { to: '/employee/reports', icon: FileText, label: 'Reports' },
  { to: '/employee/leave', icon: CalendarOff, label: 'Leave' },
];

export default function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { user, hasPermission } = useAuth();
  const isEmployee = user?.role === 'employee';
  const basePath = isEmployee ? '/employee' : '/admin';

  // Admin bottom nav — permission-aware, max 5 items
  const adminBottomLinks = [
    { to: '/admin', icon: LayoutDashboard, label: 'Home', end: true, show: true },
    { to: '/admin/employees', icon: Users, label: 'Staff', show: hasPermission('EMPLOYEE_VIEW') },
    { to: '/admin/projects', icon: FolderKanban, label: 'Projects', show: hasPermission('PROJECT_VIEW') },
    { to: '/admin/tasks', icon: CheckSquare, label: 'Tasks', show: hasPermission('TASK_VIEW') },
    { to: '/admin/reports', icon: FileText, label: 'Reports', show: hasPermission('REPORTS_VIEW') },
    { to: '/admin/analytics', icon: BarChart3, label: 'Analytics', show: hasPermission('ANALYTICS_VIEW') },
  ].filter(l => l.show).slice(0, 5);

  const bottomLinks = isEmployee ? employeeBottomLinks : adminBottomLinks;

  return (
    <div className="flex min-h-screen bg-gray-50">
      {/* Desktop sidebar */}
      <div className="hidden lg:flex lg:flex-shrink-0">
        <Sidebar open={true} onClose={() => {}} />
      </div>

      {/* Mobile sidebar */}
      <div className="lg:hidden">
        <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      </div>

      <div className="flex-1 flex flex-col min-w-0">
        {/* Mobile top bar */}
        <header className="lg:hidden sticky top-0 z-30 bg-white border-b border-gray-200 px-4 py-3 flex items-center gap-3 shadow-sm">
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 transition-colors"
            aria-label="Open menu"
          >
            <Menu className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2 flex-1">
            <div className="w-6 h-6 bg-blue-600 rounded flex items-center justify-center">
              <Building2 className="w-3.5 h-3.5 text-white" />
            </div>
            <span className="font-bold text-gray-900 text-sm">MG Solutions</span>
          </div>
          <div className="flex items-center gap-1">
            <NavLink
              to={`${basePath}/edit-profile`}
              className={({ isActive }) =>
                `p-1.5 rounded-lg transition-colors ${isActive ? 'bg-purple-100 text-purple-600' : 'text-gray-400 hover:bg-gray-100'}`
              }
              title="Edit Profile"
            >
              <UserCog className="w-4 h-4" />
            </NavLink>
            <NavLink
              to={`${basePath}/change-password`}
              className={({ isActive }) =>
                `p-1.5 rounded-lg transition-colors ${isActive ? 'bg-blue-100 text-blue-600' : 'text-gray-400 hover:bg-gray-100'}`
              }
              title="Change Password"
            >
              <ShieldCheck className="w-4 h-4" />
            </NavLink>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-x-hidden pb-20 lg:pb-0">
          {isEmployee && <AnnouncementBanner />}
          <Outlet />
        </main>

        {/* Mobile bottom navigation */}
        <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-30 bg-white border-t border-gray-200 flex items-stretch">
          {bottomLinks.map(({ to, icon: Icon, label, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `flex-1 flex flex-col items-center justify-center py-2 gap-0.5 text-xs font-medium transition-colors ${
                  isActive ? 'text-blue-600' : 'text-gray-400 hover:text-gray-600'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <div className={`p-1 rounded-lg transition-colors ${isActive ? 'bg-blue-50' : ''}`}>
                    <Icon className="w-5 h-5" />
                  </div>
                  <span className="leading-none">{label}</span>
                </>
              )}
            </NavLink>
          ))}
        </nav>
      </div>
    </div>
  );
}
