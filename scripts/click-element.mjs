// Real mouse click on a UIKit element of a panel, by element id (desktop view).
//   PANEL=ExperimentCard EL=exp-opt-1 npx @iwsdk/cli browser run scripts/click-element.mjs
// PANEL is the panel's Object3D name in the scene; EL the element id in its UIKitML.
export default async function run({ page }) {
  let app = null;
  for (let i = 0; i < 40 && !app; i++) {
    for (const f of page.frames()) if (await f.evaluate(() => !!window.__primal?.game).catch(() => false)) app = f;
    if (!app) await page.waitForTimeout(500);
  }
  if (!app) throw new Error('app not found');
  const at = await app.evaluate(
    ({ panelName, el }) => {
      const p = window.__primal;
      const panel = p.world.scene.getObjectByName(panelName);
      if (!panel) return { error: `no panel ${panelName}` };
      const e = panel.getElementById?.(el);
      if (!e) return { error: `no element ${el}` };
      const v = p.world.camera.position.clone();
      e.getWorldPosition(v);
      p.world.camera.updateMatrixWorld(true);
      v.project(p.world.camera);
      const r = p.world.renderer.domElement.getBoundingClientRect();
      return { x: r.left + ((v.x + 1) / 2) * r.width, y: r.top + ((1 - v.y) / 2) * r.height };
    },
    { panelName: process.env.PANEL, el: process.env.EL },
  );
  if (at.error) return at;
  const box = (await app.frameElement().catch(() => null))?.boundingBox ? await (await app.frameElement()).boundingBox() : { x: 0, y: 0 };
  await page.mouse.click((box?.x ?? 0) + at.x, (box?.y ?? 0) + at.y);
  await page.waitForTimeout(500);
  return { clicked: at };
}
