// Real mouse click on a 3D object in the scene, by Object3D name (desktop view). The camera is first turned
// to face it, so the click lands even when it was behind you.
//   OBJ=FramePush_3_-1 npx @iwsdk/cli browser run scripts/click-object.mjs
// OBJ may be a prefix (the first object whose name starts with it is used).
export default async function run({ page }) {
  let app = null;
  for (let i = 0; i < 40 && !app; i++) {
    for (const f of page.frames()) if (await f.evaluate(() => !!window.__primal?.game).catch(() => false)) app = f;
    if (!app) await page.waitForTimeout(500);
  }
  if (!app) throw new Error('app not found');
  const find = ({ name }) => {
    const p = window.__primal;
    let obj = null;
    p.world.scene.traverse((o) => {
      if (!obj && o.name && o.name.startsWith(name)) obj = o;
    });
    if (!obj) return { error: `no object ${name}` };
    const v = p.world.camera.position.clone();
    obj.getWorldPosition(v);
    return { name: obj.name, x: v.x, y: v.y, z: v.z };
  };
  const target = await app.evaluate(find, { name: process.env.OBJ });
  if (target.error) return target;
  // Turn to face it (DesktopControlsSystem owns the view), then let a few frames apply the turn.
  await app.evaluate(({ x, y, z }) => {
    const p = window.__primal;
    const eye = p.world.camera.position.clone();
    p.world.camera.getWorldPosition(eye);
    const pitch = Math.atan2(y - eye.y, Math.hypot(x - eye.x, z - eye.z));
    p.face(x, z, pitch);
  }, target);
  await page.waitForTimeout(400);
  const at = await app.evaluate(({ x, y, z }) => {
    const p = window.__primal;
    const cam = p.world.camera;
    cam.updateMatrixWorld(true);
    const v = cam.position.clone().set(x, y, z).project(cam);
    const r = p.world.renderer.domElement.getBoundingClientRect();
    return { x: r.left + ((v.x + 1) / 2) * r.width, y: r.top + ((1 - v.y) / 2) * r.height, depth: v.z };
  }, target);
  const box = (await app.frameElement().catch(() => null))?.boundingBox ? await (await app.frameElement()).boundingBox() : { x: 0, y: 0 };
  await page.mouse.click((box?.x ?? 0) + at.x, (box?.y ?? 0) + at.y);
  await page.waitForTimeout(500);
  return { clicked: { ...target, screen: at } };
}
