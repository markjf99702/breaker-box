// The sample house: a made-up panel, mostly mapped, for trying Breaker Box before doing your own.
import * as M from './model.js';
import { findAppliance } from './catalog.js';

// What's in each room. [kind, name] for outlets, lights and switches; an appliance is just its name.
const ROOMS = [
  ['Kitchen', [['outlet', 'Counter left'], ['outlet', 'Counter right'], ['outlet', 'Island'], ['light', 'Ceiling light'], ['light', 'Under-cabinet lights'], 'Fridge', 'Dishwasher', 'Microwave', 'Garbage disposal', 'Electric range']],
  ['Dining room', [['outlet', ''], ['outlet', ''], ['light', 'Pendant lights']]],
  ['Living room', [['outlet', ''], ['outlet', ''], ['outlet', ''], ['outlet', ''], ['light', 'Fan and light']]],
  ['Bedroom 1', [['outlet', ''], ['outlet', ''], ['outlet', ''], ['light', 'Ceiling light'], 'Window AC']],
  ['Bedroom 2', [['outlet', ''], ['outlet', ''], ['light', 'Ceiling light']]],
  ['Office', [['outlet', ''], ['outlet', ''], ['light', 'Ceiling light'], 'Computer', 'Laser printer', 'Space heater']],
  ['Bath', [['outlet', 'By the sink'], ['light', 'Vanity light'], 'Bath fan', 'Hair dryer']],
  ['Hall', [['light', 'Hall light'], 'Smoke alarms', 'Doorbell']],
  ['Laundry', [['light', 'Ceiling light'], 'Washer', 'Electric dryer']],
  ['Basement', [['light', 'Ceiling lights'], ['outlet', ''], 'Furnace', 'Water heater', 'Sump pump', 'Dehumidifier']],
  ['Garage', [['outlet', 'Bench left'], ['outlet', 'Bench right'], ['light', 'Ceiling lights'], 'Garage door opener', 'Freezer', 'EV charger']],
  ['Outside', [['outlet', 'Front'], ['outlet', 'Back'], ['light', 'Porch light'], ['light', 'Floodlight'], 'Central AC']],
];

// Main panel, 32 spaces: [space, amps, poles, kind, what's on it as "Room: thing", label]
const MAIN = [
  [1, 20, 1, 'standard', ['Kitchen: Counter left', 'Kitchen: Counter right']],
  [2, 20, 1, 'standard', ['Kitchen: Island', 'Kitchen: Microwave']],
  [3, 20, 1, 'standard', ['Kitchen: Dishwasher', 'Kitchen: Garbage disposal']],
  [4, 20, 1, 'standard', ['Kitchen: Fridge']],
  [5, 40, 2, 'standard', ['Kitchen: Electric range']],
  [6, 15, 1, 'standard', ['Kitchen: Ceiling light', 'Kitchen: Under-cabinet lights', 'Dining room: Pendant lights'], 'Kitchen and dining lights'],
  [8, 20, 1, 'standard', ['Dining room: Outlet 1', 'Dining room: Outlet 2']],
  [9, 15, 1, 'afci', ['Living room: Outlet 1', 'Living room: Outlet 2', 'Living room: Outlet 3', 'Living room: Fan and light']],
  [10, 15, 1, 'afci', ['Bedroom 1: Outlet 1', 'Bedroom 1: Outlet 2', 'Bedroom 1: Ceiling light', 'Bedroom 1: Window AC']],
  [11, 15, 1, 'afci', ['Office: Outlet 1', 'Office: Outlet 2', 'Office: Ceiling light', 'Office: Computer', 'Office: Laser printer', 'Office: Space heater']],
  [12, 15, 1, 'afci', ['Bedroom 2: Outlet 1', 'Bedroom 2: Outlet 2', 'Bedroom 2: Ceiling light']],
  [13, 15, 1, 'gfci', ['Bath: By the sink', 'Bath: Vanity light', 'Bath: Bath fan', 'Bath: Hair dryer']],
  [14, 15, 1, 'standard', ['Hall: Hall light', 'Hall: Smoke alarms', 'Hall: Doorbell']],
  [15, 20, 1, 'standard', ['Laundry: Ceiling light', 'Laundry: Washer']],
  [16, 30, 2, 'standard', ['Laundry: Electric dryer']],
  [17, 20, 1, 'standard', ['Basement: Sump pump']],
  [19, 15, 1, 'standard', ['Basement: Ceiling lights', 'Basement: Outlet 1']],
  [20, 30, 2, 'standard', ['Basement: Water heater']],
  [21, 15, 1, 'standard', ['Basement: Furnace']],
  [23, 20, 1, 'standard', null],
  [24, 15, 1, 'standard', ['Outside: Front', 'Outside: Porch light']],
  [25, 30, 2, 'standard', ['Outside: Central AC']],
  [26, 20, 1, 'gfci', ['Outside: Back']],
  [28, 15, 1, 'tandem', null],
  [29, 60, 2, 'standard', 'feeds'],
  [30, 15, 1, 'standard', [], 'Spare'],
  [32, 20, 1, 'standard', null],
];

const GARAGE = [
  [1, 20, 1, 'gfci', ['Garage: Bench left', 'Garage: Bench right']],
  [2, 15, 1, 'standard', ['Garage: Ceiling lights', 'Garage: Garage door opener']],
  [3, 20, 1, 'standard', ['Garage: Freezer']],
  [4, 40, 2, 'standard', ['Garage: EV charger']],
  [5, 15, 1, 'standard', null],
];

export function sampleHouse(now = Date.now()) {
  const h = M.blankHouse('Sample house');
  h.sample = true;
  const byName = {};
  for (const [roomName, things] of ROOMS) {
    const room = M.addRoom(h, roomName);
    for (const item of things) {
      const t = typeof item === 'string'
        ? (a => M.addThing(h, room.id, { kind: 'appliance', name: a.name, watts: a.watts, volts: a.volts, hours: a.hours }))(findAppliance(item))
        : M.addThing(h, room.id, { kind: item[0], name: item[1] });
      byName[`${roomName}: ${t.name}`] = t;
    }
  }
  const main = M.addPanel(h, { name: 'Main panel', spaces: 32, mainAmps: 200, where: 'Basement, by the stairs', fill: 0 });
  const garage = M.addPanel(h, { name: 'Garage subpanel', spaces: 12, mainAmps: null, where: 'Garage, left wall', fill: 0 });
  const day = 86400000;
  const fill = (panel, rows) => rows.forEach(([space, amps, poles, kind, on, label], i) => {
    const c = M.addCircuit(panel, space, { amps, poles, kind: kind === 'tandem' ? 'standard' : kind, label: label || '' });
    if (kind === 'tandem') M.setTandem(h, c, true);
    if (on === 'feeds') garage.fedBy = c.id;
    if (Array.isArray(on)) {
      c.tested = now - 6 * day + i * 3600000;
      for (const key of on) {
        if (!byName[key]) throw new Error(`sample: no ${key}`);
        byName[key].circuitId = c.id;
      }
    }
  });
  fill(main, MAIN);
  fill(garage, GARAGE);
  h.created = h.updated = now - 6 * day;
  return h;
}
