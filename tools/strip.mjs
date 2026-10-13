import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { prune, quantize } from '@gltf-transform/functions';
const [,, inp, out] = process.argv;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS); const doc = await io.read(inp);
for (const me of doc.getRoot().listMeshes()) for (const p of me.listPrimitives()) p.setAttribute('NORMAL', null);
for (const m of doc.getRoot().listMaterials()) { m.setNormalTexture(null); m.setMetallicRoughnessTexture(null); m.setOcclusionTexture(null); }
await doc.transform(prune(), quantize({ quantizePosition: 14, quantizeNormal: 10, quantizeTexcoord: 12 }));
await io.write(out, doc);
