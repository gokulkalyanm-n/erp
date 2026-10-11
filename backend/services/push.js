const path = require('path');
const { initializeApp, cert } = require('firebase-admin/app');
const { getMessaging } = require('firebase-admin/messaging');
const User = require('../models/User');
const fs = require('fs');

const renderPath = '/etc/secrets/firebase-key.json';
const localPath  = path.join(__dirname, '..', 'firebase-key.json');
const keyPath    = fs.existsSync(renderPath) ? renderPath : localPath;

initializeApp({
  credential: cert(JSON.parse(fs.readFileSync(keyPath, 'utf8'))),
});

const DEAD_TOKEN_ERRORS = [
  'messaging/registration-token-not-registered',
  'messaging/invalid-registration-token',
];

/**
 * Send to an explicit list of tokens in batches of 500.
 * Removes dead tokens from all users after each batch.
 * @param {string[]} tokens
 * @param {string} title
 * @param {string} body
 * @param {Object} data  — all values must be strings
 */
async function _sendToTokens(tokens, title, body, data = {}) {
  const unique = [...new Set(tokens)];
  if (!unique.length) return;

  const strData = Object.fromEntries(
    Object.entries(data).map(([k, v]) => [k, String(v)])
  );

  for (let i = 0; i < unique.length; i += 500) {
    const batch = unique.slice(i, i + 500);
    const res = await getMessaging().sendEachForMulticast({
      tokens: batch,
      notification: { title, body },
      data: strData,
      android: { priority: 'high' },
    });

    const dead = [];
    res.responses.forEach((r, idx) => {
      if (!r.success && DEAD_TOKEN_ERRORS.includes(r.error?.code)) {
        dead.push(batch[idx]);
      }
    });
    if (dead.length) {
      await User.updateMany({}, { $pull: { deviceTokens: { $in: dead } } });
    }
  }
}

/**
 * Send to ALL active users who have at least one device token.
 */
async function sendToAll(title, body, data = {}) {
  const users = await User.find(
    { isActive: true, 'deviceTokens.0': { $exists: true } },
    'deviceTokens'
  );
  const tokens = users.flatMap(u => u.deviceTokens);
  await _sendToTokens(tokens, title, body, data);
}

/**
 * Send to specific users by their MongoDB _id values.
 * Silently skips users with no tokens.
 * @param {string[]|ObjectId[]} userIds
 */
async function sendToUsers(userIds, title, body, data = {}) {
  if (!userIds || !userIds.length) return;
  const users = await User.find(
    { _id: { $in: userIds }, isActive: true, 'deviceTokens.0': { $exists: true } },
    'deviceTokens'
  );
  const tokens = users.flatMap(u => u.deviceTokens);
  await _sendToTokens(tokens, title, body, data);
}

/**
 * Send to all active users whose role is in the given array.
 * @param {string[]} roles  e.g. ['admin', 'super_admin']
 */
async function sendToRoles(roles, title, body, data = {}) {
  if (!roles || !roles.length) return;
  const users = await User.find(
    { role: { $in: roles }, isActive: true, 'deviceTokens.0': { $exists: true } },
    'deviceTokens'
  );
  const tokens = users.flatMap(u => u.deviceTokens);
  await _sendToTokens(tokens, title, body, data);
}

/**
 * Send to all admins (role=admin) who have a specific permission,
 * plus all super_admins.
 * Useful for "notify HR" scenarios.
 * @param {string} permission  e.g. 'LEAVE_APPROVE'
 */
async function sendToPermission(permission, title, body, data = {}) {
  const users = await User.find(
    {
      isActive: true,
      'deviceTokens.0': { $exists: true },
      $or: [
        { role: 'super_admin' },
        { role: 'admin', permissions: permission },
      ],
    },
    'deviceTokens'
  );
  const tokens = users.flatMap(u => u.deviceTokens);
  await _sendToTokens(tokens, title, body, data);
}

module.exports = { sendToAll, sendToUsers, sendToRoles, sendToPermission };
