/* ============================================================
   Bubble Town: the house designer.

   Two houses on Maple Lane belong to the two divers, one each.
   The owner builds the layout on a grid (rooms, front door,
   chimneys); the outside of the house takes its shape from that
   layout. Then she decorates: furniture, rugs, pictures, wall
   colours and floors. Everyone else can visit and look around.

   Everything is drawn on one 2D canvas in an isometric "dollhouse"
   view that turns in four steps. No libraries, and nothing newer
   than Safari 12 understands, so it runs on the old iPads.

   The house is kept inside the diver's own save (save.house), so
   it rides along with the family backup between iPads and each
   girl can watch the other's house change.

   This file is separate from index.html on purpose: if anything
   here breaks, the game itself still starts.
   ============================================================ */
(function(){
"use strict";
if(window.House) return;

var GW = 9, GH = 7;             // the building lot, in squares
var WH = 1.25;                  // wall height, in squares
var WT = 0.1;                   // wall thickness
var KIDS = ['sophia', 'angelina'];
var DX = [0, 1, 0, -1], DY = [-1, 0, 1, 0];     // sides: 0 north, 1 east, 2 south, 3 west
var ROT_W = [3, 2, 1, 0], ROT_N = [0, 3, 2, 1]; // which world side is the back-left / back-right wall in each view

/* ---------------- catalog ---------------- */
var WALLS = ['#f6ead2', '#ffffff', '#ffd9e4', '#ffc2d4', '#e3d4ff', '#c9b8f5', '#cfe9ff', '#a9d4f5',
             '#d2f0d0', '#a8dcae', '#fff3b0', '#ffd9a0', '#f7b7a3', '#d9d2c5'];
var FLOORS = [
  {name:'Wood',        c:'#c9995f', k:'plank'},
  {name:'Light wood',  c:'#e6c897', k:'plank'},
  {name:'Dark wood',   c:'#8d6240', k:'plank'},
  {name:'White tile',  c:'#f2f4f6', k:'check', c2:'#d5dde4'},
  {name:'Blue tile',   c:'#bfe3f2', k:'check', c2:'#8fc8e0'},
  {name:'Pink carpet', c:'#f7b9cf', k:'plain'},
  {name:'Purple carpet', c:'#c7b3ee', k:'plain'},
  {name:'Green carpet', c:'#a9d9a4', k:'plain'},
  {name:'Blue carpet', c:'#9cc4ee', k:'plain'},
  {name:'Stone',       c:'#b9b4aa', k:'check', c2:'#a39d92'}
];
var ROOMS = [
  {t:'living',  name:'Living room', ic:'🛋️', wall:0,  floor:0},
  {t:'bedroom', name:'Bedroom',     ic:'🛏️', wall:2,  floor:5},
  {t:'kitchen', name:'Kitchen',     ic:'🍳', wall:10, floor:3},
  {t:'bath',    name:'Bathroom',    ic:'🛁', wall:6,  floor:4},
  {t:'play',    name:'Playroom',    ic:'🧸', wall:8,  floor:7},
  {t:'hall',    name:'Hallway',     ic:'🚪', wall:1,  floor:1}
];
var EXT = ['#ffe0b0', '#f0e0c8', '#ffffff', '#ffd0dc', '#f7a8b8', '#d6ccf2', '#b9a4ea', '#bfe0f7',
           '#7fb7e8', '#cfe8c4', '#8fcf94', '#fff0a8', '#f3c36a', '#e88a6a', '#c9c2b6'];
var ROOFS = ['#a8643a', '#7a5a40', '#c2405f', '#4c6f9e', '#5d8a4a', '#6a58a8', '#3a3f4a', '#d98a3a', '#2f8f8a', '#e36a8f'];

function roomDef(t){ for(var i=0; i<ROOMS.length; i++) if(ROOMS[i].t === t) return ROOMS[i]; return ROOMS[0]; }

/* Furniture is built from plain boxes: [x0, y0, z0, x1, y1, z1, colour].
   x runs across the width, y from the back to the front, z up. */
var WOOD = '#9a6a40', WOOD_D = '#7b5230', WHITE = '#ffffff', STEEL = '#cfd6dc';
function bed(c){ return [[.05,.05,0,.95,1.95,.22,WOOD], [.08,.28,.22,.92,1.92,.36,WHITE], [.08,.8,.36,.92,1.92,.41,c],
                         [.2,.34,.36,.8,.66,.46,WHITE], [.05,.05,0,.95,.2,.75,WOOD_D]]; }
function sofa(c, c2){ return [[.05,.25,0,1.95,.95,.28,c], [.05,.05,0,1.95,.3,.72,c2], [.05,.3,.28,.25,.95,.5,c2], [1.75,.3,.28,1.95,.95,.5,c2],
                              [.28,.32,.28,.99,.9,.37,c], [1.01,.32,.28,1.72,.9,.37,c]]; }
function chairBox(c, c2){ return [[.1,.25,0,.9,.9,.28,c], [.1,.08,0,.9,.3,.75,c2], [.1,.3,.28,.26,.9,.48,c2], [.74,.3,.28,.9,.9,.48,c2]]; }
function legs(x0, y0, x1, y1, h, c){ var t = .09; return [[x0,y0,0,x0+t,y0+t,h,c], [x1-t,y0,0,x1,y0+t,h,c], [x0,y1-t,0,x0+t,y1,h,c], [x1-t,y1-t,0,x1,y1,h,c]]; }
var FURN = [
  {k:'bed',     name:'Pink bed',    w:1, d:2, b:bed('#ff9cbd')},
  {k:'bed2',    name:'Purple bed',  w:1, d:2, b:bed('#b9a4ea')},
  {k:'bed3',    name:'Blue bed',    w:1, d:2, b:bed('#7fb7e8')},
  {k:'night',   name:'Night table', w:1, d:1, b:[[.2,.15,0,.8,.7,.42,WOOD], [.17,.12,.42,.83,.73,.47,WOOD_D], [.44,.36,.47,.56,.48,.62,'#888'], [.34,.26,.62,.66,.58,.82,'#ffe9a8']]},
  {k:'dresser', name:'Dresser',     w:1, d:1, b:[[.06,.08,0,.94,.6,.58,WOOD], [.04,.06,.58,.96,.62,.63,WOOD_D], [.44,.6,.36,.56,.63,.42,'#ffd479'], [.44,.6,.14,.56,.63,.2,'#ffd479']]},
  {k:'closet',  name:'Wardrobe',    w:1, d:1, b:[[.06,.06,0,.94,.6,1.12,'#b98850'], [.04,.04,1.12,.96,.62,1.17,WOOD_D], [.47,.6,.4,.5,.63,.7,'#ffd479'], [.53,.6,.4,.56,.63,.7,'#ffd479']]},
  {k:'sofa',    name:'Pink sofa',   w:2, d:1, b:sofa('#ff9cbd', '#e5779e')},
  {k:'sofa2',   name:'Blue sofa',   w:2, d:1, b:sofa('#8fc0ea', '#5f97c9')},
  {k:'sofa3',   name:'Green sofa',  w:2, d:1, b:sofa('#9fd6a0', '#6fb074')},
  {k:'chair',   name:'Armchair',    w:1, d:1, b:chairBox('#ffd479', '#e0ac45')},
  {k:'chair2',  name:'Purple chair',w:1, d:1, b:chairBox('#c7b3ee', '#9d86d6')},
  {k:'table',   name:'Table',       w:1, d:1, b:legs(.12,.12,.88,.88,.44,WOOD_D).concat([[.06,.06,.44,.94,.94,.52,WOOD]])},
  {k:'dining',  name:'Big table',   w:2, d:1, b:legs(.1,.14,1.9,.86,.46,WOOD_D).concat([[.04,.08,.46,1.96,.92,.54,WOOD], [.8,.38,.54,1.2,.62,.6,'#ff9cbd'], [.92,.44,.6,1.08,.56,.78,'#6fb074']])},
  {k:'stool',   name:'Chair',       w:1, d:1, b:legs(.28,.28,.72,.72,.3,WOOD_D).concat([[.25,.25,.3,.75,.75,.36,'#f3c36a'], [.25,.25,.36,.75,.32,.8,WOOD]])},
  {k:'tv',      name:'TV',          w:2, d:1, b:[[.1,.2,0,1.9,.7,.3,WOOD_D], [.3,.38,.3,1.7,.47,1.0,'#20222b'], [.36,.47,.36,1.64,.48,.94,'#5fc8e8']]},
  {k:'shelf',   name:'Bookshelf',   w:1, d:1, b:[[.06,.06,0,.94,.42,1.15,WOOD], [.12,.42,.08,.4,.47,.34,'#e55b6c'], [.42,.42,.08,.62,.47,.3,'#5b8de5'], [.64,.42,.08,.88,.47,.36,'#f3c36a'],
                                                 [.12,.42,.45,.5,.47,.7,'#6fb074'], [.54,.42,.45,.88,.47,.66,'#b9a4ea'], [.12,.42,.8,.36,.47,1.04,'#ff9cbd'], [.4,.42,.8,.88,.47,1.0,'#5fc8e8']]},
  {k:'desk',    name:'Desk',        w:1, d:1, b:legs(.08,.15,.92,.8,.46,WOOD_D).concat([[.04,.1,.46,.96,.84,.52,WOOD], [.3,.2,.52,.7,.26,.86,'#20222b'], [.34,.26,.56,.66,.27,.82,'#8fd8f0'], [.3,.5,.52,.7,.72,.55,'#e8e8ee']])},
  {k:'piano',   name:'Piano',       w:2, d:1, b:[[.1,.1,0,1.9,.55,.85,'#2a2a30'], [.1,.55,0,1.9,.85,.5,'#2a2a30'], [.14,.56,.5,1.86,.84,.53,WHITE], [.6,.9,0,1.4,1,.3,'#5a3a2a']]},
  {k:'lamp',    name:'Lamp',        w:1, d:1, b:[[.36,.36,0,.64,.64,.05,'#777'], [.47,.47,.05,.53,.53,.85,'#999'], [.3,.3,.85,.7,.7,1.1,'#ffe9a8']]},
  {k:'plant',   name:'Plant',       w:1, d:1, b:[[.34,.34,0,.66,.66,.26,'#c9773f'], [.24,.24,.26,.76,.76,.68,'#4caf50'], [.34,.34,.68,.66,.66,.96,'#6fcf6f']]},
  {k:'flowers', name:'Flowers',     w:1, d:1, b:[[.38,.38,0,.62,.62,.3,'#8fc0ea'], [.3,.3,.3,.7,.7,.5,'#4caf50'], [.3,.3,.5,.46,.46,.62,'#ff7fa8'], [.54,.34,.5,.7,.5,.64,'#ffd479'], [.4,.54,.5,.56,.7,.66,'#ff9cbd']]},
  {k:'toybox',  name:'Toy box',     w:1, d:1, b:[[.1,.2,0,.9,.8,.4,'#ff9cbd'], [.08,.18,.4,.92,.82,.46,'#e5779e'], [.2,.3,.46,.44,.54,.68,'#ffd479'], [.52,.36,.46,.78,.62,.6,'#8fc0ea']]},
  {k:'fish',    name:'Fish tank',   w:1, d:1, b:[[.1,.2,0,.9,.8,.42,WOOD_D], [.14,.24,.42,.86,.76,.9,'#7fd4ee'], [.12,.22,.9,.88,.78,.94,'#2a2a30']]},
  {k:'fire',    name:'Fireplace',   w:1, d:1, b:[[.05,.05,0,.95,.45,1.0,'#b5523b'], [.24,.45,0,.76,.47,.52,'#2a1c18'], [.38,.47,0,.62,.49,.32,'#ffb030'], [.44,.49,0,.56,.5,.2,'#fff0a0'], [.02,.03,1.0,.98,.52,1.07,'#7a5a40']]},
  {k:'fridge',  name:'Fridge',      w:1, d:1, b:[[.1,.08,0,.9,.78,1.15,'#e9eef2'], [.78,.78,.66,.83,.81,1.0,'#9aa5ad'], [.78,.78,.2,.83,.81,.56,'#9aa5ad']]},
  {k:'stove',   name:'Stove',       w:1, d:1, b:[[.05,.05,0,.95,.85,.58,'#f2f2f2'], [.05,.05,.58,.95,.85,.61,'#33363d'], [.05,.05,.61,.95,.14,.82,'#f2f2f2'], [.2,.85,.14,.8,.87,.44,'#33363d'],
                                                 [.18,.24,.61,.42,.48,.63,'#e55b6c'], [.58,.24,.61,.82,.48,.63,'#e55b6c']]},
  {k:'counter', name:'Counter',     w:1, d:1, b:[[.04,.05,0,.96,.72,.55,'#b98850'], [0,.03,.55,1,.76,.6,'#ece6da']]},
  {k:'sink',    name:'Kitchen sink',w:1, d:1, b:[[.04,.05,0,.96,.72,.55,'#b98850'], [0,.03,.55,1,.76,.6,'#ece6da'], [.22,.2,.6,.78,.62,.61,'#9fd8ea'], [.47,.08,.6,.53,.14,.8,STEEL], [.47,.08,.76,.53,.3,.8,STEEL]]},
  {k:'toilet',  name:'Toilet',      w:1, d:1, b:[[.26,.08,0,.74,.3,.62,WHITE], [.3,.3,0,.7,.78,.3,WHITE], [.27,.28,.3,.73,.8,.35,'#e3eef5']]},
  {k:'tub',     name:'Bathtub',     w:1, d:2, b:[[.08,.08,0,.92,1.92,.42,WHITE], [.16,.16,.42,.84,1.84,.43,'#9fd8ea'], [.44,.1,.42,.56,.2,.62,STEEL]]},
  {k:'vanity',  name:'Bath sink',   w:1, d:1, b:[[.15,.06,0,.85,.55,.5,WHITE], [.12,.04,.5,.88,.6,.56,'#e3eef5'], [.3,.16,.56,.7,.48,.57,'#9fd8ea'], [.47,.06,.56,.53,.12,.74,STEEL], [.2,.02,.8,.8,.05,1.15,'#bfe6ff']]}
];
var RUGS = [
  {k:'r1', name:'Pink rug',     w:2, d:2, c:'#ff9cbd', c2:'#ffe1ec'},
  {k:'r2', name:'Blue rug',     w:2, d:2, c:'#7fb7e8', c2:'#dff0ff'},
  {k:'r3', name:'Purple rug',   w:3, d:2, c:'#a98fe6', c2:'#ece4ff'},
  {k:'r4', name:'Green rug',    w:3, d:2, c:'#7fc98a', c2:'#e2f6e3'},
  {k:'r5', name:'Round rug',    w:2, d:2, c:'#ffd479', c2:'#fff3cf', round:1},
  {k:'r6', name:'Round pink',   w:2, d:2, c:'#f78fb3', c2:'#ffd9e6', round:1},
  {k:'r7', name:'Bath mat',     w:1, d:1, c:'#9fd8ea', c2:'#e6f8fd'},
  {k:'r8', name:'Rainbow rug',  w:2, d:1, c:'#e55b6c', c2:'#ffd479', stripes:['#e55b6c', '#f3a04a', '#ffd95a', '#7fc98a', '#7fb7e8', '#a98fe6']}
];
var PICS = [
  {k:'p1', ic:'🌈', bg:'#dff3ff', fr:'#ffffff'}, {k:'p2', ic:'🦄', bg:'#ffe3f0', fr:'#ffd479'}, {k:'p3', ic:'🐬', bg:'#cdeeff', fr:'#7a5a40'},
  {k:'p4', ic:'🌸', bg:'#fff3cf', fr:'#ffffff'}, {k:'p5', ic:'⭐', bg:'#2c3e6b', fr:'#ffd479'}, {k:'p6', ic:'🐱', bg:'#f2e6ff', fr:'#7a5a40'},
  {k:'p7', ic:'🦋', bg:'#e2f6e3', fr:'#ffffff'}, {k:'p8', ic:'❤️', bg:'#fff0f3', fr:'#e55b6c'}, {k:'p9', ic:'⛵', bg:'#bfe6ff', fr:'#3a3f4a'},
  {k:'p10', ic:'🐴', bg:'#fdf0d8', fr:'#7a5a40'}, {k:'p11', ic:'🌻', bg:'#dff3ff', fr:'#ffd479'}, {k:'p12', ic:'🎹', bg:'#f6ead2', fr:'#3a3f4a'}
];
function byK(list, k){ for(var i=0; i<list.length; i++) if(list[i].k === k) return list[i]; return null; }

/* ---------------- colours ---------------- */
var tintMemo = {};
function tint(hex, amt){
  var key = hex + '|' + Math.round(amt);
  if(tintMemo[key]) return tintMemo[key];
  var n = parseInt(hex.slice(1), 16), r = n >> 16, gr = (n >> 8) & 255, b = n & 255, d = Math.round(amt*2.55);
  var cl = function(v){ return v < 0 ? 0 : v > 255 ? 255 : v; };
  return (tintMemo[key] = 'rgb(' + cl(r + d) + ',' + cl(gr + d) + ',' + cl(b + d) + ')');
}

/* ---------------- the house data ---------------- */
function blank(){
  var c = []; for(var i=0; i<GW*GH; i++) c.push(0);
  return {v:1, cells:c, rooms:{}, next:1, items:[], rugs:[], pics:[], chim:[], door:null, ext:0, roof:0};
}
function addRoom(H, t, x0, y0, x1, y1){
  var id = H.next++, d = roomDef(t); H.rooms[id] = {t:t, wall:d.wall, floor:d.floor};
  for(var y=y0; y<=y1; y++) for(var x=x0; x<=x1; x++) H.cells[y*GW + x] = id;
  return id;
}
function starter(id){
  var H = blank();
  if(id === 'angelina'){
    addRoom(H, 'living', 2, 3, 5, 5); addRoom(H, 'kitchen', 2, 1, 4, 2); addRoom(H, 'bath', 5, 1, 5, 2); addRoom(H, 'bedroom', 6, 2, 7, 5);
    H.items = [{k:'sofa2', x:2, y:3, r:0}, {k:'tv', x:2, y:5, r:2}, {k:'plant', x:5, y:5, r:0}, {k:'bed2', x:7, y:2, r:0}, {k:'toybox', x:6, y:5, r:0},
               {k:'fridge', x:2, y:1, r:0}, {k:'stove', x:3, y:1, r:0}, {k:'sink', x:4, y:1, r:0}, {k:'toilet', x:5, y:1, r:0}];
    H.rugs = [{k:'r5', x:3, y:4}]; H.pics = [{k:'p2', x:6, y:2, s:0}, {k:'p7', x:3, y:3, s:0}];
    H.chim = [[5, 3]]; H.door = {x:4, y:5, s:2}; H.ext = 5; H.roof = 5;
  } else {
    addRoom(H, 'living', 1, 3, 4, 5); addRoom(H, 'kitchen', 5, 3, 7, 5); addRoom(H, 'bedroom', 1, 1, 3, 2); addRoom(H, 'bath', 4, 1, 5, 2);
    H.items = [{k:'sofa', x:1, y:3, r:0}, {k:'tv', x:1, y:5, r:2}, {k:'lamp', x:4, y:3, r:0}, {k:'bed', x:1, y:1, r:0}, {k:'dresser', x:3, y:1, r:0},
               {k:'fridge', x:7, y:3, r:0}, {k:'stove', x:6, y:3, r:0}, {k:'counter', x:5, y:3, r:0}, {k:'table', x:6, y:5, r:0}, {k:'tub', x:4, y:1, r:0}, {k:'toilet', x:5, y:1, r:0}];
    H.rugs = [{k:'r1', x:2, y:4}]; H.pics = [{k:'p1', x:2, y:1, s:0}, {k:'p3', x:3, y:3, s:0}];
    H.chim = [[4, 4]]; H.door = {x:2, y:5, s:2}; H.ext = 3; H.roof = 2;
  }
  normalize(H);
  return H;
}
function valid(H){ return H && H.v === 1 && H.cells && H.cells.length === GW*GH && H.rooms && H.items; }
function room(H, x, y){ return (x < 0 || y < 0 || x >= GW || y >= GH) ? 0 : H.cells[y*GW + x]; }

function footprint(def, r){ return (r % 2) ? [def.d, def.w] : [def.w, def.d]; }
function fits(H, def, x, y, r, skip){
  var f = footprint(def, r), i, j, k;
  for(j=0; j<f[1]; j++) for(i=0; i<f[0]; i++) if(!room(H, x + i, y + j)) return false;
  for(k=0; k<H.items.length; k++){
    var it = H.items[k]; if(it === skip) continue;
    var d2 = byK(FURN, it.k); if(!d2) continue;
    var f2 = footprint(d2, it.r);
    if(x < it.x + f2[0] && it.x < x + f[0] && y < it.y + f2[1] && it.y < y + f[1]) return false;
  }
  return true;
}
function wallAt(H, x, y, s){ var a = room(H, x, y); return a && room(H, x + DX[s], y + DY[s]) !== a; }
function outerAt(H, x, y, s){ return room(H, x, y) && !room(H, x + DX[s], y + DY[s]); }
function autoDoor(H){
  var best = null, bs = -1e9, x, y, s;
  for(y=0; y<GH; y++) for(x=0; x<GW; x++) for(s=0; s<4; s++){
    if(!outerAt(H, x, y, s)) continue;
    var sc = (s === 2 ? 100 : s === 1 ? 40 : s === 3 ? 30 : 0) + y*3 - Math.abs(x - GW/2);
    if(sc > bs){ bs = sc; best = {x:x, y:y, s:s}; }
  }
  return best;
}
/* after any change to the layout: drop whatever no longer has a floor or a wall to stand on */
function normalize(H){
  var used = {}, i;
  for(i=0; i<H.cells.length; i++) if(H.cells[i]){ if(H.rooms[H.cells[i]]) used[H.cells[i]] = 1; else H.cells[i] = 0; }
  for(var id in H.rooms) if(!used[id]) delete H.rooms[id];
  H.items = H.items.filter(function(it){ var d = byK(FURN, it.k); return d && fits(H, d, it.x, it.y, it.r, it); });
  // two things on one square: the later one goes
  var keep = []; H.items.forEach(function(it){ var d = byK(FURN, it.k), sv = H.items; H.items = keep; if(fits(H, d, it.x, it.y, it.r, null)) keep.push(it); H.items = sv; }); H.items = keep;
  H.rugs = (H.rugs || []).filter(function(r){ var d = byK(RUGS, r.k); if(!d) return false; for(var j=0; j<d.d; j++) for(var k=0; k<d.w; k++) if(!room(H, r.x + k, r.y + j)) return false; return true; });
  H.pics = (H.pics || []).filter(function(p){ return byK(PICS, p.k) && wallAt(H, p.x, p.y, p.s); });
  H.chim = (H.chim || []).filter(function(c){ return room(H, c[0], c[1]); });
  if(!H.door || !outerAt(H, H.door.x, H.door.y, H.door.s)) H.door = autoDoor(H);
  if(!(H.ext >= 0 && H.ext < EXT.length)) H.ext = 0;
  if(!(H.roof >= 0 && H.roof < ROOFS.length)) H.roof = 0;
}
/* one open doorway between every pair of rooms that touch */
function doorways(H){
  var pairs = {}, out = {}, x, y, s;
  for(y=0; y<GH; y++) for(x=0; x<GW; x++) for(s=1; s<=2; s++){
    var a = room(H, x, y), b = room(H, x + DX[s], y + DY[s]);
    if(a && b && a !== b){ var key = a < b ? a + '_' + b : b + '_' + a; (pairs[key] = pairs[key] || []).push([x, y, s]); }
  }
  for(var k in pairs){ var e = pairs[k][Math.floor((pairs[k].length - 1)/2)];
    out[e[0] + ',' + e[1] + ',' + e[2]] = 1; out[(e[0] + DX[e[2]]) + ',' + (e[1] + DY[e[2]]) + ',' + ((e[2] + 2) % 4)] = 1; }
  return out;
}
function hasWindow(x, y, s){ return ((s % 2 === 0 ? x : y) % 2) === 1; }
/* roof heights on a half-square grid: how far each point is from the edge of the house */
function roofField(H){
  var W = GW*2 + 1, Hh = GH*2 + 1, d = [], q = [], i, x, y;
  var sub = function(sx, sy){ return (sx < 0 || sy < 0) ? 0 : room(H, sx >> 1, sy >> 1); };
  for(y=0; y<Hh; y++) for(x=0; x<W; x++){
    var inside = sub(x - 1, y - 1) && sub(x, y - 1) && sub(x - 1, y) && sub(x, y);
    d.push(inside ? -1 : 0); if(!inside) q.push(y*W + x);
  }
  for(i=0; i<q.length; i++){
    var c = q[i], cx = c % W, cy = (c - cx)/W;
    for(var oy=-1; oy<=1; oy++) for(var ox=-1; ox<=1; ox++){
      var nx = cx + ox, ny = cy + oy; if(nx < 0 || ny < 0 || nx >= W || ny >= Hh) continue;
      var n = ny*W + nx; if(d[n] === -1){ d[n] = d[c] + 1; q.push(n); }
    }
  }
  return {W:W, d:d};
}
var SLOPE = .38;                 // roof rise per half square
function roofZ(F, hx, hy){ var v = F.d[hy*F.W + hx]; return WH + (v > 0 ? v : 0)*SLOPE; }

/* ---------------- saving and sharing ---------------- */
var houseMemo = {};
function readHouse(id){
  try{
    if(id === P && save){ if(!valid(save.house)) save.house = starter(id); return save.house; }
    var best = null, bt = -1, tryOne = function(raw){ if(!raw) return; var o = typeof raw === 'string' ? JSON.parse(raw) : raw; if(o && valid(o.house) && (o.updated || 0) > bt){ bt = o.updated || 0; best = o.house; } };
    try{ tryOne(localStorage.getItem('bubbletown.' + id)); }catch(e){}
    try{ var b = JSON.parse(localStorage.getItem('bubbletown.backup.' + id) || 'null'); if(b) tryOne(b.save); }catch(e){}
    return best || starter(id);
  }catch(e){ return starter(id); }
}
function cachedHouse(id){
  var m = houseMemo[id], t = Date.now();
  if(m && t - m.t < 2500 && !(id === P && m.h !== save.house)) return m;
  var h = readHouse(id); m = houseMemo[id] = {t:t, h:h, f:roofField(h)}; return m;
}
var syncT = 0;
function commit(){
  if(!S.edit) return;
  normalize(S.H); save.house = S.H; delete houseMemo[S.id];
  try{ persist(); }catch(e){}
  clearTimeout(syncT);
  syncT = setTimeout(function(){ try{ for(var k in Net.peers){ var c = Net.peers[k].conn; if(c && c.open) netSendBackup(c); } }catch(e){} }, 1500);
}
function title(id){ var n; try{ n = diverName(playerDef(id)); }catch(e){ n = 'Diver'; } return n + '’s house'; }

/* ---------------- state ---------------- */
var S = {id:null, H:null, edit:false, mode:'decor', rot:0, tool:{t:'move'}, cat:'furn', hist:[], drag:null, watch:0, raw:''};
var cv, g, cam = {ox:0, oy:0, hw:32, hh:16, zs:36}, DPR = 1, CW = 0, CH = 0;
var el = {};

/* ---------------- geometry ---------------- */
function toWorld(u, v, r){ return r === 0 ? [u, v] : r === 1 ? [v, GH - u] : r === 2 ? [GW - u, GH - v] : [GW - v, u]; }
function toView(x, y, r){ return r === 0 ? [x, y] : r === 1 ? [GH - y, x] : r === 2 ? [GW - x, GH - y] : [y, GW - x]; }
function viewRect(x0, y0, x1, y1, r){ var a = toView(x0, y0, r), b = toView(x1, y1, r); return [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[0], b[0]), Math.max(a[1], b[1])]; }
function viewCell(u, v, r){ var w = toWorld(u + .5, v + .5, r); return [Math.floor(w[0]), Math.floor(w[1])]; }
function PX(u, v, z){ return [cam.ox + (u - v)*cam.hw, cam.oy + (u + v)*cam.hh - z*cam.zs]; }
/* a point inside a piece of furniture, turned r quarter turns inside its own footprint */
function localRect(def, r, b){
  var w = def.w, d = def.d, p = function(x, y){ return r === 0 ? [x, y] : r === 1 ? [d - y, x] : r === 2 ? [w - x, d - y] : [y, w - x]; };
  var a = p(b[0], b[1]), c = p(b[3], b[4]);
  return [Math.min(a[0], c[0]), Math.min(a[1], c[1]), Math.max(a[0], c[0]), Math.max(a[1], c[1])];
}

/* ---------------- drawing ---------------- */
function poly(pts, fill, stroke){
  g.beginPath(); g.moveTo(pts[0][0], pts[0][1]);
  for(var i=1; i<pts.length; i++) g.lineTo(pts[i][0], pts[i][1]);
  g.closePath();
  if(fill){ g.fillStyle = fill; g.fill(); }
  if(stroke){ g.strokeStyle = stroke; g.stroke(); }
}
var EDGE = 'rgba(40,30,30,.22)';
function box(u0, v0, z0, u1, v1, z1, c){
  g.lineWidth = 1; g.lineJoin = 'round';
  poly([PX(u0, v1, z0), PX(u1, v1, z0), PX(u1, v1, z1), PX(u0, v1, z1)], tint(c, -24), EDGE);      // the face toward the front-left
  poly([PX(u1, v0, z0), PX(u1, v1, z0), PX(u1, v1, z1), PX(u1, v0, z1)], tint(c, -9), EDGE);       // the face toward the front-right
  poly([PX(u0, v0, z1), PX(u1, v0, z1), PX(u1, v1, z1), PX(u0, v1, z1)], tint(c, 10), EDGE);       // the top
}
/* draw flat art onto a wall: side 'w' is the back-left wall of view square (u,v), 'n' the back-right.
   The art is drawn in a 100 x 100 square, a0..a1 along the wall and z0..z1 up it. */
function onWall(side, u, v, a0, a1, z0, z1, fn){
  var P0, P1, P2;
  if(side === 'w'){ P0 = PX(u + WT, v + 1 - a0, z1); P1 = PX(u + WT, v + 1 - a1, z1); P2 = PX(u + WT, v + 1 - a0, z0); }
  else { P0 = PX(u + a0, v + WT, z1); P1 = PX(u + a1, v + WT, z1); P2 = PX(u + a0, v + WT, z0); }
  g.save();
  g.transform((P1[0] - P0[0])/100, (P1[1] - P0[1])/100, (P2[0] - P0[0])/100, (P2[1] - P0[1])/100, P0[0], P0[1]);
  fn(side === 'w' ? -10 : -24);
  g.restore();
}
function artWindow(sh){
  g.fillStyle = tint('#ffffff', sh); g.fillRect(0, 0, 100, 100);
  var gr = g.createLinearGradient(0, 0, 0, 100); gr.addColorStop(0, '#9fd8f5'); gr.addColorStop(1, '#d8f2ff');
  g.fillStyle = gr; g.fillRect(9, 9, 82, 82);
  g.fillStyle = 'rgba(255,255,255,.55)'; g.beginPath(); g.moveTo(16, 60); g.lineTo(50, 16); g.lineTo(64, 16); g.lineTo(16, 78); g.fill();
  g.fillStyle = tint('#ffffff', sh); g.fillRect(46, 9, 8, 82); g.fillRect(9, 46, 82, 8);
}
function artDoor(sh){
  g.fillStyle = tint('#ffffff', sh); g.fillRect(0, 0, 100, 100);
  g.fillStyle = tint('#b5523b', sh); g.fillRect(8, 5, 84, 95);
  g.fillStyle = tint('#b5523b', sh - 14); g.fillRect(18, 12, 64, 34); g.fillRect(18, 54, 64, 38);
  g.fillStyle = '#ffd479'; g.beginPath(); g.arc(80, 52, 5, 0, 7); g.fill();
}
function artPic(p){ return function(sh){
  g.fillStyle = 'rgba(0,0,0,.18)'; g.fillRect(4, 6, 100, 100);
  g.fillStyle = tint(p.fr, sh); g.fillRect(0, 0, 100, 100);
  g.fillStyle = p.bg; g.fillRect(10, 10, 80, 80);
  g.font = '56px serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#333'; g.fillText(p.ic, 50, 54);
}; }

var LAWN = .8;                  // how far the lawn reaches past the lot
function fitCam(){
  var odd = S.rot % 2, RW = odd ? GH : GW, RH = odd ? GW : GH, M = LAWN, top = WH + .2;
  var hUnits = Math.max(top*.56, M/2) + (RW + RH + 2*M)/4 + .12;
  var tw = Math.min(CW/((RW + RH + 4*M)/2 + .1), (CH - 36)/hUnits);
  cam.hw = tw/2; cam.hh = tw/4; cam.zs = tw*.56;
  var bx0 = -(RH + 2*M)*cam.hw, bx1 = (RW + 2*M)*cam.hw, by0 = -Math.max(top*cam.zs, 2*M*cam.hh), by1 = (RW + RH + 2*M)*cam.hh + .2*cam.zs;
  cam.ox = Math.round((CW - (bx1 + bx0))/2); cam.oy = Math.round(32 + ((CH - 32) - (by1 - by0))/2 - by0);
  cam.RW = RW; cam.RH = RH;
}
/* which of two boxes in one square has to be drawn first */
function before(a, b){
  var e = 1e-6;
  if(a[0] < b[3] - e && b[0] < a[3] - e && a[1] < b[4] - e && b[1] < a[4] - e) return a[2] < b[2] || (a[2] === b[2] && a[5] <= b[2] + e);   // one sits on the other
  if(a[3] <= b[0] + e) return !(b[4] <= a[1] + e);
  if(b[3] <= a[0] + e) return false;
  return a[4] <= b[1] + e;
}
function sortBoxes(list){
  var rest = list.slice(), out = [], i, j;
  while(rest.length){
    var pickI = 0;
    for(i=0; i<rest.length; i++){ var free = true; for(j=0; j<rest.length && free; j++) if(j !== i && before(rest[j], rest[i]) && !before(rest[i], rest[j])) free = false; if(free){ pickI = i; break; } }
    out.push(rest.splice(pickI, 1)[0]);
  }
  return out;
}
function floorQuad(x0, y0, x1, y1, z, fill, stroke){
  var r = S.rot, a = toView(x0, y0, r), b = toView(x1, y0, r), c = toView(x1, y1, r), d = toView(x0, y1, r);
  poly([PX(a[0], a[1], z), PX(b[0], b[1], z), PX(c[0], c[1], z), PX(d[0], d[1], z)], fill, stroke);
}
function drawFloorCell(H, x, y){
  var rm = H.rooms[room(H, x, y)], f = FLOORS[rm.floor] || FLOORS[0], c = f.c;
  if(f.k === 'check' && (x + y) % 2) c = f.c2;
  g.lineWidth = 1;
  floorQuad(x, y, x + 1, y + 1, 0, c, tint(c, -10));
  if(f.k === 'plank'){
    g.strokeStyle = tint(f.c, -14); g.lineWidth = 1; g.beginPath();
    for(var k=1; k<3; k++){ var a = toView(x, y + k/3, S.rot), b = toView(x + 1, y + k/3, S.rot), p = PX(a[0], a[1], 0), q = PX(b[0], b[1], 0); g.moveTo(p[0], p[1]); g.lineTo(q[0], q[1]); }
    g.stroke();
  }
}
function drawRug(rg){
  var d = byK(RUGS, rg.k); if(!d) return;
  var x0 = rg.x + .1, y0 = rg.y + .1, x1 = rg.x + d.w - .1, y1 = rg.y + d.d - .1, i;
  g.lineWidth = 1;
  if(d.round){
    var cx = (x0 + x1)/2, cy = (y0 + y1)/2, rx = (x1 - x0)/2, ry = (y1 - y0)/2;
    [1, .7, .38].forEach(function(k, n){ var pts = []; for(i=0; i<28; i++){ var a = i/28*Math.PI*2, w = toView(cx + Math.cos(a)*rx*k, cy + Math.sin(a)*ry*k, S.rot); pts.push(PX(w[0], w[1], .012)); }
      poly(pts, n === 1 ? d.c2 : d.c, n ? null : tint(d.c, -18)); });
  } else if(d.stripes){
    var n = d.stripes.length; for(i=0; i<n; i++) floorQuad(x0 + (x1 - x0)*i/n, y0, x0 + (x1 - x0)*(i + 1)/n, y1, .012, d.stripes[i], null);
  } else {
    floorQuad(x0, y0, x1, y1, .012, d.c, tint(d.c, -18));
    floorQuad(x0 + .18, y0 + .18, x1 - .18, y1 - .18, .012, d.c2, null);
    floorQuad(x0 + .3, y0 + .3, x1 - .3, y1 - .3, .012, d.c, null);
  }
}

function render(){
  if(!g || !S.H) return;
  var H = S.H, r = S.rot, out = S.mode === 'out', build = S.mode === 'build';
  g.setTransform(DPR, 0, 0, DPR, 0, 0); g.clearRect(0, 0, CW, CH);
  fitCam();
  var RW = cam.RW, RH = cam.RH, M2 = LAWN, u, v, x, y, i;
  // the lawn
  poly([PX(-M2, -M2, 0), PX(RW + M2, -M2, 0), PX(RW + M2, RH + M2, 0), PX(-M2, RH + M2, 0)], '#8fd06a', '#6fb650');
  poly([PX(-M2, RH + M2, 0), PX(RW + M2, RH + M2, 0), PX(RW + M2, RH + M2, -.18), PX(-M2, RH + M2, -.18)], '#7a5a40');
  poly([PX(RW + M2, -M2, 0), PX(RW + M2, RH + M2, 0), PX(RW + M2, RH + M2, -.18), PX(RW + M2, -M2, -.18)], '#8d6a4c');
  if(build && S.edit){ g.lineWidth = 1; g.setLineDash([4, 4]);
    for(y=0; y<GH; y++) for(x=0; x<GW; x++) if(!room(H, x, y)) floorQuad(x, y, x + 1, y + 1, 0, 'rgba(255,255,255,.16)', 'rgba(255,255,255,.75)');
    g.setLineDash([]); }
  // the path from the front door
  if(H.door){ var dr = H.door, px0 = dr.x + .2 + DX[dr.s]*1, py0 = dr.y + .2 + DY[dr.s]*1;
    floorQuad(px0, py0, px0 + .6, py0 + .6, .004, '#e8d7a8', null);
    floorQuad(px0 + DX[dr.s]*.8, py0 + DY[dr.s]*.8, px0 + DX[dr.s]*.8 + .6, py0 + DY[dr.s]*.8 + .6, .004, '#e8d7a8', null); }
  // floors and rugs lie flat, so they all go down first
  for(y=0; y<GH; y++) for(x=0; x<GW; x++) if(room(H, x, y)) drawFloorCell(H, x, y);
  if(!out) H.rugs.forEach(drawRug);
  if(S.drag && S.drag.it && !out){ var di = S.drag.it, dd = byK(S.drag.rug ? RUGS : FURN, di.k), fp = S.drag.rug ? [dd.w, dd.d] : footprint(dd, di.r);
    g.lineWidth = 3; floorQuad(di.x + .04, di.y + .04, di.x + fp[0] - .04, di.y + fp[1] - .04, .02, 'rgba(255,212,121,.35)', '#ffb300'); }

  // furniture, cut into one-square pieces so each square can be drawn back to front
  var cells = {}, put = function(cu, cv2, b){ var k = cu + cv2*64; (cells[k] = cells[k] || []).push(b); };
  if(!out) H.items.forEach(function(it){
    var def = byK(FURN, it.k); if(!def) return;
    def.b.forEach(function(b){
      var lr = localRect(def, it.r, b), vr = viewRect(it.x + lr[0], it.y + lr[1], it.x + lr[2], it.y + lr[3], r);
      for(var cu=Math.floor(vr[0] + 1e-6); cu<vr[2] - 1e-6; cu++) for(var cw=Math.floor(vr[1] + 1e-6); cw<vr[3] - 1e-6; cw++)
        put(cu, cw, [Math.max(vr[0], cu), Math.max(vr[1], cw), b[2], Math.min(vr[2], cu + 1), Math.min(vr[3], cw + 1), b[5], b[6]]);
    });
  });
  var DW = doorways(H), F = out ? roofField(H) : null, ext = EXT[H.ext], roofC = ROOFS[H.roof];
  var isDoor = function(c, s){ return H.door && H.door.x === c[0] && H.door.y === c[1] && H.door.s === s; };
  var picsOn = function(c, s){ return H.pics.filter(function(p){ return p.x === c[0] && p.y === c[1] && p.s === s; }); };

  function wall(side, u, v, A, B, cA, cB, sA){
    // A is the room on the near side of this wall (it faces us), B the room behind it
    if(A === B) return;
    var bx = side === 'w' ? [u, v, u + WT, v + 1] : [u, v, u + 1, v + WT];
    var wb = function(z0, z1, c){ box(bx[0], bx[1], z0, bx[2], bx[3], z1, c); };
    var deco = function(c, s){
      if(isDoor(c, s)) onWall(side, u, v, .22, .78, 0, 1.0, artDoor);
      else if(hasWindow(c[0], c[1], s)) onWall(side, u, v, .22, .78, .42, .98, artWindow);
    };
    if(out){
      if(A && B) return;
      wb(0, WH, ext);
      if(!A) deco(cB, (sA + 2) % 4);
      return;
    }
    if(A && B){                                    // a wall between two rooms: low, with a see-through top so the room behind still shows
      var open = DW[cA[0] + ',' + cA[1] + ',' + sA], col = WALLS[H.rooms[A].wall] || WALLS[0];
      if(!open) wb(0, .3, col);
      g.globalAlpha = .3; wb(open ? 1.0 : .3, WH, col); g.globalAlpha = 1;
      picsOn(cA, sA).forEach(function(p){ onWall(side, u, v, .25, .75, .5, 1.0, artPic(byK(PICS, p.k))); });
    } else if(A){                                  // a back wall of the house, seen from inside
      wb(0, WH, WALLS[H.rooms[A].wall] || WALLS[0]);
      var pp = picsOn(cA, sA);
      if(isDoor(cA, sA)) onWall(side, u, v, .22, .78, 0, 1.0, artDoor);
      else if(pp.length) pp.forEach(function(p){ onWall(side, u, v, .25, .75, .5, 1.0, artPic(byK(PICS, p.k))); });
      else if(hasWindow(cA[0], cA[1], sA)) onWall(side, u, v, .22, .78, .42, .98, artWindow);
    } else {                                       // a front wall: cut down low so you can see in
      if(isDoor(cB, (sA + 2) % 4)){ var m = side === 'w' ? [u + .12, v + .2, u + .5, v + .8] : [u + .2, v + .12, u + .8, v + .5];
        poly([PX(m[0], m[1], .01), PX(m[2], m[1], .01), PX(m[2], m[3], .01), PX(m[0], m[3], .01)], '#c2405f', '#8d2c44'); }
      else wb(0, .16, ext);
    }
  }
  for(var sum=0; sum<=RW + RH; sum++) for(u=Math.max(0, sum - RH); u<=Math.min(RW, sum); u++){
    v = sum - u;
    var c = viewCell(u, v, r), A = room(H, c[0], c[1]), sW = ROT_W[r], sN = ROT_N[r];
    var cW = [c[0] + DX[sW], c[1] + DY[sW]], cN = [c[0] + DX[sN], c[1] + DY[sN]];
    wall('n', u, v, A, room(H, cN[0], cN[1]), c, cN, sN);
    wall('w', u, v, A, room(H, cW[0], cW[1]), c, cW, sW);
    var list = cells[u + v*64];
    if(list){ list = sortBoxes(list); for(i=0; i<list.length; i++){ var b = list[i]; box(b[0], b[1], b[2], b[3], b[4], b[5], b[6]); } }
    if(out && A) roofCell(F, u, v, r, roofC, H, c);
  }
  if(build) roomLabels(H);
}
/* the roof over one square: four small slopes, lit from the front-right */
function roofCell(F, u, v, r, col, H, c){
  var hz = function(pu, pv){ var w = toWorld(pu, pv, r); return roofZ(F, Math.round(w[0]*2), Math.round(w[1]*2)); };
  var tri = function(a, b, d){
    var ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = d[0] - a[0], vy = d[1] - a[1], vz = d[2] - a[2];
    var nx = uy*vz - uz*vy, ny = uz*vx - ux*vz, nz = ux*vy - uy*vx; if(nz < 0){ nx = -nx; ny = -ny; nz = -nz; }
    var l = Math.sqrt(nx*nx + ny*ny + nz*nz) || 1, br = (nx*.5 + ny*.12 + nz*.86)/l;
    var fill = tint(col, Math.max(-22, Math.min(12, (br - .86)*90)));
    g.lineWidth = 1; poly([PX(a[0], a[1], a[2]), PX(b[0], b[1], b[2]), PX(d[0], d[1], d[2])], fill, fill);
  };
  var top = WH;
  for(var s=0; s<4; s++){
    var su = u + (s % 2)*.5, sv = v + (s >> 1)*.5;
    var p00 = [su, sv, hz(su, sv)], p10 = [su + .5, sv, hz(su + .5, sv)], p11 = [su + .5, sv + .5, hz(su + .5, sv + .5)], p01 = [su, sv + .5, hz(su, sv + .5)];
    top = Math.max(top, p00[2], p10[2], p11[2], p01[2]);
    if(Math.abs(p00[2] - p11[2]) >= Math.abs(p10[2] - p01[2])) /* cut along the hip or valley line */ { tri(p00, p10, p11); tri(p00, p11, p01); }
    else { tri(p00, p10, p01); tri(p10, p11, p01); }
  }
  for(var i=0; i<H.chim.length; i++) if(H.chim[i][0] === c[0] && H.chim[i][1] === c[1]){
    box(u + .3, v + .3, WH, u + .7, v + .7, top + .4, '#b5523b'); box(u + .25, v + .25, top + .4, u + .75, v + .75, top + .5, '#7a3a2a');
  }
}
function roomLabels(H){
  var acc = {}, x, y;
  for(y=0; y<GH; y++) for(x=0; x<GW; x++){ var id = room(H, x, y); if(id){ var a = acc[id] = acc[id] || [0, 0, 0]; a[0] += x + .5; a[1] += y + .5; a[2]++; } }
  g.font = '700 ' + Math.max(11, Math.round(cam.hw*.36)) + 'px Nunito, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  for(var k in acc){ var w = toView(acc[k][0]/acc[k][2], acc[k][1]/acc[k][2], S.rot), p = PX(w[0], w[1], .3), d = roomDef(H.rooms[k].t), txt = d.ic + ' ' + d.name;
    var tw = g.measureText(txt).width + 14; g.fillStyle = 'rgba(3,24,43,.72)'; g.fillRect(p[0] - tw/2, p[1] - 11, tw, 22); g.fillStyle = '#fff'; g.fillText(txt, p[0], p[1] + 1); }
  H.chim.forEach(function(c){ var w = toView(c[0] + .5, c[1] + .5, S.rot), p = PX(w[0], w[1], .05); g.font = Math.round(cam.hw*.6) + 'px serif'; g.fillText('🧱', p[0], p[1]); });
}

