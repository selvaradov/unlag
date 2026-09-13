import './style.css';
import { generatePlan } from './algorithm/generate.ts';
import type { PlanInput } from './algorithm/types.ts';
import { APP_NAME, COPY_LINK, DOWNLOAD_ICS, FOOTER, LINK_COPIED, TAGLINE, adaptedLine, summary } from './copy.ts';
import { renderForm } from './ui/form.ts';
import { dayLabel } from './ui/format.ts';
import { toICS } from './ui/ics.ts';
import { renderNowNext } from './ui/nowNext.ts';
import { readInput, writeInput } from './ui/state.ts';
import { renderTextList } from './ui/textList.ts';
import { renderTimeline } from './ui/timeline.ts';

const app = document.getElementById('app')!;
let input: PlanInput = readInput(location.search);

function download(name: string, content: string, type: string): void {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

function render(): void {
  const plan = generatePlan(input);
  const now = Date.now();
  app.replaceChildren();

  const header = document.createElement('header');
  header.innerHTML = `<h1>${APP_NAME}</h1><p class="tagline">${TAGLINE}</p>`;
  app.appendChild(header);

  app.appendChild(renderNowNext(plan, now));

  const sum = document.createElement('p');
  sum.className = 'summary';
  sum.textContent = `${summary(input.homeZone, input.destZone, plan.direction, plan.totalShiftHours)} ${adaptedLine(plan.adaptedAt ? dayLabel(plan, plan.adaptedAt) : null)}`;
  app.appendChild(sum);

  app.appendChild(
    renderForm(input, (next) => {
      input = next;
      history.replaceState(null, '', writeInput(input));
      render();
    }),
  );

  app.appendChild(renderTimeline(plan, now));
  app.appendChild(renderTextList(plan, now));

  const actions = document.createElement('div');
  actions.className = 'actions';
  const ics = document.createElement('button');
  ics.textContent = DOWNLOAD_ICS;
  ics.addEventListener('click', () => download('unlag.ics', toICS(plan), 'text/calendar'));
  const link = document.createElement('button');
  link.textContent = COPY_LINK;
  link.addEventListener('click', async () => {
    await navigator.clipboard.writeText(location.origin + location.pathname + writeInput(input));
    link.textContent = LINK_COPIED;
    setTimeout(() => (link.textContent = COPY_LINK), 1500);
  });
  actions.append(ics, link);
  app.appendChild(actions);

  const footer = document.createElement('footer');
  footer.textContent = FOOTER;
  app.appendChild(footer);
}

render();
// Keep the now and next panel and the now marker fresh.
setInterval(render, 60_000);
