// Icons from Lucide (https://lucide.dev, ISC licence), imported from the package as SVG text.
import bedDouble from 'lucide-static/icons/bed-double.svg?raw';
import bell from 'lucide-static/icons/bell.svg?raw';
import calendar from 'lucide-static/icons/calendar.svg?raw';
import check from 'lucide-static/icons/check.svg?raw';
import chevronDown from 'lucide-static/icons/chevron-down.svg?raw';
import circleAlert from 'lucide-static/icons/circle-alert.svg?raw';
import clock from 'lucide-static/icons/clock.svg?raw';
import coffee from 'lucide-static/icons/coffee.svg?raw';
import glasses from 'lucide-static/icons/glasses.svg?raw';
import info from 'lucide-static/icons/info.svg?raw';
import lamp from 'lucide-static/icons/lamp.svg?raw';
import link from 'lucide-static/icons/link.svg?raw';
import list from 'lucide-static/icons/list.svg?raw';
import moon from 'lucide-static/icons/moon.svg?raw';
import pencil from 'lucide-static/icons/pencil.svg?raw';
import pill from 'lucide-static/icons/pill.svg?raw';
import plane from 'lucide-static/icons/plane.svg?raw';
import planeLanding from 'lucide-static/icons/plane-landing.svg?raw';
import planeTakeoff from 'lucide-static/icons/plane-takeoff.svg?raw';
import sun from 'lucide-static/icons/sun.svg?raw';
import x from 'lucide-static/icons/x.svg?raw';
import zoomIn from 'lucide-static/icons/zoom-in.svg?raw';
import zoomOut from 'lucide-static/icons/zoom-out.svg?raw';

// Lucide's own "off" convention, a diagonal through the icon, used for no more caffeine.
const SLASH = '<path d="m2 2 20 20"/>';

// Strip the fixed size, add our class and hide from screen readers; optionally add a slash.
function prepare(svg: string, extraClass = '', slash = false): string {
  let out = svg
    .replace(/<!--[\s\S]*?-->/, '')
    .replace(/\s*width="24"\s*height="24"/, '')
    .replace(/class="[^"]*"/, '')
    .replace('<svg', `<svg class="icon ${extraClass}" aria-hidden="true"`);
  if (slash) out = out.replace('</svg>', `${SLASH}</svg>`);
  return out.replace(/\n\s*/g, '');
}

export const ICONS = {
  sun: prepare(sun),
  glasses: prepare(glasses),
  cup: prepare(coffee),
  noCup: prepare(coffee, '', true),
  bed: prepare(bedDouble),
  bell: prepare(bell),
  moon: prepare(moon),
  plane: prepare(plane),
  planeTakeoff: prepare(planeTakeoff),
  planeLanding: prepare(planeLanding),
  pill: prepare(pill),
  lamp: prepare(lamp),
  clock: prepare(clock),
  calendar: prepare(calendar),
  link: prepare(link),
  check: prepare(check),
  edit: prepare(pencil),
  zoomIn: prepare(zoomIn),
  zoomOut: prepare(zoomOut),
  days: prepare(list),
  close: prepare(x),
  info: prepare(info),
  alert: prepare(circleAlert),
  chevron: prepare(chevronDown, 'chevron'),
} as const;

export type IconName = keyof typeof ICONS;
