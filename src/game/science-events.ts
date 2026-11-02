// Science events: the contract between the Lab Notebook and everything that
// can happen in the world. A system (crafting, hunting, weather, ...) calls
// `game.science('tool.knap.flake')` when the thing happens; the notebook entry
// whose `trigger` matches is recorded, and quest steps can wait on the event.
//
// Add an id here BEFORE emitting or referencing it: tests fail on unknown ids.
// Naming: <area>.<thing>.<what happened>, lower-case, dot-separated.

export const SCIENCE_EVENTS = {
  // --- gathering / materials (already emitted by Game via item firstObservation)
  'gather.deadwood': 'First dead wood (twigs or log) picked up.',
  'gather.greenwood': 'First living branch picked up.',
  'gather.moss': 'First damp moss picked up.',
  'gather.clay': 'First clay picked up.',
  'gather.cane': 'First hollow cane picked up.',

  // --- crafting and building (already emitted by Game / fire.ts)
  'craft.cord': 'Cord twisted from fibres.',
  'craft.bowdrill': 'Bow drill assembled.',
  'build.workbench.done': 'Workbench (slab on three stones) completed.',
  'build.firepit.wetstone': 'A wet stream stone was used in the fire pit and then heated.',
  'build.firepit.litter': 'A fire was lit with dry litter close to the pit.',
  'fire.drill.ember': 'First bow-drill session produced dust and heat.',
  'fire.ember.damp': 'An ember was placed on damp material and died.',
  'fire.ember.unfed': 'An ember went out with no air flow or no tinder.',
  'fire.fuel.toobig': 'Large logs were put on a young flame.',
  'fire.fuel.none': 'Flame burned out with nothing larger to catch.',
  'fire.lit': 'A stable fire was established.',
  'fire.charcoal.burn': 'Charcoal was burned on a fire.',
  'pottery.untempered.crack': 'A clay-only pot cracked while drying.',
  'pottery.wet.burst': 'A damp pot burst in the fire.',
  'pottery.fired': 'A pot was fired successfully.',
  'charcoal.pit.water': 'A pit dug near the stream filled with water.',
  'charcoal.ash': 'A mound burned with vents open and made ash.',
  'charcoal.early': 'A mound was opened too early.',
  'charcoal.done': 'Charcoal made in a sealed mound.',
  'water.raw.inspected': 'Stream water inspected with the lens.',
  'water.filter.washout': 'A filter with no cloth support was used.',
  'water.filter.clog': 'A filter with fine layers above coarse ones was used.',
  'water.filter.odour': 'Filtered, un-charcoaled water inspected.',
  'water.filter.microbes': 'Filtered water inspected with the lens.',
  'water.boil.murky': 'Unfiltered water was boiled.',
  'water.boil.done': 'Water was boiled to a rolling boil.',

  // --- shelter and weather
  'shelter.site.chosen': 'A shelter site was marked (dry, flat, safe overhead).',
  'shelter.frame.built': 'A leaning ridge-pole frame was set up.',
  'shelter.roof.covered': 'The frame was covered with branches, bark or leaves.',
  'shelter.bed.insulated': 'A thick bed of dry debris was laid under the sleeping spot.',
  'shelter.wind.blocked': 'Shelter opening faced away from the wind.',
  'weather.sky.read': 'Player looked at the sky (clouds / colour) at dusk.',
  'weather.rain.start': 'Rain started.',
  'weather.night.clear': 'A cold, clear night fell.',

  // --- tools
  'tool.knap.flake': 'A flake was struck from a fine-grained stone.',
  'tool.knap.fail': 'A coarse stone was struck and crumbled.',
  'tool.edge.cut': 'Something was cut with a sharp stone edge.',
  'tool.lash.hold': 'A lashing held a load.',
  'tool.axe.made': 'A stone head was lashed to a handle.',
  'tool.lever.used': 'A stick was used as a lever to move something heavy.',
  'tool.wedge.split': 'A log was split with an axe or wedge.',
  'tool.point.hardened': 'A wooden point was hardened over embers.',

  // --- hunting and nature
  'hunt.track.found': 'Animal tracks were found.',
  'hunt.bow.drawn': 'The bow was drawn.',
  'hunt.arrow.made': 'An arrow was made.',
  'hunt.fletch.made': 'Feathers were added to an arrow.',
  'hunt.arrow.fly': 'An arrow was shot.',
  'hunt.arrow.hit': 'An arrow hit its target.',
  'nature.foodchain.seen': 'A predator was seen near its prey.',
  'nature.predator.near': 'A predator noticed the player.',

  // --- the body
  'body.thirst.warning': 'Thirst level crossed the warning mark.',
  'body.drink': 'Player drank water.',
  'body.eat': 'Player ate food.',
  'food.cooked': 'Food was cooked on a fire.',
  'body.carry.heavy': 'Player carried a heavy load for a while.',
  'body.cold.wet': 'Player got wet while it was cold.',
  'body.wound.hurt': 'Player got a wound.',
  'body.wound.cleaned': 'A wound was washed with safe water.',
  'body.wound.dirty': 'A wound was left unwashed and got worse.',

  // --- camp
  'fire.hotstones.boil': 'Water was heated with hot stones.',
  'fire.signal.smoke': 'A smoke signal was made with green fuel.',
  'fire.night.kept': 'A fire was kept alive through the night.',
  'water.sediment.settle': 'Muddy water was left to stand and cleared.',
} as const;

export type ScienceEventId = keyof typeof SCIENCE_EVENTS;

export const isScienceEvent = (id: string): id is ScienceEventId => id in SCIENCE_EVENTS;