/* a small picture of one thing, for the buttons along the bottom */
function icon(w, h, draw){
  var c = document.createElement('canvas'), d = Math.min(window.devicePixelRatio || 1, 2);
  c.width = w*d; c.height = h*d; c.style.width = w + 'px'; c.style.height = h + 'px';
  var sg = g, sc = cam, sr = S.rot;
  g = c.getContext('2d'); g.setTransform(d, 0, 0, d, 0, 0); S.rot = 0;
  try{ draw(w, h); }catch(e){}
  g = sg; cam = sc; S.rot = sr;
  return c;
}
function furnIcon(def){ return icon(64, 52, function(w, h){
  var hw = Math.min(46/(def.w + def.d), 20); cam = {ox:w/2 + (def.d - def.w)*hw/2, oy:h - 8 - (def.w + def.d)*hw/2, hw:hw, hh:hw/2, zs:hw*1.12};
  sortBoxes(def.b).forEach(function(b){ box(b[0], b[1], b[2], b[3], b[4], b[5], b[6]); }); }); }
function rugIcon(d){ return icon(64, 52, function(w, h){
  var hw = 44/(d.w + d.d); cam = {ox:w/2 + (d.d - d.w)*hw/2, oy:h/2 - (d.w + d.d)*hw/4, hw:hw, hh:hw/2, zs:hw};
  drawRug({k:d.k, x:0, y:0}); }); }
