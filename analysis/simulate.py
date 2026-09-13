# /// script
# requires-python = ">=3.12"
# dependencies = ["circadian>=1.0", "numpy"]
# ///
"""Checks a generated plan against circadian oscillator models.

Reads analysis/plan.json (written by scripts/print-plan.ts --json), turns the
events into a lux profile under the assumptions below, integrates the Forger99
and Hannay19 models from an entrained home routine, and prints the predicted
core body temperature minimum for each day next to the rule based Tmin. An
unchanged routine (same flight, no preflight shift, no light management) is
simulated alongside for comparison.
"""

import json
import sys
from datetime import datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

import numpy as np
from circadian.models import Forger99, Hannay19

# Lux assumptions for someone without a light box.
LUX = {
    "sleep": 0.0,
    "dark": 30.0,  # sunglasses outdoors or a dim room
    "flight": 100.0,  # cabin
    "evening": 100.0,  # ordinary indoor evening
    "daytime": 1000.0,  # a mix of outdoor and indoor daytime light
    "light_daylight": 2000.0,  # seeking light outdoors in the day
    "light_indoor": 500.0,  # seeking light after dark, brightest room available
}
DAYLIGHT = (7, 19)
DT_HOURS = 0.1
BASELINE_DAYS = 14
HOUR_MS = 3_600_000


def load_plan(path: Path) -> dict:
    return json.loads(path.read_text())


def zone_at(t_ms: float, plan: dict) -> ZoneInfo:
    z = plan["input"]["homeZone"] if t_ms < plan["arrive"] else plan["input"]["destZone"]
    return ZoneInfo(z)


def local_hour(t_ms: float, plan: dict) -> float:
    d = datetime.fromtimestamp(t_ms / 1000, tz=zone_at(t_ms, plan))
    return d.hour + d.minute / 60


def is_daylight(t_ms: float, plan: dict) -> bool:
    return DAYLIGHT[0] <= local_hour(t_ms, plan) < DAYLIGHT[1]


def lux_for_plan(t_ms: float, plan: dict) -> float:
    active = [e for e in plan["events"] if e["start"] <= t_ms < e["end"]]
    kinds = {e["kind"] for e in active}
    if "sleep" in kinds or "nap" in kinds:
        return LUX["sleep"]
    if "dark" in kinds:
        return LUX["dark"]
    if "light" in kinds:
        return LUX["light_daylight"] if is_daylight(t_ms, plan) else LUX["light_indoor"]
    if "flight" in kinds:
        return LUX["flight"]
    return LUX["daytime"] if is_daylight(t_ms, plan) else LUX["evening"]


def habitual_sleep(t_ms: float, plan: dict, zone: ZoneInfo) -> bool:
    inp = plan["input"]
    h = local_hour_in(t_ms, zone)
    bed = clock(inp["habitualBed"])
    wake = clock(inp["habitualWake"])
    return h >= bed or h < wake if bed > wake else bed <= h < wake


def local_hour_in(t_ms: float, zone: ZoneInfo) -> float:
    d = datetime.fromtimestamp(t_ms / 1000, tz=zone)
    return d.hour + d.minute / 60


def clock(hhmm: str) -> float:
    h, m = hhmm.split(":")
    return int(h) + int(m) / 60


def lux_unmanaged(t_ms: float, plan: dict) -> float:
    """Someone who ignores jet lag: home routine until the flight, destination routine after landing."""
    zone = zone_at(t_ms, plan)
    if plan["depart"] <= t_ms < plan["arrive"]:
        return LUX["flight"]
    if habitual_sleep(t_ms, plan, zone):
        return LUX["sleep"]
    h = local_hour_in(t_ms, zone)
    return LUX["daytime"] if DAYLIGHT[0] <= h < DAYLIGHT[1] else LUX["evening"]


