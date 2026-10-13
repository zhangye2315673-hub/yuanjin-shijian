(function () {
"use strict";
// ================= UI (delegated, theme-agnostic) =================
var speed = 1, dir = 1, rewindUntil = 0;
var body = document.body;
body.dataset.speed = "normal";
function syncSpeedUI() {
  var key = speed < 1 ? "0.3" : speed > 1 ? "3" : "1";
  document.querySelectorAll("[data-speed]").forEach(function (b) { b.classList.toggle("on", b.dataset.speed === key); });
}
window.__syncSpeedUI = syncSpeedUI;
function setSpeed(s) {
  speed = s; dir = 1; body.classList.remove("rew");
  body.dataset.speed = s < 1 ? "slow" : s > 1 ? "fast" : "normal";
  syncSpeedUI();
}
document.addEventListener("click", function (e) {
  var sb = e.target.closest("button[data-speed]"); if (sb && isFinite(+sb.dataset.speed)) { setSpeed(+sb.dataset.speed); return; }
  var rb = e.target.closest("[data-act=rewind]"); if (rb) { dir = -1; rewindUntil = performance.now() + 2500; body.classList.add("rew"); }
});
var rewBtn = { classList: { remove: function () { body.classList.remove("rew"); }, add: function () { body.classList.add("rew"); } } };

var THREE = window.THREE;
if (!THREE) return;
var canvas = document.getElementById("c");
var renderer;
try { renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true }); } catch (e) { return; }
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;

var scene = new THREE.Scene();
scene.fog = new THREE.Fog(0xe8b9c4, 48, 128);

// ---------- seeded random ----------
var seed = 7;
function rnd() { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; }
function rr(a, b) { return a + (b - a) * rnd(); }

// ---------- toon gradient (3 steps) ----------
var gc = document.createElement("canvas"); gc.width = 3; gc.height = 1;
var g2 = gc.getContext("2d");
["#b2b2b2", "#dedede", "#ffffff"].forEach(function (c, i) { g2.fillStyle = c; g2.fillRect(i, 0, 1, 1); });
var gradientMap = new THREE.CanvasTexture(gc);
gradientMap.minFilter = gradientMap.magFilter = THREE.NearestFilter;
gradientMap.generateMipmaps = false;

var matCache = {};
function toon(color, opts) {
  if (!opts && matCache[color]) return matCache[color];
  var m = new THREE.MeshToonMaterial(Object.assign({ color: color, gradientMap: gradientMap }, opts || {}));
  if (!opts) matCache[color] = m;
  return m;
}
var INK = 0x5a3526;
var SWAY = []; // wind-driven groups
var outlineMat = new THREE.MeshBasicMaterial({ color: INK, side: THREE.BackSide });
var outlines = [], PROPS = [];

// faceted: non-indexed + flat normals, optional vertex jitter (shared per position)
function facet(geo, jit, jy) {
  var g = geo.index ? geo.toNonIndexed() : geo;
  if (jit) {
    var p = g.attributes.position, map = {};
    for (var i = 0; i < p.count; i++) {
      var k = p.getX(i).toFixed(3) + "," + p.getY(i).toFixed(3) + "," + p.getZ(i).toFixed(3);
      if (!map[k]) map[k] = [rr(-jit, jit), rr(-jit, jit) * (jy == null ? 1 : jy), rr(-jit, jit)];
      p.setXYZ(i, p.getX(i) + map[k][0], p.getY(i) + map[k][1], p.getZ(i) + map[k][2]);
    }
  }
  g.computeVertexNormals();
  return g;
}
// inverted hull: push every vertex along its averaged (smooth) normal
function hull(geo, t) {
  var g = geo.clone(), p = g.attributes.position, acc = {}, i, k;
  var n = g.attributes.normal;
  for (i = 0; i < p.count; i++) {
    k = p.getX(i).toFixed(3) + "," + p.getY(i).toFixed(3) + "," + p.getZ(i).toFixed(3);
    if (!acc[k]) acc[k] = new THREE.Vector3();
    acc[k].x += n.getX(i); acc[k].y += n.getY(i); acc[k].z += n.getZ(i);
  }
  for (k in acc) acc[k].normalize();
  for (i = 0; i < p.count; i++) {
    k = p.getX(i).toFixed(3) + "," + p.getY(i).toFixed(3) + "," + p.getZ(i).toFixed(3);
    var v = acc[k];
    p.setXYZ(i, p.getX(i) + v.x * t, p.getY(i) + v.y * t, p.getZ(i) + v.z * t);
  }
  return g;
}
function M(geo, color, o) {
  o = o || {};
  var mat = typeof color === "object" && color.isMaterial ? color : toon(color);
  var m = new THREE.Mesh(geo, mat);
  m.castShadow = o.shadow !== false; m.receiveShadow = true;
  if (o.line !== false) {
    geo.computeBoundingBox();
    var bs = new THREE.Vector3(); geo.boundingBox.getSize(bs);
    var tt = Math.min((o.t || 0.045) * 0.8, Math.max(0.006, Math.min(bs.x, bs.y, bs.z) * 0.14));
    var h = new THREE.Mesh(hull(geo, tt), o.lineMat || outlineMat);
    h.castShadow = false; h.receiveShadow = false;
    m.add(h); outlines.push(h);
  }
  return m;
}
function put(o, x, y, z, parent) { o.position.set(x, y, z); (parent || scene).add(o); return o; }
var ico = function (r, d) { return new THREE.IcosahedronGeometry(r, d || 0); };
var cyl = function (a, b, h, s, hs) { return new THREE.CylinderGeometry(a, b, h, s || 6, hs || 1); };

// ---------- palette ----------
var C = {
  grass: 0xd6ad3e, grass2: 0xc9b53a, moss: 0x9bb03a, rock: 0xe0a676, rock2: 0xcf9264, rock3: 0xb87d5e,
  stone: 0xb9ada3, leafA: 0xf07f2a, leafB: 0xf6a531, leafC: 0xe2522f, trunk: 0x6e4430, wood: 0x9b6a45,
  skin: 0xffd7bb, hairG: 0x5b3322, dress: 0xe0473a, cream: 0xfbeed6, roof: 0xd2452f, roof2: 0xb3372a,
  greyHair: 0xe8e2dc, purple: 0x9a5fae, white: 0xfffaf2
};

// ================= sky =================
var skyC = document.createElement("canvas"); skyC.width = 8; skyC.height = 512;
var skyT = new THREE.CanvasTexture(skyC); skyT.colorSpace = THREE.SRGBColorSpace;
scene.background = skyT;
function lerpC(a, b, k) { return new THREE.Color(a).lerp(new THREE.Color(b), k); }
var NIGHT = 0;
function paintSky(k) {
  var n = NIGHT, x = skyC.getContext("2d"), gr = x.createLinearGradient(0, 0, 0, 512);
  var st = [[0, 0x8fc4ee, 0xd98aa0, 0x141a3e], [0.32, 0xbfe0f4, 0xffa877, 0x232a5c], [0.52, 0xf7f0de, 0xffd49a, 0x3b3f78], [0.72, 0xdfe6ee, 0xf4b9b6, 0x5a4f88], [1, 0xcfd8ea, 0xc9a6d4, 0x2c2a55]];
  st.forEach(function (q) { gr.addColorStop(q[0], "#" + lerpC(q[1], q[2], k).lerp(new THREE.Color(q[3]), n).getHexString()); });
  x.fillStyle = gr; x.fillRect(0, 0, 8, 512); skyT.needsUpdate = true;
  scene.fog.color.copy(lerpC(0xdce4ee, 0xebb6c0, k).lerp(new THREE.Color(0x3a3a6e), n));
}
// ================= lights =================
var hemi = new THREE.HemisphereLight(0xfff0dc, 0x9a7ab8, 1.5);
scene.add(hemi);
var sun = new THREE.DirectionalLight(0xffcf9a, 2.6);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
var sc = sun.shadow.camera; sc.left = -16; sc.right = 16; sc.top = 16; sc.bottom = -16; sc.near = 1; sc.far = 120;
sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.02;
scene.add(sun); scene.add(sun.target);
var fill = new THREE.DirectionalLight(0xc9b6ff, 0.75); scene.add(fill); scene.add(fill.target);

// sun disc + halo (sprites, far behind)
function radial(stops) {
  var c = document.createElement("canvas"); c.width = c.height = 256;
  var x = c.getContext("2d"), g = x.createRadialGradient(128, 128, 0, 128, 128, 128);
  stops.forEach(function (s) { g.addColorStop(s[0], s[1]); });
  x.fillStyle = g; x.fillRect(0, 0, 256, 256);
  var t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
var halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: radial([[0, "rgba(255,240,200,0.9)"], [0.25, "rgba(255,210,150,0.45)"], [1, "rgba(255,190,150,0)"]]), fog: false, depthWrite: false }));
halo.scale.set(40, 40, 1);
var disc = new THREE.Sprite(new THREE.SpriteMaterial({ map: radial([[0, "#fffbe8"], [0.6, "#fff1c4"], [0.7, "rgba(255,230,170,0.6)"], [1, "rgba(255,220,160,0)"]]), fog: false, depthWrite: false }));
disc.scale.set(5, 5, 1);


// ================= islands (organic, layered) =================
function smoothN(g) { // smooth normals across duplicated positions
  g.computeVertexNormals();
  var p = g.attributes.position, n = g.attributes.normal, acc = {}, i, k;
  for (i = 0; i < p.count; i++) { k = p.getX(i).toFixed(3) + "," + p.getY(i).toFixed(3) + "," + p.getZ(i).toFixed(3); (acc[k] = acc[k] || new THREE.Vector3()).add(new THREE.Vector3(n.getX(i), n.getY(i), n.getZ(i))); }
  for (i = 0; i < p.count; i++) { k = p.getX(i).toFixed(3) + "," + p.getY(i).toFixed(3) + "," + p.getZ(i).toFixed(3); var v = acc[k].clone().normalize(); n.setXYZ(i, v.x, v.y, v.z); }
  return g;
}
function coast(o) { // smooth organic radius function
  var ph = [rr(0, 6), rr(0, 6), rr(0, 6), rr(0, 6)];
  return function (a) {
    var k = 1 + Math.sin(a * 2 + ph[0]) * 0.09 + Math.sin(a * 3 + ph[1]) * 0.08 + Math.sin(a * 5 + ph[2]) * 0.045 + Math.sin(a * 7 + ph[3]) * 0.02;
    (o.bumps || []).forEach(function (b) { // [angle, amount(+cape / -bay), width]
      var d = Math.atan2(Math.sin(a - b[0]), Math.cos(a - b[0])); k += b[1] * Math.exp(-(d * d) / (2 * b[2] * b[2]));
    });
    return o.r * k;
  };
}
function blobShape(R, n, flat) {
  var pts = [];
  for (var i = 0; i < n; i++) { var a = (i / n) * Math.PI * 2, rad = R(a); pts.push(new THREE.Vector2(Math.cos(a) * rad * flat, Math.sin(a) * rad)); }
  return pts;
}
var GROUND_COL = 0xcda552;
var grassTex = window.__GRASS ? new THREE.TextureLoader().load(window.__GRASS) : null;
if (grassTex) { grassTex.wrapS = grassTex.wrapT = THREE.RepeatWrapping; grassTex.repeat.set(0.3, 0.3); grassTex.colorSpace = THREE.SRGBColorSpace; grassTex.anisotropy = 4; }
var leafGeo = (function () { var g = new THREE.SphereGeometry(0.075, 10, 6); g.scale(1, 0.35, 1.7); g.translate(0, 0, 0.09); return g; })();
function addRimGrass(G, R, fl) { // hand-painted-looking grass fringe drooping over the lip
  var cg = new THREE.ConeGeometry(0.045, 0.3, 5, 1); cg.translate(0, 0.15, 0);
  var cols = [0xd6ad3e, 0xc9b53a, 0xe3bd52, 0xb9a136, 0x9bb03a];
  cols.forEach(function (c, ci) {
    var n = 70, im = new THREE.InstancedMesh(cg, toon(c), n), d = new THREE.Object3D();
    for (var i = 0; i < n; i++) {
      var a = (i + ci / cols.length + rr(-0.3, 0.3)) / n * Math.PI * 2, rad = R(a) + rr(0.12, 0.26);
      var x = Math.cos(a) * rad * fl, z = -Math.sin(a) * rad;
      d.position.set(x, rr(-0.06, 0.04), z);
      d.rotation.set(0, 0, 0); d.lookAt(x * 2, d.position.y, z * 2); d.rotateX(rr(1.6, 2.3));
      d.scale.set(rr(0.8, 1.3), rr(0.7, 1.4), rr(0.8, 1.3)); d.updateMatrix(); im.setMatrixAt(i, d.matrix);
    }
    im.castShadow = false; im.receiveShadow = true; G.add(im);
  });
}
var rockMat = new THREE.MeshToonMaterial({ color: 0xffffff, vertexColors: true, gradientMap: gradientMap });
var TOP0 = 0.12;
function island(o) {
  var G = new THREE.Group(), R = coast(o), fl = o.flat || 1;
  var outline = blobShape(R, 96, fl);
  // grass cap with a soft rounded lip
  var cap = new THREE.ExtrudeGeometry(new THREE.Shape(outline), { depth: 0.3, bevelEnabled: true, bevelThickness: 0.18, bevelSize: 0.26, bevelSegments: 4, curveSegments: 1 });
  cap.rotateX(-Math.PI / 2); cap.translate(0, -0.36, 0);
  var capMat = toon(GROUND_COL);
  var capM = put(M(smoothN(cap), capMat, { t: 0.05 }), 0, 0, 0, G); capM.userData.ground = true;
  if (o.terrace) { // raised back tier: a crescent plateau hugging the back coast, with a soft cliff
    var tr = o.terrace, tp = [], Nc = 44, ii;
    for (ii = 0; ii <= Nc; ii++) { var ta = tr.a1 + (tr.a2 - tr.a1) * ii / Nc, trd = R(ta) * 0.93; tp.push(new THREE.Vector2(Math.cos(ta) * trd * fl, Math.sin(ta) * trd)); }
    for (ii = Nc - 1; ii >= 1; ii--) {
      var tt2 = ii / Nc, ta2 = tr.a1 + (tr.a2 - tr.a1) * tt2;
      var ff = 1 - tr.f * Math.pow(Math.sin(Math.PI * tt2), 0.6) + 0.05 * Math.sin(tt2 * 19 + 1.3) * Math.sin(Math.PI * tt2) + 0.03 * Math.sin(tt2 * 41);
      var trd2 = R(ta2) * 0.93 * ff; tp.push(new THREE.Vector2(Math.cos(ta2) * trd2 * fl, Math.sin(ta2) * trd2));
    }
    var tg = new THREE.ExtrudeGeometry(new THREE.Shape(tp), { depth: tr.h, bevelEnabled: true, bevelThickness: 0.1, bevelSize: 0.13, bevelSegments: 3, curveSegments: 1 });
    tg.rotateX(-Math.PI / 2); tg.translate(0, TOP0 + 0.08, 0);
    var tm = M(smoothN(tg), capMat, { t: 0.05 }); tm.material = [capMat, toon(0xc8875a)]; tm.userData.ground = true; G.add(tm);
    G.userData.terraceTop = TOP0 - 0.02 + tr.h + 0.2;
    // strata line along the cliff
    var sp2 = []; for (ii = Nc - 1; ii >= 1; ii--) { var q2 = tp[Nc + (Nc - ii)]; if (q2) sp2.push(new THREE.Vector3(q2.x * 1.035, TOP0 + 0.17, -q2.y * 1.035)); }
    if (sp2.length > 3) { var sc2 = new THREE.CatmullRomCurve3(sp2); G.add(new THREE.Mesh(new THREE.TubeGeometry(sc2, 80, 0.035, 5, false), toon(0xa86848))); }
  }
  // soil band under the grass
  var soil = new THREE.ExtrudeGeometry(new THREE.Shape(blobShape(function (a) { return R(a) * 0.985; }, 96, fl)), { depth: 0.12, bevelEnabled: true, bevelThickness: 0.08, bevelSize: 0.12, bevelSegments: 3, curveSegments: 1 });
  soil.rotateX(-Math.PI / 2); soil.translate(0, -0.78, 0);
  put(M(smoothN(soil), 0xb8744a, { t: 0.04 }), 0, 0, 0, G);
  // rock body: rings with strata ledges, vertical grooves, tapering to a leaning tip
  var H = 4.6 * o.depth, L = 40, S = 96, pos = [], col = [], idx = [];
  var layerCols = [C.rock, C.rock2, 0xe8b486, C.rock2, C.rock3, C.rock2, 0xa9705a, 0x9a6460].map(function (c) { return new THREE.Color(c); });
  var tipX = rr(-0.6, 0.6), tipZ = rr(-0.5, 0.5), ph = rr(0, 6);
  for (var li = 0; li <= L; li++) {
    var t = li / L, y = -0.72 - t * H;
    var prof = t < 0.12 ? 0.96 - t * 0.3 : 0.92 * Math.pow(Math.max(0, 1 - (t - 0.12) / 0.88), 0.72);
    var layer = t * 7, fr = layer - Math.floor(layer);
    prof *= 1 - 0.06 * Math.pow(fr, 2.2) * (1 - t * 0.5);
    var lc = layerCols[Math.min(layerCols.length - 1, Math.floor(layer))];
    for (var si = 0; si < S; si++) {
      var a = si / S * Math.PI * 2;
      var n = 1 + Math.sin(a * 6 + t * 7 + ph) * 0.045 + Math.sin(a * 13 - t * 11) * 0.025 + Math.sin(a * 29 + ph) * 0.012 * (1 - t);
      var rad = R(a) * prof * n;
      pos.push(Math.cos(a) * rad * fl + tipX * t * t, y, -Math.sin(a) * rad + tipZ * t * t);
      var sh = 0.94 + 0.06 * Math.sin(a * 3 + li);
      col.push(lc.r * sh, lc.g * sh, lc.b * sh);
    }
  }
  for (li = 0; li < L; li++) for (si = 0; si < S; si++) {
    var p0 = li * S + si, p1 = li * S + (si + 1) % S, p2 = p0 + S, p3 = p1 + S;
    idx.push(p0, p2, p1, p1, p2, p3);
  }
  var bg = new THREE.BufferGeometry();
  bg.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  bg.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  bg.setIndex(idx); bg.computeVertexNormals();
  G.userData.body = put(M(bg, rockMat, { t: 0.05 }), 0, 0, 0, G); G.userData.H = H; G.userData.r = o.r; G.userData.fl = fl;
  // moss tufts + hanging vines on the lip
  var mossM = toon(C.moss), vineM = toon(0x7f9a35), leafLt = toon(0xa3b445), leafGold = toon(0xd9a13a);
  for (var i = 0; i < 12; i++) {
    var a2 = rr(0, 6.28), r2 = R(a2) * 1.01;
    var m = new THREE.Mesh(new THREE.SphereGeometry(rr(0.09, 0.16), 12, 8), i % 3 ? mossM : toon(C.grass2));
    m.scale.y = rr(1.1, 1.5); put(m, Math.cos(a2) * r2 * fl, -0.58, -Math.sin(a2) * r2, G);
    if (i % 4 === 0) {
      var len = rr(0.8, 2.0), x0 = Math.cos(a2) * r2 * fl, z0 = -Math.sin(a2) * r2;
      var cv = new THREE.CatmullRomCurve3([new THREE.Vector3(x0, -0.6, z0), new THREE.Vector3(x0 * 1.02, -0.6 - len * 0.5, z0 * 1.02), new THREE.Vector3(x0 * 0.99, -0.6 - len, z0 * 0.99)]);
      put(new THREE.Mesh(new THREE.TubeGeometry(cv, 12, 0.022, 5, false), toon(0x6d7f2c)), 0, 0, 0, G);
      var nl = Math.floor(len / 0.13);
      for (var q = 1; q <= nl; q++) {
        var pq = cv.getPoint(q / (nl + 0.5)), side = q % 2 ? 1 : -1;
        var lfc = q > nl - 2 && rnd() < 0.5 ? leafGold : (q % 3 ? vineM : leafLt);
        var lf = new THREE.Mesh(leafGeo, lfc); lf.scale.setScalar(rr(0.8, 1.25) * (1 - q / nl * 0.35));
        lf.position.copy(pq); lf.rotation.set(rr(-0.4, 0.4), Math.atan2(x0, z0) + side * 1.1, side * 0.7); G.add(lf);
      }
    }
  }
  // little pebbles drifting under the island
  for (i = 0; i < 4; i++) {
    var pb = new THREE.Mesh(smoothN(new THREE.DodecahedronGeometry(rr(0.18, 0.4), 1)), rockMat.clone());
    pb.material = toon([C.rock2, C.rock3][i % 2]);
    var aa = rr(0, 6.28), dd = rr(0.4, 0.9) * o.r;
    put(pb, Math.cos(aa) * dd, -H * rr(0.55, 0.95), Math.sin(aa) * dd, G); pebbles.push(pb); pb.visible = false; pb.userData.y0 = pb.position.y; pb.userData.ph = rr(0, 6);
  }
  G.userData.outline = outline;
  return G;
}
var RIGHT_ROCK_YAW = 0; var pebbles = [], farIsles = [];