function picIcon(p){ return icon(64, 52, function(w, h){ g.translate(12, 6); g.scale(.4, .4); artPic(p)(0); }); }
function swatch(c, roof){ return icon(64, 52, function(w, h){
  if(roof){ g.fillStyle = c; g.beginPath(); g.moveTo(8, 40); g.lineTo(32, 10); g.lineTo(56, 40); g.fill(); g.strokeStyle = 'rgba(0,0,0,.25)'; g.stroke(); }
  else { g.fillStyle = c; g.fillRect(12, 8, 40, 36); g.strokeStyle = 'rgba(0,0,0,.25)'; g.strokeRect(12.5, 8.5, 39, 35); } }); }
function floorIcon(f){ return icon(64, 52, function(w, h){
  for(var y=0; y<3; y++) for(var x=0; x<3; x++){ g.fillStyle = f.k === 'check' && (x + y) % 2 ? f.c2 : f.c; g.fillRect(11 + x*14, 5 + y*14, 14, 14);
    if(f.k === 'plank'){ g.fillStyle = tint(f.c, -14); g.fillRect(11 + x*14, 5 + y*14 + 13, 14, 1); } }
  g.strokeStyle = 'rgba(0,0,0,.25)'; g.strokeRect(11.5, 5.5, 42, 42); }); }

