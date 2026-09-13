// The methodology page: the rules behind the plan, in plain words.
import './fonts.css';
import './style.css';
import { APP_NAME, FOOTER, HEADER, METHOD } from './copy.ts';
import { ICONS } from './ui/icons.ts';

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
    <p class="footer">${FOOTER}</p>
  </main>
`;