var LEFT = island({ r: 4.6, depth: 1, flat: 1.1, terrace: { a1: 1.2, a2: 3.6, f: 0.6, h: 0.36 }, bumps: [[0.35, -0.13, 0.22], [1.25, 0.1, 0.32], [2.6, -0.1, 0.18], [3.7, 0.12, 0.3], [5.3, -0.12, 0.2]] });
LEFT.position.set(-6.3, 0, 0.6); scene.add(LEFT);
var RIGHT = island({ r: 4.3, depth: 1.1, flat: 1.05, terrace: { a1: 2.1, a2: 3.55, f: 0.5, h: 0.3 }, bumps: [[0.9, 0.11, 0.3], [2.0, -0.12, 0.2], [3.3, 0.09, 0.28], [4.7, 0.06, 0.3], [5.8, 0.08, 0.25]] });
RIGHT.position.set(6.2, 0.6, -0.8); scene.add(RIGHT);
var TOP = 0.12;

// ================= props =================
function softBall(r, wob) { // smooth, slightly lumpy sphere
  var g = new THREE.IcosahedronGeometry(r, 3), p = g.attributes.position, ph = rr(0, 6), v = new THREE.Vector3();
  for (var i = 0; i < p.count; i++) {
    v.set(p.getX(i), p.getY(i), p.getZ(i)); var n = v.clone().normalize();
    var k = 1 + wob * (Math.sin(n.x * 3 + ph) * Math.sin(n.y * 3 + ph * 1.7) * Math.sin(n.z * 3 + ph * 0.6));
    v.multiplyScalar(k); p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals(); return g;
}
function trunkGeo(s) {
  var lean = rr(-0.12, 0.12) * s;
  var cv = new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0, 0), new THREE.Vector3(lean * 0.4, 0.6 * s, 0), new THREE.Vector3(lean, 1.25 * s, lean * 0.5), new THREE.Vector3(lean * 1.3, 1.7 * s, lean * 0.6)]);
  var tg = new THREE.TubeGeometry(cv, 16, 0.17 * s, 10, false), p = tg.attributes.position, pts = cv.getSpacedPoints(16), v = new THREE.Vector3();
  for (var i = 0; i < p.count; i++) {
    var seg = Math.floor(i / 11), k = seg / 16, c = pts[Math.min(seg, 16)];
    var f = (1.15 - 0.55 * k) * (k < 0.08 ? 1.35 - k * 4 : 1);
    v.set(p.getX(i), p.getY(i), p.getZ(i)).sub(c).multiplyScalar(f).add(c); p.setXYZ(i, v.x, v.y, v.z);
  }
  tg.computeVertexNormals(); return { geo: tg, top: cv.getPoint(1) };
}
function tree(parent, x, z, s, cols) {
  var g = new THREE.Group(); cols = cols || [C.leafA, C.leafB, C.leafC];
  var tk = trunkGeo(s);
  put(M(tk.geo, C.trunk, { t: 0.03 }), 0, 0, 0, g);
  var top = tk.top, n = 9 + Math.floor(rnd() * 3);
  for (var i = 0; i < n; i++) {
    var a = i / n * 6.28 + rr(-0.3, 0.3), ring = i === 0 ? 0 : rr(0.5, 0.75), r = (i === 0 ? 0.98 : rr(0.55, 0.75)) * s;
    var bx = Math.cos(a) * ring * s, bz = Math.sin(a) * ring * s, by = (i === 0 ? 0.35 : rr(-0.05, 0.55)) * s;
    if (i > n - 3) { bx *= 0.4; bz *= 0.4; by = rr(0.9, 1.15) * s; }
    var m = M(softBall(r, 0.07), cols[i % cols.length], { t: 0.03 });
    m.scale.y = 0.88; put(m, top.x + bx, top.y + by, top.z + bz, g);
  }
  g.rotation.y = rr(0, 6);
  SWAY.push({ o: g, k: 0.035, f: 0.9, ph: rr(0, 6), r0: g.rotation.clone() });
  PROPS.push({ k: s >= 1 ? "tree" : "tree2", o: g, p: parent, h: 2.7 * s });
  return put(g, x, TOP, z, parent);
}
function bush(parent, x, z, s, col) {
  var g = new THREE.Group();
  [[0, 0.22, 0, 0.36], [0.28, 0.16, 0.1, 0.26], [-0.26, 0.15, -0.06, 0.27], [0.05, 0.14, 0.27, 0.22]].forEach(function (b) {
    var m = M(softBall(b[3] * s, 0.06), col || C.leafA, { t: 0.028 }); m.scale.y = 0.85; put(m, b[0] * s, b[1] * s, b[2] * s, g);
  });
  g.rotation.y = rr(0, 6);
  SWAY.push({ o: g, k: 0.05, f: 1.3, ph: rr(0, 6), r0: g.rotation.clone() });
  PROPS.push({ k: "bush", o: g, p: parent, h: 0.75 * s });
  return put(g, x, TOP, z, parent);
}
function rock(parent, x, z, s) {
  var m = M(softBall(0.33 * s, 0.18), C.stone, { t: 0.03 });
  m.scale.y = 0.6; m.rotation.y = rr(0, 6);
  PROPS.push({ k: "rock", o: m, p: parent, h: 0.36 * s, sib: true, x: x, z: z });
  return put(m, x, TOP + 0.1 * s, z, parent);
}
function flower(parent, x, z, col) {
  var g = new THREE.Group();
  put(new THREE.Mesh(cyl(0.015, 0.015, 0.3, 4), toon(0x8cc152, { emissive: 0x3c5a1a, emissiveIntensity: 0.35 })), 0, 0.15, 0, g);
  put(M(facet(ico(0.08, 0)), col, { t: 0.012 }), 0, 0.32, 0, g);
  SWAY.push({ o: g, k: 0.22, f: 2.2, ph: rr(0, 6), r0: g.rotation.clone() });
  PROPS.push({ k: "flowers", o: g, p: parent, h: 0.3, n: PROPS.filter(function (r) { return r.k === "flowers"; }).length });
  return put(g, x, TOP, z, parent);
}
function fence(parent, pts) {
  var c0 = parent.children.length;
  PROPS.push({ k: "fence", p: parent, pts: pts, c0: c0, fence: true });
  for (var i = 0; i < pts.length; i++) {
    var p = pts[i];
    put(M(facet(cyl(0.07, 0.08, 0.75, 5)), C.wood, { t: 0.03 }), p[0], TOP + 0.37, p[1], parent);
    if (i < pts.length - 1) {
      var q = pts[i + 1], dx = q[0] - p[0], dz = q[1] - p[1], L = Math.hypot(dx, dz);
      [0.28, 0.58].forEach(function (h) {
        var r = M(facet(new THREE.BoxGeometry(L, 0.07, 0.06)), C.wood, { t: 0.025 });
        r.rotation.y = -Math.atan2(dz, dx);
        put(r, (p[0] + q[0]) / 2, TOP + h, (p[1] + q[1]) / 2, parent);
      });
    }
  }
}
function slabStone(parent, x, z, s) {
  var m = M(facet(cyl(0.36 * s, 0.4 * s, 0.12, 7), 0.04, 0.2), 0xd9cfc2, { t: 0.025 });
  m.rotation.y = rr(0, 3); PROPS.push({ k: "stone", o: m, p: parent, h: 1, wd: 0.78 * s, sib: true, x: x, z: z }); return put(m, x, TOP + 0.04, z, parent);
}
function chibi(parent, o) {
  var g = new THREE.Group();
  // legs
  [-0.1, 0.1].forEach(function (x) {
    put(M(facet(cyl(0.06, 0.07, 0.3, 5)), o.legs || 0xfff1e0, { t: 0.025 }), x, 0.15, 0, g);
    put(M(facet(ico(0.085, 0)), 0x6a3c2a, { t: 0.025 }), x, 0.04, 0.04, g);
  });
  // body / dress
  put(M(facet(new THREE.ConeGeometry(0.36, 0.62, 8), 0, 0), o.dress, { t: 0.035 }), 0, 0.58, 0, g);
  // arms
  [-1, 1].forEach(function (sx) {
    var a = M(facet(cyl(0.045, 0.05, 0.36, 5)), o.dress, { t: 0.025 });
    a.rotation.z = sx * 0.5; put(a, sx * 0.24, 0.66, 0.02, g);
    put(M(facet(ico(0.06, 0)), C.skin, { t: 0.02 }), sx * 0.33, 0.5, 0.03, g);
  });
  // head
  var head = put(M(facet(ico(0.34, 1)), C.skin, { t: 0.04 }), 0, 1.15, 0, g);
  // hair cap
  var hair = M(facet(ico(0.37, 1)), o.hair, { t: 0.04 });
  hair.scale.set(1.02, 0.86, 1.02); put(hair, 0, 1.24, -0.06, g);
  var bang = M(facet(ico(0.22, 0)), o.hair, { t: 0.03 }); bang.scale.set(1.5, 0.5, 0.8); put(bang, 0, 1.36, 0.2, g);
  if (o.tail) { var tl = M(facet(ico(0.16, 0)), o.hair, { t: 0.03 }); tl.scale.y = 1.6; put(tl, 0, 1.0, -0.36, g); }
  if (o.bun) put(M(facet(ico(0.17, 0)), o.hair, { t: 0.03 }), 0, 1.55, -0.12, g);
  // eyes + cheeks
  [-1, 1].forEach(function (sx) {
    put(new THREE.Mesh(ico(0.045, 1), new THREE.MeshBasicMaterial({ color: INK })), sx * 0.12, 1.12, 0.31, g);
    put(new THREE.Mesh(ico(0.05, 1), new THREE.MeshBasicMaterial({ color: 0xff9e8a })), sx * 0.2, 1.03, 0.27, g).scale.z = 0.3;
  });
  if (o.pack) { var bp = M(facet(new THREE.BoxGeometry(0.34, 0.36, 0.18), 0.02), 0xd8a35a, { t: 0.03 }); put(bp, 0, 0.72, -0.27, g); }
  if (o.glasses) {
    [-1, 1].forEach(function (sx) { put(new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.014, 4, 10), new THREE.MeshBasicMaterial({ color: INK })), sx * 0.12, 1.12, 0.33, g); });
  }
  g.scale.setScalar(o.s || 1);
  return g;
}

// ---------- left island content ----------
tree(LEFT, -2.6, -1.6, 1.25);
tree(LEFT, -3.4, 0.8, 1.0, [C.leafC, C.leafA, C.leafB]);
tree(LEFT, -1.0, -3.0, 0.9, [C.leafB, C.leafA]);
bush(LEFT, -3.6, 2.4, 1.1, C.leafA); bush(LEFT, -2.2, 3.1, 0.9, C.leafC); bush(LEFT, 1.4, -2.9, 1, C.leafB);
fence(LEFT, [[-1.8, 3.6], [-0.6, 3.75], [0.6, 3.6], [1.8, 3.2]]);
fence(LEFT, [[2.4, -2.4], [3.3, -1.5]]);
[[-0.8, 2.5, 1], [0.0, 1.7, 0.9], [0.6, 0.9, 1.05], [-1.4, 3.1, 0.8]].forEach(function (s) { slabStone(LEFT, s[0], s[1], s[2]); });
rock(LEFT, -4.0, -1.2, 1.4); rock(LEFT, 2.8, 2.7, 1.1); rock(LEFT, -0.7, -2.7, 0.8);
for (var fi = 0; fi < 22; fi++) flower(LEFT, rr(-4, 3.5), rr(-3, 3.3), [0xffd23d, 0xff6b3d, 0xffffff, 0xff9a3c][fi % 4]);
// sign
var sign = new THREE.Group();
put(M(facet(cyl(0.06, 0.07, 1.0, 5)), C.wood, { t: 0.03 }), -0.5, 0.5, 0, sign);
put(M(facet(cyl(0.06, 0.07, 1.0, 5)), C.wood, { t: 0.03 }), 0.5, 0.5, 0, sign);
put(M(facet(new THREE.BoxGeometry(1.5, 0.6, 0.1), 0.02), 0xb07c4f, { t: 0.035 }), 0, 0.8, 0.02, sign);
sign.rotation.y = 0.9; put(sign, -2.9, TOP, 2.0, LEFT);
// sapling at the chasm edge
var sap = new THREE.Group();
put(M(facet(cyl(0.035, 0.06, 0.8, 5)), C.trunk, { t: 0.025 }), 0, 0.4, 0, sap);
[[0.12, 0.8, 0], [-0.12, 0.7, 0.05], [0, 0.95, -0.05]].forEach(function (p) { put(M(facet(ico(0.13, 0)), 0xf3c23a, { t: 0.025 }), p[0], p[1], p[2], sap); });
put(sap, 3.3, TOP, 1.2, LEFT); PROPS.push({ k: "ytree", o: sap, p: LEFT, h: 1.1 });
// girl
// ================= detailed chibi characters (v10) =================
function faceTex(kind) {
  var c = document.createElement("canvas"); c.width = c.height = 512;
  var x = c.getContext("2d");
  function ell(cx, cy, rx, ry, fill) { x.beginPath(); x.ellipse(cx, cy, rx, ry, 0, 0, 6.2832); x.fillStyle = fill; x.fill(); }
  // blush
  [-1, 1].forEach(function (s) {
    var g = x.createRadialGradient(256 + s * 120, 330, 4, 256 + s * 120, 330, 62);
    g.addColorStop(0, "rgba(255,120,110,0.55)"); g.addColorStop(1, "rgba(255,120,110,0)");
    x.fillStyle = g; x.fillRect(0, 0, 512, 512);
  });
  x.lineCap = "round"; x.strokeStyle = "#4a2618";
  if (kind === "girl") {
    [-1, 1].forEach(function (s) {
      var cx = 256 + s * 84, cy = 262;
      ell(cx, cy, 34, 46, "#3a1d12");
      var g = x.createLinearGradient(0, cy - 40, 0, cy + 46); g.addColorStop(0, "#5a2c18"); g.addColorStop(1, "#b0703c");
      ell(cx, cy + 6, 26, 34, g);
      ell(cx, cy + 4, 13, 17, "#2a120a");
      ell(cx - 10 * s + 2, cy - 16, 11, 13, "#fffaf0"); ell(cx + 10 * s, cy + 20, 5, 5, "rgba(255,250,240,.85)");
      x.lineWidth = 9; x.beginPath(); x.moveTo(cx - 38, cy - 34); x.quadraticCurveTo(cx, cy - 58, cx + 38, cy - 36); x.stroke();
      x.lineWidth = 6; x.beginPath(); x.moveTo(cx + s * 34, cy - 38); x.lineTo(cx + s * 48, cy - 48); x.stroke();
      x.lineWidth = 7; x.strokeStyle = "#6a3a24"; x.beginPath(); x.moveTo(cx - 24, cy - 84); x.quadraticCurveTo(cx, cy - 94, cx + 24, cy - 86); x.stroke(); x.strokeStyle = "#4a2618";
    });
    x.lineWidth = 7; x.beginPath(); x.moveTo(236, 352); x.quadraticCurveTo(256, 370, 276, 352); x.stroke();
  } else {
    [-1, 1].forEach(function (s) {
      var cx = 256 + s * 84, cy = 272;
      x.lineWidth = 10; x.beginPath(); x.moveTo(cx - 28, cy + 4); x.quadraticCurveTo(cx, cy - 22, cx + 28, cy + 4); x.stroke();
      x.lineWidth = 5; x.strokeStyle = "rgba(120,70,50,.6)"; x.beginPath(); x.moveTo(cx + s * 34, cy + 16); x.lineTo(cx + s * 44, cy + 24); x.stroke(); x.strokeStyle = "#4a2618";
      x.lineWidth = 7; x.strokeStyle = "#b8aca4"; x.beginPath(); x.moveTo(cx - 26, cy - 52); x.quadraticCurveTo(cx, cy - 62, cx + 26, cy - 52); x.stroke(); x.strokeStyle = "#4a2618";
    });
    x.lineWidth = 7; x.beginPath(); x.moveTo(228, 352); x.quadraticCurveTo(256, 376, 284, 352); x.stroke();
    x.lineWidth = 4; x.strokeStyle = "rgba(150,90,70,.45)"; x.beginPath(); x.moveTo(200, 340); x.quadraticCurveTo(208, 356, 214, 364); x.moveTo(312, 340); x.quadraticCurveTo(304, 356, 298, 364); x.stroke();
  }
  var t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}