/* ---------------- the screen ---------------- */
var CSS = '#lHouse{padding:0}' +
  '#hzWrap{position:absolute;top:0;left:0;right:0;bottom:0;display:-webkit-box;display:flex;-webkit-box-orient:vertical;flex-direction:column;background:#bfe6ff;background:linear-gradient(180deg,#8fd0f5 0%,#d9f1ff 55%,#bfe9c0 100%)}' +
  '#hzTop{display:flex;align-items:center;flex-wrap:wrap;padding:8px 10px 6px;padding-top:calc(8px + env(safe-area-inset-top));background:rgba(4,28,46,.88)}' +
  '#hzTitle{font-family:Comfortaa,"Trebuchet MS",sans-serif;font-weight:700;font-size:18px;color:#fff;margin:0 12px 0 4px;max-width:34%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' +
  '#hzTabs{flex:1;white-space:nowrap}' +
  '.hzb{display:inline-block;vertical-align:top;margin:3px 3px;padding:8px 12px;border-radius:14px;border:2px solid rgba(125,240,255,.35);background:rgba(10,58,88,.7);color:#eaf9ff;font:700 14px Nunito,"Avenir Next",sans-serif;line-height:1.2;cursor:pointer;-webkit-appearance:none}' +
  '.hzb.sel{border-color:#ffd479;background:rgba(255,212,121,.28);color:#fff}' +
  '.hzb.big{font-size:15px;padding:9px 14px}' +
  '.hzb.gold{background:#ffc94f;border-color:#ffe9b4;color:#04121f}' +
  '.hzb[disabled]{opacity:.35}' +
  '.hzi{width:78px;padding:4px 2px 5px;font-size:11px;text-align:center;white-space:normal;background:rgba(255,255,255,.9);color:#04121f;border-color:rgba(4,28,46,.25)}' +
  '.hzi.sel{background:#fff3cf;color:#04121f;border-color:#ff9a00;box-shadow:0 0 0 2px #ffb300}' +
  '.hzi canvas{display:block;margin:0 auto 1px}' +
  '#hzStage{position:relative;-webkit-box-flex:1;flex:1 1 0;min-height:0}' +
  '#hzCv{position:absolute;top:0;left:0;width:100%;height:100%;touch-action:none}' +
  '#hzHint{position:absolute;left:0;right:0;top:6px;text-align:center;pointer-events:none;font:700 14px Nunito,sans-serif;color:#04121f}' +
  '#hzHint span{display:inline-block;background:rgba(255,255,255,.82);border-radius:12px;padding:4px 12px}' +
  '#hzBar{background:rgba(4,28,46,.88);padding:4px 6px;padding-bottom:calc(4px + env(safe-area-inset-bottom))}' +
  '.hzRow{white-space:nowrap;overflow-x:auto;overflow-y:hidden;-webkit-overflow-scrolling:touch;touch-action:pan-x}' +
  '.hzRow::-webkit-scrollbar{display:none}' +
  '#hzRow2{min-height:50px}' +
  '.hzSep{display:inline-block;width:14px}' +
  '.hzLbl{display:inline-block;vertical-align:top;color:#9fd3e6;font:700 12px Nunito,sans-serif;margin:24px 6px 0 8px}';

