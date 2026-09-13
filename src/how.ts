// The methodology page: the rules behind the plan, in plain words.
import './fonts.css';
import './style.css';
import { APP_NAME, CREDIT, FOOTER, HEADER, METHOD, METHOD_DETAIL } from './copy.ts';
import { ICONS } from './ui/icons.ts';
import { applyTheme, currentTheme } from './ui/theme.ts';

applyTheme(currentTheme());
const root = document.getElementById('how')!;
const back = `/${location.search}`;
root.className = 'how-page';
root.innerHTML = `
  <header class="top">
    <span class="brand">${APP_NAME}</span>
    <a class="back" href="${back}">${ICONS.chevron}<span>${HEADER.back}</span></a>
  </header>
  <main>
    <h1>${HEADER.how}</h1>
    ${METHOD.map(({ title, text }) => `<h2>${title}</h2><p>${text}</p>`).join('')}
    <h2 class="detail-title">${METHOD_DETAIL.title}</h2>
    <p>${METHOD_DETAIL.intro}</p>
    ${METHOD_DETAIL.steps.map(({ title, code }) => `<h3>${title}</h3><pre>${code}</pre>`).join('')}
    <p class="footer">${FOOTER}</p>
    <p class="footer credit">${CREDIT} <a href="${HEADER.licencesHref}">${HEADER.licences}</a>.</p>
  </main>
`;
