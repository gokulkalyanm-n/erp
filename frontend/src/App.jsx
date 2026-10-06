import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider, useAuth } from './context/AuthContext';
import LoadingSpinner from './components/LoadingSpinner';
import Layout from './components/Layout';

// Pages
import Login from './pages/Login';
import ChangePassword from './pages/ChangePassword';
import EditProfile from './pages/EditProfile';

// Admin
import AdminDashboard from './pages/admin/AdminDashboard';
import Employees from './pages/admin/Employees';
import EmployeeDetail from './pages/admin/EmployeeDetail';
import Projects from './pages/admin/Projects';
import Tasks from './pages/admin/Tasks';
import Reports from './pages/admin/Reports';
import Analytics from './pages/admin/Analytics';
import Announcements from './pages/admin/Announcements';
import AdminManagement from './pages/admin/AdminManagement';
import LeaveManagement from './pages/admin/LeaveManagement';

// Employee
import EmployeeDashboard from './pages/employee/EmployeeDashboard';
import MyProjects from './pages/employee/MyProjects';
import MyTasks from './pages/employee/MyTasks';
import DailyReports from './pages/employee/DailyReports';
import Performance from './pages/employee/Performance';
import MyLeave from './pages/employee/MyLeave';

// Route guard — allows admin AND super_admin
function RequireAdmin({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <LoadingSpinner fullPage />;
  if (!user) return <Navigate to="/login" replace />;
  if (user.role !== 'admin' && user.role !== 'super_admin') {
    return <Navigate to="/employee" replace />;
  }
  return children;
}

function RequireEmployee({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <LoadingSpinner fullPage />;
  if (!user) return <Navigate to="/login" replace />;
  if (user.role !== 'employee') {
    return <Navigate to="/admin" replace />;
  }
  return children;
}

function RedirectIfAuth() {
  const { user, loading } = useAuth();
  if (loading) return <LoadingSpinner fullPage />;
  if (user) {
    if (user.role === 'employee') return <Navigate to="/employee" replace />;
    return <Navigate to="/admin" replace />;
  }
  return <Login />;
}

function AppRoutes() {
  return (
    <Routes>
      {/* Public */}
      <Route path="/login" element={<RedirectIfAuth />} />

      {/* Admin + Super Admin Routes */}
      <Route path="/admin" element={
        <RequireAdmin>
          <Layout />
        </RequireAdmin>
      }>
        <Route index element={<AdminDashboard />} />
        <Route path="employees" element={<Employees />} />
        <Route path="employees/:id" element={<EmployeeDetail />} />
        <Route path="projects" element={<Projects />} />
        <Route path="tasks" element={<Tasks />} />
        <Route path="reports" element={<Reports />} />
        <Route path="analytics" element={<Analytics />} />
        <Route path="announcements" element={<Announcements />} />
        <Route path="admin-management" element={<AdminManagement />} />
        <Route path="leave" element={<LeaveManagement />} />
        <Route path="change-password" element={<ChangePassword />} />
        <Route path="edit-profile" element={<EditProfile />} />
      </Route>

      {/* Employee Routes */}
      <Route path="/employee" element={
        <RequireEmployee>
          <Layout />
        </RequireEmployee>
      }>
        <Route index element={<EmployeeDashboard />} />
        <Route path="projects" element={<MyProjects />} />
        <Route path="tasks" element={<MyTasks />} />
        <Route path="reports" element={<DailyReports />} />
        <Route path="performance" element={<Performance />} />
        <Route path="leave" element={<MyLeave />} />
        <Route path="change-password" element={<ChangePassword />} />
        <Route path="edit-profile" element={<EditProfile />} />
      </Route>

      {/* Default */}
      <Route path="/" element={<Navigate to="/login" replace />} />
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <AppRoutes />
        <Toaster
          position="top-right"
          toastOptions={{
            duration: 3500,
            style: { fontSize: '14px', borderRadius: '10px', boxShadow: '0 4px 20px rgba(0,0,0,0.1)' },
            success: { iconTheme: { primary: '#10b981', secondary: '#fff' } },
            error: { iconTheme: { primary: '#ef4444', secondary: '#fff' } },
          }}
        />
      </BrowserRouter>
    </AuthProvider>
  );
}
