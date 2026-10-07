const path = require('path');
const { initializeApp, cert } = require('firebase-admin/app');
const { getMessaging } = require('firebase-admin/messaging');
const User = require('../models/User');

const fs = require('fs');

const renderPath = '/etc/secrets/firebase-key.json';
const localPath = path.join(__dirname, '..', 'firebase-key.json');
const keyPath = fs.existsSync(renderPath) ? renderPath : localPath;

initializeApp({
  credential: cert(JSON.parse(fs.readFileSync(keyPath, 'utf8'))),
});

const DEAD_TOKEN_ERRORS = [
  'messaging/registration-token-not-registered',
  'messaging/invalid-registration-token',
];

async function sendToAll(title, body, data = {}) {
  const users = await User.find({ isActive: true, 'deviceTokens.0': { $exists: true } })
    .select('deviceTokens');
  const tokens = [...new Set(users.flatMap(u => u.deviceTokens))];
  if (!tokens.length) return;

  for (let i = 0; i < tokens.length; i += 500) {
    const batch = tokens.slice(i, i + 500);
    const res = await getMessaging().sendEachForMulticast({
      tokens: batch,
      notification: { title, body },
      data,
      android: { priority: 'high' },
    });

    const dead = [];
    res.responses.forEach((r, idx) => {
      if (!r.success && DEAD_TOKEN_ERRORS.includes(r.error?.code)) dead.push(batch[idx]);
    });
    if (dead.length) {
      await User.updateMany({}, { $pull: { deviceTokens: { $in: dead } } });
    }
  }
}

module.exports = { sendToAll };