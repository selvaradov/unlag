// Prints the generated plan for the default inputs as a table, in the zone in effect at each event.
import { DateTime } from 'luxon';
import { DEFAULT_INPUT } from '../src/config.ts';
import { generatePlan } from '../src/algorithm/generate.ts';
import type { PlanInput } from '../src/algorithm/types.ts';

const input: PlanInput = JSON.parse(JSON.stringify(DEFAULT_INPUT));
const plan = generatePlan(input);
if (process.argv.includes('--json')) {
  console.log(JSON.stringify(plan));
  process.exit(0);
}
const zone = (t: number) => (t < plan.arrive ? input.homeZone : input.destZone);
const fmt = (t: number) => DateTime.fromMillis(t, { zone: zone(t) }).toFormat('ccc dd HH:mm ZZZZ');

console.log(
  `direction=${plan.direction} total=${plan.totalShiftHours}h adapted=${plan.adaptedAt ? fmt(plan.adaptedAt) : 'not within plan'}`,
);
console.log('Tmin:');
for (const t of plan.tmins) console.log(`  ${fmt(t.at)}  earned ${t.earned.toFixed(2)}h`);
console.log('Events:');
for (const e of plan.events) {
  const end = e.end === e.start ? '' : ` -> ${fmt(e.end)}`;
  console.log(`  ${e.kind.padEnd(13)} ${fmt(e.start)}${end} ${e.note ?? ''}${e.optional ? ' (optional)' : ''}`);
}