function faceCap(r, kind) {
  var g = new THREE.SphereGeometry(r, 40, 24, Math.PI / 2 - 1.0, 2.0, Math.PI / 2 - 0.85, 1.75);
  // sphere phi runs from +x towards -z; flip u so the texture reads left-to-right from the front
  var uv = g.attributes.uv; for (var i = 0; i < uv.count; i++) uv.setX(i, 1 - uv.getX(i));
  var m = new THREE.Mesh(g, new THREE.MeshToonMaterial({ map: faceTex(kind), gradientMap: gradientMap, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
  m.renderOrder = 2; return m;
}
function clump(r, sx, sy, sz, col, t) { var m = M(facet(ico(r, 1)), col, { t: t || 0.018 }); m.scale.set(sx, sy, sz); return m; }
function pleatSkirt(rt, rb, h, n, col) {
  var g = new THREE.CylinderGeometry(rt, rb, h, n * 2, 2, true), p = g.attributes.position;
  for (var i = 0; i < p.count; i++) {
    var y = p.getY(i), a = Math.atan2(p.getZ(i), p.getX(i)), k = (0.5 - y / h) ;
    var w = 1 + Math.max(0, Math.cos(a * n)) * 0.07 * k;
    p.setX(i, p.getX(i) * w); p.setZ(i, p.getZ(i) * w);
  }
  return M(facet(g), toon(col, { side: THREE.DoubleSide }), { t: 0.015 });
}
function joint(parent, x, y, z) { var j = new THREE.Group(); j.position.set(x, y, z); parent.add(j); return j; }

function girlModel() {
  var g = new THREE.Group(), body = joint(g, 0, 0, 0), u = {};
  var SK = C.skin, DR = 0xdf5444, CR = 0xfbf0dc, HB = 0x6a3a22, SH = 0x6b3b26;
  [-1, 1].forEach(function (s) {
    var leg = joint(body, s * 0.1, 0.42, 0);
    put(M(facet(cyl(0.05, 0.045, 0.2, 7)), SK, { t: 0.012 }), 0, -0.1, 0, leg);
    put(M(facet(cyl(0.058, 0.052, 0.2, 7)), 0xfffaf2, { t: 0.014 }), 0, -0.27, 0, leg);
    put(M(facet(cyl(0.064, 0.064, 0.035, 7)), 0xf1e6d6, { t: 0.01 }), 0, -0.17, 0, leg);
    var shoe = clump(0.08, 1, 0.62, 1.45, SH); put(shoe, 0, -0.38, 0.03, leg);
    put(M(facet(new THREE.BoxGeometry(0.1, 0.018, 0.03)), 0x4a2618, { t: 0.006 }), 0, -0.34, 0.05, leg);
    u["leg" + (s < 0 ? "L" : "R")] = leg;
  });
  put(M(facet(cyl(0.17, 0.2, 0.08, 10)), CR, { t: 0.012 }), 0, 0.42, 0, body); // petticoat
  put(pleatSkirt(0.2, 0.36, 0.34, 9, DR), 0, 0.58, 0, body);
  put(M(facet(cyl(0.165, 0.2, 0.26, 10)), DR, { t: 0.016 }), 0, 0.86, 0, body); // bodice
  put(M(facet(cyl(0.15, 0.165, 0.06, 10)), CR, { t: 0.01 }), 0, 1.0, 0, body);
  [-1, 1].forEach(function (s) { // collar petals + straps + buttons
    var col = M(facet(new THREE.CylinderGeometry(0.09, 0.09, 0.02, 9, 1, false, 0, Math.PI)), CR, { t: 0.01 });
    col.rotation.set(-0.35, s > 0 ? -0.4 : Math.PI + 0.4, 0); put(col, s * 0.06, 1.03, 0.08, body);
    var st = M(facet(new THREE.BoxGeometry(0.045, 0.24, 0.02)), DR, { t: 0.008 }); st.rotation.z = s * 0.12; put(st, s * 0.09, 0.9, 0.16, body);
    put(M(facet(ico(0.022, 0)), 0xf3c23a, { t: 0.006 }), s * 0.09, 0.96, 0.18, body);
  });
  put(M(facet(cyl(0.012, 0.012, 0.36, 4)), 0xf6d8a8, { line: false }), 0, 0.6, 0.27, body).rotation.x = 0.28; // apron stitch line
  // backpack
  var bp = joint(body, 0, 0.84, -0.2);
  put(clump(0.17, 1.1, 1.15, 0.6, 0xe0aa4c, 0.02), 0, 0, 0, bp);
  put(clump(0.12, 1.25, 0.5, 0.45, 0xc98d38, 0.012), 0, 0.1, -0.06, bp);
  put(M(facet(ico(0.03, 0)), 0xe0473a, { t: 0.006 }), 0, 0.05, -0.12, bp);
  // arms
  [-1, 1].forEach(function (s) {
    var sh = joint(body, s * 0.19, 0.98, 0.0);
    put(clump(0.085, 1, 0.95, 1, CR, 0.014), s * 0.02, -0.02, 0, sh); // puff sleeve
    var fore = joint(sh, s * 0.03, -0.07, 0);
    put(M(facet(cyl(0.04, 0.045, 0.22, 6)), CR, { t: 0.01 }), 0, -0.11, 0, fore);
    put(M(facet(cyl(0.05, 0.05, 0.03, 7)), 0xf1e2c8, { t: 0.008 }), 0, -0.22, 0, fore);
    var hand = joint(fore, 0, -0.27, 0); put(clump(0.05, 1, 1.05, 0.9, SK, 0.01), 0, 0, 0, hand);
    u["arm" + (s < 0 ? "L" : "R")] = sh; u["hand" + (s < 0 ? "L" : "R")] = hand; u["fore" + (s < 0 ? "L" : "R")] = fore;
  });
  // head
  var head = joint(body, 0, 1.06, 0); u.head = head;
  put(M(facet(ico(0.06, 0)), SK, { t: 0.01 }), 0, 0.02, 0, head); // neck
  var hc = put(M(facet(ico(0.34, 2)), SK, { t: 0.02 }), 0, 0.33, 0, head);
  put(faceCap(0.343, "girl"), 0, 0.33, 0, head);
  [-1, 1].forEach(function (s) { put(clump(0.06, 0.6, 1, 0.8, SK, 0.01), s * 0.33, 0.3, 0.02, head); });
  var cap = clump(0.36, 1.04, 0.82, 1.04, HB, 0.02); put(cap, 0, 0.42, -0.05, head);
  for (var i = 0; i < 13; i++) { // bob: hanging clumps around back & sides
    var a = 1.15 + i * (3.98 / 12), r = 0.31;
    var cl = clump(0.13, 0.75, 1.6, 0.75, i % 2 ? HB : 0x5c3220, 0.016);
    cl.position.set(Math.sin(a) * r, 0.2 + Math.abs(Math.cos(a)) * 0.02, Math.cos(a) * r - 0.04);
    cl.rotation.set(Math.cos(a) * -0.25, a, Math.sin(a) * 0.25); head.add(cl);
  }
  for (i = 0; i < 6; i++) { // bangs
    var b = clump(0.085, 1.05, 1.35, 0.6, i % 2 ? HB : 0x5c3220, 0.014);
    var ba = -0.75 + i * 0.3; b.position.set(Math.sin(ba) * 0.3, 0.52 - Math.abs(ba) * 0.08, Math.cos(ba) * 0.3 - 0.03);
    b.rotation.set(0.5, ba, -ba * 0.4); head.add(b);
  }
  var tail = joint(head, 0.3, 0.42, -0.16); u.tail = tail; // side ponytail
  put(M(facet(cyl(0.035, 0.035, 0.05, 7)), 0xd9392e, { t: 0.008 }), 0, 0, 0, tail).rotation.z = 1.2;
  var tl = clump(0.1, 0.8, 1.7, 0.8, HB, 0.014); tl.rotation.z = -0.5; put(tl, 0.08, -0.12, 0, tail);
  var clip = joint(head, -0.22, 0.56, 0.18); // yellow flower clip
  for (i = 0; i < 4; i++) put(M(facet(ico(0.035, 0)), 0xf6c341, { t: 0.006 }), Math.cos(i * 1.57) * 0.035, Math.sin(i * 1.57) * 0.035, 0, clip);
  put(M(facet(ico(0.022, 0)), 0xe0473a, { line: false }), 0, 0, 0.02, clip);
  g.userData = u; return g;
}

function grandmaModel() {
  var g = new THREE.Group(), body = joint(g, 0, 0, 0), u = {};
  var SK = 0xfdd3b6, CA = 0xa98bc6, CA2 = 0x8d70ad, SK2 = 0x7d4a6e, AP = 0xfbf1df, HR = 0xe9e4df;
  // seated: hips at y .5 (bench top), thighs forward, shins down
  [-1, 1].forEach(function (s) {
    var th = put(M(facet(cyl(0.085, 0.08, 0.3, 7)), SK2, { t: 0.014 }), s * 0.1, 0.52, 0.12, body); th.rotation.x = Math.PI / 2;
    put(M(facet(cyl(0.075, 0.09, 0.36, 7)), SK2, { t: 0.014 }), s * 0.1, 0.3, 0.27, body);
    put(M(facet(cyl(0.05, 0.05, 0.08, 7)), 0xf4ead8, { t: 0.01 }), s * 0.1, 0.1, 0.28, body);
    put(clump(0.08, 1, 0.6, 1.5, 0x6b3b26), s * 0.1, 0.04, 0.31, body);
  });
  put(pleatSkirt(0.2, 0.27, 0.22, 8, SK2), 0, 0.55, 0.0, body);
  var torso = joint(body, 0, 0.62, 0); u.torso = torso;
  put(M(facet(cyl(0.2, 0.25, 0.42, 10)), CA, { t: 0.018 }), 0, 0.21, 0, torso); // cardigan
  put(M(facet(new THREE.TorusGeometry(0.235, 0.035, 5, 12)), CA2, { t: 0.01 }), 0, 0.02, 0, torso).rotation.x = Math.PI / 2; // knit hem
  put(M(facet(cyl(0.012, 0.012, 0.4, 4)), CA2, { line: false }), 0, 0.22, 0.23, torso);
  for (var i = 0; i < 3; i++) put(M(facet(ico(0.022, 0)), 0xd9a648, { t: 0.005 }), 0.035, 0.12 + i * 0.1, 0.235, torso);
  var ap = M(facet(new THREE.CylinderGeometry(0.26, 0.29, 0.34, 10, 1, true, -0.75, 1.5)), toon(AP, { side: THREE.DoubleSide }), { t: 0.01 });
  put(ap, 0, -0.06, 0.02, torso);
  put(M(facet(new THREE.BoxGeometry(0.12, 0.09, 0.02)), 0xf3e2c6, { t: 0.006 }), 0.06, -0.1, 0.29, torso);
  put(M(facet(ico(0.02, 0)), 0xd9533e, { line: false }), 0.06, -0.09, 0.305, torso);
  put(M(facet(cyl(0.11, 0.13, 0.05, 10)), 0xf4ead8, { t: 0.008 }), 0, 0.44, 0, torso); // blouse collar
  // arms holding the cup
  var cupJ = joint(torso, 0, 0.17, 0.3); u.cup = cupJ;
  put(M(facet(cyl(0.065, 0.055, 0.11, 9)), 0xfff6e8, { t: 0.01 }), 0, 0, 0, cupJ);
  put(M(facet(cyl(0.058, 0.058, 0.005, 9)), 0x8a4a2a, { line: false }), 0, 0.053, 0, cupJ);
  put(M(facet(cyl(0.067, 0.067, 0.02, 9)), 0xd9533e, { line: false }), 0, 0.015, 0, cupJ);
  [-1, 1].forEach(function (s) {
    var sh = joint(torso, s * 0.22, 0.36, 0);
    put(clump(0.085, 1, 1, 1, CA, 0.014), 0, 0, 0, sh);
    var up = put(M(facet(cyl(0.065, 0.06, 0.2, 7)), CA, { t: 0.012 }), s * 0.01, -0.12, 0.05, sh); up.rotation.x = 0.4;
    var fo = put(M(facet(cyl(0.06, 0.055, 0.22, 7)), CA, { t: 0.012 }), -s * 0.06, -0.2, 0.2, sh); fo.rotation.set(1.35, 0, s * 0.5);
    put(M(facet(new THREE.TorusGeometry(0.055, 0.02, 4, 8)), CA2, { line: false }), -s * 0.12, -0.19, 0.29, sh).rotation.set(0, s * 1.0, 0);
    put(clump(0.05, 1, 0.9, 1, SK, 0.008), -s * 0.15, -0.19, 0.31, sh);
  });
  var head = joint(torso, 0, 0.46, 0); u.head = head;
  put(M(facet(ico(0.3, 2)), SK, { t: 0.018 }), 0, 0.27, 0, head);
  put(faceCap(0.303, "gma"), 0, 0.27, 0, head);
  [-1, 1].forEach(function (s) { put(clump(0.055, 0.6, 1, 0.8, SK, 0.008), s * 0.295, 0.25, 0.02, head); });
  var hcap = clump(0.32, 1.04, 0.62, 1.0, HR, 0.018); put(hcap, 0, 0.47, -0.07, head);
  for (i = 0; i < 9; i++) { var a = 1.25 + i * 0.47; var w = clump(0.1, 0.9, 1.1, 0.8, i % 2 ? HR : 0xd5cec8, 0.012); w.position.set(Math.sin(a) * 0.28, 0.3, Math.cos(a) * 0.28 - 0.05); w.rotation.y = a; head.add(w); }
  [-1, 1].forEach(function (s) { var sw = clump(0.11, 0.8, 0.7, 0.6, HR, 0.012); sw.rotation.z = s * 0.6; put(sw, s * 0.17, 0.52, 0.14, head); });
  put(clump(0.16, 1, 0.92, 1, 0xd5cec8, 0.016), 0, 0.64, -0.1, head); // bun
  put(M(facet(new THREE.TorusGeometry(0.11, 0.02, 4, 12)), 0x9a5fae, { line: false }), 0, 0.58, -0.08, head).rotation.x = 1.3;
  [-1, 1].forEach(function (s) { // round gold glasses
    put(new THREE.Mesh(new THREE.TorusGeometry(0.068, 0.009, 5, 18), new THREE.MeshBasicMaterial({ color: 0xb98a3a })), s * 0.085, 0.28, 0.29, head).rotation.y = s * 0.12;
    put(new THREE.Mesh(cyl(0.006, 0.006, 0.22, 4), new THREE.MeshBasicMaterial({ color: 0xb98a3a })), s * 0.2, 0.29, 0.18, head).rotation.x = Math.PI / 2;
  });
  put(new THREE.Mesh(new THREE.TorusGeometry(0.02, 0.007, 4, 8, Math.PI), new THREE.MeshBasicMaterial({ color: 0xb98a3a })), 0, 0.29, 0.3, head);
  g.userData = u; return g;
}
function animChars(t) {
  var gu = girl.userData;
  if (gu.head) {
    gu.head.rotation.z = Math.sin(t * 0.9) * 0.05; gu.head.rotation.x = -0.12 + Math.sin(t * 0.6) * 0.03;
    gu.armR.rotation.z = 2.5 + Math.sin(t * 1.5) * 0.12; gu.armR.rotation.x = -0.3; gu.foreR.rotation.z = -0.2 + Math.sin(t * 1.5 + 0.6) * 0.1;
    gu.armL.rotation.z = -0.25 + Math.sin(t * 1.1) * 0.05; gu.armL.rotation.x = 0.1;
    gu.tail.rotation.z = Math.sin(t * 2.1) * 0.15;
    gu.legL.rotation.x = Math.sin(t * 0.8) * 0.04;
  }
  var mu = gma.userData;
  if (mu.head) {
    var sip = Math.max(0, Math.sin(t * 0.55)); sip = sip * sip * sip;
    mu.cup.position.y = 0.17 + sip * 0.2; mu.cup.position.z = 0.3 - sip * 0.06; mu.cup.rotation.x = -sip * 0.5;
    mu.head.rotation.x = -0.08 + sip * 0.12 + Math.sin(t * 0.7) * 0.02; mu.head.rotation.z = Math.sin(t * 0.4) * 0.04;
    mu.torso.scale.y = 1 + Math.sin(t * 1.4) * 0.012;
  }
}

var girl = girlModel(); LEFT.add(girl);
girl.rotation.y = 0.9; put(girl, 0.6, TOP, 0.5, LEFT);
var hand = girl.userData.handR;
// seagull
function gull(parent, x, y, z) {
  var g = new THREE.Group();
  var b = M(facet(ico(0.16, 0)), C.white, { t: 0.025 }); b.scale.set(1.4, 1, 1); put(b, 0, 0.16, 0, g);
  put(M(facet(ico(0.1, 0)), C.white, { t: 0.02 }), 0.2, 0.3, 0, g);
  put(new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.09, 4), toon(0xffa53d)), 0.31, 0.3, 0, g).rotation.z = -Math.PI / 2;
  return put(g, x, y, z, parent);
}
gull(LEFT, -4.0, TOP + 0.22, -1.2);

// ---------- kite ----------
var kite = new THREE.Group();
var KP = [[0, 0.75], [0.5, 0.05], [0, -0.85], [-0.5, 0.05]];
var KC = [0xe8463a, 0x3a9fe0, 0xffd23d, 0xfffaf2];
for (var ki = 0; ki < 4; ki++) {
  var a = KP[ki], b = KP[(ki + 1) % 4];
  var kg = new THREE.BufferGeometry();
  kg.setAttribute("position", new THREE.Float32BufferAttribute([0, 0, 0, a[0], a[1], 0, b[0], b[1], 0], 3));
  kg.computeVertexNormals();
  var km = new THREE.Mesh(kg, toon(KC[ki], { side: THREE.DoubleSide })); km.castShadow = true; kite.add(km);
}
var rim = KP.concat([KP[0]]).map(function (p) { return new THREE.Vector3(p[0], p[1], 0.01); });
kite.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(rim), new THREE.LineBasicMaterial({ color: INK })));
var tailParts = [];
for (var ti = 0; ti < 5; ti++) {
  var bow = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.12), toon([0xe8463a, 0xffd23d, 0x3a9fe0][ti % 3], { side: THREE.DoubleSide }));
  bow.position.set(0, -0.95 - ti * 0.3, 0); kite.add(bow); tailParts.push(bow);
}
var kiteLine = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()]), new THREE.LineBasicMaterial({ color: INK }));
kiteLine.frustumCulled = false; scene.add(kite); scene.add(kiteLine);

