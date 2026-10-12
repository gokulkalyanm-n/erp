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
 * De-duplicates by user ID first, then by token value, so no user or token
 * is ever notified twice.
 * Removes dead tokens from all users after each batch.
 *
 * @param {{ userId: string, tokens: string[] }[]} userTokenPairs
 * @param {string} title
 * @param {string} body
 * @param {Object} data  — all values must be strings
 */
async function _sendToTokens(userTokenPairs, title, body, data = {}) {
  // 1. De-duplicate by user ID
  const seenUsers = new Set();
  const dedupedPairs = userTokenPairs.filter(p => {
    const id = String(p.userId);
    if (seenUsers.has(id)) return false;
    seenUsers.add(id);
    return true;
  });

  // 2. Flatten tokens, de-duplicate by token value
  const seenTokens = new Set();
  const unique = [];
  for (const p of dedupedPairs) {
    for (const t of p.tokens) {
      if (!seenTokens.has(t)) {
        seenTokens.add(t);
        unique.push(t);
      }
    }
  }

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

/** Internal: fetch users matching a mongo filter and build userTokenPairs */
async function _fetchPairs(filter) {
  const users = await User.find(
    { ...filter, isActive: true, 'deviceTokens.0': { $exists: true } },
    '_id deviceTokens'
  );
  return users.map(u => ({ userId: String(u._id), tokens: u.deviceTokens }));
}

/**
 * Send to ALL active users who have at least one device token.
 */
async function sendToAll(title, body, data = {}) {
  const pairs = await _fetchPairs({});
  await _sendToTokens(pairs, title, body, data);
}

/**
 * Send to specific users by their MongoDB _id values.
 * Silently skips users with no tokens.
 * @param {string[]|ObjectId[]} userIds
 */
async function sendToUsers(userIds, title, body, data = {}) {
  if (!userIds || !userIds.length) return;
  const pairs = await _fetchPairs({ _id: { $in: userIds } });
  await _sendToTokens(pairs, title, body, data);
}

/**
 * Send to all active users whose role is in the given array.
 * @param {string[]} roles  e.g. ['super_admin']
 */
async function sendToRoles(roles, title, body, data = {}) {
  if (!roles || !roles.length) return;
  const pairs = await _fetchPairs({ role: { $in: roles } });
  await _sendToTokens(pairs, title, body, data);
}

/**
 * Send to admins (role='admin') who have a specific permission.
 * Does NOT include super_admin — use sendToRoles(['super_admin']) for that.
 * @param {string} permission  e.g. 'LEAVE_APPROVE'
 */
async function sendToPermission(permission, title, body, data = {}) {
  const pairs = await _fetchPairs({
    role: 'admin',
    permissions: permission,
  });
  await _sendToTokens(pairs, title, body, data);
}

module.exports = { sendToAll, sendToUsers, sendToRoles, sendToPermission };
