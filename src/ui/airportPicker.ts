// A small combobox: type a code, a city or a name and pick an airport from the list.
import { type Airport, loadAirports, searchAirports } from '../data/airports.ts';
import { PICKER } from '../copy.ts';

export interface AirportPickerOptions {
  id: string;
  // What the box shows before anything is picked, usually the current code.
  initialText: string;
  placeholder: string;
  onPick: (a: Airport) => void;
}

export function renderAirportPicker(opts: AirportPickerOptions): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'airport-picker';
  const input = document.createElement('input');
  input.id = opts.id;
  input.type = 'text';
  input.autocomplete = 'off';
  input.spellcheck = false;
  input.placeholder = opts.placeholder;
  input.setAttribute('role', 'combobox');
  input.setAttribute('aria-expanded', 'false');
  input.value = opts.initialText;
  let current = opts.initialText;
  const list = document.createElement('ul');
  list.className = 'airport-options';
  list.setAttribute('role', 'listbox');
  list.hidden = true;
  wrap.append(input, list);

  let airports: Airport[] = [];
  let results: Airport[] = [];
  let active = -1;

  const close = () => {
    list.hidden = true;
    input.setAttribute('aria-expanded', 'false');
    active = -1;
  };
  const pick = (a: Airport) => {
    current = `${a.code} · ${a.city}`;
    input.value = current;
    close();
    opts.onPick(a);
  };
  const show = () => {
    list.replaceChildren();
    results.forEach((a, i) => {
      const li = document.createElement('li');
      li.setAttribute('role', 'option');
      li.setAttribute('aria-selected', String(i === active));
      li.innerHTML = `<span class="code">${a.code}</span><span class="city">${a.city}</span><span class="name">${a.name}</span>`;
      li.addEventListener('mousedown', (ev) => {
        ev.preventDefault();
        pick(a);
      });
      list.appendChild(li);
    });
    if (results.length === 0) {
      const li = document.createElement('li');
      li.className = 'empty';
      li.textContent = PICKER.noMatch;
      list.appendChild(li);
    }
    // Fixed positioning so the list escapes scrolling panels; keep it inside the viewport.
    const r = input.getBoundingClientRect();
    const width = Math.max(r.width, 320);
    list.style.top = `${r.bottom + 4}px`;
    list.style.width = `${Math.min(width, window.innerWidth - 16)}px`;
    list.style.left = `${Math.max(8, Math.min(r.left, window.innerWidth - width - 8))}px`;
    list.hidden = false;
    input.setAttribute('aria-expanded', 'true');
  };
  const update = () => {
    results = searchAirports(airports, input.value.split('·')[0]);
    active = results.length ? 0 : -1;
    show();
  };

  input.addEventListener('focus', async () => {
    airports = await loadAirports();
    // Show the city for a bare code once the list is available.
    if (/^[A-Za-z]{3}$/.test(current)) {
      const a = airports.find((x) => x.code === current.toUpperCase());
      if (a) {
        current = `${a.code} · ${a.city}`;
        input.value = current;
      }
    }
    input.select();
  });
  input.addEventListener('input', async () => {
    airports = await loadAirports();
    update();
  });
  input.addEventListener('keydown', (ev) => {
    if (list.hidden) return;
    if (ev.key === 'ArrowDown') {
      active = Math.min(results.length - 1, active + 1);
      show();
      ev.preventDefault();
    } else if (ev.key === 'ArrowUp') {
      active = Math.max(0, active - 1);
      show();
      ev.preventDefault();
    } else if (ev.key === 'Enter') {
      if (active >= 0) pick(results[active]);
      ev.preventDefault();
    } else if (ev.key === 'Escape') {
      close();
    }
  });
  window.addEventListener('scroll', close, { passive: true, capture: true });
  input.addEventListener('blur', () => {
    setTimeout(() => {
      close();
      input.value = current;
    }, 120);
  });
  return wrap;
}
