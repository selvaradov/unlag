// Push notifications for this plan on this device: a button that subscribes or unsubscribes,
// with a line of status beneath it.
import { NOTIFY } from '../copy.ts';
import { ICONS } from './icons.ts';

function supported(): boolean {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

// iOS only allows push once the page is installed to the home screen.
function needsInstall(): boolean {
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent);
  const standalone =
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as { standalone?: boolean }).standalone === true;
  return ios && !standalone;
}

function toKey(base64: string): Uint8Array {
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
  const raw = atob(padded.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

async function currentSubscription(): Promise<PushSubscription | null> {
  const reg = await navigator.serviceWorker.getRegistration();
  return reg ? reg.pushManager.getSubscription() : null;
}

async function subscribe(search: string): Promise<void> {
  const reg = await navigator.serviceWorker.ready;
  const res = await fetch('/api/push/config');
  if (!res.ok) throw new Error('unavailable');
  const { publicKey } = (await res.json()) as { publicKey: string };
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error('denied');
  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: toKey(publicKey) as BufferSource,
  });
  const saved = await fetch('/api/push/subscribe', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ subscription: sub.toJSON(), search }),
  });
  if (!saved.ok) throw new Error('failed');
}

async function unsubscribe(): Promise<void> {
  const sub = await currentSubscription();
  if (!sub) return;
  await fetch('/api/push/subscribe', {
    method: 'DELETE',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ endpoint: sub.endpoint }),
  });
  await sub.unsubscribe();
}

export function renderNotify(search: string): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'notify';
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'icon-button';
  const status = document.createElement('p');
  status.className = 'notify-status';
  wrap.append(button, status);

  const show = (on: boolean, message = '') => {
    button.innerHTML = `${on ? ICONS.check : ICONS.bell}<span>${on ? NOTIFY.on : NOTIFY.off}</span>`;
    status.textContent = message || (on ? NOTIFY.onHint : NOTIFY.offHint);
  };

  if (!supported()) {
    button.disabled = true;
    show(false, NOTIFY.unsupported);
    return wrap;
  }
  if (needsInstall()) {
    button.disabled = true;
    show(false, NOTIFY.install);
    return wrap;
  }
  let on = false;
  void currentSubscription().then((sub) => {
    on = sub !== null;
    show(on);
  });
  show(false, NOTIFY.checking);
  button.addEventListener('click', async () => {
    button.disabled = true;
    try {
      if (on) {
        await unsubscribe();
        on = false;
        show(false);
      } else {
        await subscribe(search);
        on = true;
        show(true, NOTIFY.justOn);
      }
    } catch (err) {
      const code = (err as Error).message;
      show(on, NOTIFY.errors[code] ?? NOTIFY.errors.failed);
    } finally {
      button.disabled = false;
    }
  });
  return wrap;
}