function mk(tag, cls, txt, parent){ var e = document.createElement(tag); if(cls) e.className = cls; if(txt) e.textContent = txt; if(tag === 'button') e.type = 'button'; if(parent) parent.appendChild(e); return e; }
function tap(e, fn){ e.addEventListener('click', function(ev){ ev.stopPropagation(); try{ Audio_.blip(700); }catch(x){} fn(); }); }
function ensureDom(){
  if(el.layer) return;
  var st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
  var L = el.layer = mk('div', 'layer'); L.id = 'lHouse';
  var W = mk('div', '', '', L); W.id = 'hzWrap';
  var top = mk('div', '', '', W); top.id = 'hzTop';
  el.title = mk('div', '', '', top); el.title.id = 'hzTitle';
  el.tabs = mk('div', '', '', top); el.tabs.id = 'hzTabs';
  el.undo = mk('button', 'hzb', '↩ Undo', top); tap(el.undo, undo);
  var rl = mk('button', 'hzb big', '⟲ Turn', top); tap(rl, function(){ S.rot = (S.rot + 1) % 4; render(); });
  var cl = mk('button', 'hzb big gold', '✓ Done', top); tap(cl, close);
  var stage = mk('div', '', '', W); stage.id = 'hzStage';
  cv = mk('canvas', '', '', stage); cv.id = 'hzCv';
  el.hint = mk('div', '', '', stage); el.hint.id = 'hzHint';
  var bar = el.bar = mk('div', '', '', W); bar.id = 'hzBar';
  el.row1 = mk('div', 'hzRow', '', bar); el.row2 = mk('div', 'hzRow', '', bar); el.row2.id = 'hzRow2';
  document.body.appendChild(L);
  g = cv.getContext('2d');
  var opt = {passive:false};
  cv.addEventListener('pointerdown', down, opt); cv.addEventListener('pointermove', move, opt);
  cv.addEventListener('pointerup', up, opt); cv.addEventListener('pointercancel', up, opt);
  window.addEventListener('resize', function(){ if(isOpen()) setTimeout(size, 60); });
  window.addEventListener('orientationchange', function(){ if(isOpen()) setTimeout(size, 300); });
}
function isOpen(){ return el.layer && el.layer.classList.contains('on'); }
function size(){
  var r = cv.parentNode.getBoundingClientRect();
  CW = Math.max(200, Math.round(r.width)); CH = Math.max(160, Math.round(r.height));
  DPR = window.LEGACY ? 1 : Math.min(window.devicePixelRatio || 1, 2);
  cv.width = CW*DPR; cv.height = CH*DPR;
  render();
}
function hint(t){ el.hint.innerHTML = ''; if(t) mk('span', '', t, el.hint); }

