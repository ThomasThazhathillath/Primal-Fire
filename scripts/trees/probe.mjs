import './dom-stub.mjs';
const { Tree } = await import('@dgreenheck/ez-tree');
const t = new Tree();
t.options.bark.textured = false;
t.loadPreset('Oak Medium');
console.log(t.children.map((c) => [c.name, c.geometry.attributes.position.count, c.geometry.index ? c.geometry.index.count : 0, Object.keys(c.geometry.attributes)]));
t.geometry;
const b = new (await import('three')).Box3().setFromObject(t);
console.log(b.min, b.max);
