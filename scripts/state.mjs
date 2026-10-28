// Inspect or nudge the running game from the IWSDK CLI, e.g. alongside the
// XR emulator (`npx @iwsdk/cli xr ...`):
//   npx @iwsdk/cli browser run scripts/state.mjs              # print state
//   MODE=begin npx @iwsdk/cli browser run scripts/state.mjs   # wake up
//   MODE=reset npx @iwsdk/cli browser run scripts/state.mjs   # clear save + reload
//   TAKE=dryStone npx @iwsdk/cli browser run scripts/state.mjs  # take into hand
// Needs `npx @iwsdk/cli dev up --allow-browser-automation`.
export default async function run({ page }) {
  let app;
  for (const f of page.frames()) if (await f.evaluate(() => !!window.__primal?.game).catch(() => false)) app = f;
  if (!app) throw new Error('window.__primal not found - is the app loaded?');
  return await app.evaluate(
    ({ mode, take }) => {
      const p = window.__primal;
      if (mode === 'reset') {
        localStorage.clear();
        location.reload();
        return 'reloading';
      }
      if (mode === 'begin') p.begin();
      if (take) p.take(take);
      const head = p.world.camera.getWorldPosition(p.world.camera.position.clone());
      const ghost = p.world.scene.getObjectByName('BlueprintGhost');
      return {
        head: head.toArray().map((n) => +n.toFixed(2)),
        quest: p.game.quest?.title,
        step: p.game.currentStep()?.index,
        held: p.game.held,
        satchel: p.game.satchelContents(),
        ghost: { visible: ghost.visible, x: +ghost.position.x.toFixed(2), z: +ghost.position.z.toFixed(2) },
        structures: p.game.structures.map((s) => ({ id: s.id, kind: s.kind, spots: s.spots, complete: s.complete })),
        notebook: p.game.notebook,
        log: p.log().split('\n').slice(-5),
      };
    },
    { mode: process.env.MODE ?? '', take: process.env.TAKE ?? '' },
  );
}
