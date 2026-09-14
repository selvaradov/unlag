// Push notifications for this plan on this device: a button that subscribes or unsubscribes,
// with a line beside it that appears only when something needs saying. The subscription is tied to a plan, so a device following a
// different plan is offered a switch.
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
  if (!supported()) return null;
  const reg = await navigator.serviceWorker.getRegistration();
  return reg ? reg.pushManager.getSubscription() : null;
}

// The plan the server has for this device's subscription, or null.
async function followedPlan(sub: PushSubscription): Promise<string | null> {
  const res = await fetch(`/api/push/status?endpoint=${encodeURIComponent(sub.endpoint)}`);
  if (!res.ok) return null;
  return ((await res.json()) as { search: string | null }).search;
}

async function save(sub: PushSubscription, search: string): Promise<void> {
  const saved = await fetch('/api/push/subscribe', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ subscription: sub.toJSON(), search }),
  });
  if (!saved.ok) throw new Error('failed');
}

async function subscribe(search: string): Promise<void> {
  const reg = await navigator.serviceWorker.ready;
  const res = await fetch('/api/push/config');
  if (!res.ok) throw new Error('unavailable');
  const { publicKey } = (await res.json()) as { publicKey: string };
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error('denied');
  const sub =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: toKey(publicKey) as BufferSource,
    }));
  await save(sub, search);
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

// After an edit, a device that follows a plan keeps following the edited one.
export async function syncSubscription(search: string): Promise<void> {
  const sub = await currentSubscription();
  if (!sub) return;
  const followed = await followedPlan(sub);
  if (followed !== null && followed !== search) await save(sub, search);
}

type State = 'off' | 'on' | 'other';

export function renderNotify(search: string): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'action-line notify';
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'icon-button';
  const status = document.createElement('p');
  status.className = 'action-status';
  wrap.append(button, status);

  const show = (state: State, message = '') => {
    const label = state === 'on' ? NOTIFY.on : state === 'other' ? NOTIFY.switchTo : NOTIFY.off;
    const icon = state === 'on' ? ICONS.check : ICONS.bell;
    button.innerHTML = `${icon}<span>${label}</span>`;
    status.textContent = message;
    status.hidden = message === '';
  };

  if (!supported()) {
    wrap.classList.add('impossible');
    button.disabled = true;
    show('off', NOTIFY.unsupported);
    return wrap;
  }
  if (needsInstall()) {
    // No install prompt exists on iOS; the share sheet is where Add to Home Screen lives.
    wrap.classList.add('impossible');
    button.disabled = true;
    show('off', NOTIFY.install);
    const add = document.createElement('button');
    add.type = 'button';
    add.className = 'icon-button';
    add.innerHTML = `${ICONS.share}<span>${NOTIFY.addToHome}</span>`;
    add.addEventListener('click', async () => {
      if (navigator.share) {
        try {
          await navigator.share({ title: 'Unlag', url: location.href });
        } catch {
          // Cancelled; the written steps stay on screen.
        }
      }
      status.textContent = NOTIFY.addToHomeSteps;
      status.hidden = false;
    });
    wrap.appendChild(add);
    return wrap;
  }

  let state: State = 'off';
  show('off');
  void (async () => {
    const sub = await currentSubscription();
    const followed = sub ? await followedPlan(sub) : null;
    state = followed === null ? 'off' : followed === search ? 'on' : 'other';
    show(state);
  })();

  button.addEventListener('click', async () => {
    button.disabled = true;
    try {
      if (state === 'on') {
        await unsubscribe();
        state = 'off';
        show(state);
      } else {
        await subscribe(search);
        state = 'on';
        show(state);
      }
    } catch (err) {
      const code = (err as Error).message;
      show(state, NOTIFY.errors[code] ?? NOTIFY.errors.failed);
    } finally {
      button.disabled = false;
    }
  });
  return wrap;
}
