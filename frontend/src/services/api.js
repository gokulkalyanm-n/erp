import axios from 'axios';
const API_URL = import.meta.env.VITE_API_URL || 'https://erp-fff3.onrender.com';

const api = axios.create({
  baseURL: `${API_URL}/api`,
  headers: {
    'Content-Type': 'application/json',
  },
});




// Attach token to every request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');

  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  return config;
});

// Handle 401 globally
api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/login';
    }

    return Promise.reject(err);
  }
);

// Auth
export const login = (data) => api.post('/auth/login', data);
export const getMe = () => api.get('/auth/me');
export const changePassword = (data) => api.post('/auth/change-password', data);
export const updateProfile = (data) => api.put('/auth/profile', data);

// Employees
export const getEmployees = (params) => api.get('/employees', { params });
export const createEmployee = (data) => api.post('/employees', data);
export const getEmployee = (id) => api.get(`/employees/${id}`);
export const updateEmployee = (id, data) =>
  api.put(`/employees/${id}`, data);
export const toggleEmployeeStatus = (id) =>
  api.patch(`/employees/${id}/toggle-status`);
export const resetPassword = (id, data) =>
  api.patch(`/employees/${id}/reset-password`, data);
export const deleteEmployee = (id) => api.delete(`/employees/${id}`);

// Projects
export const getProjects = (params) => api.get('/projects', { params });
export const createProject = (data) => api.post('/projects', data);
export const getProject = (id) => api.get(`/projects/${id}`);
export const updateProject = (id, data) =>
  api.put(`/projects/${id}`, data);
export const updateProjectStatus = (id, data) =>
  api.patch(`/projects/${id}/status`, data);
export const updateProjectProgress = (id, data) =>
  api.patch(`/projects/${id}/progress`, data);
export const deleteProject = (id) => api.delete(`/projects/${id}`);

// Tasks
export const getTasks = (params) => api.get('/tasks', { params });
export const createTask = (data) => api.post('/tasks', data);
export const getTask = (id) => api.get(`/tasks/${id}`);
export const updateTask = (id, data) =>
  api.put(`/tasks/${id}`, data);
export const updateTaskStatus = (id, data) =>
  api.patch(`/tasks/${id}/status`, data);
export const addComment = (id, data) =>
  api.post(`/tasks/${id}/comment`, data);
export const deleteTask = (id) => api.delete(`/tasks/${id}`);

// Reports
export const getReports = (params) => api.get('/reports', { params });
export const createReport = (data) => api.post('/reports', data);
export const getReport = (id) => api.get(`/reports/${id}`);
export const updateReport = (id, data) =>
  api.put(`/reports/${id}`, data);
export const getMissingReports = () => api.get('/reports/missing');
export const reviewReport = (id, data) =>
  api.patch(`/reports/${id}/review`, data);
export const replyToReview = (id, data) =>
  api.patch(`/reports/${id}/reply`, data);

// Dashboard
export const getAdminDashboard = () => api.get('/dashboard/admin');
export const getEmployeeDashboard = () => api.get('/dashboard/employee');
export const getPerformance = (id) =>
  api.get(`/dashboard/performance/${id}`);

// Announcements
export const getAnnouncements = () => api.get('/announcements');
export const createAnnouncement = (data) => api.post('/announcements', data);
export const updateAnnouncement = (id, data) => api.put(`/announcements/${id}`, data);
export const deleteAnnouncement = (id) => api.delete(`/announcements/${id}`);

// Payroll
export const getPayrollSalaries = () => api.get('/payroll/salaries');
export const updateSalary = (id, data) => api.patch(`/payroll/salaries/${id}`, data);
export const getPayroll = (params) => api.get('/payroll', { params });
export const generatePayroll = (data) => api.post('/payroll/generate', data);
export const updateAdjustments = (id, data) => api.patch(`/payroll/${id}/adjustments`, data);
export const markPaid = (id) => api.patch(`/payroll/${id}/mark-paid`);
export const markAllPaid = (data) => api.patch('/payroll/mark-all-paid', data);
export const updatePayrollStatus = (id, data) => api.patch(`/payroll/${id}/status`, data);
export const getMyPayroll = () => api.get('/payroll/my');

// Attendance
export const getAttendanceSettings = () => api.get('/attendance/settings');
export const updateAttendanceSettings = (data) => api.put('/attendance/settings', data);
export const getMyAttendance = (params) => api.get('/attendance/my', { params });
export const getDailyAttendance = (params) => api.get('/attendance/daily', { params });
export const getMonthlyAttendance = (params) => api.get('/attendance/monthly', { params });
export const getEmployeeAttendance = (id, params) => api.get(`/attendance/employee/${id}`, { params });

// Documents
export const uploadEmployeeDoc  = (formData) => api.post('/documents/employee', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
export const uploadAdminDoc     = (formData) => api.post('/documents/admin', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
export const getMyDocuments     = () => api.get('/documents/my');
export const getSharedDocuments = () => api.get('/documents/shared');
export const getCompanyDocuments= () => api.get('/documents/company');
export const getAdminDocuments  = (params) => api.get('/documents/admin', { params });
export const getAdminSharedDocs = () => api.get('/documents/admin/shared');
export const deleteDocument     = (id) => api.delete(`/documents/${id}`);
// Download returns the raw binary — use responseType blob
export const downloadDocument   = (id) => api.get(`/documents/${id}/download`, { responseType: 'blob' });

// Attendance Corrections
export const submitCorrection  = (data) => api.post('/corrections', data);
export const getCorrections    = (params) => api.get('/corrections', { params });
export const reviewCorrection  = (id, data) => api.patch(`/corrections/${id}/review`, data);

// Leave
export const getLeaves = (params) => api.get('/leave', { params });
export const applyLeave = (data) => api.post('/leave', data);
export const getLeave = (id) => api.get(`/leave/${id}`);
export const hrReviewLeave = (id, data) => api.patch(`/leave/${id}/hr-review`, data);
export const saReviewLeave = (id, data) => api.patch(`/leave/${id}/sa-review`, data);
export const deleteLeave = (id) => api.delete(`/leave/${id}`);

// Admin Management (super_admin only)
export const getAdmins = () => api.get('/admins');
export const createAdmin = (data) => api.post('/admins', data);
export const getAdmin = (id) => api.get(`/admins/${id}`);
export const updateAdmin = (id, data) => api.put(`/admins/${id}`, data);
export const toggleAdminStatus = (id) => api.patch(`/admins/${id}/toggle-status`);
export const resetAdminPassword = (id, data) => api.patch(`/admins/${id}/reset-password`, data);
export const deleteAdmin = (id) => api.delete(`/admins/${id}`);
export const getPermissionsList = () => api.get('/admins/permissions/list');
export const promoteEmployee = (employeeId, data) => api.post(`/admins/promote/${employeeId}`, data);
export const demoteAdmin = (adminId) => api.post(`/admins/demote/${adminId}`);

export default api;