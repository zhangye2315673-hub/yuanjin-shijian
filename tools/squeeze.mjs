import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { meshopt, prune, dedup } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer';
await MeshoptEncoder.ready; await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'meshopt.encoder':MeshoptEncoder,'meshopt.decoder':MeshoptDecoder});
for (const [i,o] of process.argv.slice(2).map(a=>a.split('='))) {
  const doc = await io.read(i);
  for (const t of doc.getRoot().listTextures()) t.dispose();
  await doc.transform(dedup(), prune({keepAttributes:true, keepLeaves:true}), meshopt({encoder: MeshoptEncoder, level:'medium', quantizePosition:16, quantizeTexcoord:16, quantizeNormal:10}));
  await io.write(o, doc);
}
