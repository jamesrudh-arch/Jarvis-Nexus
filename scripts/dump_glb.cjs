#!/usr/bin/env node
/** Dump the jarvis_avaturn.glb node/material/morph structure for material tailoring. */
const fs = require('fs');
const path = '/home/z/my-project/public/models/jarvis_avaturn.glb';
const buf = fs.readFileSync(path);

// GLB header: magic(4) version(4) length(4), then chunk: length(4) type(4) json
const jsonLen = buf.readUInt32LE(12);
const jsonType = buf.readUInt32LE(16);
if (jsonType !== 0x4e4f534a) { console.error('not JSON chunk'); process.exit(1); }
const json = JSON.parse(buf.slice(20, 20 + jsonLen).toString('utf8'));

const mats = (json.materials || []).map((m) => ({
  name: m.name,
  pbr: m.pbrMetallicRoughness ? { mr: m.pbrMetallicRoughness.metallicFactor, rough: m.pbrMetallicRoughness.roughnessFactor } : null,
  extensions: Object.keys(m.extensions || {}),
}));
console.log('== MATERIALS ==');
console.log(JSON.stringify(mats, null, 1).slice(0, 3000));

console.log('\n== MESHES (name, primitives materials, morph count) ==');
for (const mesh of json.meshes || []) {
  const primInfo = (mesh.primitives || []).map((p) => ({
    mat: (json.materials?.[p.material]?.name) || p.material,
    targets: (p.targets || []).length,
  }));
  console.log(`${mesh.name} :: ${JSON.stringify(primInfo)}`);
}

console.log('\n== SKINS ==');
for (const skin of json.skins || []) {
  const jointNames = (skin.joints || []).map((j) => json.nodes?.[j]?.name).filter(Boolean);
  console.log(`skin "${skin.name}" joints=${jointNames.length}`);
  console.log('  hair/cloth/skirt/bust joints:', jointNames.filter((n) => /hair|cloth|skirt|bust|breast|pony|strand|jacket|coat|dress/i.test(n)).join(', ') || '(none)');
  console.log('  arm/hand joints:', jointNames.filter((n) => /arm|hand|shoulder/i.test(n)).join(', '));
}

console.log('\n== ANIMATIONS ==');
for (const a of json.animations || []) {
  console.log(`${a.name} (${(a.channels || []).length} channels)`);
}

// Morph target names from extensions (Avaturn usually stores them)
const firstMeshWithTargets = (json.meshes || []).find((m) => m.primitives?.[0]?.targets?.length > 0);
if (firstMeshWithTargets) {
  const ext = firstMeshWithTargets.extras || {};
  console.log('\n== FIRST MORPHED MESH EXTRAS ==');
  console.log(JSON.stringify(ext).slice(0, 1800));
}