function setMode(m){ S.mode = m; S.drag = null;
  if(m === 'build') S.tool = {t:'room', type:'living'};
  else if(m === 'decor') S.tool = {t:'move'};
  else S.tool = {t:'none'};
  ui(); render(); }
function setTool(t){ S.tool = t; ui(); render(); }
function ui(){ uiBuild(); fitStage(); }
/* the bar along the bottom changes height with the mode, so the drawing area does too */
function fitStage(){ var r = cv.parentNode.getBoundingClientRect(); if(Math.abs(r.width - CW) > 1 || Math.abs(r.height - CH) > 1) size(); }
function uiBuild(){
  el.title.textContent = '🏡 ' + title(S.id);
  el.tabs.innerHTML = ''; el.row1.innerHTML = ''; el.row2.innerHTML = '';
  var tabs = S.edit ? [['build', '🔨 Build'], ['decor', '🛋️ Decorate'], ['out', '🏡 Outside']] : [['decor', '👀 Inside'], ['out', '🏡 Outside']];
  tabs.forEach(function(t){ var b = mk('button', 'hzb big' + (S.mode === t[0] ? ' sel' : ''), t[1], el.tabs); tap(b, function(){ setMode(t[0]); }); });
  el.undo.style.display = S.edit ? '' : 'none'; el.undo.disabled = !S.hist.length;
  el.bar.style.display = S.edit ? '' : 'none';
  if(!S.edit){ hint('You are visiting. Only the owner can change this house.'); return; }
  var T = S.tool, sel = function(on){ return on ? ' sel' : ''; };
  var item = function(row, cvs, label, on, fn){ var b = mk('button', 'hzb hzi' + sel(on), '', row); if(cvs) b.appendChild(cvs); b.appendChild(document.createTextNode(label)); tap(b, fn); return b; };
  if(S.mode === 'build'){
    ROOMS.forEach(function(d){ var b = mk('button', 'hzb big' + sel(T.t === 'room' && T.type === d.t), d.ic + ' ' + d.name, el.row2); tap(b, function(){ setTool({t:'room', type:d.t}); }); });
    mk('span', 'hzSep', '', el.row2);
    [['erase', '🧽 Take away'], ['door', '🚪 Front door'], ['chim', '🧱 Chimney']].forEach(function(x){ var b = mk('button', 'hzb big' + sel(T.t === x[0]), x[1], el.row2); tap(b, function(){ setTool({t:x[0]}); }); });
    hint(T.t === 'room' ? 'Drag on the lawn to build a ' + roomDef(T.type).name.toLowerCase() + '.' : T.t === 'erase' ? 'Drag over floor to take it away.' :
         T.t === 'door' ? 'Tap a square at the edge of the house for the front door.' : 'Tap a room to put a chimney on the roof. Tap again to take it off.');
  } else if(S.mode === 'decor'){
    [['move', '✋ Move and turn'], ['trash', '🗑️ Take out']].forEach(function(x){ var b = mk('button', 'hzb' + sel(T.t === x[0]), x[1], el.row1); tap(b, function(){ setTool({t:x[0]}); }); });
    mk('span', 'hzSep', '', el.row1);
    [['furn', '🛋️ Furniture'], ['rug', '🟣 Rugs'], ['pic', '🖼️ Pictures'], ['wall', '🎨 Wall colors'], ['floor', '🪵 Floors']].forEach(function(x){
      var b = mk('button', 'hzb' + sel(S.cat === x[0]), x[1], el.row1); tap(b, function(){ S.cat = x[0]; if(S.tool.t !== 'move' && S.tool.t !== 'trash') S.tool = {t:'move'}; ui(); }); });
    if(S.cat === 'furn') FURN.forEach(function(d){ item(el.row2, furnIcon(d), d.name, T.t === 'furn' && T.k === d.k, function(){ setTool({t:'furn', k:d.k}); }); });
    if(S.cat === 'rug') RUGS.forEach(function(d){ item(el.row2, rugIcon(d), d.name, T.t === 'rug' && T.k === d.k, function(){ setTool({t:'rug', k:d.k}); }); });
    if(S.cat === 'pic') PICS.forEach(function(d){ item(el.row2, picIcon(d), 'Picture', T.t === 'pic' && T.k === d.k, function(){ setTool({t:'pic', k:d.k}); }); });
    if(S.cat === 'wall') WALLS.forEach(function(c, i){ item(el.row2, swatch(c), 'Paint', T.t === 'wall' && T.i === i, function(){ setTool({t:'wall', i:i}); }); });
    if(S.cat === 'floor') FLOORS.forEach(function(f, i){ item(el.row2, floorIcon(f), f.name, T.t === 'floor' && T.i === i, function(){ setTool({t:'floor', i:i}); }); });
    hint(T.t === 'move' ? 'Drag something to move it. Tap it to turn it.' : T.t === 'trash' ? 'Tap something to take it out.' :
         T.t === 'furn' || T.t === 'rug' ? 'Tap the floor where it should go.' : T.t === 'pic' ? 'Tap a back wall to hang it there.' :
         T.t === 'wall' ? 'Tap a room to paint its walls.' : 'Tap a room to change its floor.');
  } else {
    mk('span', 'hzLbl', 'Walls', el.row2);
    EXT.forEach(function(c, i){ item(el.row2, swatch(c), 'Paint', S.H.ext === i, function(){ snap(); S.H.ext = i; commit(); ui(); render(); }); });
    mk('span', 'hzLbl', 'Roof', el.row2);
    ROOFS.forEach(function(c, i){ item(el.row2, swatch(c, 1), 'Roof', S.H.roof === i, function(){ snap(); S.H.roof = i; commit(); ui(); render(); }); });
    hint('This is your house from the street. Pick its colors.');
  }
}

