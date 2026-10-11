import { Capacitor } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';
import api from './api';

let listenersAdded = false;
let currentToken = null;

// Call after login. Does nothing in the browser, only runs inside the app.
export async function initPush() {
  if (!Capacitor.isNativePlatform()) return;

  try {
    const perm = await PushNotifications.requestPermissions();
    if (perm.receive !== 'granted') return;

    if (!listenersAdded) {
      listenersAdded = true;

      await PushNotifications.addListener('registration', async (t) => {
        currentToken = t.value;
        try {
          await api.post('/devices/token', { token: t.value });
        } catch (e) {
          console.error('Saving device token failed', e);
        }
      });

      await PushNotifications.addListener('registrationError', (e) => {
        console.error('Push registration error', e);
      });
    }

    await PushNotifications.register();
  } catch (e) {
    console.error('Push setup failed', e);
  }
}

// Call before logout so this phone stops getting that user's notifications.
export async function removePush() {
  if (!Capacitor.isNativePlatform() || !currentToken) return;
  try {
    await api.delete('/devices/token', { data: { token: currentToken } });
  } catch (e) {
    console.error('Removing device token failed', e);
  }
  currentToken = null;
}