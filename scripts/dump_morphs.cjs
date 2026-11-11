#!/usr/bin/env node
/** List ALL morph target names per mesh in the Avaturn GLB. */
const fs = require('fs');
const buf = fs.readFileSync('/home/z/my-project/public/models/jarvis_avaturn.glb');
const jsonLen = buf.readUInt32LE(12);
const json = JSON.parse(buf.slice(20, 20 + jsonLen).toString('utf8'));

for (const mesh of json.meshes || []) {
  const prim = mesh.primitives?.[0];
  if (!prim?.targets?.length) continue;
  const names = mesh.extras?.targetNames || [];
  console.log(`\n### ${mesh.name} — ${prim.targets.length} targets`);
  console.log(names.join(', '));
}
