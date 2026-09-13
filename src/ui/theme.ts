// Light, dark or follow the system. The choice is stamped on the root element and remembered;
// index.html applies it before the first paint so there is no flash.
import { THEME } from '../copy.ts';
import { ICONS } from './icons.ts';

export type Theme = 'auto' | 'light' | 'dark';
const KEY = 'unlag-theme';

export function currentTheme(): Theme {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'light' || v === 'dark' ? v : 'auto';
  } catch {
    return 'auto';
  }
}

export function applyTheme(theme: Theme): void {
  if (theme === 'auto') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.dataset.theme = theme;
  try {
    if (theme === 'auto') localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, theme);
  } catch {
    // Storage may be unavailable; the attribute still applies for this page.
  }
  // The browser chrome follows the page ground.
  const dark = theme === 'dark' || (theme === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  for (const meta of document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')) {
    meta.content = dark ? THEME.darkGround : THEME.lightGround;
  }
}

export function renderThemeToggle(): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'theme-toggle';
  wrap.setAttribute('role', 'group');
  wrap.setAttribute('aria-label', THEME.label);
  const options: { value: Theme; icon: string; title: string }[] = [
    { value: 'light', icon: ICONS.sun, title: THEME.light },
    { value: 'auto', icon: ICONS.sunMoon, title: THEME.auto },
    { value: 'dark', icon: ICONS.moon, title: THEME.dark },
  ];
  const buttons = options.map((o) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.innerHTML = o.icon;
    b.title = o.title;
    b.setAttribute('aria-label', o.title);
    b.addEventListener('click', () => {
      // Ease the change, then drop the class so nothing else animates later.
      document.documentElement.classList.add('theme-switching');
      window.setTimeout(() => document.documentElement.classList.remove('theme-switching'), 250);
      applyTheme(o.value);
      for (const [i, other] of buttons.entries())
        other.setAttribute('aria-pressed', String(options[i].value === o.value));
    });
    return b;
  });
  const current = currentTheme();
  buttons.forEach((b, i) => b.setAttribute('aria-pressed', String(options[i].value === current)));
  wrap.append(...buttons);
  return wrap;
}