// ---------- right island content ----------
var house = new THREE.Group();
put(M(facet(new THREE.BoxGeometry(2.4, 1.7, 2.0)), C.cream, { t: 0.05 }), 0, 0.85, 0, house);
// timber base
put(M(facet(new THREE.BoxGeometry(2.55, 0.3, 2.15)), 0xb8a89a, { t: 0.04 }), 0, 0.15, 0, house);
// roof (gable prism)
var rs = new THREE.Shape([new THREE.Vector2(-1.55, 0), new THREE.Vector2(1.55, 0), new THREE.Vector2(0, 1.35)]);
var roofG = new THREE.ExtrudeGeometry(rs, { depth: 2.5, bevelEnabled: false }); roofG.translate(0, 0, -1.25);
put(M(facet(roofG), C.roof, { t: 0.06 }), 0, 1.7, 0, house);
// roof tiles rows (thin slabs on each slope)
[-1, 1].forEach(function (sx) {
  for (var r = 0; r < 3; r++) {
    var tg = M(facet(new THREE.BoxGeometry(0.62, 0.08, 2.6)), r % 2 ? C.roof2 : C.roof, { t: 0.03 });
    tg.rotation.z = sx * -0.716;
    put(tg, sx * (1.25 - r * 0.42), 1.75 + r * 0.37 + 0.06, 0, house);
  }
});
var chim = M(facet(new THREE.BoxGeometry(0.42, 1.0, 0.42)), 0xd8cbbd, { t: 0.04 }); put(chim, 0.75, 2.75, -0.5, house);
put(M(facet(new THREE.BoxGeometry(0.52, 0.12, 0.52)), 0x9a8a7d, { t: 0.03 }), 0.75, 3.28, -0.5, house);
var winM = new THREE.MeshToonMaterial({ color: 0xffd98a, emissive: 0xffb04a, emissiveIntensity: 0.9, gradientMap: gradientMap });
function win(x, y, z, ry, round) {
  var w = new THREE.Group();
  var geo = round ? cyl(0.28, 0.28, 0.06, 10) : new THREE.BoxGeometry(0.5, 0.55, 0.06);
  if (round) geo.rotateX(Math.PI / 2);
  put(M(facet(geo), winM, { t: 0.04 }), 0, 0, 0, w);
  put(new THREE.Mesh(new THREE.BoxGeometry(round ? 0.56 : 0.5, 0.05, 0.08), toon(0x6e4430)), 0, 0, 0.01, w);
  put(new THREE.Mesh(new THREE.BoxGeometry(0.05, round ? 0.56 : 0.55, 0.08), toon(0x6e4430)), 0, 0, 0.01, w);
  w.rotation.y = ry; return put(w, x, y, z, house);
}
win(-0.65, 1.0, 1.01, 0); win(1.21, 1.0, 0.4, Math.PI / 2); win(1.21, 1.0, -0.5, Math.PI / 2); win(0, 2.25, 1.27, 0, true);
var door = M(facet(new THREE.BoxGeometry(0.6, 1.0, 0.08)), 0x8a5a3a, { t: 0.035 }); put(door, 0.45, 0.65, 1.02, house);
// flower box
put(M(facet(new THREE.BoxGeometry(0.62, 0.16, 0.2)), C.wood, { t: 0.025 }), -0.65, 0.66, 1.1, house);
for (var bi = 0; bi < 4; bi++) put(M(facet(ico(0.08, 0)), [0xff6b3d, 0xffd23d][bi % 2], { t: 0.02 }), -0.85 + bi * 0.13, 0.8, 1.12, house);
house.rotation.y = -0.5;
put(house, 0.9, TOP, -1.1, RIGHT);
var chimTop = new THREE.Object3D(); put(chimTop, 0.75, 3.4, -0.5, house);
// smoke puffs
var smoke = [];
for (var si = 0; si < 7; si++) {
  var sm = M(facet(ico(0.3, 0)), toon(0xffffff, { transparent: true, opacity: 0.95, emissive: 0xb8a8a6, emissiveIntensity: 0.7 }), { line: false, shadow: false });
  sm.userData.ph = si / 7; scene.add(sm); smoke.push(sm);
}
// bench + grandma
var bench = new THREE.Group();
put(M(facet(new THREE.BoxGeometry(1.4, 0.1, 0.45)), C.wood, { t: 0.03 }), 0, 0.45, 0, bench);
put(M(facet(new THREE.BoxGeometry(1.4, 0.35, 0.08)), C.wood, { t: 0.03 }), 0, 0.78, -0.22, bench);
[[-0.6, 0.18], [0.6, 0.18], [-0.6, -0.18], [0.6, -0.18]].forEach(function (p) { put(M(facet(cyl(0.05, 0.05, 0.45, 5)), C.wood, { t: 0.02 }), p[0], 0.22, p[1], bench); });
var gma = grandmaModel(); put(gma, 0.2, -0.02, -0.02, bench);
bench.rotation.y = 0.2;
put(bench, -1.6, TOP, 1.2, RIGHT);
// cat
var cat = new THREE.Group();
var cb = M(facet(ico(0.26, 0)), 0xf2a04a, { t: 0.03 }); cb.scale.set(1.6, 0.8, 1); put(cb, 0, 0.18, 0, cat);
put(M(facet(ico(0.18, 0)), 0xfff5ea, { t: 0.03 }), 0.38, 0.28, 0.05, cat);
[-1, 1].forEach(function (s) { put(M(new THREE.ConeGeometry(0.06, 0.12, 4), 0xf2a04a, { t: 0.02 }), 0.4, 0.46, s * 0.09, cat); });
var catTail = M(facet(cyl(0.04, 0.05, 0.4, 5)), 0xf2a04a, { t: 0.02 }); catTail.rotation.z = 1.2; put(catTail, -0.5, 0.18, 0.05, cat);
cat.rotation.y = 0.6; put(cat, -0.2, TOP, 2.3, RIGHT);
// mailbox
var mb = new THREE.Group();
put(M(facet(cyl(0.06, 0.07, 0.9, 5)), C.wood, { t: 0.025 }), 0, 0.45, 0, mb);
put(M(facet(new THREE.BoxGeometry(0.5, 0.42, 0.36)), 0xe23b30, { t: 0.035 }), 0, 1.05, 0, mb);
put(M(facet(new THREE.BoxGeometry(0.58, 0.08, 0.44)), 0xb72b24, { t: 0.03 }), 0, 1.3, 0, mb);
gull(mb, -0.1, 1.33, 0).scale.setScalar(0.8);
mb.rotation.y = -0.4; put(mb, 2.6, TOP, 2.1, RIGHT);
// sunflowers
function sunflower(parent, x, z, h) {
  var g = new THREE.Group();
  put(new THREE.Mesh(cyl(0.03, 0.03, h, 4), toon(0x8cc152, { emissive: 0x3c5a1a, emissiveIntensity: 0.35 })), 0, h / 2, 0, g);
  var head = M(facet(cyl(0.2, 0.2, 0.06, 9)), 0xffc62e, { t: 0.025 }); head.rotation.x = 1.2; put(head, 0, h, 0.03, g);
  var core = new THREE.Mesh(cyl(0.09, 0.09, 0.08, 7), toon(0x6e4430)); core.rotation.x = 1.2; put(core, 0, h, 0.06, g);
  SWAY.push({ o: g, k: 0.12, f: 1.6, ph: rr(0, 6), r0: g.rotation.clone() });
  PROPS.push({ k: "sun", o: g, p: parent, h: 1.3, first: !sunflower.done }); sunflower.done = 1;
  return put(g, x, TOP, z, parent);
}
sunflower(RIGHT, 1.8, 1.0, 0.9); sunflower(RIGHT, 2.1, 0.7, 0.75); sunflower(RIGHT, 1.55, 0.6, 0.65);
tree(RIGHT, 3.0, -2.2, 1.1, [C.leafA, C.leafC, C.leafB]);
tree(RIGHT, -2.8, -1.6, 0.85, [C.leafB, C.leafA]);
bush(RIGHT, -3.2, 0.6, 1, C.leafC); bush(RIGHT, 3.3, 0.4, 0.9, C.leafA);
fence(RIGHT, [[-0.8, 3.2], [0.5, 3.35], [1.7, 3.0]]);
fence(RIGHT, [[-3.4, 1.6], [-3.6, 2.6]]);
[[-2.4, 0.2, 1], [-1.7, -0.4, 0.9], [-0.9, -0.2, 1]].forEach(function (s) { slabStone(RIGHT, s[0], s[1], s[2]); });
rock(RIGHT, 2.6, -0.4, 1); rock(RIGHT, -2.8, 2.6, 1.2);
for (var fj = 0; fj < 16; fj++) flower(RIGHT, rr(-3.2, 3.2), rr(-2.8, 3), [0xffd23d, 0xff6b3d, 0xffffff][fj % 3]);
var lamp = new THREE.Group();
put(M(facet(cyl(0.04, 0.05, 1.3, 5)), 0x4a3a35, { t: 0.02 }), 0, 0.65, 0, lamp);
put(M(facet(new THREE.BoxGeometry(0.2, 0.26, 0.2)), winM, { t: 0.025 }), 0, 1.38, 0, lamp);
put(lamp, 1.7, TOP, 1.6, RIGHT);
var lampL = new THREE.PointLight(0xffb45a, 0, 5, 1.6); lampL.position.set(0, 1.35, 0); lamp.add(lampL);
var houseL = new THREE.PointLight(0xffa54a, 0, 6, 1.5); houseL.position.set(0, 1.0, 2.2); house.parent ? house.parent.add(houseL) : RIGHT.add(houseL); houseL.position.add(house.position);


// grass tufts and lighter patches on both islands
function tufts(parent, n, rx, rz) {
  var tg = new THREE.ConeGeometry(0.07, 0.28, 3);
  for (var i = 0; i < n; i++) {
    var g = new THREE.Group();
    for (var j = 0; j < 3; j++) { var c = new THREE.Mesh(tg, toon([0xe6c04a, 0xb9c44a, 0xf7d962][(i + j) % 3])); c.position.set(rr(-0.1, 0.1), 0.12, rr(-0.1, 0.1)); c.rotation.z = rr(-0.4, 0.4); c.castShadow = true; g.add(c); }
    put(g, rr(-rx, rx), TOP, rr(-rz, rz), parent);
    SWAY.push({ o: g, k: 0.3, f: 2.6, ph: rr(0, 6), r0: g.rotation.clone() });
  }
  for (var k = 0; k < 6; k++) {
    var p = new THREE.Mesh(facet(cyl(rr(0.5, 1.0), rr(0.5, 1.0), 0.02, 7)), toon(k % 2 ? 0xf3d158 : 0xc7b23b)); p.receiveShadow = true;
    put(p, rr(-rx, rx) * 0.8, TOP + 0.01, rr(-rz, rz) * 0.8, parent);
  }
}
if (!(window.__GLB && window.__GLB.grass)) { tufts(LEFT, 45, 4.2, 3.4); tufts(RIGHT, 35, 3.6, 3.0); }

// ================= crystal "future" tree (soft glass, unlit fresnel) =================
var cryMat = new THREE.ShaderMaterial({
  uniforms: { uT: { value: 0 }, uOp: { value: 1 } }, transparent: true, depthWrite: false, side: THREE.DoubleSide,
  vertexShader: "varying vec3 vN; varying vec3 vV; varying float vY; void main(){ vec4 mv = modelViewMatrix * vec4(position,1.); vN = normalMatrix * normal; vV = -mv.xyz; vY = (modelMatrix * vec4(position,1.)).y; gl_Position = projectionMatrix * mv; }",
  fragmentShader: "uniform float uT, uOp; varying vec3 vN; varying vec3 vV; varying float vY; void main(){ float ln = length(vN), lv = length(vV); vec3 n = ln > 1e-4 ? vN / ln : vec3(0.,0.,1.); vec3 v = lv > 1e-4 ? vV / lv : vec3(0.,0.,1.); float f = clamp(1. - abs(dot(n, v)), 0., 1.); f = f * f; vec3 base = mix(vec3(.80,.93,1.), vec3(1.,.90,.97), clamp(vY * .08 + .3, 0., 1.)); float sh = .5 + .5 * sin(vY * 1.7 - uT * 1.6); vec3 c = base * (.75 + .25 * sh) + vec3(1.) * f * .6; float a = clamp(.34 + f * .55, 0., .92) * uOp; gl_FragColor = vec4(clamp(c, 0., 1.), a); }"
});
var cryHull = new THREE.MeshBasicMaterial({ color: 0x6aaee6, side: THREE.BackSide, transparent: true, opacity: 0.45, depthWrite: false });
var cryLine = cryHull;
var crystal = new THREE.Group();
function cryPiece(geo, hullT) {
  var m = new THREE.Mesh(geo, cryMat); m.renderOrder = 2;
  var h = new THREE.Mesh(hull(geo, hullT || 0.035), cryHull); h.renderOrder = 1; m.add(h);
  crystal.add(m); return m;
}
var base = new THREE.Vector3(3.1, TOP, 0.0); // world: left island edge
function branch(pts, r0, r1) {
  var curve = new THREE.CatmullRomCurve3(pts.map(function (p) { return new THREE.Vector3(p[0], p[1], p[2]); }));
  var tg = new THREE.TubeGeometry(curve, 12, r0, 12, false);
  // taper
  var p = tg.attributes.position, cps = curve.getSpacedPoints(12);
  for (var i = 0; i < p.count; i++) {
    var seg = Math.floor(i / 13), k = seg / 12, c = cps[Math.min(seg, 12)];
    var v = new THREE.Vector3(p.getX(i), p.getY(i), p.getZ(i)).sub(c).multiplyScalar(1 - (1 - r1 / r0) * k).add(c);
    p.setXYZ(i, v.x, v.y, v.z);
  }
  tg.computeVertexNormals(); cryPiece(tg);
  return curve;
}
branch([[0, 0, 0], [0.4, 1.6, 0], [1.6, 3.4, -0.1], [3.6, 4.6, -0.3], [6.2, 4.9, -0.6]], 0.42, 0.12);
branch([[1.2, 2.9, -0.05], [1.4, 4.4, 0.5], [2.0, 5.6, 0.7]], 0.2, 0.06);
branch([[2.6, 4.1, -0.2], [3.6, 5.6, -0.9], [4.6, 6.3, -1.2]], 0.18, 0.05);
branch([[4.4, 4.8, -0.4], [5.8, 5.9, 0.3], [7.0, 6.2, 0.6]], 0.16, 0.05);
branch([[0.2, 0.4, 0], [-0.5, 0.05, 0.4]], 0.18, 0.06);
var leafSpots = [[2.0, 5.8, 0.7, 1.0], [3.0, 6.2, 0.0, 1.15], [4.6, 6.5, -1.1, 1.0], [5.6, 6.0, 0.4, 1.2], [7.0, 6.3, 0.7, 0.95], [6.4, 5.2, -0.8, 0.9], [3.9, 5.4, 0.9, 0.85], [1.3, 5.0, -0.6, 0.8], [5.0, 7.1, 0.0, 0.8], [2.6, 7.0, 0.3, 0.7], [6.8, 7.0, -0.3, 0.7]];
var cryLeaves = [];
var cryGlow = new THREE.SpriteMaterial({ map: radial([[0, 'rgba(235,248,255,0.55)'], [0.4, 'rgba(200,232,255,0.2)'], [1, 'rgba(200,232,255,0)']]), transparent: true, depthWrite: false, fog: false });
leafSpots.forEach(function (l, i) {
  var g = softBall(l[3] * 0.85, 0.08);
  var m = cryPiece(g, 0.04); m.position.set(l[0], l[1], l[2]); m.rotation.set(rr(0, 3), rr(0, 3), 0);
  var gl = new THREE.Sprite(cryGlow); gl.scale.setScalar(l[3] * 2.4); gl.renderOrder = 4; m.add(gl);
  m.userData.ph = i; cryLeaves.push(m);
});
crystal.position.copy(base).add(LEFT.position);
crystal.scale.setScalar(0.86); scene.add(crystal); crystal.visible = false; // removed per user 2026-10-13
// dotted arc: where the future bridge lands
var arcDots = [];
var arc = new THREE.QuadraticBezierCurve3(new THREE.Vector3(-3.0, 0.4, 1.4), new THREE.Vector3(0, 3.2, 1.2), new THREE.Vector3(3.2, 0.9, 0.8));
var dotMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
for (var di = 0; di <= 18; di++) { var dd = new THREE.Mesh(ico(0.07, 1), dotMat); dd.position.copy(arc.getPoint(di / 18)); scene.add(dd); arcDots.push(dd); }

