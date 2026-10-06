const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Project = require('../models/Project');
const Task = require('../models/Task');
const DailyReport = require('../models/DailyReport');
const { protect, adminOnly, hasPermission } = require('../middleware/auth');

// GET /api/dashboard/admin — Admin analytics
router.get('/admin', protect, adminOnly, async (req, res) => {
  try {
    const [
      totalEmployees,
      activeEmployees,
      totalProjects,
      activeProjects,
      completedProjects,
      totalTasks,
      completedTasks,
      pendingTasks,
      inProgressTasks,
      totalReports
    ] = await Promise.all([
      User.countDocuments({ role: 'employee' }),
      User.countDocuments({ role: 'employee', isActive: true }),
      Project.countDocuments(),
      Project.countDocuments({ status: 'active' }),
      Project.countDocuments({ status: 'completed' }),
      Task.countDocuments(),
      Task.countDocuments({ status: 'completed' }),
      Task.countDocuments({ status: 'todo' }),
      Task.countDocuments({ status: 'in-progress' }),
      DailyReport.countDocuments()
    ]);

    // Today's reports
    const today = new Date();
    const dayStart = new Date(today.setHours(0, 0, 0, 0));
    const dayEnd = new Date(today.setHours(23, 59, 59, 999));
    const todayReports = await DailyReport.countDocuments({ date: { $gte: dayStart, $lte: dayEnd } });

    // Department-wise employees
    const deptStats = await User.aggregate([
      { $match: { role: 'employee', isActive: true } },
      { $group: { _id: '$department', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]);

    // Recent projects
    const recentProjects = await Project.find()
      .sort({ createdAt: -1 })
      .limit(5)
      .populate('assignedEmployees.employee', 'name')
      .select('name status deadline priority completionPercentage');

    // Recent reports
    const recentReports = await DailyReport.find()
      .sort({ createdAt: -1 })
      .limit(5)
      .populate('employee', 'name employeeId')
      .populate('project', 'name');

    // Task completion by month (last 6 months)
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    const tasksByMonth = await Task.aggregate([
      { $match: { completedAt: { $gte: sixMonthsAgo }, status: 'completed' } },
      {
        $group: {
          _id: { year: { $year: '$completedAt' }, month: { $month: '$completedAt' } },
          count: { $sum: 1 }
        }
      },
      { $sort: { '_id.year': 1, '_id.month': 1 } }
    ]);

    // Hours worked last 7 days
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const hoursPerDay = await DailyReport.aggregate([
      { $match: { date: { $gte: sevenDaysAgo } } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$date' } },
          totalHours: { $sum: '$hoursWorked' }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    res.json({
      stats: {
        totalEmployees,
        activeEmployees,
        totalProjects,
        activeProjects,
        completedProjects,
        totalTasks,
        completedTasks,
        pendingTasks,
        inProgressTasks,
        totalReports,
        todayReports
      },
      deptStats,
      recentProjects,
      recentReports,
      tasksByMonth,
      hoursPerDay
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/dashboard/employee — Employee dashboard
router.get('/employee', protect, async (req, res) => {
  try {
    const userId = req.user._id;

    const [myProjects, myTasks, myReports] = await Promise.all([
      Project.find({ 'assignedEmployees.employee': userId, status: { $ne: 'cancelled' } })
        .select('name projectId status deadline priority')
        .limit(10),
      Task.find({ assignedTo: userId })
        .populate('project', 'name')
        .sort({ dueDate: 1 }),
      DailyReport.find({ employee: userId })
        .populate('project', 'name')
        .sort({ date: -1 })
        .limit(10)
    ]);

    const completedTasks = myTasks.filter(t => t.status === 'completed').length;
    const pendingTasks = myTasks.filter(t => t.status === 'todo').length;
    const inProgressTasks = myTasks.filter(t => t.status === 'in-progress').length;

    // Total hours this week
    const weekStart = new Date();
    weekStart.setDate(weekStart.getDate() - 7);
    const weekReports = myReports.filter(r => new Date(r.date) >= weekStart);
    const weeklyHours = weekReports.reduce((sum, r) => sum + r.hoursWorked, 0);

    // Check if today's report submitted
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);
    const todayReport = await DailyReport.findOne({
      employee: userId,
      date: { $gte: todayStart, $lte: todayEnd }
    });

    // Overdue tasks
    const now = new Date();
    const overdueTasks = myTasks.filter(
      t => new Date(t.dueDate) < now && t.status !== 'completed' && t.status !== 'cancelled'
    );

    // Task completion trend (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const taskTrend = await Task.aggregate([
      { $match: { assignedTo: userId, completedAt: { $gte: thirtyDaysAgo } } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$completedAt' } },
          count: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    res.json({
      stats: {
        totalProjects: myProjects.length,
        completedTasks,
        pendingTasks,
        inProgressTasks,
        weeklyHours,
        totalReports: myReports.length,
        todayReportSubmitted: !!todayReport,
        overdueTasksCount: overdueTasks.length
      },
      myProjects,
      myTasks,
      recentReports: myReports,
      overdueTasks,
      taskTrend
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/dashboard/performance/:employeeId — Performance metrics
router.get('/performance/:employeeId', protect, async (req, res) => {
  try {
    const { employeeId } = req.params;

    // Employees can only see their own performance
    if (req.user.role === 'employee' && req.user._id.toString() !== employeeId)
      return res.status(403).json({ message: 'Access denied' });

    const employee = await User.findById(employeeId).select('-password');
    if (!employee) return res.status(404).json({ message: 'Employee not found' });

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const [allTasks, allReports, projects] = await Promise.all([
      Task.find({ assignedTo: employeeId }).populate('project', 'name'),
      DailyReport.find({ employee: employeeId }).sort({ date: 1 }),
      Project.find({ 'assignedEmployees.employee': employeeId }).select('name status')
    ]);

    const completedOnTime = allTasks.filter(
      t => t.status === 'completed' && t.completedAt && new Date(t.completedAt) <= new Date(t.dueDate)
    ).length;
    const completedLate = allTasks.filter(
      t => t.status === 'completed' && t.completedAt && new Date(t.completedAt) > new Date(t.dueDate)
    ).length;

    // Report consistency (last 30 days)
    const recentReports = allReports.filter(r => new Date(r.date) >= thirtyDaysAgo);
    const totalHours = allReports.reduce((sum, r) => sum + r.hoursWorked, 0);

    // Hours per week
    const hoursPerWeek = await DailyReport.aggregate([
      { $match: { employee: employee._id } },
      {
        $group: {
          _id: { week: { $week: '$date' }, year: { $year: '$date' } },
          totalHours: { $sum: '$hoursWorked' },
          reportCount: { $sum: 1 }
        }
      },
      { $sort: { '_id.year': 1, '_id.week': 1 } },
      { $limit: 12 }
    ]);

    // Task status distribution
    const taskStatusDist = {
      completed: allTasks.filter(t => t.status === 'completed').length,
      inProgress: allTasks.filter(t => t.status === 'in-progress').length,
      todo: allTasks.filter(t => t.status === 'todo').length,
      cancelled: allTasks.filter(t => t.status === 'cancelled').length
    };

    res.json({
      employee,
      performance: {
        totalTasks: allTasks.length,
        completedOnTime,
        completedLate,
        completionRate: allTasks.length > 0
          ? Math.round(((completedOnTime + completedLate) / allTasks.length) * 100)
          : 0,
        totalReports: allReports.length,
        recentReports: recentReports.length,
        totalHoursWorked: totalHours,
        avgDailyHours: allReports.length > 0 ? (totalHours / allReports.length).toFixed(1) : 0,
        taskStatusDist
      },
      hoursPerWeek,
      projects,
      recentReports: recentReports.slice(-10)
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
