import { GLTFLoader } from './node_modules/three/examples/jsm/loaders/GLTFLoader.js';
import * as SkeletonUtils from './node_modules/three/examples/jsm/utils/SkeletonUtils.js';
window.THREE.GLTFLoader = GLTFLoader; window.THREE.SkeletonUtils = SkeletonUtils;
import { MeshoptDecoder } from './node_modules/three/examples/jsm/libs/meshopt_decoder.module.js';
window.THREE.MeshoptDecoder = MeshoptDecoder;
