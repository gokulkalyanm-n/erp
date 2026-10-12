import { format, formatDistanceToNow, isPast, isToday } from 'date-fns';

export const formatDate = (date) => {
  if (!date) return '-';
  return format(new Date(date), 'dd MMM yyyy');
};

export const formatDateTime = (date) => {
  if (!date) return '-';
  return format(new Date(date), 'dd MMM yyyy, h:mm a');
};

/**
 * Format a date/time in Indian Standard Time.
 * Output: "07 Oct 2026, 05:20 pm"
 * Matches the notification body format exactly.
 */
export const formatApplied = (d) => {
  if (!d) return '-';
  return new Date(d).toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: true,
  });
};

export const timeAgo = (date) => {
  if (!date) return '-';
  return formatDistanceToNow(new Date(date), { addSuffix: true });
};

export const isOverdue = (date) => {
  if (!date) return false;
  return isPast(new Date(date)) && !isToday(new Date(date));
};

export const statusColor = (status) => {
  const map = {
    'active': 'badge-green',
    'completed': 'badge-green',
    'planning': 'badge-blue',
    'on-hold': 'badge-yellow',
    'cancelled': 'badge-red',
    'todo': 'badge-gray',
    'in-progress': 'badge-blue',
    'review': 'badge-purple',
    'blocked': 'badge-red',
    'pending': 'badge-yellow',
  };
  return map[status] || 'badge-gray';
};

export const priorityColor = (priority) => {
  const map = {
    'low': 'badge-gray',
    'medium': 'badge-blue',
    'high': 'badge-yellow',
    'critical': 'badge-red',
  };
  return map[priority] || 'badge-gray';
};

export const priorityDot = (priority) => {
  const map = {
    'low': 'bg-gray-400',
    'medium': 'bg-blue-500',
    'high': 'bg-orange-500',
    'critical': 'bg-red-600',
  };
  return map[priority] || 'bg-gray-400';
};

export const getInitials = (name) => {
  if (!name) return '?';
  return name.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase();
};

export const avatarColor = (name) => {
  const colors = [
    'bg-blue-500', 'bg-green-500', 'bg-purple-500', 'bg-orange-500',
    'bg-pink-500', 'bg-indigo-500', 'bg-teal-500', 'bg-red-500',
  ];
  if (!name) return colors[0];
  const idx = name.charCodeAt(0) % colors.length;
  return colors[idx];
};