def simulate(model_cls, lux_fn, plan: dict, t0_ms: float, t1_ms: float):
    """Integrate from an entrained baseline over [t0, t1].

    Returns the CBTmin instants in ms from t0 onward and the model's own entrained
    CBTmin clock hour under the home routine, which is what "adapted" means for it.
    """
    home = ZoneInfo(plan["input"]["homeZone"])
    baseline_start = t0_ms - BASELINE_DAYS * 24 * HOUR_MS
    hours = np.arange(0, (t1_ms - baseline_start) / HOUR_MS, DT_HOURS)

    def lux_at(h: float) -> float:
        t = baseline_start + h * HOUR_MS
        if t < t0_ms:
            return LUX["sleep"] if habitual_sleep(t, plan, home) else lux_unmanaged(t, plan)
        return lux_fn(t, plan)

    light = np.array([lux_at(h) for h in hours])
    model = model_cls()
    day = hours[hours < 24]
    ic = model.equilibrate(day, light[: len(day)], num_loops=30)
    traj = model.integrate(hours, initial_condition=ic, input=light)
    cbt_hours = model.cbt(traj)
    instants = [baseline_start + h * HOUR_MS for h in cbt_hours]
    entrained = [local_hour_in(t, home) for t in instants if t0_ms - 3 * 24 * HOUR_MS <= t < t0_ms]
    return [t for t in instants if t >= t0_ms], float(np.mean(entrained))


def fmt(t_ms: float, plan: dict) -> str:
    return datetime.fromtimestamp(t_ms / 1000, tz=zone_at(t_ms, plan)).strftime("%a %d %H:%M %Z")


def main() -> None:
    path = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(__file__).with_name("plan.json")
    plan = load_plan(path)
    t0 = plan["planStart"] - 12 * HOUR_MS
    t1 = plan["planEnd"] + 24 * HOUR_MS
    dest = ZoneInfo(plan["input"]["destZone"])

    print(f"direction={plan['direction']} total={plan['totalShiftHours']}h\n")
    results = {}
    entrained = {}
    for name, cls in (("Forger99", Forger99), ("Hannay19", Hannay19)):
        results[(name, "plan")], entrained[name] = simulate(cls, lux_for_plan, plan, t0, t1)
        results[(name, "unmanaged")], _ = simulate(cls, lux_unmanaged, plan, t0, t1)

    rule = [t["at"] for t in plan["tmins"]]
    n = max(len(rule), *(len(v) for v in results.values()))
    header = f"{'rule based':<22}" + "".join(f"{k[0] + ' ' + k[1]:<22}" for k in results)
    print(header)
    for i in range(n):
        row = f"{fmt(rule[i], plan) if i < len(rule) else '':<22}"
        for k in results:
            v = results[k]
            row += f"{fmt(v[i], plan) if i < len(v) else '':<22}"
        print(row)

    print("\nEach model's entrained Tmin clock under the home routine, and the hours still to shift")
    print("after each destination night (negative means past the entrained position):")
    for k, v in results.items():
        ent = entrained[k[0]]
        after = [t for t in v if t >= plan["arrive"]]
        remaining = []
        for t in after:
            gap = (ent - local_hour_in(t, dest)) % 24
            if plan["direction"] == "advance":
                gap = (-gap) % 24
            if gap > 12:
                gap -= 24
            remaining.append(gap)
        steps = np.diff([t / HOUR_MS for t in v]) - 24
        sign = 1 if plan["direction"] == "delay" else -1
        wrong = [s for s, r in zip(steps[-len(remaining):], remaining) if sign * s < -0.25 and r > 0.5]
        print(f"  {k[0]:<9}{k[1]:<11}entrained {ent:05.2f}  remaining " + " ".join(f"{r:+.1f}" for r in remaining))
        print(f"  {'':<20}daily steps beyond 24 h: " + " ".join(f"{s:+.1f}" for s in steps) + (f"  WRONG DIRECTION x{len(wrong)}" if wrong else ""))
    del dest


if __name__ == "__main__":
    main()