// ================= chasm, water, falls =================
var river = new THREE.Mesh(new THREE.PlaneGeometry(6, 40, 6, 30), toon(0x46c9c2, { emissive: 0x1f8a90, emissiveIntensity: 0.25 }));
river.geometry.rotateX(-Math.PI / 2);
river.position.set(0.2, -11, -6); river.visible = false;
var rp = river.geometry.attributes.position, river0 = Float32Array.from(rp.array);
var cloudMat2 = new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0xe8d8e0, emissiveIntensity: 0.5 });
function fall(x, y, z, h, w) {
  var g = new THREE.PlaneGeometry(w, h, 1, 8);
  var m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: 0xe9fbff, transparent: true, opacity: 0.8 }));
  m.position.set(x, y - h / 2, z); scene.add(m);
  var foam = new THREE.Mesh(new THREE.SphereGeometry(0.7, 20, 12), cloudMat2); foam.scale.y = 0.45; put(foam, x, y - h, z);
  return m;
}
var falls = [];
// cloud banks
var clouds = [];
// low-poly faceted clouds: puffy icospheres with flattened bases, toon-lit, fog-blended
var cloudMat = new THREE.MeshToonMaterial({ color: 0xf6eee9, emissive: 0xf2c6c8, emissiveIntensity: 0.22, gradientMap: gradientMap });
var cloudMatFar = new THREE.MeshToonMaterial({ color: 0xffeae6, emissive: 0xe9b6c4, emissiveIntensity: 0.38, gradientMap: gradientMap });
function puff(r) { // smooth rounded puff with soft lumps, flat-ish base
  var g = new THREE.SphereGeometry(r, 28, 18), p = g.attributes.position, ph = rr(0, 6), v = new THREE.Vector3();
  for (var i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i).normalize();
    var k = 1 + 0.06 * Math.sin(v.x * 3.1 + ph) * Math.sin(v.z * 2.7 + ph) + 0.04 * Math.sin(v.y * 4 + v.x * 2 + ph);
    var x = v.x * r * k, y = v.y * r * k, z = v.z * r * k;
    if (y < -r * 0.25) y = -r * 0.25 - (y + r * 0.25) * 0.12;
    p.setXYZ(i, x, y, z);
  }
  g.computeVertexNormals(); return g;
}
function cloud(x, y, z, s, big, far) {
  var g = new THREE.Group(), n = (big ? 7 : 4) + Math.floor(rnd() * 3), mat = far ? cloudMatFar : cloudMat;
  for (var i = 0; i < n; i++) {
    var mid = 1 - Math.abs(i - (n - 1) / 2) / ((n + 1) / 2);
    var r = (0.55 + mid * 0.85) * s * rr(0.8, 1.1);
    var m = new THREE.Mesh(puff(r), mat);
    m.position.set((i - (n - 1) / 2) * 0.85 * s + rr(-0.2, 0.2) * s, r * 0.25 + mid * 0.35 * s + rr(0, 0.12) * s, rr(-0.5, 0.5) * s);
    m.receiveShadow = !far; g.add(m);
    if (mid > 0.5 && rnd() < 0.7) { var r2 = r * rr(0.5, 0.7), m2 = new THREE.Mesh(puff(r2), mat); m2.position.set(m.position.x + rr(-0.4, 0.4) * s, m.position.y + r * 0.6, m.position.z + rr(-0.3, 0.3) * s); g.add(m2); }
  }
  g.userData.v = rr(0.06, 0.16); g.userData.x0 = x;
  clouds.push(g); return put(g, x, y, z);
}
// near puffs + cloud sea under the islands
cloud(-13, -7.2, 7, 1.2); cloud(12, -8, 8, 1.3); cloud(-2, -10.2, 6, 1.0);
cloud(-17, -4.5, -12, 1.0); cloud(16, -3.5, -16, 1.1);
for (var cs = 0; cs < 16; cs++) cloud(rr(-36, 36), rr(-15, -12.5), rr(-34, 2), rr(1.4, 2.2), true);
// horizon cloud ranges: replace the flat painted ridges, fade into fog
for (var hr = 0; hr < 22; hr++) { var hz = rr(-70, -105); cloud(rr(-75, 75), rr(-11, -3) + (hz + 70) * -0.06, hz, rr(2.6, 4.2), true, true); }
// cloud sea floor


// ================= distant world (camera-locked backdrop) =================
var camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 400);
scene.add(camera);
var back = new THREE.Group(); camera.add(back);
function flat(col) { return new THREE.MeshBasicMaterial({ color: col, fog: false }); }
function ridge(y, h, col, n, zz, ph) {
  var pts = [new THREE.Vector2(-90, -40)];
  for (var i = 0; i <= 160; i++) {
    var x = -90 + 180 * i / 160;
    var v = Math.sin(x * 0.045 * n / 10 + ph) * 0.55 + Math.sin(x * 0.11 * n / 10 + ph * 2.3) * 0.3 + Math.sin(x * 0.023 + ph * 0.7) * 0.6;
    pts.push(new THREE.Vector2(x, y + (v * 0.5 + 0.5) * h));
  }
  pts.push(new THREE.Vector2(90, -40));
  var m = new THREE.Mesh(new THREE.ShapeGeometry(new THREE.Shape(pts)), new THREE.MeshBasicMaterial({ color: col, fog: false, transparent: true, opacity: 0.92 }));
  m.position.z = zz; back.add(m); return m;
}
var ridges = [];
// distant floating islands as soft silhouettes
var floaters = [];
function floater(x, y, r, col) {
  var g = new THREE.Group(), mat = flat(col);
  var topM = new THREE.Mesh(new THREE.CircleGeometry(r, 40), mat); topM.scale.y = 0.32; g.add(topM);
  var sh = new THREE.Shape(); sh.moveTo(-r, 0); sh.bezierCurveTo(-r * 0.9, -r * 1.2, -r * 0.2, -r * 2.2, 0, -r * 2.3); sh.bezierCurveTo(r * 0.2, -r * 2.2, r * 0.9, -r * 1.2, r, 0); sh.lineTo(-r, 0);
  g.add(new THREE.Mesh(new THREE.ShapeGeometry(sh, 24), mat));
  for (var i = 0; i < 2; i++) { var tr = new THREE.Mesh(new THREE.CircleGeometry(r * 0.3, 32), mat); tr.position.set((i ? 0.35 : -0.3) * r, r * 0.38, 0); g.add(tr); }
  g.position.set(x, y, -260); g.userData.y0 = y; g.userData.ph = rr(0, 6); back.add(g); floaters.push(g); return g;
}

// sun on the horizon

// ================= birds =================
var birds = [], tmpB = new THREE.Vector3();
for (var bj = 0; bj < 4; bj++) {
  var bg = new THREE.Group();
  [-1, 1].forEach(function (s) {
    var w = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.14), new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide }));
    w.position.x = s * 0.25; var pv = new THREE.Group(); pv.add(w); pv.userData.s = s; bg.add(pv);
  });
  bg.userData = { r: rr(3, 6), h: rr(-1, 3.5), sp: rr(0.25, 0.45) * (bj % 2 ? 1 : -1), ph: rr(0, 6), cx: rr(-1, 1.5), cz: rr(-3, 2) };
  scene.add(bg); birds.push(bg);
}

// ================= camera / controls =================
var yaw = 0.18, pitch = 0.42, zoom = 1, yawT = yaw, pitchT = pitch, zoomT = zoom;
var target = new THREE.Vector3(1.4, 0.1, -3.0);
var intro = 0, introOn = true, yawV = 0, idleT = 0;
window.__girl = girl; window.__gma = gma; window.__V3 = THREE.Vector3;
window.__look = function (x, y, z) { target.set(x, y, z); };
window.__dims = function () {
  scene.updateMatrixWorld(true);
  function h(o) { var b = new THREE.Box3().setFromObject(o); return (b.max.y - b.min.y).toFixed(2) + "w" + Math.max(b.max.x - b.min.x, b.max.z - b.min.z).toFixed(2); }
  var out = [heroes.girl && "girl " + h(heroes.girl), heroes.gma && "gma " + h(heroes.gma), heroes.house && "house " + h(heroes.house)];
  PROPS.forEach(function (r) { if (/tree|bush|sunflower|lamp|fence/.test(r.k) && r.o && r.o.visible !== false) out.push(r.k + (r.p === RIGHT ? "R " : "L ") + h(r.o)); });
  ["LEFT", "RIGHT"].forEach(function (n) { var I = n === "LEFT" ? LEFT : RIGHT; var c = I.children.find(function (o) { return o.userData.ground; }); if (c) out.push(n + " cap " + h(c)); });
  return out.join(" | ");
};
window.__rockYaw = function (y) { RIGHT.traverse(function (o) { if (o.userData.isRockC) o.rotation.y = y; }); };
window.__setView = function (y, p, z) { introOn = false; yaw = yawT = y; if (p) pitch = pitchT = p; if (z) { zoom = zoomT = z; frustum(); } };
function frustum() {
  var w = window.innerWidth, h = window.innerHeight, a = w / h;
  var half = (a < 0.9 ? Math.max(8.6, 10.5 / a) : 8.6) / zoom;
  camera.left = -half * a; camera.right = half * a; camera.top = half; camera.bottom = -half;
  camera.updateProjectionMatrix();
}
function resize() { renderer.setSize(window.innerWidth, window.innerHeight, false); frustum(); if (typeof postSize === 'function') postSize(); }
window.addEventListener("resize", resize);
var ptrs = {}, pinch0 = 0, zoom0 = 1;
canvas.addEventListener("pointerdown", function (e) {
  yawV = 0; introOn = false; idleT = 0;
  canvas.setPointerCapture(e.pointerId); ptrs[e.pointerId] = [e.clientX, e.clientY];
  var k = Object.keys(ptrs); if (k.length === 2) { var a = ptrs[k[0]], b = ptrs[k[1]]; pinch0 = Math.hypot(a[0] - b[0], a[1] - b[1]); zoom0 = zoomT; }
});
canvas.addEventListener("pointermove", function (e) {
  if (!ptrs[e.pointerId]) return;
  var pv = ptrs[e.pointerId]; ptrs[e.pointerId] = [e.clientX, e.clientY];
  var k = Object.keys(ptrs);
  introOn = false; idleT = 0;
  if (k.length === 1) { yawV = -(e.clientX - pv[0]) * 0.006; yawT += yawV; pitchT = Math.min(0.95, Math.max(0.3, pitchT + (e.clientY - pv[1]) * 0.004)); }
  else if (k.length === 2 && pinch0) { var a = ptrs[k[0]], b = ptrs[k[1]]; zoomT = Math.min(2.5, Math.max(0.6, zoom0 * Math.hypot(a[0] - b[0], a[1] - b[1]) / pinch0)); }
});
function up(e) { delete ptrs[e.pointerId]; if (Object.keys(ptrs).length < 2) pinch0 = 0; }
canvas.addEventListener("pointerup", up); canvas.addEventListener("pointercancel", up);
canvas.addEventListener("wheel", function (e) { e.preventDefault(); introOn = false; idleT = 0; zoomT = Math.min(2.5, Math.max(0.6, zoomT * Math.exp(-e.deltaY * 0.0012))); }, { passive: false });


// ================= post: tilt-shift + bloom + grade =================
var postOn = true;
var rtOpt = { type: THREE.HalfFloatType, colorSpace: THREE.LinearSRGBColorSpace };
var rtScene = new THREE.WebGLRenderTarget(4, 4, Object.assign({ samples: 4 }, rtOpt));
var rtT = new THREE.WebGLRenderTarget(4, 4, rtOpt);
var rtA = new THREE.WebGLRenderTarget(4, 4, rtOpt), rtB = new THREE.WebGLRenderTarget(4, 4, rtOpt);
var postCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
var quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
var postScene = new THREE.Scene(); postScene.add(quad);
var VS = "varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }";
function SM(fs, u) { return new THREE.ShaderMaterial({ uniforms: u, vertexShader: VS, fragmentShader: fs, depthTest: false, depthWrite: false }); }
var brightM = SM("uniform sampler2D tD; varying vec2 vUv; void main(){ vec3 c = texture2D(tD, vUv).rgb; float l = dot(c, vec3(.299,.587,.114)); if (!(l < 64.) || !(l >= 0.)) { c = vec3(0.); l = 0.; } c = min(c, vec3(4.)); gl_FragColor = vec4(c * smoothstep(.86, 1.1, l), 1.); }", { tD: { value: null } });
var blurM = SM("uniform sampler2D tD; uniform vec2 dir; varying vec2 vUv; void main(){ vec3 c = texture2D(tD, vUv).rgb * .227; c += (texture2D(tD, vUv + dir * 1.38).rgb + texture2D(tD, vUv - dir * 1.38).rgb) * .316; c += (texture2D(tD, vUv + dir * 3.23).rgb + texture2D(tD, vUv - dir * 3.23).rgb) * .07; gl_FragColor = vec4(c, 1.); }", { tD: { value: null }, dir: { value: new THREE.Vector2() } });
var tiltFS = "uniform sampler2D tD; uniform sampler2D tB; uniform vec2 dir; uniform float focus, band, amt, final, bloom; varying vec2 vUv;" +
  "void main(){ float d = max(0., abs(vUv.y - focus) - band); float r = clamp(d * amt, 0., 1.) * 6.;" +
  " vec3 c = vec3(0.); float w = 0.; for (int i = -6; i <= 6; i++){ float fi = float(i); float k = exp(-fi*fi/18.); vec3 sm = texture2D(tD, vUv + dir * fi * r / 6.).rgb; float sl = sm.r + sm.g + sm.b; if (!(sl < 200.) || !(sl >= 0.)) sm = vec3(0.); c += clamp(sm, 0., 2.) * k; w += k; } c /= w;" +
  " if (final > .5) { vec3 bb = texture2D(tB, vUv).rgb; float bl = bb.r + bb.g + bb.b; if (!(bl < 200.) || !(bl >= 0.)) bb = vec3(0.); c += bb * bloom; float l = dot(c, vec3(.299,.587,.114)); c *= mix(vec3(.92,.95,1.09), vec3(1.06,1.,.91), smoothstep(.12,.75,l)); l = dot(c, vec3(.299,.587,.114)); c = mix(vec3(l), c, 1.1); vec2 q = vUv - .5; float v = dot(q, q); c = mix(c, c * vec3(.80,.83,1.02), clamp(v * 1.6, 0., .5)); c = pow(clamp(c, 0., 1.), vec3(1./2.2)); c += (fract(sin(dot(gl_FragCoord.xy, vec2(12.9898,78.233))) * 43758.5453) - .5) * .018; }" +
  " gl_FragColor = vec4(c, 1.); }";
var tiltM = SM(tiltFS, { tD: { value: null }, tB: { value: null }, dir: { value: new THREE.Vector2() }, focus: { value: 0.52 }, band: { value: 0.23 }, amt: { value: 3.2 }, final: { value: 0 }, bloom: { value: 0.45 } });
function postSize() {
  var w = renderer.domElement.width, h = renderer.domElement.height;
  rtScene.setSize(w, h); rtT.setSize(w, h); rtA.setSize(w >> 2, h >> 2); rtB.setSize(w >> 2, h >> 2);
}
function pass(mat, target) { quad.material = mat; renderer.setRenderTarget(target); renderer.render(postScene, postCam); }
function renderPost() {
  if (!postOn) { renderer.setRenderTarget(null); renderer.render(scene, camera); return; }
  var w = rtScene.width, h = rtScene.height;
  renderer.setRenderTarget(rtScene); renderer.render(scene, camera);
  brightM.uniforms.tD.value = rtScene.texture; pass(brightM, rtA);
  for (var i = 0; i < 2; i++) {
    blurM.uniforms.tD.value = rtA.texture; blurM.uniforms.dir.value.set((1 + i) / rtA.width, 0); pass(blurM, rtB);
    blurM.uniforms.tD.value = rtB.texture; blurM.uniforms.dir.value.set(0, (1 + i) / rtA.height); pass(blurM, rtA);
  }
  tiltM.uniforms.tD.value = rtScene.texture; tiltM.uniforms.dir.value.set(1.6 / w, 0); tiltM.uniforms.final.value = 0; pass(tiltM, rtT);
  tiltM.uniforms.tD.value = rtT.texture; tiltM.uniforms.tB.value = rtA.texture; tiltM.uniforms.dir.value.set(0, 1.6 / h); tiltM.uniforms.final.value = 1; pass(tiltM, null);
}


// ================= atmosphere: light motes + drifting leaves =================
var moteTex = radial([[0, "rgba(255,250,225,1)"], [0.35, "rgba(255,225,170,0.55)"], [1, "rgba(255,200,150,0)"]]);
var MN = 140, mg = new THREE.BufferGeometry(), mpos = new Float32Array(MN * 3), mseed = [];
for (var mi = 0; mi < MN; mi++) { mseed.push([rr(-14, 14), rr(-4, 9), rr(-9, 9), rr(0, 6.28), rr(0.15, 0.45)]); }
mg.setAttribute("position", new THREE.BufferAttribute(mpos, 3));
var motes = new THREE.Points(mg, new THREE.PointsMaterial({ map: moteTex, size: 0.32, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, color: 0xfff0c8, fog: false }));
motes.frustumCulled = false; scene.add(motes);
var leafG = new THREE.ShapeGeometry(new THREE.Shape([new THREE.Vector2(0, -0.14), new THREE.Vector2(0.09, 0), new THREE.Vector2(0, 0.14), new THREE.Vector2(-0.09, 0)]));
var leaves = [];
for (var li = 0; li < 26; li++) {
  var lm = new THREE.Mesh(leafG, toon([C.leafA, C.leafB, C.leafC][li % 3], { side: THREE.DoubleSide }));
  lm.userData = { x: rr(-12, 12), z: rr(-6, 7), y0: rr(-2, 10), ph: rr(0, 6.28), v: rr(0.25, 0.55) };
  scene.add(lm); leaves.push(lm);
}
function stepAtmos(t) {
  for (var i = 0; i < MN; i++) {
    var m = mseed[i];
    mpos[i * 3] = m[0] + Math.sin(t * m[4] + m[3]) * 0.8;
    mpos[i * 3 + 1] = m[1] + Math.sin(t * m[4] * 0.7 + m[3] * 2) * 0.6;
    mpos[i * 3 + 2] = m[2] + Math.cos(t * m[4] * 0.8 + m[3]) * 0.8;
  }
  mg.attributes.position.needsUpdate = true;
  leaves.forEach(function (l) {
    var u = l.userData, k = (((u.y0 - t * u.v * 0.6) % 14) + 14) % 14;
    l.position.set(((u.x + t * u.v * 1.6 + 12) % 24 + 24) % 24 - 12 + Math.sin(t * 0.7 + u.ph) * 1.2, k - 4, u.z + Math.cos(t * 0.5 + u.ph) * 0.8);
    l.rotation.set(t * 1.3 + u.ph, t * 0.9 + u.ph, Math.sin(t * 2 + u.ph) * 0.8);
  });
}

