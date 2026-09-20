import { api } from './api.js';

function isIos() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

function isStandalone() {
  return matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
}

function applicationServerKey(value) {
  const padding = '='.repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replace(/-/g, '+').replace(/_/g, '/');
  const bytes = atob(base64);
  return Uint8Array.from(bytes, character => character.charCodeAt(0));
}

async function registration() {
  let current = await navigator.serviceWorker.getRegistration('/');
  if (!current) await navigator.serviceWorker.register('/sw.js');
  return navigator.serviceWorker.ready;
}

export async function getPushState() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
    return { supported: false, reason: 'unsupported', subscribed: false };
  }
  if (isIos() && !isStandalone()) {
    return { supported: false, reason: 'ios-install', subscribed: false };
  }
  try {
    const config = await api.pushConfig();
    if (!config.configured) return { supported: true, configured: false, subscribed: false, permission: Notification.permission };
    const current = await (await registration()).pushManager.getSubscription();
    return {
      supported: true,
      configured: true,
      subscribed: Boolean(current),
      permission: Notification.permission,
      publicKey: config.public_key,
      devices: config.devices,
    };
  } catch (error) {
    return { supported: true, configured: false, subscribed: false, error: error.message };
  }
}

export async function enablePush(publicKey) {
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error('Debes permitir las notificaciones desde los ajustes del dispositivo.');
  const worker = await registration();
  let subscription = await worker.pushManager.getSubscription();
  if (!subscription) {
    subscription = await worker.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: applicationServerKey(publicKey),
    });
  }
  await api.subscribePush(subscription.toJSON());
  return getPushState();
}

export async function disablePush() {
  const worker = await registration();
  const subscription = await worker.pushManager.getSubscription();
  if (subscription) {
    await api.unsubscribePush(subscription.endpoint);
    await subscription.unsubscribe();
  }
  if (navigator.clearAppBadge) await navigator.clearAppBadge().catch(() => {});
  return getPushState();
}

export async function sendTestPush() {
  return api.testPush();
}
