// What a house tends to have: room names to tap, and appliances with the watts they typically draw while running.
// The watts are ordinary figures for a load check, not measurements; the label on the appliance has the real one.

export const ROOM_IDEAS = [
  'Kitchen', 'Living room', 'Dining room', 'Bedroom 1', 'Bedroom 2', 'Bedroom 3', 'Bath', 'Half bath', 'Hall',
  'Office', 'Laundry', 'Garage', 'Basement', 'Attic', 'Stairs', 'Porch', 'Outside',
];

// volts: 240 means it needs a double-pole breaker. hours: it runs for three hours or more at a time,
// which is what the 80% guideline is about.
export const APPLIANCES = [
  { name: 'Fridge', watts: 700 },
  { name: 'Freezer', watts: 500 },
  { name: 'Dishwasher', watts: 1500 },
  { name: 'Microwave', watts: 1500 },
  { name: 'Garbage disposal', watts: 800 },
  { name: 'Electric range', watts: 5000, volts: 240 },
  { name: 'Wall oven', watts: 3500, volts: 240 },
  { name: 'Range hood', watts: 150 },
  { name: 'Toaster', watts: 1200 },
  { name: 'Coffee maker', watts: 1000 },
  { name: 'Kettle', watts: 1500 },
  { name: 'Washer', watts: 1000 },
  { name: 'Electric dryer', watts: 5000, volts: 240 },
  { name: 'Gas dryer', watts: 600 },
  { name: 'Furnace', watts: 800, hours: true },
  { name: 'Boiler', watts: 200, hours: true },
  { name: 'Central AC', watts: 3500, volts: 240, hours: true },
  { name: 'Heat pump', watts: 4000, volts: 240, hours: true },
  { name: 'Water heater', watts: 4500, volts: 240, hours: true },
  { name: 'Sump pump', watts: 800 },
  { name: 'Well pump', watts: 1500, volts: 240 },
  { name: 'Dehumidifier', watts: 500, hours: true },
  { name: 'Space heater', watts: 1500, hours: true },
  { name: 'Baseboard heater', watts: 1500, volts: 240, hours: true },
  { name: 'Window AC', watts: 1000, hours: true },
  { name: 'Garage door opener', watts: 550 },
  { name: 'EV charger', watts: 7200, volts: 240, hours: true },
  { name: 'Hot tub', watts: 6000, volts: 240, hours: true },
  { name: 'Hair dryer', watts: 1500 },
  { name: 'Bath fan', watts: 50 },
  { name: 'TV', watts: 150 },
  { name: 'Computer', watts: 300 },
  { name: 'Laser printer', watts: 600 },
  { name: 'Smoke alarms', watts: 10 },
  { name: 'Doorbell', watts: 10 },
];

// Which appliances to offer first in a room, by a word in its name.
const BY_ROOM = [
  [/kitchen/i, ['Fridge', 'Dishwasher', 'Microwave', 'Garbage disposal', 'Electric range', 'Range hood', 'Toaster', 'Coffee maker', 'Kettle', 'Wall oven']],
  [/laundry|utility/i, ['Washer', 'Electric dryer', 'Gas dryer', 'Water heater', 'Furnace']],
  [/basement|cellar|mechanical|furnace/i, ['Furnace', 'Water heater', 'Sump pump', 'Dehumidifier', 'Freezer', 'Boiler', 'Well pump', 'Washer', 'Electric dryer']],
  [/garage|shed|workshop/i, ['Garage door opener', 'Freezer', 'EV charger', 'Fridge', 'Water heater', 'Space heater']],
  [/outside|yard|patio|porch|deck/i, ['Central AC', 'Heat pump', 'Hot tub', 'Doorbell']],
  [/bath/i, ['Bath fan', 'Hair dryer', 'Space heater']],
  [/attic/i, ['Furnace', 'Heat pump']],
  [/office|study|den/i, ['Computer', 'Laser printer', 'Space heater', 'Window AC', 'TV']],
  [/bed|living|family|dining|room/i, ['Space heater', 'Window AC', 'TV', 'Computer', 'Baseboard heater']],
  [/hall|stair|entry/i, ['Smoke alarms', 'Doorbell']],
];

export function appliancesFor(roomName = '') {
  const first = BY_ROOM.find(([re]) => re.test(roomName))?.[1] || [];
  const byName = Object.fromEntries(APPLIANCES.map(a => [a.name, a]));
  return [...first.map(n => byName[n]), ...APPLIANCES.filter(a => !first.includes(a.name))];
}

export const findAppliance = name => APPLIANCES.find(a => a.name.toLowerCase() === String(name).trim().toLowerCase());

// Names to tap when naming an outlet, light or switch.
export const PLACE_IDEAS = {
  outlet: ['By the door', 'By the bed', 'By the window', 'Behind the couch', 'Under the TV', 'Counter left', 'Counter right', 'Island', 'By the sink', 'Outside, front', 'Outside, back'],
  light: ['Ceiling light', 'Fan and light', 'Pendant lights', 'Recessed lights', 'Vanity light', 'Under-cabinet lights', 'Porch light', 'Floodlight', 'Closet light'],
  switch: ['By the door', 'Top of the stairs', 'Bottom of the stairs', 'Garbage disposal switch', 'Fan switch'],
};

export const KIND_WORDS = {
  outlet: ['Outlet', 'Outlets'],
  light: ['Light', 'Lights'],
  switch: ['Switch', 'Switches'],
  appliance: ['Appliance', 'Appliances'],
};