// ================= time of day =================
var stars = (function () {
  var N = 700, a = new Float32Array(N * 3);
  for (var i = 0; i < N; i++) { var u = Math.random() * 6.2832, v = Math.acos(Math.random() * 0.95), R = 150; a[i * 3] = Math.cos(u) * Math.sin(v) * R; a[i * 3 + 1] = Math.cos(v) * R - 10; a[i * 3 + 2] = Math.sin(u) * Math.sin(v) * R; }
  var g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.BufferAttribute(a, 3));
  var m = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xfff6e0, size: 1.6, sizeAttenuation: false, transparent: true, opacity: 0, depthWrite: false, fog: false }));
  scene.add(m); return m;
})();
function sstep(a, b, x) { var t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); }
// p in [0,1): 0 noon, .25 sunset, .5 midnight, .75 sunrise
function setSun(p, sky) {
  var th = p * 6.2832, e = 0.97 * Math.cos(th), elev = Math.asin(e), az = 1.85 + th;
  var day = sstep(-0.05, 0.14, e), n = sstep(0.02, -0.28, e); NIGHT = n;
  var k = 1 - Math.max(0, Math.min(1, e / 0.97)); k = Math.pow(k, 1.3); // 0 overhead -> 1 horizon
  var dirV;
  if (e >= -0.05) dirV = new THREE.Vector3(Math.cos(az) * Math.cos(elev), Math.max(0.06, Math.sin(elev)), Math.sin(az) * Math.cos(elev));
  else { var me = 0.55 + 0.35 * sstep(-0.05, -0.97, e), ma = az + Math.PI; dirV = new THREE.Vector3(Math.cos(ma) * Math.cos(me), Math.sin(me), Math.sin(ma) * Math.cos(me)); }
  dirV.normalize(); sun.position.copy(dirV).multiplyScalar(50); sun.target.position.set(0, 0, 0);
  var lowK = Math.pow(k, 1.6);
  sun.color.copy(lerpC(0xfff8ec, 0xff9e5c, lowK).lerp(new THREE.Color(0xa8bcff), n));
  sun.intensity = (2.9 - lowK * 1.4) * day + 0.75 * sstep(-0.05, -0.25, e);
  fill.position.set(-dirV.x * 50, 25, -dirV.z * 50); fill.color.copy(lerpC(0xdfe8ff, 0xb9a6ff, k)); fill.intensity = (0.45 + k * 0.3) * (1 - n * 0.6);
  hemi.color.copy(lerpC(0xfffaf0, 0xffcfb0, k).lerp(new THREE.Color(0x6f7fc0), n)); hemi.groundColor.copy(lerpC(0x9aaccc, 0xa47cb4, k).lerp(new THREE.Color(0x2c2848), n)); hemi.intensity = (1.0 - k * 0.2) * (1 - n * 0.45);
  cloudMat.emissiveIntensity = (0.04 + k * 0.2) * (1 - n); cloudMatFar.emissiveIntensity = (0.12 + k * 0.26) * (1 - n * 0.85);
  stars.material.opacity = n * 0.9;
  var lamps = sstep(0.12, -0.1, e); lampL.intensity = 2.2 * lamps; houseL.intensity = 2.6 * lamps;
  winM.emissiveIntensity = 0.5 + 1.2 * lamps;
  if (typeof motes !== "undefined") motes.material.color.set(n > 0.5 ? 0xd8f0a0 : 0xfff0c8);
  if (sky !== false) paintSky(k);
}
var SUNK = null, sunFrame = 0, curK = 0.18;
window.__sun = function (k) { SUNK = k; setSun(k); };
(function () {
  var r = document.getElementById("todR"), a = document.getElementById("todA");
  if (!r) return;
  r.addEventListener("input", function () { SUNK = +r.value; setSun(SUNK); a.classList.remove("on"); });
  a.addEventListener("click", function () { SUNK = null; a.classList.add("on"); });
  setInterval(function () { if (SUNK == null) r.value = curK; }, 500);
})();
function stepSun(t) { // full day ~4 min: noon -> dusk -> night -> dawn
  var k = SUNK != null ? SUNK : ((((t + 43) / 240) % 1) + 1) % 1;
  curK = k; setSun(k, (sunFrame++ % 6) === 0);
}
var sunIn = document.getElementById("sun");
sunIn.addEventListener("input", function () { setSun(+sunIn.value); });
var tsEl = document.getElementById("tilt"); if (tsEl) tsEl.addEventListener("change", function (e) { postOn = e.target.checked; });
var olEl = document.getElementById("outline"); if (olEl) olEl.addEventListener("change", function (e) { outlines.forEach(function (o) { o.visible = e.target.checked; }); });
setSun(+sunIn.value); resize();

// ================= theme pass: near / far, then / now =================
(function () {
  // far island: smaller, higher, deeper — distance reads as time
  RIGHT.scale.setScalar(0.82); RIGHT.position.set(7.8, 1.3, -8.4); LEFT.scale.setScalar(1.0); bench.scale.multiplyScalar(0.75); // same world scale for figures; islands differ by radius
  // "then": gently aged, warmer & faded palette on the far island
  var sepia = new THREE.Color(0xe2c29c);
  RIGHT.traverse(function (o) {
    if (!o.isMesh || !o.material || o.material === outlineMat || !o.material.color) return;
    o.material = o.material.clone(); o.material.color.lerp(sepia, 0.2);
  });
  // ivy on the cottage
  RIGHT.updateMatrixWorld(true);
  var hb = new THREE.Box3().setFromObject(house), ivyM = toon(0x8a9a48), ivyM2 = toon(0xc08a3a);
  for (var i = 0; i < 44; i++) {
    var w = new THREE.Vector3(rr(hb.min.x, hb.min.x + (hb.max.x - hb.min.x) * 0.45), rr(hb.min.y, hb.min.y + (hb.max.y - hb.min.y) * (0.25 + rnd() * 0.45)), hb.max.z - 0.02);
    var b = new THREE.Mesh(softBall(rr(0.05, 0.09), 0.1), i % 3 ? ivyM : ivyM2);
    house.worldToLocal(w); b.position.copy(w); b.scale.z = 0.5; house.add(b);
  }
  // characters a little bigger, turned towards each other across the gap
  girl.scale.multiplyScalar(1.1); gma.scale.multiplyScalar(1.05);
  LEFT.parent.updateMatrixWorld(true);
  var gw = new THREE.Vector3(), mw = new THREE.Vector3();
  girl.getWorldPosition(gw); gma.getWorldPosition(mw);
  var gl = mw.clone(); gl.y = gw.y; girl.lookAt(gl); girl.rotateY(-1.0);
  var ml = gw.clone(); ml.y = mw.y; gma.lookAt(ml); gma.rotateY(-0.5);
  // the dotted time-arc now spans girl -> grandma
  var a0 = gw.clone().add(new THREE.Vector3(0, 2.4, 0)), a2 = mw.clone().add(new THREE.Vector3(0, 1.2, 0));
  var arc2 = new THREE.QuadraticBezierCurve3(a0, a0.clone().lerp(a2, 0.5).add(new THREE.Vector3(0, 3.2, 0)), a2);
  arcDots.forEach(function (d, i) { d.position.copy(arc2.getPoint(i / (arcDots.length - 1))); });
  // grass detail: soft patches + leaf piles
  var patchA = toon(0xdcb431), patchB = toon(0xf7d861), pileM = [toon(C.leafA), toon(C.leafB), toon(C.leafC)];
  [[LEFT, 4.6], [RIGHT, 4.3]].forEach(function (pr) {
    var P = pr[0], R = pr[1];
    for (var j = 0; j < 12; j++) {
      var a = rr(0, 6.28), d = rr(0.3, 0.78) * R;
      continue; var pg;
      pg.rotation.x = -Math.PI / 2; pg.scale.x = rr(1, 1.8); pg.rotation.z = rr(0, 3); pg.receiveShadow = true;
      put(pg, Math.cos(a) * d, TOP + 0.006 + j * 0.0008, Math.sin(a) * d, P);
    }
    for (j = 0; j < 4; j++) {
      var a3 = rr(0, 6.28), d3 = rr(0.4, 0.8) * R, cx = Math.cos(a3) * d3, cz = Math.sin(a3) * d3;
      var pl = new THREE.Group(); put(pl, cx, TOP, cz, P);
      for (var k = 0; k < 6; k++) {
        var lf = new THREE.Mesh(softBall(rr(0.08, 0.14), 0.1), pileM[k % 3]); lf.scale.y = 0.45; lf.castShadow = true;
        put(lf, rr(-0.25, 0.25), 0.04, rr(-0.25, 0.25), pl);
      }
      PROPS.push({ k: "leaves", o: pl, p: P, h: 1, wd: rr(0.55, 0.8), sib: true, x: cx, z: cz });
    }
  });
  // distant islands fading into the haze
  [[-24, 7, -42, 0.42], [21, 10, -58, 0.36], [-6, 13, -74, 0.3], [32, 4, -36, 0.4], [-36, 2, -62, 0.32]].forEach(function (d) {
    var fi = island({ r: 3.2, depth: 0.9, flat: 1 });
    fi.scale.setScalar(d[3]); fi.position.set(d[0], d[1], d[2]); scene.add(fi);
    var tr = tree(fi, 0.4, -0.3, 1.6); fi.userData.y0 = d[1]; fi.userData.ph = rr(0, 6); farIsles.push(fi);
  });
})();

// ================= v11: Tripo hero assets + wind =================
var WIND = { t: 0, s: 1, dir: new THREE.Vector2(0.82, 0.57) };
var windU = { uT: { value: 0 }, uS: { value: 1 } };
// ---- ground snap: drop props onto the real (bevelled) grass surface ----