/* ---------------- touching the house ---------------- */
function snap(){ S.hist.push(JSON.stringify(S.H)); if(S.hist.length > 25) S.hist.shift(); if(el.undo) el.undo.disabled = false; }
function undo(){ if(!S.edit || !S.hist.length) return; S.H = JSON.parse(S.hist.pop()); commit(); ui(); render(); }
function nope(msg){ try{ Audio_.nope(); }catch(e){} if(msg) try{ toast(msg); }catch(e){} }
function pop(){ try{ Audio_.pop(); }catch(e){} }
function at(e, lift){
  var r = cv.getBoundingClientRect(), dx = (e.clientX - r.left - cam.ox)/cam.hw, dy = (e.clientY - r.top - cam.oy + (lift || 0)*cam.zs)/cam.hh;
  var u = (dx + dy)/2, v = (dy - dx)/2, w = toWorld(u, v, S.rot);
  return {x:Math.floor(w[0]), y:Math.floor(w[1]), fx:w[0], fy:w[1], u:u, v:v};
}
function inLot(p){ return p.x >= 0 && p.y >= 0 && p.x < GW && p.y < GH; }
function itemAt(x, y){ for(var i=S.H.items.length - 1; i>=0; i--){ var it = S.H.items[i], f = footprint(byK(FURN, it.k), it.r); if(x >= it.x && y >= it.y && x < it.x + f[0] && y < it.y + f[1]) return it; } return null; }
function rugAt(x, y){ for(var i=S.H.rugs.length - 1; i>=0; i--){ var r = S.H.rugs[i], d = byK(RUGS, r.k); if(x >= r.x && y >= r.y && x < r.x + d.w && y < r.y + d.d) return r; } return null; }
function rugFits(d, x, y){ for(var j=0; j<d.d; j++) for(var i=0; i<d.w; i++) if(!room(S.H, x + i, y + j)) return false; return true; }
function paintCell(p){
  var H = S.H, D = S.drag; if(!inLot(p)) return;
  var i = p.y*GW + p.x;
  if(S.tool.t === 'erase'){ if(H.cells[i]){ H.cells[i] = 0; D.changed = 1; } return; }
  if(!D.rid){
    var cur = H.cells[i], rid = 0, s;
    if(cur && H.rooms[cur].t === S.tool.type) rid = cur;
    for(s=0; s<4 && !rid; s++){ var n = room(H, p.x + DX[s], p.y + DY[s]); if(n && H.rooms[n].t === S.tool.type) rid = n; }
    if(!rid){ var d = roomDef(S.tool.type); rid = H.next++; H.rooms[rid] = {t:d.t, wall:d.wall, floor:d.floor}; }
    D.rid = rid;
  }
  if(H.cells[i] !== D.rid){ H.cells[i] = D.rid; D.changed = 1; }
}
function down(e){
  e.preventDefault(); if(!S.edit || S.mode === 'out' || S.drag) return;
  try{ cv.setPointerCapture(e.pointerId); }catch(x){}
  var p = at(e), H = S.H, T = S.tool;
  if(S.mode === 'build'){
    if(T.t === 'room' || T.t === 'erase'){ snap(); S.drag = {paint:1, last:p, changed:0}; paintCell(p); render(); }
    else if(T.t === 'chim'){
      if(!room(H, p.x, p.y)) return nope('Tap a room first.');
      snap(); var had = -1; H.chim.forEach(function(c, i){ if(c[0] === p.x && c[1] === p.y) had = i; });
      if(had >= 0) H.chim.splice(had, 1); else H.chim.push([p.x, p.y]);
      pop(); commit(); render(); toast(had >= 0 ? 'Chimney gone.' : 'Chimney on the roof! Look at it in Outside.');
    } else if(T.t === 'door'){
      var best = -1, bd = 9, s, ds = [p.fy - p.y, p.x + 1 - p.fx, p.y + 1 - p.fy, p.fx - p.x];
      for(s=0; s<4; s++) if(outerAt(H, p.x, p.y, s) && ds[s] < bd){ bd = ds[s]; best = s; }
      if(best < 0) return nope('Tap a square at the edge of the house.');
      snap(); H.door = {x:p.x, y:p.y, s:best}; pop(); commit(); render();
    }
    return;
  }
  if(T.t === 'move'){
    var it = itemAt(p.x, p.y), rug = it ? null : rugAt(p.x, p.y), o = it || rug;
    if(o){ S.drag = {it:o, rug:!!rug, ox:p.x - o.x, oy:p.y - o.y, sx:o.x, sy:o.y, moved:0, snapped:0}; render(); }
  } else if(T.t === 'trash'){
    var a = itemAt(p.x, p.y), i2;
    if(a){ snap(); H.items.splice(H.items.indexOf(a), 1); }
    else { var pi = -1; H.pics.forEach(function(q, i){ if(q.x === p.x && q.y === p.y) pi = i; });
      if(pi >= 0){ snap(); H.pics.splice(pi, 1); }
      else { var rg = rugAt(p.x, p.y); if(!rg) return; snap(); H.rugs.splice(H.rugs.indexOf(rg), 1); } }
    pop(); commit(); render();
  } else if(T.t === 'furn'){
    var def = byK(FURN, T.k), f = footprint(def, 0), ok = null;
    for(var j=0; j<f[1] && !ok; j++) for(i2=0; i2<f[0] && !ok; i2++) if(fits(H, def, p.x - i2, p.y - j, 0, null)) ok = [p.x - i2, p.y - j];
    if(!ok) return nope(room(H, p.x, p.y) ? 'It does not fit there. Try another spot.' : 'Tap on a floor.');
    snap(); H.items.push({k:T.k, x:ok[0], y:ok[1], r:0}); pop(); commit(); render();
  } else if(T.t === 'rug'){
    var rd = byK(RUGS, T.k), rok = null;
    for(var jj=0; jj<rd.d && !rok; jj++) for(var ii=0; ii<rd.w && !rok; ii++) if(rugFits(rd, p.x - ii, p.y - jj)) rok = [p.x - ii, p.y - jj];
    if(!rok) return nope('The rug needs more floor.');
    snap(); H.rugs.push({k:T.k, x:rok[0], y:rok[1]}); pop(); commit(); render();
  } else if(T.t === 'pic'){
    // she may tap the wall itself (try that first, as a point partway up the wall) or the floor in front of it
    var sw = ROT_W[S.rot], sn = ROT_N[S.rot], hit = null;
    [at(e, .78), p].forEach(function(q){
      if(hit || !room(H, q.x, q.y)) return;
      var fu = q.u - Math.floor(q.u), fv = q.v - Math.floor(q.v);
      var cand = (fu < fv ? [sw, sn] : [sn, sw]).filter(function(s2){ return wallAt(H, q.x, q.y, s2) && !(H.door && H.door.x === q.x && H.door.y === q.y && H.door.s === s2); });
      if(cand.length) hit = {x:q.x, y:q.y, s:cand[0]};
    });
    if(!hit) return nope('Tap a back wall, or the floor right next to one.');
    snap(); H.pics = H.pics.filter(function(q){ return !(q.x === hit.x && q.y === hit.y && q.s === hit.s); });
    H.pics.push({k:T.k, x:hit.x, y:hit.y, s:hit.s}); pop(); commit(); render();
  } else if(T.t === 'wall' || T.t === 'floor'){
    var rid = room(H, p.x, p.y); if(!rid) return nope('Tap a room.');
    snap(); H.rooms[rid][T.t] = T.i; pop(); commit(); render();
  }
}
function move(e){
  var D = S.drag; if(!D) return; e.preventDefault();
  var p = at(e);
  if(D.paint){
    var n = Math.max(1, Math.ceil(Math.max(Math.abs(p.fx - D.last.fx), Math.abs(p.fy - D.last.fy))*2));
    for(var i=1; i<=n; i++){ var fx = D.last.fx + (p.fx - D.last.fx)*i/n, fy = D.last.fy + (p.fy - D.last.fy)*i/n; paintCell({x:Math.floor(fx), y:Math.floor(fy)}); }
    D.last = p; render(); return;
  }
  var nx = p.x - D.ox, ny = p.y - D.oy, it = D.it;
  if(nx === it.x && ny === it.y) return;
  var ok = D.rug ? rugFits(byK(RUGS, it.k), nx, ny) : fits(S.H, byK(FURN, it.k), nx, ny, it.r, it);
  if(!ok) return;
  if(!D.snapped){ var x0 = it.x, y0 = it.y; it.x = D.sx; it.y = D.sy; snap(); it.x = x0; it.y = y0; D.snapped = 1; }
  it.x = nx; it.y = ny; D.moved = 1; render();
}
function up(e){
  var D = S.drag; if(!D) return; S.drag = null;
  if(D.paint){ if(D.changed){ pop(); commit(); } else S.hist.pop(); ui(); render(); return; }
  if(D.moved){ pop(); commit(); ui(); render(); return; }
  if(D.rug){ render(); return; }
  // a tap: turn it a quarter turn, nudging it if it needs room
  var it = D.it, def = byK(FURN, it.k), nr = (it.r + 1) % 4, tries = [[0, 0], [-1, 0], [0, -1], [1, 0], [0, 1], [-1, -1]], done = 0;
  for(var i=0; i<tries.length && !done; i++) if(fits(S.H, def, it.x + tries[i][0], it.y + tries[i][1], nr, it)){ snap(); it.x += tries[i][0]; it.y += tries[i][1]; it.r = nr; done = 1; }
  if(done){ pop(); commit(); ui(); } else nope('No room to turn it here.');
  render();
}

