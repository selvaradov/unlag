export type Direction = 'delay' | 'advance';
export type CaffeineHabit = 'none' | 'regular' | 'off';

export interface PlanInput {
  homeZone: string;
  destZone: string;
  // Clock times as HH:MM in the home zone.
  habitualBed: string;
  habitualWake: string;
  // Local wall clock times, ISO without offset, in the home and destination zones.
  flight: { depart: string; arrive: string };
  // Wake time on the travel day, HH:MM in the home zone.
  travelDayWake?: string;
  preflightDays: number;
  postDays: number;
  caffeine: CaffeineHabit;
  melatonin: boolean;
  lightBox: boolean;
}

export type EventKind = 'sleep' | 'nap' | 'light' | 'dark' | 'caffeine' | 'caffeineDose' | 'melatonin' | 'flight';

// Times are epoch milliseconds. Point events have end equal to start.
export interface PlanEvent {
  kind: EventKind;
  start: number;
  end: number;
  note?: string;
  optional?: boolean;
}

export interface TminPoint {
  at: number;
  // Hours of shift earned in the 24 h leading to this Tmin.
  earned: number;
}

export interface Plan {
  input: PlanInput;
  direction: Direction;
  totalShiftHours: number;
  depart: number;
  arrive: number;
  tmins: TminPoint[];
  events: PlanEvent[];
  // Tmin instant at which the target was reached, if within the plan.
  adaptedAt: number | null;
  planStart: number;
  planEnd: number;
}