// ================= pond + stream + waterfall (stylized toon water) =================
var WATER = (function () {
  var U = { uT: { value: 0 }, uL: { value: 1 }, uN: { value: 0 } };
  var NOISE = "float h21(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}" +
    "float vn(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(h21(i),h21(i+vec2(1,0)),f.x),mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),f.x),f.y);}";
  var LIT = "col*=uL; col=mix(col,col*vec3(.45,.55,.95)+vec3(.02,.04,.1),uN*.75);";
  var pondMat = new THREE.ShaderMaterial({ uniforms: U, vertexShader:
    "attribute float aE; attribute float aA; varying float vE; varying float vA; varying vec2 vP; void main(){vE=aE;vA=aA;vP=position.xz;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}",
    fragmentShader: "uniform float uT,uL,uN; varying float vE; varying float vA; varying vec2 vP;" + NOISE +
    "void main(){float e=vE; vec3 deep=vec3(.2,.5,.58), mid=vec3(.4,.74,.74), sh=vec3(.72,.89,.8), foam=vec3(1.,.98,.92);" +
    "vec3 col=mix(deep,mid,smoothstep(.15,.7,e)); col=mix(col,sh,smoothstep(.66,.86,e));" +
    "float r=sin(e*20.-uT*2.4+vn(vP*3.)*3.); col=mix(col,foam,step(.95,r)*(1.-e)*.6);" +
    "float n=vn(vec2((vP.x-uT*.45)*2.6,vP.y*7.)); col=mix(col,foam,smoothstep(.66,.7,n)*.8*(1.-smoothstep(.75,.9,e)));" +
    "float n3=vn(vec2((vP.x-uT*.3)*5.+7.,vP.y*11.)); col=mix(col,foam,smoothstep(.72,.75,n3)*.55*(1.-smoothstep(.75,.9,e)));" +
    "float f=smoothstep(.87,.93,e+.07*(vn(vec2(vA*5.+uT*.6,uT*.4))-.5)); col=mix(col,foam,f);" + LIT +
    "gl_FragColor=vec4(col,1.);}" });
  var flowMat = new THREE.ShaderMaterial({ uniforms: U, transparent: true, side: THREE.DoubleSide, vertexShader:
    "attribute float aS; attribute float aF; varying vec2 vU; varying float vS; varying float vF; void main(){vU=uv;vS=aS;vF=aF;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}",
    fragmentShader: "uniform float uT,uL,uN; varying vec2 vU; varying float vS; varying float vF;" + NOISE +
    "void main(){float u=vU.x, v=vU.y; vec3 col=mix(vec3(.38,.72,.73),vec3(.3,.66,.72),vS); vec3 foam=vec3(1.,.98,.93);" +
    "float sp=mix(1.1,3.6,vS);" +
    "float n=vn(vec2(u*mix(5.,10.,vS),v*mix(1.6,.5,vS)-uT*sp)); float n2=vn(vec2(u*12.+3.,v*mix(3.,.9,vS)-uT*sp*1.35));" +
    "col=mix(col,vec3(.22,.56,.62),smoothstep(.3,.18,n2)*(1.-vS)*.55);" +
    "float dash=smoothstep(.56,.6,n)+smoothstep(.66,.69,n2)*.8;" +
    "float chev=step(.82,fract(v*mix(2.2,1.4,vS)-uT*sp*.9+abs(u-.5)*mix(1.4,0.,vS)))*smoothstep(.2,.55,vn(vec2(u*4.,v*.8-uT*sp*.5)));" +
    "col=mix(col,foam,clamp(dash+chev*.7,0.,1.)*mix(.85,.8,vS));" +
    "float ed=abs(u-.5)*2.; col=mix(col,foam,smoothstep(.72,.9,ed+.18*(vn(vec2(v*5.-uT*2.5,u*3.))-.5)));" +
    "float a=1.-smoothstep(.62,1.,vF); a*=mix(1.,1.-smoothstep(.82,1.,ed),vS); a*=.94;" + LIT +
    "gl_FragColor=vec4(col,a);}" });
  function pond(P, cx, cz, rx, rz) {
    var NR = 9, NS = 56, pos = [], aE = [], aA = [], idx = [], ph = rr(0, 6);
    pos.push(cx, TOP0 + 0.035, cz); aE.push(0); aA.push(0);
    for (var r = 1; r <= NR; r++) for (var i = 0; i < NS; i++) {
      var a = i / NS * Math.PI * 2, w = 1 + 0.09 * Math.sin(a * 3 + ph) + 0.05 * Math.sin(a * 5 - ph), e = r / NR;
      pos.push(cx + Math.cos(a) * rx * w * e, TOP0 + 0.035, cz + Math.sin(a) * rz * w * e); aE.push(e); aA.push(i / NS);
    }
    for (i = 0; i < NS; i++) idx.push(0, 1 + (i + 1) % NS, 1 + i);
    for (r = 1; r < NR; r++) for (i = 0; i < NS; i++) { var a0 = 1 + (r - 1) * NS + i, a1 = 1 + (r - 1) * NS + (i + 1) % NS, b0 = a0 + NS, b1 = a1 + NS; idx.push(a0, a1, b0, a1, b1, b0); }
    var g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute("aE", new THREE.Float32BufferAttribute(aE, 1)); g.setAttribute("aA", new THREE.Float32BufferAttribute(aA, 1)); g.setIndex(idx); g.computeVertexNormals();
    var m = new THREE.Mesh(g, pondMat); m.receiveShadow = false; P.add(m);
    // soft earthen lip around the pond
    var lp = []; for (i = 0; i < 64; i++) { var aa = i / 64 * Math.PI * 2, ww = 1 + 0.09 * Math.sin(aa * 3 + ph) + 0.05 * Math.sin(aa * 5 - ph); lp.push(new THREE.Vector3(cx + Math.cos(aa) * rx * ww * 1.06, TOP0 + 0.02, cz + Math.sin(aa) * rz * ww * 1.06)); }
    var lipG = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(lp, true), 96, 0.075, 6, true); lipG.scale(1, 1, 1);
    var lip = M(lipG, 0xa98a4a, { t: 0.02 }); lip.scale.y = 0.6; lip.position.y = TOP0 * 0.4; P.add(lip);
    return { ph: ph, edge: function (a) { var w = 1 + 0.09 * Math.sin(a * 3 + ph) + 0.05 * Math.sin(a * 5 - ph); return new THREE.Vector3(cx + Math.cos(a) * rx * w, 0, cz + Math.sin(a) * rz * w); } };
  }
  function ribbon(P, pts, widths, fallFrom) { // pts: centreline Vector3s; widths per point; fallFrom: index where it starts falling
    var pos = [], uv = [], aS = [], aF = [], idx = [], L = 0, n = pts.length, hd = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    var fallLen = 0; for (var i = fallFrom + 1; i < n; i++) fallLen += pts[i].distanceTo(pts[i - 1]);
    var acc = 0;
    for (i = 0; i < n; i++) {
      if (i > 0) L += pts[i].distanceTo(pts[i - 1]);
      var a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)]; hd.set(b.x - a.x, 0, b.z - a.z);
      if (hd.lengthSq() < 1e-6) hd.copy(ribbon._hd); else { hd.normalize(); ribbon._hd = hd.clone(); }
      var side = new THREE.Vector3().crossVectors(up, hd).normalize().multiplyScalar(widths[i] / 2);
      pos.push(pts[i].x - side.x, pts[i].y, pts[i].z - side.z, pts[i].x + side.x, pts[i].y, pts[i].z + side.z);
      uv.push(0, L, 1, L);
      var s = i <= fallFrom ? 0 : Math.min(1, (i - fallFrom) / 3); aS.push(s, s);
      if (i > fallFrom) acc += pts[i].distanceTo(pts[i - 1]); var f = fallLen ? acc / fallLen : 0; aF.push(f, f);
      if (i < n - 1) { var k = i * 2; idx.push(k, k + 2, k + 1, k + 1, k + 2, k + 3); }
    }
    var g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    g.setAttribute("aS", new THREE.Float32BufferAttribute(aS, 1)); g.setAttribute("aF", new THREE.Float32BufferAttribute(aF, 1)); g.setIndex(idx);
    var m = new THREE.Mesh(g, flowMat); m.renderOrder = 2; P.add(m); return m;
  }
  ribbon._hd = new THREE.Vector3(1, 0, 0);
  // ---- build on LEFT: pond on the lower tier, a shallow stream east to the rim, then a fall under the island
  var P = LEFT, cx = 1.95, cz = -0.55, pd = pond(P, cx, cz, 0.95, 0.7);
  var ol = P.userData.outline, best = null, aim = 0.05;
  ol.forEach(function (p) { var a = Math.atan2(p.y, p.x); if (best == null || Math.abs(a - aim) < Math.abs(Math.atan2(best.y, best.x) - aim)) best = p; });
  var rim = new THREE.Vector3(best.x, 0, -best.y), dirO = rim.clone().normalize();
  var start = pd.edge(-0.12); start.x -= 0.12;
  var Y = TOP0 + 0.032, mid1 = new THREE.Vector3(start.x * 0.55 + rim.x * 0.45, Y, start.z * 0.6 + rim.z * 0.4 - 0.35), mid2 = new THREE.Vector3(start.x * 0.25 + rim.x * 0.75, Y, start.z * 0.2 + rim.z * 0.8 + 0.18);
  var flat = new THREE.CatmullRomCurve3([new THREE.Vector3(start.x, Y, start.z), mid1, mid2, new THREE.Vector3(rim.x - dirO.x * 0.05, Y, rim.z - dirO.z * 0.05)]).getPoints(26);
  var pts = flat.slice(), widths = flat.map(function (p, i) { return 0.5 + 0.08 * Math.sin(i * 0.7); });
  var fallFrom = pts.length - 1, lipR = [[0.08, -0.02], [0.17, -0.07], [0.24, -0.15], [0.3, -0.26]];
  lipR.forEach(function (d) { pts.push(new THREE.Vector3(rim.x + dirO.x * d[0], Y + d[1], rim.z + dirO.z * d[0])); widths.push(0.62); });
  var FH = 4.3, top0 = pts[pts.length - 1];
  for (var i = 1; i <= 26; i++) { var t = i / 26, dy = t * FH, out = 0.06 + 0.42 * Math.sqrt(t); pts.push(new THREE.Vector3(top0.x + dirO.x * out, top0.y - dy, top0.z + dirO.z * out)); widths.push(0.68 + 0.55 * t); }
  ribbon(P, pts, widths, fallFrom + 2);
  // bank stones along the stream and around the pond (become Tripo stones)
  for (i = 0; i < 9; i++) { var a = i / 9 * Math.PI * 2 + 0.4; if (Math.abs(((a + Math.PI) % (2 * Math.PI)) - Math.PI) < 0.45) continue; var e = pd.edge(a), o2 = e.clone().sub(new THREE.Vector3(cx, 0, cz)).normalize().multiplyScalar(0.16); slabStone(P, e.x + o2.x, e.z + o2.z, rr(0.32, 0.5)); }
  [6, 13, 20].forEach(function (k, j) { var p = flat[k], q = flat[k + 1], d = new THREE.Vector3(q.x - p.x, 0, q.z - p.z).normalize(), sd = j % 2 ? 1 : -1; slabStone(P, p.x - d.z * 0.34 * sd, p.z + d.x * 0.34 * sd, rr(0.3, 0.42)); });
  // mist + spray where the fall fades out, foam puff at the lip
  var mistM = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5, depthWrite: false }), mists = [];
  var bot = pts[pts.length - 6];
  for (i = 0; i < 7; i++) { var ms = new THREE.Mesh(new THREE.IcosahedronGeometry(rr(0.22, 0.42), 2), mistM.clone()); ms.position.set(bot.x + rr(-0.4, 0.4), bot.y + rr(-0.3, 0.4), bot.z + rr(-0.4, 0.4)); ms.userData = { y0: ms.position.y, ph: rr(0, 6), s: ms.scale.x }; P.add(ms); mists.push(ms); }
  for (i = 0; i < 3; i++) { var fp = new THREE.Mesh(new THREE.IcosahedronGeometry(rr(0.08, 0.12), 1), mistM.clone()); var lp2 = pts[fallFrom + 2]; fp.position.set(lp2.x + rr(-0.2, 0.2), lp2.y + 0.02, lp2.z + rr(-0.2, 0.2)); fp.userData = { y0: fp.position.y, ph: rr(0, 6), s: 1 }; P.add(fp); mists.push(fp); }
  // falling droplets
  var ND = 70, dg = new THREE.BufferGeometry(), dp = new Float32Array(ND * 3), dd = [];
  for (i = 0; i < ND; i++) dd.push({ t: rnd(), off: rr(-0.5, 0.5), sp: rr(0.25, 0.45), o: rr(0.05, 0.3) });
  dg.setAttribute("position", new THREE.BufferAttribute(dp, 3));
  var drops = new THREE.Points(dg, new THREE.PointsMaterial({ color: 0xf4fffc, size: 3.2, sizeAttenuation: false, transparent: true, opacity: 0.85, depthWrite: false })); P.add(drops);
  var sideV = new THREE.Vector3(-dirO.z, 0, dirO.x);
  return {
    avoid: [[cx, cz, 1.25]].concat(flat.filter(function (p, i) { return i % 3 === 0; }).map(function (p) { return [p.x, p.z, 0.45]; })),
    tick: function (T) {
      U.uT.value = T; U.uN.value = typeof NIGHT === "number" ? NIGHT : 0; U.uL.value = 0.72 + 0.3 * Math.min(1.2, hemi.intensity) + 0.06 * Math.min(3, sun.intensity);
      mists.forEach(function (m) { var u = m.userData, k = 0.5 + 0.5 * Math.sin(T * 1.3 + u.ph); m.scale.setScalar(u.s * (0.85 + 0.35 * k)); m.position.y = u.y0 + 0.15 * Math.sin(T * 0.7 + u.ph); m.material.opacity = (0.28 + 0.3 * k) * (1 - 0.6 * (U.uN.value)); });
      for (var i = 0; i < ND; i++) { var d = dd[i]; d.t = (d.t + d.sp * 0.016) % 1; var y = top0.y - d.t * FH * 0.95, out = 0.06 + 0.42 * Math.sqrt(d.t) + d.o; dp[i * 3] = top0.x + dirO.x * out + sideV.x * d.off; dp[i * 3 + 1] = y; dp[i * 3 + 2] = top0.z + dirO.z * out + sideV.z * d.off; }
      dg.attributes.position.needsUpdate = true;
    }
  };
})();
var groundSnap = (function () {
  var rc = new THREE.Raycaster(), caps = [];
  scene.traverse(function (o) { if (o.userData && o.userData.ground) caps.push(o); });
  return function (o) {
    if (!o || !o.parent) return;
    scene.updateMatrixWorld(true);
    var w = o.getWorldPosition(new THREE.Vector3());
    rc.set(new THREE.Vector3(w.x, w.y + 6, w.z), new THREE.Vector3(0, -1, 0));
    var hit = rc.intersectObjects(caps, false)[0];
    if (!hit) return;
    var lp = o.parent.worldToLocal(hit.point.clone());
    o.position.y = lp.y - 0.02;
  };
})();
function groundY(P, x, z) { var o = new THREE.Object3D(); o.position.set(x, TOP, z); P.add(o); groundSnap(o); var y = o.position.y + 0.02; P.remove(o); return y; }
PROPS.forEach(function (r) { // keep water clear of loose props
  if (!r.o || r.p !== LEFT || r.k === "stone" || r.k === "tree" || r.k === "tree2" || r.k === "ytree") return;
  var x = r.sib ? r.x : r.o.position.x, z = r.sib ? r.z : r.o.position.z;
  WATER.avoid.forEach(function (v) { if ((x - v[0]) * (x - v[0]) + (z - v[1]) * (z - v[1]) < v[2] * v[2]) { r.skip = true; r.o.visible = false; } });
});
PROPS.forEach(function (r) { groundSnap(r.o); });
[sign, lamp].forEach(groundSnap);
var heroes = {};
(function () {
  // ---------- wind grass (instanced blades, vertex-shader sway) ----------
  var bladeG = new THREE.BufferGeometry();
  var bw = 0.075, bh = 1;
  bladeG.setAttribute("position", new THREE.Float32BufferAttribute([-bw, 0, 0, bw, 0, 0, -bw * 0.6, bh * 0.5, 0.01, bw * 0.6, bh * 0.5, 0.01, 0, bh, 0.03], 3));
  bladeG.setAttribute("uv", new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 0.5, 1, 0.5, 0.5, 1], 2));
  bladeG.setIndex([0, 1, 2, 1, 3, 2, 2, 3, 4]);
  bladeG.computeVertexNormals();
  function windMat(col) {
    var m = new THREE.MeshToonMaterial({ color: 0xffffff, gradientMap: gradientMap, side: THREE.DoubleSide, vertexColors: true });
    m.onBeforeCompile = function (sh) {
      sh.uniforms.uT = windU.uT; sh.uniforms.uS = windU.uS;
      sh.vertexShader = "uniform float uT; uniform float uS;\n" + sh.vertexShader.replace("#include <begin_vertex>", [
        "#include <begin_vertex>",
        "vec4 wp = modelMatrix * instanceMatrix * vec4(0.0,0.0,0.0,1.0);",
        "float hgt = position.y;",
        "float wave = sin(dot(wp.xz, vec2(0.82,0.57)) * 0.55 - uT * 1.7) * 0.5 + 0.5;",
        "float gust = sin(wp.x * 0.13 + uT * 0.45) * 0.5 + 0.5;",
        "float bend = (0.18 + 0.55 * wave * wave + 0.25 * gust) * uS * hgt * hgt;",
        "bend += sin(uT * 3.1 + wp.x * 2.3 + wp.z * 1.7) * 0.06 * hgt;",
        "transformed.x += bend * 0.82 * 0.9; transformed.z += bend * 0.57 * 0.9; transformed.y -= bend * bend * 0.25;"
      ].join("\n"));
    };
    return m;
  }
  function meadow(P, R, n, cols, avoid) {
    var im = new THREE.InstancedMesh(bladeG, windMat(), n), d = new THREE.Object3D(), c = new THREE.Color(), k = 0;
    var ol = P.userData.outline, N = ol.length;
    function coastR(a) { // outline radius along angle a (shape y == -z)
      var t = ((a / 6.283185) % 1 + 1) % 1 * N, i0 = Math.floor(t) % N, i1 = (i0 + 1) % N, f = t - Math.floor(t);
      return ol[i0].length() * (1 - f) + ol[i1].length() * f;
    }
    var tufts = Math.round(n / 4), tries = 0;
    while (k < n - 6 && tries++ < tufts * 6) { // sparse chunky low-poly tufts, 3-5 blades each
      var a = rr(0, 6.283), rad = Math.sqrt(rnd()) * coastR(a) * 0.88;
      var x = Math.cos(a) * rad, z = -Math.sin(a) * rad;
      var bad = false; for (var j = 0; j < avoid.length; j++) { var v = avoid[j]; if ((x - v[0]) * (x - v[0]) + (z - v[1]) * (z - v[1]) < v[2] * v[2]) { bad = true; break; } }
      if (bad) continue;
      var nb = 3 + ((rnd() * 3) | 0), base = rr(0, 6.28), th = rr(0.11, 0.2), tc = cols[(rnd() * cols.length) | 0];
      (P.userData.tufts = P.userData.tufts || []).push([x, z, base, th]);
      if (window.__GLB && window.__GLB.grass) { k++; continue; }
      for (var bI = 0; bI < nb; bI++) {
        var ba = base + bI / nb * 6.28 + rr(-0.3, 0.3);
        d.position.set(x + Math.cos(ba) * 0.03, TOP, z + Math.sin(ba) * 0.03);
        d.rotation.set(0, -ba + Math.PI / 2, 0); d.rotateX(rr(0.25, 0.5));
        d.scale.set(rr(0.9, 1.2), th * rr(0.75, 1.15), 1);
        d.updateMatrix(); im.setMatrixAt(k, d.matrix);
        c.set(tc); im.setColorAt(k, c); k++;
      }
    }
    if (window.__GLB && window.__GLB.grass) k = 0;
    im.count = k; im.castShadow = false; im.receiveShadow = true; im.frustumCulled = false;
    if (im.instanceColor) im.instanceColor.needsUpdate = true;
    // vertex colour: darker roots -> bright tips
    var vc = []; [0.8, 0.8, 0.93, 0.93, 1.08].forEach(function (v) { vc.push(v, v, v); });
    bladeG.setAttribute("color", new THREE.Float32BufferAttribute(vc, 3));
    P.add(im); return im;
  }
  meadow(LEFT, 4.6, 200, [0xc29a2e, 0xb8a032, 0xe8c858, 0xa9a038], [[0.6, 0.5, 0.55], [-3.6, -0.6, 0.0]].concat(WATER.avoid));
  meadow(RIGHT, 4.3, 130, [0xc29a2e, 0xb8a032, 0xe8c858, 0xa9a038], [[0.9, -1.1, 1.9], [-1.6, 1.2, 0.95]]);

  // ---------- Tripo GLB heroes ----------
  if (!window.__GLB || !THREE.GLTFLoader) return;
  function b64buf(b) { var s = atob(b), u = new Uint8Array(s.length); for (var i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return u.buffer; }
  function deq(G) {
    ["position", "uv"].forEach(function (k) {
      var a = G.attributes[k]; if (!a) return; var n = a.itemSize, f = new Float32Array(a.count * n);
      for (var i = 0; i < a.count; i++) { f[i * n] = a.getX(i); f[i * n + 1] = a.getY(i); if (n > 2) f[i * n + 2] = a.getZ(i); }
      G.setAttribute(k, new THREE.BufferAttribute(f, n));
    });
    G.computeVertexNormals();
  }
  function prep(root, height, tint, lineT, name) {
    var tex = null;
    if (window.__TEX && window.__TEX[name]) { var im = new Image(); tex = new THREE.Texture(im); im.onload = function () { tex.needsUpdate = true; }; im.src = window.__TEX[name]; tex.flipY = false; tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4; }
    var meshes = [];
    root.updateMatrixWorld(true);
    root.traverse(function (m) { if (m.isMesh) meshes.push(m); });
    var g = new THREE.Group(), inner = new THREE.Group();
    meshes.forEach(function (m) {
      deq(m.geometry); m.geometry.applyMatrix4(m.matrixWorld);
      var map = tex || m.material.map; if (map && !tex) { map.colorSpace = THREE.SRGBColorSpace; map.anisotropy = 4; }
      var mat = new THREE.MeshToonMaterial({ map: map, gradientMap: gradientMap, color: tint || 0xffffff });
      var mm = new THREE.Mesh(m.geometry, mat); mm.castShadow = true; mm.receiveShadow = true; inner.add(mm);
    });
    var b = new THREE.Box3().setFromObject(inner), sz = b.getSize(new THREE.Vector3()), s = height / sz.y;
    inner.children.forEach(function (mm) {
      mm.geometry.translate(-(b.min.x + b.max.x) / 2, -b.min.y, -(b.min.z + b.max.z) / 2);
      mm.geometry.scale(s, s, s); mm.geometry.computeBoundingBox(); mm.geometry.computeBoundingSphere();
      var h = new THREE.Mesh(hull(mm.geometry, lineT), outlineMat); h.castShadow = false; mm.add(h); outlines.push(h);
    });
    g.add(inner); g.userData.inner = inner; return g;
  }
  var L = new THREE.GLTFLoader(); if (THREE.MeshoptDecoder) L.setMeshoptDecoder(THREE.MeshoptDecoder);
  function load(name, cb) { L.parse(b64buf(window.__GLB[name]), "", function (gl) { cb(gl.scene); }, function (e) { console.warn("glb", name, e); }); }
  var sepiaTint = new THREE.Color(0xffffff).lerp(new THREE.Color(0xe2c29c), 0.28);

  // girl: replaces the hand-built one, same spot & facing
  load("girl", function (sc) {
    var G = prep(sc, 1.9, null, 0.012, "girl"); G.scale.setScalar(0.72);
    G.position.copy(girl.position); G.position.y = TOP; LEFT.add(G); girl.visible = false; heroes.girl = G;
    scene.updateMatrixWorld(true);
    var gw = G.getWorldPosition(new THREE.Vector3()), mw = bench.getWorldPosition(new THREE.Vector3());
    var hg = Math.atan2(mw.x - gw.x, mw.z - gw.z), hc = yaw; // toward grandma / toward camera
    G.rotation.y = hg + (Math.atan2(Math.sin(hc - hg), Math.cos(hc - hg))) * 0.5 - Math.PI / 2; // model faces +X
    // kite string starts at the top of her hand-held stick (highest vertex)
    var gp = G.userData.inner.children[0].geometry.attributes.position, ty = -1e9, ti2 = 0;
    for (var q = 0; q < gp.count; q++) if (gp.getY(q) > ty) { ty = gp.getY(q); ti2 = q; }
    var ha = new THREE.Object3D(); ha.position.set(gp.getX(ti2), ty, gp.getZ(ti2)); G.userData.inner.add(ha); hand = ha;
  });
  // grandma: seated figure on the bench
  load("gma", function (sc) {
    var G = prep(sc, 1.45, sepiaTint, 0.011, "gma");
    G.position.set(0.1, 0.03, 0.16); bench.add(G); gma.visible = false; heroes.gma = G;
    scene.updateMatrixWorld(true);
    var bw2 = bench.getWorldPosition(new THREE.Vector3()), gw2 = girl.getWorldPosition(new THREE.Vector3());
    var hgw = Math.atan2(gw2.x - bw2.x, gw2.z - bw2.z), hc2 = yaw, hh = hgw + Math.atan2(Math.sin(hc2 - hgw), Math.cos(hc2 - hgw)) * 0.5;
    bench.rotation.y = hh; G.rotation.y = -0.8; // model faces ~+X+Z
  });
  // cottage: replaces the box house; ivy & old windows go with it
  load("house", function (sc) {
    var G = prep(sc, 3.9, sepiaTint, 0.016, "house");
    G.position.copy(house.position); G.rotation.y = house.rotation.y + 0.1;
    RIGHT.add(G); house.visible = false; heroes.house = G;
    // chimney: highest vertex cluster -> smoke anchor
    var pos = G.userData.inner.children[0].geometry.attributes.position, top = -1e9, ax = 0, az = 0, cnt = 0, i;
    for (i = 0; i < pos.count; i++) top = Math.max(top, pos.getY(i));
    for (i = 0; i < pos.count; i++) if (pos.getY(i) > top - 0.05) { ax += pos.getX(i); az += pos.getZ(i); cnt++; }
    var anchor = new THREE.Object3D(); anchor.position.set(ax / cnt, top + 0.05, az / cnt); G.add(anchor);
    chimTop = anchor;
    smoke.forEach(function (s) { s.scale.multiplyScalar(0.7); });
    // warm window glow spill on the ground in front
    var glow = new THREE.Mesh(new THREE.CircleGeometry(1.4, 32), new THREE.MeshBasicMaterial({ map: radial([[0, "rgba(255,190,110,0.55)"], [1, "rgba(255,170,90,0)"]]), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    glow.rotation.x = -Math.PI / 2; glow.position.set(0, 0.02, 1.6); G.add(glow);
  });
  // ---- Tripo props: replace hand-built props in place (same groups, so wind sway keeps working)
  var isR = function (o) { while (o) { if (o === RIGHT) return true; o = o.parent; } return false; };
  function hideKids(o) { o.children.forEach(function (c) { c.visible = false; }); }
  function fit(name, cb) {
    if (!window.__GLB[name]) return;
    load(name, function (sc) {
      var LT = { rockA: 0.02, rockC: 0.02, grass: 0.012, clod: 0.014, stone: 0.012, leaves: 0.01, rockB: 0.02, sign: 0.012, kite: 0.012, ytree: 0.006, ctree: 0.004, flowers: 0.02, gull: 0.03, tree: 0.006, tree2: 0.007, bush: 0.012, rock: 0.02, sun: 0.01, fence: 0.014, cat: 0.03, mail: 0.012, lamp: 0.01, bench: 0.014 };
      var tmpl = { L: prep(sc, 1, null, LT[name] || 0.015, name) };
      cb(function (h, right) { // returns a clone scaled to height h
        var c = tmpl.L.clone(true); c.scale.setScalar(h);
        if (right) c.traverse(function (m) { if (m.isMesh && m.material !== outlineMat) { m.material = m.material.clone(); m.material.color.copy(sepiaTint); } });
        return c;
      }, tmpl.L);
    });
  }
  var hasY = !!window.__GLB.ytree;
  ["tree", hasY ? "ytree" : "tree2", "bush", "rock", "sun", "flowers", "stone", "leaves"].forEach(function (k) {
    fit(k, function (make) {
      PROPS.forEach(function (r) {
        var rk = (hasY && r.k === "tree2") ? "ytree" : r.k;
        if (rk !== k || r.skip) return;
        if (k === "flowers" && r.n % 3) { r.o.visible = false; return; }
        if (k === "sun" && !r.first) { r.o.visible = false; return; }
        var c = make(r.h, isR(r.p)); c.rotation.y = rr(0, 6);
        if (k === "ytree") c.traverse(function (m) { if (m.isMesh && m.material !== outlineMat) { m.material = m.material.clone(); m.material.color.multiply(new THREE.Color(1.0, 0.86, 0.5)); } });
        if (r.wd) { var bb = new THREE.Box3().setFromObject(c), bs = bb.getSize(new THREE.Vector3()); c.scale.multiplyScalar(r.wd / Math.max(bs.x, bs.z)); }
        if (r.sib) { r.o.visible = false; c.position.set(r.x, TOP - 0.02, r.z); r.p.add(c); groundSnap(c); }
        else { hideKids(r.o); r.o.add(c); }
      });
    });
  });
  fit("grass", function (make, L) { // Tripo tuft, instanced across both islands
    var src = L.userData.inner.children[0], hullM = src.children[0];
    [LEFT, RIGHT].forEach(function (P) {
      var T = (P.userData.tufts || []).filter(function (t, i) { return i % 3 !== 2; }), n = T.length; if (!n) return;
      var mat = src.material.clone(); mat.color.setHex(0xf0dc9a); if (P === RIGHT) mat.color.multiply(sepiaTint);
      var im = new THREE.InstancedMesh(src.geometry, mat, n), ho = hullM ? new THREE.InstancedMesh(hullM.geometry, outlineMat, n) : null, d = new THREE.Object3D();
      T.forEach(function (t, i) {
        var hh = 0.1 + t[3] * 0.7; d.position.set(t[0], groundY(P, t[0], t[1]) - 0.02, t[1]); d.rotation.set(0, t[2], 0); d.scale.set(hh * rr(0.9, 1.25), hh, hh * rr(0.9, 1.25)); d.updateMatrix();
        im.setMatrixAt(i, d.matrix); if (ho) ho.setMatrixAt(i, d.matrix);
      });
      im.castShadow = true; im.receiveShadow = true; P.add(im); if (ho) { P.add(ho); outlines.push(ho); }
    });
  });
  fit("clod", function (make) { // Tripo crumbled earth chunks hugging the rim
    [[LEFT, 6, 0.3], [RIGHT, 4, 1.1]].forEach(function (cfg) {
      var P = cfg[0], ol = P.userData.outline, N = ol.length;
      for (var i = 0; i < cfg[1]; i++) {
        var idx = Math.floor(((i + rr(0.15, 0.85)) / cfg[1] + cfg[2] / 6.283) * N) % N, p = ol[idx], len = Math.hypot(p.x, p.y), ux = p.x / len, uz = -p.y / len;
        var h = rr(0.32, 0.55), pa = Math.atan2(p.y, p.x); if (P === LEFT && Math.abs(pa - 0.05) < 0.45) continue; var c = make(h, P === RIGHT), out = rr(0.02, 0.14);
        c.position.set(p.x + ux * out, TOP - h * rr(0.95, 1.25), -p.y + uz * out);
        c.rotation.set(rr(-0.35, 0.35), rr(0, 6.28), rr(-0.35, 0.35));
        c.scale.multiply(new THREE.Vector3(rr(1, 1.5), 1, rr(1, 1.4)));
        c.traverse(function (m) { if (m.isMesh && m.material !== outlineMat) { m.material = m.material.clone(); m.material.color.multiply(new THREE.Color(0.95, 0.85, 0.66)); } });
        P.add(c);
        if (rnd() < 0.4) { var c2 = make(h * 0.5, P === RIGHT); c2.position.set(c.position.x + ux * h * 0.5 + rr(-0.2, 0.2), c.position.y - h * 0.6, c.position.z + uz * h * 0.5 + rr(-0.2, 0.2)); c2.rotation.set(rr(-0.6, 0.6), rr(0, 6.28), rr(-0.6, 0.6)); P.add(c2); }
      }
    });
  });
  fit("fence", function (make, L) {
    var b = new THREE.Box3().setFromObject(L), sz = b.getSize(new THREE.Vector3()), alongX = sz.x >= sz.z, len = alongX ? sz.x : sz.z;
    PROPS.forEach(function (r) {
      if (!r.fence) return;
      var n = r.pts.length + 2 * (r.pts.length - 1);
      for (var i = r.c0; i < r.c0 + n && i < r.p.children.length; i++) r.p.children[i].visible = false;
      for (var j = 0; j < r.pts.length - 1; j++) {
        var p = r.pts[j], q = r.pts[j + 1], dx = q[0] - p[0], dz = q[1] - p[1], D = Math.hypot(dx, dz);
        var c = make(0.8, isR(r.p)); c.scale.set(alongX ? 0.8 * D / len * 1.08 : 0.8, 0.8, alongX ? 0.8 : 0.8 * D / len * 1.08);
        c.rotation.y = -Math.atan2(dz, dx) + (alongX ? 0 : Math.PI / 2);
        c.position.set((p[0] + q[0]) / 2, TOP - 0.02, (p[1] + q[1]) / 2); r.p.add(c);
      }
    });
  });
  [["cat", cat, 0.42], ["mail", mb, 1.5], ["lamp", lamp, 1.7]].forEach(function (d) {
    fit(d[0], function (make) { hideKids(d[1]); var c = make(d[2], true); c.rotation.y = d[0] === "cat" ? 0.3 : -0.6; d[1].add(c); });
  });
  [["rockA", LEFT], ["rockC", RIGHT]].forEach(function (d) {
    fit(d[0], function (make) {
      var I = d[1], u = I.userData, c = make(1, I === RIGHT);
      var b = new THREE.Box3().setFromObject(c), sz = b.getSize(new THREE.Vector3());
      var H = u.H * (I === RIGHT ? 1.45 : 1.05);
      c.scale.set(2 * u.r * u.fl * 0.98 / sz.x, H, 2 * u.r * 0.98 / sz.z);
      c.position.set(0, -0.66 - H, 0); c.rotation.y = rr(0, 6); if (I === RIGHT) { c.rotation.y = RIGHT_ROCK_YAW; c.userData.isRockC = true; }
      u.body.visible = false; I.add(c);
    });
  });
  fit("sign", function (make) {
    hideKids(sign); var c = make(1.15, false); sign.add(c);
  });
  fit("kite", function (make) {
    for (var i = 0; i < 5; i++) kite.children[i].visible = false; // 4 panels + rim
    var c = make(1, false), w = new THREE.Group(); w.add(c);
    var b = new THREE.Box3().setFromObject(c), sz = b.getSize(new THREE.Vector3());
    var thin = sz.x < sz.y && sz.x < sz.z ? "x" : (sz.y < sz.z ? "y" : "z");
    if (thin === "y") w.rotation.x = Math.PI / 2; else if (thin === "x") w.rotation.y = Math.PI / 2;
    w.updateMatrixWorld(true); b = new THREE.Box3().setFromObject(w); sz = b.getSize(new THREE.Vector3());
    var k = 1.6 / Math.max(sz.x, sz.y, sz.z); w.scale.multiplyScalar(k);
    w.updateMatrixWorld(true); b = new THREE.Box3().setFromObject(w); var ctr = b.getCenter(new THREE.Vector3());
    w.position.sub(ctr); w.position.y -= 0.05; kite.add(w);
  });
  fit("gull", function (make) {
    birds.forEach(function (bg) {
      bg.children.forEach(function (w) { w.visible = false; });
      var c = make(0.32, false), parts = [];
      c.traverse(function (m) { if (m.isMesh) { m.geometry = m.geometry.clone(); m.frustumCulled = false; parts.push(m); } });
      var bb = new THREE.Box3(); parts.forEach(function (m) { m.geometry.computeBoundingBox(); bb.union(m.geometry.boundingBox); });
      var half = Math.max(-bb.min.x, bb.max.x), x0 = half * 0.16;
      // head direction: the end of the body (|x|<x0) holding more vertices
      var nf = 0, nb = 0, p0 = parts[0].geometry.attributes.position;
      for (var i = 0; i < p0.count; i++) if (Math.abs(p0.getX(i)) < x0) { if (p0.getZ(i) > 0) nf++; else nb++; }
      c.rotation.y = nf >= nb ? Math.PI : 0;
      parts.forEach(function (m) { m.userData.p0 = Float32Array.from(m.geometry.attributes.position.array); });
      bg.userData.gm = c; bg.userData.parts = parts; bg.userData.x0 = x0; bg.add(c);
    });
  });
  fit("bench", function (make) {
    bench.children.forEach(function (c) { if (c !== gma && c !== heroes.gma) c.visible = false; });
    var c = make(0.95, true); c.rotation.y = 0; bench.add(c); heroes.benchM = c;
  });
})();
function stepWind(t) {
  // breathing wind: slow swell + occasional gusts
  var gust = Math.max(0, Math.sin(t * 0.21) * Math.sin(t * 0.53 + 1.3));
  WIND.s = 0.75 + 0.35 * Math.sin(t * 0.17) + gust * 0.9;
  windU.uT.value = t; windU.uS.value = WIND.s;
  for (var i = 0; i < SWAY.length; i++) {
    var w = SWAY[i], o = w.o, ph = w.ph + (o.position.x * 0.55 + o.position.z * 0.4);
    var a = (Math.sin(t * w.f + ph) * 0.6 + Math.sin(t * w.f * 2.3 + ph * 1.7) * 0.25 + 0.35) * w.k * WIND.s;
    o.rotation.x = w.r0.x + a * 0.57; o.rotation.z = w.r0.z - a * 0.82;
  }
  if (heroes.girl) {
    var gi = heroes.girl.userData.inner;
    gi.rotation.z = -Math.sin(t * 1.1) * 0.012 * WIND.s; gi.rotation.x = Math.sin(t * 0.9 + 1) * 0.008;
    gi.position.y = Math.abs(Math.sin(t * 1.6)) * 0.012;
  }
  if (heroes.gma) {
    var mi = heroes.gma.userData.inner;
    mi.scale.y = 1 + Math.sin(t * 1.2) * 0.008; mi.rotation.x = Math.sin(t * 0.45) * 0.012;
  }
}

// ================= loop =================
var clock = new THREE.Clock(), t = 0, tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3();
function frame() {
  var now = performance.now();
  if (dir < 0 && now > rewindUntil) { dir = 1; rewBtn.classList.remove("on"); }
  var dt = Math.min(clock.getDelta(), 0.05) * speed * (dir < 0 ? -2.5 : 1);
  if (!isFinite(dt)) { dt = 0; speed = 1; } t += dt; if (!isFinite(t)) t = 0;
  if (introOn) { intro = Math.min(1, intro + dt / 4.2); var ie = 1 - Math.pow(1 - intro, 3);
    yawT = -0.55 + (0.18 + 0.55) * ie; pitchT = 0.78 + (0.42 - 0.78) * ie; zoomT = 1.0 + (1.38 - 1.0) * ie; yaw = yawT; pitch = pitchT; if (intro >= 1) introOn = false; }
  if (!Object.keys(ptrs).length) { yawT += yawV; yawV *= 0.93; if (Math.abs(yawV) < 1e-5) yawV = 0; idleT += dt; }
  var drift = idleT > 5 ? Math.sin((idleT - 5) * 0.25) * 0.04 * Math.min(1, (idleT - 5) / 3) : 0;
  yaw += (yawT + drift - yaw) * 0.1; pitch += (pitchT - pitch) * 0.1;
  if (Math.abs(zoomT - zoom) > 0.001) { zoom += (zoomT - zoom) * 0.15; frustum(); }
  var D = 60;
  camera.position.set(target.x + Math.sin(yaw) * Math.cos(pitch) * D, target.y + Math.sin(pitch) * D, target.z + Math.cos(yaw) * Math.cos(pitch) * D);
  camera.lookAt(target);
  stepSun(t);

  // kite
  kite.position.set(-7.6 + Math.sin(t * 0.8) * 0.6 * WIND.s, 8.8 + Math.sin(t * 1.2) * 0.45 * WIND.s, -3.5 + Math.cos(t * 0.6) * 0.3);
  kite.rotation.set(0, yaw, -0.35 + Math.sin(t * 1.5) * 0.18);
  tailParts.forEach(function (p, i) { p.position.x = Math.sin(t * 3 + i * 0.8) * 0.12 * i; p.rotation.z = Math.sin(t * 3 + i) * 0.6; });
  hand.getWorldPosition(tmp);
  var lp = kiteLine.geometry.attributes.position;
  tmp2.copy(kite.position).add(tmp).multiplyScalar(0.5); tmp2.y -= 0.5;
  lp.setXYZ(0, tmp.x, tmp.y, tmp.z); lp.setXYZ(1, tmp2.x, tmp2.y, tmp2.z); lp.setXYZ(2, kite.position.x, kite.position.y - 0.1, kite.position.z);
  lp.needsUpdate = true;

  // smoke
  chimTop.getWorldPosition(tmp);
  smoke.forEach(function (s) {
    var k = ((s.userData.ph + t * 0.12) % 1 + 1) % 1;
    s.position.set(tmp.x - k * 1.6 + Math.sin(k * 6 + t) * 0.15, tmp.y + k * 3.2, tmp.z - k * 0.6);
    s.scale.setScalar(0.5 + k * 1.5); s.material.opacity = 0.95 * (1 - k * k);
  });
  // crystal shimmer
  cryMat.uniforms.uT.value = t;
  cryLeaves.forEach(function (l) { l.scale.setScalar(1 + Math.sin(t * 1.4 + l.userData.ph) * 0.04); });
  arcDots.forEach(function (d, i) { d.scale.setScalar(0.7 + 0.5 * Math.max(0, Math.sin(t * 3 - i * 0.5))); });
  // clouds
  clouds.forEach(function (c) { c.position.x = c.userData.x0 + ((t * c.userData.v + 30) % 60 + 60) % 60 - 30; });
  farIsles.forEach(function (f) { f.position.y = f.userData.y0 + Math.sin(t * 0.3 + f.userData.ph) * 0.4; });
  pebbles.forEach(function (p) { p.position.y = p.userData.y0 + Math.sin(t * 0.7 + p.userData.ph) * 0.12; });
  floaters.forEach(function (f) { f.position.y = f.userData.y0 + Math.sin(t * 0.4 + f.userData.ph) * 0.25; });
  // water
  for (var i = 0; i < rp.count; i++) rp.setY(i, river0[i * 3 + 1] + Math.sin(river0[i * 3 + 2] * 0.6 + t * 2) * 0.08);
  rp.needsUpdate = true;
  falls.forEach(function (f, i) { f.material.opacity = 0.72 + Math.sin(t * 6 + i) * 0.08; });
  // birds
  birds.forEach(function (b) {
    var u = b.userData, a = t * u.sp + u.ph;
    var P = function (a) { return tmpB.set(u.cx + Math.cos(a) * u.r + Math.sin(a * 2) * 0.8, u.h + Math.sin(a * 3) * 0.35, u.cz + Math.sin(a) * u.r * 0.55); };
    var cyc = (t * 0.45 + u.ph) % 2.2, flapping = cyc < 1.1;
    var flap = flapping ? Math.sin(t * 10 + u.ph) * 0.65 : 0.12 + Math.sin(t * 1.5 + u.ph) * 0.04;
    P(a); b.position.copy(tmpB); b.position.y += flapping ? -Math.sin(t * 10 + u.ph) * 0.04 : 0;
    var d = 0.06 * Math.sign(u.sp); P(a + d); b.lookAt(tmpB);
    // bank into the turn
    var h1 = Math.atan2(tmpB.x - b.position.x, tmpB.z - b.position.z); P(a + 2 * d); var h2 = Math.atan2(tmpB.x - b.position.x, tmpB.z - b.position.z);
    var turn = h2 - h1; turn = Math.atan2(Math.sin(turn), Math.cos(turn)); u.bank = (u.bank || 0) * 0.9 + (-turn * 9) * 0.1;
    b.rotateZ(Math.max(-0.7, Math.min(0.7, u.bank)));
    if (u.parts) u.parts.forEach(function (m) {
      var pa = m.geometry.attributes.position, A = pa.array, B = m.userData.p0, x0 = u.x0, ca = Math.cos(flap), sa = Math.sin(flap);
      for (var i = 0; i < A.length; i += 3) { var x = B[i], ax = Math.abs(x); if (ax <= x0) continue; var dx = ax - x0, sg = x < 0 ? -1 : 1, dy = B[i + 1]; A[i] = sg * (x0 + dx * ca - 0 * sa); A[i + 1] = dy + dx * sa; }
      pa.needsUpdate = true;
    });
  });
  // girl idle bob
  girl.position.y = TOP + Math.abs(Math.sin(t * 2)) * 0.015; animChars(t);
  catTail.rotation.x = Math.sin(t * 2) * 0.4;

  stepWind(t);
  stepAtmos(t);
  renderPost();
  WATER.tick(now / 1000);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
window.__ready = true;
})();