/* ---------------- opening and closing ---------------- */
function open(id){
  try{
    if(KIDS.indexOf(id) < 0) id = KIDS[0];
    ensureDom();
    S.id = id; S.edit = (id === P); S.H = readHouse(id); S.hist = []; S.drag = null; S.rot = 0; S.cat = 'furn';
    if(!S.edit) S.H = JSON.parse(JSON.stringify(S.H));
    S.raw = JSON.stringify(S.H);
    S.mode = 'decor'; S.tool = S.edit ? {t:'move'} : {t:'none'};
    openLayer('lHouse'); ui(); size(); setTimeout(size, 120);
    clearInterval(S.watch);
    if(!S.edit) S.watch = setInterval(function(){                     // watch the owner's changes arrive from her iPad
      if(!isOpen()){ clearInterval(S.watch); return; }
      var h = readHouse(S.id), raw = JSON.stringify(h); if(raw !== S.raw){ S.raw = raw; S.H = JSON.parse(raw); render(); }
    }, 3000);
  }catch(e){ console.error('house', e); try{ toast('The house would not open. Try again.'); }catch(x){} }
}
function close(){
  clearInterval(S.watch); S.drag = null;
  try{ openLayer(null); if(typeof scene !== 'undefined' && scene === 'drive' && dv2){ showHud(true); document.getElementById('boatBar').dataset.key = ''; driveBar(); } }catch(e){}
}
function pick(){
  var opt = function(id){ return {ic:id === P ? '🏡' : '🏠', label:title(id), desc:id === P ? 'Build rooms and decorate' : 'Go and visit', fn:function(){ open(id); }}; };
  var a = KIDS.indexOf(P) >= 0 ? P : KIDS[0], b = KIDS[a === KIDS[0] ? 1 : 0];
  choose('Maple Lane', 'Whose house?', 'Each diver has her own house to build and decorate. You can visit the other one any time.', opt(a), opt(b));
}
/* the house from above, on the town map: its real shape, with its own roof colour */
function drawTop(tg, h, x, y, w, hh, z){
  try{
    var m = cachedHouse(h.kid), H = m.h, F = m.f, cs = Math.min(w/GW, hh/GH), ox = x + (w - cs*GW)/2, oy = y + (hh - cs*GH)/2, col = ROOFS[H.roof], cx, cy, i;
    tg.fillStyle = '#7cc35a'; tg.fillRect(x - 6*z, y - 6*z, w + 12*z, hh + 12*z);
    tg.fillStyle = 'rgba(0,0,0,.2)';
    for(cy=0; cy<GH; cy++) for(cx=0; cx<GW; cx++) if(room(H, cx, cy)) tg.fillRect(ox + cx*cs + 5*z, oy + cy*cs + 5*z, cs + .5, cs + .5);
    for(cy=0; cy<GH*2; cy++) for(cx=0; cx<GW*2; cx++){
      if(!room(H, cx >> 1, cy >> 1)) continue;
      var a = (F.d[cy*F.W + cx] + F.d[cy*F.W + cx + 1] + F.d[(cy + 1)*F.W + cx] + F.d[(cy + 1)*F.W + cx + 1])/4;
      tg.fillStyle = tint(col, -14 + Math.min(a, 4)*11); tg.fillRect(ox + cx*cs/2, oy + cy*cs/2, cs/2 + .6, cs/2 + .6);
    }
    tg.fillStyle = '#7a3a2a'; for(i=0; i<H.chim.length; i++) tg.fillRect(ox + (H.chim[i][0] + .3)*cs, oy + (H.chim[i][1] + .3)*cs, cs*.4, cs*.4);
    if(H.door){ tg.fillStyle = '#e8d7a8'; tg.fillRect(ox + (H.door.x + .3 + DX[H.door.s]*.7)*cs, oy + (H.door.y + .3 + DY[H.door.s]*.7)*cs, cs*.4, cs*.4); }
    var txt = '🏡 ' + title(h.kid);
    tg.font = '700 ' + Math.round(11*z + 3) + 'px Comfortaa, sans-serif'; tg.textAlign = 'center';
    var lw = tg.measureText(txt).width + 16; tg.fillStyle = 'rgba(3,24,43,.62)'; roundRect(tg, x + w/2 - lw/2, y - 14*z - 13, lw, 24, 12); tg.fill();
    tg.fillStyle = '#fff'; tg.fillText(txt, x + w/2, y - 14*z + 4);
    return true;
  }catch(e){ return false; }
}

window.House = {open:open, pick:pick, title:title, drawTop:drawTop, kids:KIDS, _s:S, _render:function(){ render(); }, _ui:function(){ ui(); }, _mode:setMode};
})();
