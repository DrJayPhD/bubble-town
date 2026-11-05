/* ==========================================================================
   COVER STUDIO
   Audio in, piano music out. Runs entirely in the browser:
     1. decode each file and resample to 22.05 kHz mono
     2. Spotify's Basic Pitch model (TensorFlow.js) finds the notes
     3. tempo from an onset envelope, key by Krumhansl–Schmuckler,
        chords by template matching per bar or half bar
     4. a piano arrangement: melody in the right hand, chords in the left
     5. engraving with VexFlow; playback, falling notes, PDF/MIDI/MusicXML
   ========================================================================== */
'use strict';
const $ = s => document.querySelector(s);
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const VF = Vex.Flow;

/* ---------------- music theory ---------------- */
const SHARP = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
const FLAT  = ['C','Db','D','Eb','E','F','Gb','G','Ab','A','Bb','B'];
const MAJ_KEY = ['C','Db','D','Eb','E','F','F#','G','Ab','A','Bb','B'];
const MIN_KEY = ['C','C#','D','Eb','E','F','F#','G','G#','A','Bb','B'];
const keyName = (t, m) => m === 'minor' ? MIN_KEY[t] + 'm' : MAJ_KEY[t];
const keyFlats = (t, m) => { const n = keyName(t, m); return /b/.test(n) || ['F','Dm','Gm','Cm','Fm'].includes(n); };
const FIFTHS = {C:0,G:1,D:2,A:3,E:4,B:5,'F#':6,F:-1,Bb:-2,Eb:-3,Ab:-4,Db:-5};
function keyFifths(t, m){ const rel = m === 'minor' ? (t + 3) % 12 : t; return FIFTHS[MAJ_KEY[rel]]; }
const QUAL = {
  maj:{iv:[0,4,7],      w:[1,.9,.8],     sym:'',     prior:0},
  min:{iv:[0,3,7],      w:[1,.9,.8],     sym:'m',    prior:0},
  7:{iv:[0,4,7,10],     w:[1,.9,.7,.6],  sym:'7',    prior:-.035},
  maj7:{iv:[0,4,7,11],  w:[1,.9,.7,.6],  sym:'maj7', prior:-.045},
  m7:{iv:[0,3,7,10],    w:[1,.9,.7,.6],  sym:'m7',   prior:-.04},
  sus4:{iv:[0,5,7],     w:[1,.9,.8],     sym:'sus4', prior:-.06},
  sus2:{iv:[0,2,7],     w:[1,.9,.8],     sym:'sus2', prior:-.06},
  dim:{iv:[0,3,6],      w:[1,.9,.8],     sym:'dim',  prior:-.07},
};
function chordName(root, q, flats){ return (flats ? FLAT : SHARP)[root] + QUAL[q].sym; }
function roman(root, q, tonic, mode){
  const d = (root - tonic + 12) % 12;
  const MAJ = ['I','♭II','II','♭III','III','IV','♯IV','V','♭VI','VI','♭VII','VII'];
  const MIN = ['I','♭II','II','III','♯III','IV','♯IV','V','VI','♯VI','VII','♯VII'];
  let r = (mode === 'minor' ? MIN : MAJ)[d];
  if(q === 'min' || q === 'm7' || q === 'dim') r = r.toLowerCase();
  if(q === 'dim') r += '°';
  if(q === '7' || q === 'm7') r += '7';
  if(q === 'maj7') r += 'maj7';
  if(q === 'sus4') r += 'sus4';
  if(q === 'sus2') r += 'sus2';
  return r;
}
function diatonic(tonic, mode){
  const set = {};
  const add = (d, q)=>{ set[((tonic + d) % 12) + q] = 1; };
  if(mode === 'minor'){ [[0,'min'],[2,'dim'],[3,'maj'],[5,'min'],[7,'min'],[7,'maj'],[8,'maj'],[10,'maj'],[0,'m7'],[5,'m7'],[7,'7'],[3,'maj7'],[8,'maj7'],[10,'7']].forEach(x=>add(x[0], x[1])); }
  else { [[0,'maj'],[2,'min'],[4,'min'],[5,'maj'],[7,'maj'],[9,'min'],[11,'dim'],[0,'maj7'],[2,'m7'],[4,'m7'],[5,'maj7'],[7,'7'],[9,'m7']].forEach(x=>add(x[0], x[1])); }
  return set;
}
const KS_MAJ = [6.35,2.23,3.48,2.33,4.38,4.09,2.52,5.19,2.39,3.66,2.29,2.88];
const KS_MIN = [6.33,2.68,3.52,5.38,2.60,3.53,2.54,4.75,3.98,2.69,3.34,3.17];
function corr(a, b){ const ma = a.reduce((x,y)=>x+y,0)/12, mb = b.reduce((x,y)=>x+y,0)/12; let n=0, da=0, db=0;
  for(let i=0;i<12;i++){ n += (a[i]-ma)*(b[i]-mb); da += (a[i]-ma)**2; db += (b[i]-mb)**2; } return n / Math.sqrt(da*db || 1); }
function detectKey(notes){
  const pc = new Array(12).fill(0);
  for(const n of notes) pc[n.p % 12] += n.d * (0.5 + n.a);
  let best = {r:-2, t:0, m:'major'};
  for(let t=0;t<12;t++) for(const [m, prof] of [['major', KS_MAJ], ['minor', KS_MIN]]){
    const rot = prof.map((_, i)=>prof[(i - t + 12) % 12]);
    const r = corr(pc, rot); if(r > best.r) best = {r, t, m};
  }
  return best;
}
const spell = (p, flats)=>{ const n = (flats ? FLAT : SHARP)[p % 12]; return {step:n[0], alter:n.length > 1 ? (n[1] === '#' ? 1 : -1) : 0, oct:Math.floor(p / 12) - 1, vf:n.toLowerCase() + '/' + (Math.floor(p / 12) - 1)}; };

/* ---------------- state + storage ---------------- */
let files = [];            // {file|buffer, name, role}
let proj = null;           // the current song
let origAudio = null;      // decoded AudioBuffer of the full mix (not saved)
const LS = 'coverstudio.';
function saveProj(){
  if(!proj) return;
  try{
    localStorage.setItem(LS + 'p.' + proj.id, JSON.stringify(proj));
    const list = JSON.parse(localStorage.getItem(LS + 'list') || '[]').filter(x=>x.id !== proj.id);
    list.unshift({id:proj.id, title:proj.title, date:Date.now()});
    localStorage.setItem(LS + 'list', JSON.stringify(list.slice(0, 40)));
  }catch(e){ console.warn('save failed', e); }
}
function listProjects(){
  const box = $('#projects');
  let list = [];
  try{ list = JSON.parse(localStorage.getItem(LS + 'list') || '[]'); }catch(e){}
  if(!list.length) return;
  box.innerHTML = '';
  for(const it of list){
    const d = document.createElement('div'); d.className = 'proj';
    d.innerHTML = `<span><b></b><br><span class="note">${new Date(it.date).toLocaleDateString()}</span></span>`;
    d.querySelector('b').textContent = it.title;
    const open = document.createElement('button'); open.className = 'btn sm'; open.textContent = 'Open';
    open.onclick = ()=>{ try{ proj = JSON.parse(localStorage.getItem(LS + 'p.' + it.id)); origAudio = null; showScore(); }catch(e){ alert('Could not open that song.'); } };
    const del = document.createElement('button'); del.className = 'btn sm'; del.textContent = 'Delete';
    del.onclick = ()=>{ if(!confirm('Delete “' + it.title + '”?')) return;
      localStorage.removeItem(LS + 'p.' + it.id);
      localStorage.setItem(LS + 'list', JSON.stringify(list.filter(x=>x.id !== it.id))); listProjects(); if(list.length === 1) box.innerHTML = '<p class="note">No songs yet.</p>'; };
    const r = document.createElement('span'); r.className = 'row'; r.append(open, del);
    d.append(r); box.append(d);
  }
}

/* ---------------- import ---------------- */
const ROLES = [['mix','Whole song'],['vocals','Vocals (melody)'],['bass','Bass'],['harmony','Piano / other instruments'],['drums','Drums (ignored)']];
function guessRole(name){
  if(/voc|vox|sing|lead/i.test(name)) return 'vocals';
  if(/bass/i.test(name)) return 'bass';
  if(/drum|perc|kick|snare/i.test(name)) return 'drums';
  if(/piano|key|synth|guitar|inst|other|accomp|string|pad/i.test(name)) return 'harmony';
  return 'mix';
}
function drawFiles(){
  const box = $('#files'); box.innerHTML = '';
  files.forEach((f, i)=>{
    const d = document.createElement('div'); d.className = 'file';
    const nm = document.createElement('span'); nm.className = 'nm'; nm.textContent = f.name;
    const sel = document.createElement('select'); sel.setAttribute('aria-label', 'What is in ' + f.name);
    for(const [v, l] of ROLES){ const o = document.createElement('option'); o.value = v; o.textContent = l; if(v === f.role) o.selected = true; sel.append(o); }
    sel.onchange = ()=>{ f.role = sel.value; };
    const x = document.createElement('button'); x.className = 'btn sm'; x.textContent = 'Remove';
    x.onclick = ()=>{ files.splice(i, 1); drawFiles(); };
    d.append(nm, sel, x); box.append(d);
  });
  $('#goBtn').disabled = !files.some(f=>f.role !== 'drums');
}
function addFiles(list){
  for(const f of list) files.push({file:f, name:f.name, role:guessRole(f.name)});
  if(files.length > 1 && !files.some(f=>f.role === 'mix') && !files.some(f=>f.role === 'harmony' || f.role === 'bass')) files[0].role = 'mix';
  drawFiles();
}
$('#fileIn').onchange = e=>{ addFiles(e.target.files); e.target.value = ''; };
const drop = $('#drop');
['dragover','dragenter'].forEach(ev=>drop.addEventListener(ev, e=>{ e.preventDefault(); drop.classList.add('over'); }));
['dragleave','drop'].forEach(ev=>drop.addEventListener(ev, e=>{ e.preventDefault(); drop.classList.remove('over'); }));
drop.addEventListener('drop', e=>addFiles(e.dataTransfer.files));
$('#demoBtn').onclick = ()=>{ files = [{buffer:demoSong(), name:'Demo: Ode to Joy (synthesised)', role:'mix'}]; drawFiles(); };
$('#goBtn').onclick = ()=>analyse().catch(err=>{ console.error(err); progress(0, 'Something went wrong: ' + err.message); $('#goBtn').disabled = false; });

/* ---------------- audio ---------------- */
let actx = null;
function ac(){ if(!actx) actx = new (window.AudioContext || window.webkitAudioContext)(); if(actx.state === 'suspended') actx.resume(); return actx; }
async function decode(f){
  if(f.buffer) return f.buffer;
  const data = await f.file.arrayBuffer();
  return await new Promise((res, rej)=>ac().decodeAudioData(data, res, rej));
}
async function toMono22k(buf){
  const len = Math.ceil(buf.duration * 22050);
  const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  const oc = new OAC(1, len, 22050);
  const src = oc.createBufferSource(); src.buffer = buf; src.connect(oc.destination); src.start();
  const out = await oc.startRendering();
  return out.getChannelData(0);
}
function progress(p, txt){ $('#progBox').hidden = false; $('#progBar').style.width = Math.round(p*100) + '%'; $('#progTxt').textContent = txt; }

let bpModel = null;
async function transcribe(mono, label, from, span){
  if(!window.BP) throw new Error('the note finder has not loaded yet; wait a moment and try again');
  if(!bpModel){
    try{ await BP.tf.setBackend('webgl'); }catch(e){ await BP.tf.setBackend('cpu'); }
    bpModel = new BP.BasicPitch(BP.tf.loadGraphModel('model/model.json'));
  }
  const frames = [], onsets = [], contours = [];
  await bpModel.evaluateModel(mono, (f, o, c)=>{ frames.push(...f); onsets.push(...o); contours.push(...c); },
    p=>progress(from + p*span, `Listening for notes in ${label}… ${Math.round(p*100)}%`));
  const ev = BP.noteFramesToTime(BP.addPitchBendsToNoteEvents(contours,
    BP.outputToNotesPoly(frames, onsets, 0.5, 0.3, 8, true, null, null, true)));
  return ev.map(n=>({p:n.pitchMidi, t:n.startTimeSeconds, d:n.durationSeconds, a:n.amplitude}));
}

async function analyse(){
  $('#goBtn').disabled = true;
  ac();
  const use = files.filter(f=>f.role !== 'drums');
  const notes = {mix:[], vocals:[], bass:[], harmony:[]};
  let mixMono = null, mixBuf = null, durMax = 0;
  for(let i=0; i<use.length; i++){
    const f = use[i];
    progress(i / use.length, `Opening ${f.name}…`);
    const buf = await decode(f);
    const mono = await toMono22k(buf);
    durMax = Math.max(durMax, buf.duration);
    if(f.role === 'mix' || !mixMono){ mixMono = mono; mixBuf = buf; }
    const ns = await transcribe(mono, f.name, i / use.length, 1 / use.length);
    notes[f.role].push(...ns);
  }
  progress(1, 'Finding the beat, key and chords…');
  await new Promise(r=>setTimeout(r, 30));
  origAudio = mixBuf;
  const all = [].concat(notes.mix, notes.vocals, notes.bass, notes.harmony);
  const tempo = detectTempo(all, notes.bass.length ? notes.bass : all.filter(n=>n.p < 55), mixMono);
  const key = detectKey(notes.harmony.length || notes.bass.length ? [].concat(notes.harmony, notes.bass, notes.mix) : all);
  const title = (files[0].name || 'My song').replace(/\.[a-z0-9]+$/i, '').replace(/[_-]+/g, ' ').replace(/\b(vocals?|bass|drums|other|instrumental|stem)\b/ig, '').trim() || 'My song';
  proj = {
    id:Date.now().toString(36), title, created:Date.now(), dur:durMax,
    bpm:tempo.bpm, offset:tempo.offset, tsNum:4, tsDen:4, tonic:key.t, mode:key.m, outTonic:key.t,
    level:'medium', crate:'bar', moct:0, showChords:true, showRoman:false, chordEdits:{},
    src:{
      melody: notes.vocals.length ? 'vocals' : 'mix',
      vocals:pack(notes.vocals), mix:pack(notes.mix), bass:pack(notes.bass), harmony:pack(notes.harmony),
    },
    detected:{bpm:tempo.bpm, key:keyName(key.t, key.m), sources:use.map(f=>f.role)},
  };
  saveProj();
  $('#progBox').hidden = true; $('#goBtn').disabled = false;
  showScore();
}
// compact note storage: [pitch, start ms, duration ms, amplitude %]
const pack = ns => ns.map(n=>[n.p, Math.round(n.t*1000), Math.round(n.d*1000), Math.round(n.a*100)]);
const unpack = ns => (ns || []).map(x=>({p:x[0], t:x[1]/1000, d:x[2]/1000, a:x[3]/100}));

/* ---------------- tempo ---------------- */
function detectTempo(notes, bassNotes, mono){
  const R = 100, len = Math.ceil((Math.max(1, ...notes.map(n=>n.t + n.d)) + 1) * R);
  const env = new Float32Array(len);
  for(const n of notes){ const i = Math.round(n.t * R); if(i < len) env[i] += 0.3 + n.a; }
  if(mono){                                   // energy flux from the audio itself catches drums too
    const hop = Math.round(22050 / R), w = 1024; let prev = 0; const flux = new Float32Array(len); let mx = 0;
    for(let i=0; i<len && i*hop + w < mono.length; i++){
      let e = 0; for(let k=0; k<w; k+=2){ const v = mono[i*hop + k]; e += v*v; }
      e = Math.log(1e-6 + e); const d = Math.max(0, e - prev); prev = e; flux[i] = d; if(d > mx) mx = d;
    }
    let me = 0; for(const v of env) me = Math.max(me, v);
    if(mx > 0) for(let i=0; i<len; i++) env[i] = env[i] / (me || 1) + flux[i] / mx;
  }
  const sm = new Float32Array(len);                // smooth a little
  for(let i=0; i<len; i++){ let s = 0; for(let k=-2; k<=2; k++){ const j = i + k; if(j >= 0 && j < len) s += env[j] * (3 - Math.abs(k)); } sm[i] = s; }
  let best = 0, bestL = 55;
  const score = L=>{ let s = 0; const Li = Math.floor(L), fr = L - Li; for(let i=0; i + Li + 1 < len; i++) s += sm[i] * (sm[i + Li]*(1 - fr) + sm[i + Li + 1]*fr); return s; };
  for(let L=27; L<=110; L+=0.25){
    const prior = Math.exp(-0.5 * Math.pow(Math.log2(L / 52) / 0.9, 2));
    const s = score(L) * (0.55 + prior);
    if(s > best){ best = s; bestL = L; }
  }
  const bpm = Math.round(60 * R / bestL * 2) / 2;
  // phase: where do beats line up best?
  const L = 60 * R / bpm; let bp = 0, bo = 0;
  for(let o=0; o<L; o+=0.5){ let s = 0; for(let x=o; x<len; x+=L) s += sm[Math.round(x)] || 0; if(s > bp){ bp = s; bo = o; } }
  // which beat is the downbeat? the one where bass notes land most
  let bd = 0, bdS = -1;
  for(let k=0; k<4; k++){
    let s = 0;
    for(const n of bassNotes){ const b = (n.t * R - bo) / L; const near = Math.abs(b - Math.round(b)) < .2; if(near && ((Math.round(b) - k) % 4 + 4) % 4 === 0) s += n.d * (0.5 + n.a); }
    if(s > bdS){ bdS = s; bd = k; }
  }
  let offset = (bo + bd*L) / R;
  const first = Math.min(...notes.map(n=>n.t));
  const bar = 4 * 60 / bpm;
  while(offset - bar > first - 0.15) offset -= bar;     // let a pickup note sit before bar 1
  while(offset > first + bar) offset -= bar;
  return {bpm, offset:Math.round(offset*100)/100};
}

/* ---------------- arrangement ---------------- */
function geom(P){
  const quarter = P.tsDen === 8 ? (60 / P.bpm) / 1.5 : 60 / P.bpm;   // 6/8 counts dotted quarters
  const barQ = P.tsNum * 4 / P.tsDen;
  return {quarter, barQ, units:Math.round(barQ * 4)};
}
const toQ = (t, P, G)=>(t - P.offset) / G.quarter;

// the most salient single line, frame by frame: the melody
function melodyLine(notes, fromVocals){
  if(!notes.length) return [];
  const step = 0.02, end = Math.max(...notes.map(n=>n.t + n.d));
  const sorted = notes.map((n, i)=>Object.assign({id:i}, n)).sort((a, b)=>a.t - b.t);
  let maxA = 0; for(const n of sorted) maxA = Math.max(maxA, n.a);
  const out = []; let cur = null, j = 0; const active = [];
  for(let t=0; t<=end; t+=step){
    while(j < sorted.length && sorted[j].t <= t){ active.push(sorted[j]); j++; }
    for(let k=active.length-1; k>=0; k--) if(active[k].t + active[k].d < t) active.splice(k, 1);
    let pick = null, ps = -1;
    for(const n of active){
      if(!fromVocals && (n.p < 60 || n.a < maxA*.35)) continue;   // from a full mix, only strong upper notes can be the tune
      // an overtone of a stronger note an octave, twelfth or two octaves below is not the melody
      if(active.some(m=>m !== n && [12, 19, 24].indexOf(n.p - m.p) >= 0 && Math.abs(m.t - n.t) < 0.06 && m.a >= n.a*1.4)) continue;
      const fresh = t - n.t < 0.12 ? 0.6 : 0;          // a newly struck note beats one still ringing
      const s = (fromVocals ? n.a : n.a + (n.p - 55) * 0.02) + fresh;
      if(s > ps){ ps = s; pick = n; }
    }
    if(pick && cur && cur.id === pick.id){ cur.end = t + step; }
    else { if(cur) out.push(cur); cur = pick ? {id:pick.id, p:pick.p, t, end:t + step, a:pick.a, raw:pick.t} : null; }
  }
  if(cur) out.push(cur);
  let ln = out.filter(n=>n.end - n.t >= 0.06);
  // a short blip an octave away from its neighbour is an overtone: fold it back
  for(let i=1; i<ln.length; i++){
    const n = ln[i], pr = ln[i - 1], nx = ln[i + 1];
    if(n.end - n.t < 0.4 && (n.p - pr.p === 12 || (nx && n.p - nx.p === 12 && Math.abs(nx.t - n.end) < .05))) n.p = n.p - pr.p === 12 ? pr.p : nx.p;
  }
  // fragments of one sung or played note get rejoined
  const joined = [];
  for(const n of ln){
    const pr = joined[joined.length - 1];
    // same pitch again: a fresh attack is a repeated note; a note that began earlier and was hidden is a fragment
    const fresh = n.raw !== undefined && n.raw > n.t - 0.05;
    if(pr && pr.p === n.p && n.t - pr.end < 0.04 && (!fresh || pr.end - pr.t < 0.1)) pr.end = Math.max(pr.end, n.end);
    else joined.push(Object.assign({}, n));
  }
  return joined.filter(n=>n.end - n.t >= 0.08).map(n=>({p:n.p, t:n.t, d:n.end - n.t, a:n.a}));
}
function chordsFor(P, G, harm, bass){
  const segQ = P.crate === 'half' && G.barQ % 2 === 0 ? G.barQ / 2 : G.barQ;
  const lastQ = Math.max(G.barQ, ...harm.concat(bass).map(n=>toQ(n.t + n.d, P, G)));
  const nSeg = Math.ceil(lastQ / segQ);
  const dia = diatonic(P.tonic, P.mode);
  const segs = [];
  let prev = null;
  for(let s=0; s<nSeg; s++){
    const q0 = s*segQ, q1 = q0 + segQ, pcp = new Array(12).fill(0), bpc = new Array(12).fill(0);
    let tot = 0, btot = 0;
    for(const n of harm.concat(bass)){
      const a = toQ(n.t, P, G), b = toQ(n.t + n.d, P, G), ov = Math.min(b, q1) - Math.max(a, q0);
      if(ov <= 0) continue;
      const w = ov * (0.3 + n.a); pcp[n.p % 12] += w; tot += w;
      if(n.p < 52){ bpc[n.p % 12] += w; btot += w; }
    }
    let best = null;
    if(tot > 0.05){
      const norm = Math.sqrt(pcp.reduce((x, y)=>x + y*y, 0));
      for(let r=0; r<12; r++) for(const q in QUAL){
        const Q = QUAL[q], tv = new Array(12).fill(0);
        Q.iv.forEach((iv, k)=>{ tv[(r + iv) % 12] = Q.w[k]; });
        const tn = Math.sqrt(tv.reduce((x, y)=>x + y*y, 0));
        let dot = 0; for(let k=0; k<12; k++) dot += pcp[k]*tv[k];
        let sc = dot / (norm*tn) + Q.prior;
        if(btot > 0) sc += 0.18 * bpc[r] / btot;
        if(dia[r + q]) sc += 0.07;
        if(prev && prev.root === r && prev.q === q) sc += 0.03;          // chords tend to last
        if(!best || sc > best.sc) best = {root:r, q, sc};
      }
    }
    const c = best ? {root:best.root, q:best.q} : prev ? {root:prev.root, q:prev.q} : {root:P.tonic, q:P.mode === 'minor' ? 'min' : 'maj'};
    const ed = P.chordEdits && P.chordEdits[s];
    const fin = ed ? {root:ed.root, q:ed.q} : c;
    segs.push({i:s, q:q0, len:segQ, root:fin.root, qual:fin.q, edited:!!ed, empty:!best});
    prev = c;
  }
  return segs;
}
function nearest(pc, around){ let p = pc; while(p < around - 6) p += 12; while(p >= around + 6) p -= 12; return p; }
function arrange(P){
  const G = geom(P);
  const S = P.src;
  const voc = unpack(S.vocals), mix = unpack(S.mix), bass = unpack(S.bass), harm = unpack(S.harmony);
  const harmSrc = harm.length || bass.length ? harm.concat(mix) : mix;
  const bassSrc = bass.length ? bass : harmSrc.filter(n=>n.p < 52);
  const segs = chordsFor(P, G, harmSrc.filter(n=>!bass.length || n.p >= 40), bassSrc);
  const grid = P.level === 'easy' || P.level === 'medium' ? 2 : 4;   // eighths read more easily; sixteenths for full and raw
  const qz = x=>Math.round(x * grid) / grid;
  const rh = [], lh = [];
  if(P.level === 'raw'){
    for(const n of [].concat(voc, mix, bass, harm)){
      const a = qz(toQ(n.t, P, G)), b = Math.max(a + 1/grid, qz(toQ(n.t + n.d, P, G)));
      (n.p >= 60 ? rh : lh).push({p:n.p, q:a, d:b - a, v:n.a});
    }
  } else {
    // melody, one note at a time
    const line = melodyLine(P.src.melody === 'vocals' ? voc : mix, P.src.melody === 'vocals');
    let mel = line.map(n=>{ const a = qz(toQ(n.t, P, G)), b = Math.max(a + 1/grid, qz(toQ(n.t + n.d, P, G))); return {p:n.p, q:a, d:b - a, v:n.a}; });
    mel.sort((x, y)=>x.q - y.q || y.v - x.v);
    const m2 = [];
    for(const n of mel){ const last = m2[m2.length - 1]; if(last && n.q === last.q) continue; if(last && last.q + last.d > n.q) last.d = n.q - last.q; m2.push(n); }
    mel = m2.filter(n=>n.d > 0 && n.q > -G.barQ);
    if(mel.length){                                    // sit the melody where a right hand reads it
      const ps = mel.map(n=>n.p).sort((a, b)=>a - b), med = ps[ps.length >> 1];
      let sh = 0; while(med + sh > 76) sh -= 12; while(med + sh < 62) sh += 12;
      sh += 12 * (P.moct || 0);
      mel.forEach(n=>{ n.p += sh; });
    }
    for(const n of mel) rh.push(n);
    for(const s of segs){
      const tones = QUAL[s.qual].iv.map(iv=>(s.root + iv) % 12);
      const root = nearest(s.root, 46);
      if(P.level === 'easy'){ lh.push({p:root, q:s.q, d:s.len, v:.7}); }
      else if(P.level === 'medium'){
        const v = tones.slice(0, 3).map(pc=>nearest(pc, 55)).sort((a, b)=>a - b);
        lh.push({p:root, q:s.q, d:s.len, v:.7, chord:v});
      } else {
        const fifth = nearest((s.root + 7) % 12, root + 7);
        const pat = [root, fifth, root + 12, fifth];       // a rolling root–fifth–octave pattern
        for(let k=0; k*0.5 < s.len; k++) lh.push({p:pat[k % 4], q:s.q + k*0.5, d:0.5, v:.6});
        // a chord tone under the melody where the chord changes
        for(const n of rh){
          if(n.q === s.q && !n.added){
            let best = null;
            for(const pc of tones){ let p = n.p - 3; while(((p % 12) + 12) % 12 !== pc && p > n.p - 10) p--; if(p > n.p - 10 && p !== n.p && (!best || p > best)) best = p; }
            if(best) n.harm = best;
          }
        }
      }
    }
    // expand medium's block chords
    for(let i=lh.length-1; i>=0; i--) if(lh[i].chord){ const c = lh[i]; c.chord.forEach(p=>{ if(p !== c.p) lh.push({p, q:c.q, d:c.d, v:c.v*.8}); }); delete c.chord; }
    for(let i=rh.length-1; i>=0; i--) if(rh[i].harm){ rh.push({p:rh[i].harm, q:rh[i].q, d:rh[i].d, v:rh[i].v*.7}); }
  }
  const T = transposeBy(P);
  const sh = n=>Object.assign({}, n, {p:n.p + T});
  const lastQ = Math.max(G.barQ, ...rh.concat(lh).map(n=>n.q + n.d), segs.length ? segs[segs.length - 1].q + segs[segs.length - 1].len : 0);
  const firstQ = Math.min(0, ...rh.concat(lh).map(n=>n.q));
  const startBar = Math.floor(firstQ / G.barQ);
  return {G, rh:rh.map(sh), lh:lh.map(sh), segs:segs.map(s=>Object.assign({}, s, {root:(s.root + T + 12) % 12})),
          bars:Math.ceil(lastQ / G.barQ) - startBar, startBar,
          tonic:(P.tonic + T + 12) % 12, mode:P.mode, flats:keyFlats((P.tonic + T + 12) % 12, P.mode)};
}
function transposeBy(P){ let d = ((P.outTonic - P.tonic) % 12 + 12) % 12; if(d > 6) d -= 12; return d; }

/* ---------------- measures into note slots ---------------- */
const DUR = [[16,'w',0],[12,'h',1],[8,'h',0],[6,'q',1],[4,'q',0],[3,'8',1],[2,'8',0],[1,'16',0]];
const ALIGN = {16:16, 12:16, 8:8, 6:4, 4:4, 3:2, 2:2, 1:1};
// split a span of sixteenths into readable note values: finish the beat first, then whole beats,
// with halves only on beats 1 and 3 and dotted values only where they read naturally
function pieces(start, len, rest){
  const out = []; let p = start, left = len;
  const ok = (u, p)=>{
    if(rest && (u === 12 || u === 6 || u === 3)) return false;
    if(u === 16 || u === 12) return p === 0;
    if(u === 8 || u === 6) return p % 8 === 0;
    if(u === 4) return p % 4 === 0;
    if(u === 3 || u === 2) return p % 2 === 0;
    return true;
  };
  while(left > 0){
    const toBeat = p % 4 ? 4 - p % 4 : 16;
    for(const [u] of DUR){
      if(u > left || !ok(u, p)) continue;
      if(p % 4 && u > toBeat) continue;          // off the beat: only fill up to the next beat
      out.push(u); p += u; left -= u; break;
    }
  }
  return out;
}
// events (quarters) → per-measure slots in sixteenths: {u, len, keys:[midi], rest, tieIn, tieOut}
function slotsFor(events, m, A, cuts){
  const U = A.G.units, m0 = m * U;
  const evs = events.map(e=>({p:e.p, a:Math.round(e.q*4), b:Math.round((e.q + e.d)*4)})).filter(e=>e.b > m0 && e.a < m0 + U);
  const starts = {};
  for(const e of evs){ const a = Math.max(e.a, m0) - m0, b = Math.min(e.b, m0 + U) - m0; const k = starts[a] || (starts[a] = {a, b:0, keys:[], tieIn:e.a < m0, tieOut:e.b > m0 + U});
    if(k.keys.indexOf(e.p) < 0) k.keys.push(e.p); k.b = Math.max(k.b, b); if(e.b > m0 + U) k.tieOut = true; }
  const groups = Object.values(starts).sort((x, y)=>x.a - y.a);
  for(let i=0; i<groups.length; i++) if(i + 1 < groups.length) groups[i].b = Math.min(groups[i].b, groups[i + 1].a);
  const raw = []; let pos = 0;
  for(const g of groups){ if(g.b <= g.a) continue; if(g.a > pos) raw.push({a:pos, b:g.a, rest:true}); raw.push(g); pos = g.b; }
  if(pos < U) raw.push({a:pos, b:U, rest:true});
  const out = [];
  for(const r of raw){
    const bounds = [r.a].concat(cuts.filter(c=>c > r.a && c < r.b)).concat([r.b]);
    for(let k=0; k<bounds.length - 1; k++){
      let p = bounds[k];
      for(const u of pieces(bounds[k], bounds[k + 1] - bounds[k], r.rest)){
        const first = p === r.a, lastPiece = p + u === r.b;
        out.push({u:p, len:u, keys:r.rest ? null : r.keys.slice().sort((x, y)=>x - y), rest:!!r.rest,
          tieIn:!r.rest && (first ? !!r.tieIn : true), tieOut:!r.rest && (lastPiece ? (r.tieOut && r.b === U) : true)});
        p += u;
      }
    }
  }
  return out;
}

/* ---------------- engraving ---------------- */
function vfNote(slot, clef, flats){
  const d = DUR.find(x=>x[0] === slot.len);
  const keys = slot.rest ? [clef === 'bass' ? 'd/3' : 'b/4'] : slot.keys.map(p=>spell(p, flats).vf);
  const n = new VF.StaveNote({keys, duration:d[1] + (slot.rest ? 'r' : ''), clef, auto_stem:true, dots:d[2]});
  if(d[2]) VF.Dot.buildAndAttach([n], {all:true});
  return n;
}
function layout(A, width, single){
  const lines = []; let line = [], w = 0;
  for(let m=0; m<A.bars; m++){
    const bar = m + A.startBar;
    const cnt = Math.max(slotsFor(A.rh, bar, A, []).length, slotsFor(A.lh, bar, A, []).length);
    const mw = Math.max(110, 34 + cnt * 30);
    const extra = line.length ? 0 : 90 + 9 * Math.abs(keyFifths(A.tonic, A.mode));
    if(!single && line.length && w + mw + extra > width){ lines.push(line); line = []; w = 0; }
    line.push({m:bar, w:mw}); w += mw + (line.length === 1 ? 90 + 9 * Math.abs(keyFifths(A.tonic, A.mode)) : 0);
  }
  if(line.length) lines.push(line);
  if(!single) for(const ln of lines){                   // stretch each line to the full width
    const used = ln.reduce((s, x)=>s + x.w, 0) + 90 + 9 * Math.abs(keyFifths(A.tonic, A.mode));
    const k = ln === lines[lines.length - 1] && used < width * .7 ? 1 : width / used;
    ln.forEach(x=>{ x.w *= k; });
  }
  return lines;
}
const SYS_H = 250;
function engrave(el, A, P, opts){
  el.innerHTML = '';
  const width = opts.width, lines = opts.lines, top = opts.top || 10;
  const H = top + lines.length * SYS_H + 20;
  const totalW = opts.single ? lines[0].reduce((s, x)=>s + x.w, 0) + 140 : width;
  const r = new VF.Renderer(el, VF.Renderer.Backends.SVG);
  r.resize(totalW + 20, H);
  const ctx = r.getContext();
  const keySpec = keyName(A.tonic, A.mode);
  const marks = [];
  const segAt = {};
  for(const s of A.segs) segAt[Math.round(s.q*4)] = s;
  let prevT = null, prevB = null;
  lines.forEach((ln, li)=>{
    const y = top + li * SYS_H + 30;
    let x = 10;
    ln.forEach((cell, ci)=>{
      const first = ci === 0;
      const extra = first ? 90 + 9 * Math.abs(keyFifths(A.tonic, A.mode)) : 0;
      const w = cell.w + extra;
      const sT = new VF.Stave(x, y, w), sB = new VF.Stave(x, y + 100, w);
      if(first){ sT.addClef('treble').addKeySignature(keySpec); sB.addClef('bass').addKeySignature(keySpec);
        if(li === 0 && cell.m === A.startBar){ sT.addTimeSignature(P.tsNum + '/' + P.tsDen); sB.addTimeSignature(P.tsNum + '/' + P.tsDen); } }
      if(first) sT.setMeasure(cell.m + 1);
      const sx = Math.max(sT.getNoteStartX(), sB.getNoteStartX()); sT.setNoteStartX(sx); sB.setNoteStartX(sx);
      sT.setContext(ctx).draw(); sB.setContext(ctx).draw();
      if(first){ new VF.StaveConnector(sT, sB).setType('brace').setContext(ctx).draw(); new VF.StaveConnector(sT, sB).setType('singleLeft').setContext(ctx).draw(); }
      new VF.StaveConnector(sT, sB).setType('singleRight').setContext(ctx).draw();
      const m0 = cell.m * A.G.units;
      const cuts = A.segs.filter(s=>Math.round(s.q*4) >= m0 && Math.round(s.q*4) < m0 + A.G.units).map(s=>Math.round(s.q*4) - m0);
      const tS = slotsFor(A.rh, cell.m, A, cuts), bS = slotsFor(A.lh, cell.m, A, cuts);
      const tN = tS.map(s=>vfNote(s, 'treble', A.flats)), bN = bS.map(s=>vfNote(s, 'bass', A.flats));
      tS.forEach((s, i)=>{ const sg = segAt[m0 + s.u];
        if(sg && P.showChords) tN[i].addModifier(new VF.Annotation(chordName(sg.root, sg.qual, A.flats)).setFont('Arial', 14, 'bold').setVerticalJustification(VF.Annotation.VerticalJustify.TOP), 0); });
      bS.forEach((s, i)=>{ const sg = segAt[m0 + s.u];
        if(sg && P.showRoman) bN[i].addModifier(new VF.Annotation(roman(sg.root, sg.qual, A.tonic, A.mode)).setFont('Times', 14, 'italic').setVerticalJustification(VF.Annotation.VerticalJustify.BOTTOM), 0); });
      const vT = new VF.Voice({num_beats:P.tsNum, beat_value:P.tsDen}).setMode(VF.Voice.Mode.SOFT).addTickables(tN);
      const vB = new VF.Voice({num_beats:P.tsNum, beat_value:P.tsDen}).setMode(VF.Voice.Mode.SOFT).addTickables(bN);
      try{ VF.Accidental.applyAccidentals([vT], keySpec); VF.Accidental.applyAccidentals([vB], keySpec); }catch(e){}
      const beamsT = VF.Beam.generateBeams(tN.filter(n=>!n.isRest())), beamsB = VF.Beam.generateBeams(bN.filter(n=>!n.isRest()));
      new VF.Formatter().joinVoices([vT]).joinVoices([vB]).format([vT, vB], sT.getNoteEndX() - sx - 12);
      vT.draw(ctx, sT); vB.draw(ctx, sB);
      beamsT.concat(beamsB).forEach(b=>b.setContext(ctx).draw());
      // ties, including across barlines and line breaks
      const tie = (prev, cur, slot)=>{ if(prev && slot.tieIn){ const idx = slot.keys.map((_, i)=>i);
        try{ new VF.StaveTie({first_note:prev.n, last_note:cur, first_indices:idx.map(i=>Math.min(i, prev.k - 1)), last_indices:idx}).setContext(ctx).draw(); }catch(e){} } };
      tS.forEach((s, i)=>{ if(!s.rest){ tie(prevT, tN[i], s); prevT = {n:tN[i], k:s.keys.length}; } else prevT = null;
        marks.push({q:(m0 + s.u)/4, x:tN[i].getAbsoluteX(), line:li}); });
      bS.forEach((s, i)=>{ if(!s.rest){ tie(prevB, bN[i], s); prevB = {n:bN[i], k:s.keys.length}; } else prevB = null; });
      marks.push({q:(m0 + A.G.units)/4, x:x + w, line:li, end:true});
      x += w;
    });
  });
  marks.sort((a, b)=>a.q - b.q);
  return {svg:el.querySelector('svg'), marks, height:H};
}

/* ---------------- the score screen ---------------- */
let A = null, sheetMarks = null, scrollMarks = null, tab = 'sheet';
function fillKeys(sel, mode){
  sel.innerHTML = '';
  for(let t=0; t<12; t++) for(const m of ['major','minor']){
    if(mode && m !== mode) continue;
    const o = document.createElement('option'); o.value = t + ':' + m; o.textContent = keyName(t, m) + (m === 'minor' ? ' (minor)' : ' major'); sel.append(o);
  }
}
function showScore(){
  $('#scrImport').hidden = true; $('#scrScore').hidden = false;
  const P = proj;
  $('#title').value = P.title;
  $('#level').value = P.level; $('#bpm').value = P.bpm; $('#offset').value = P.offset;
  $('#ts').value = P.tsDen === 8 ? '6' : String(P.tsNum); $('#crate').value = P.crate; $('#moct').value = String(P.moct || 0);
  $('#showChords').checked = P.showChords; $('#showRoman').checked = P.showRoman;
  fillKeys($('#keyIn')); $('#keyIn').value = P.tonic + ':' + P.mode;
  fillKeys($('#keyOut'), P.mode); $('#keyOut').value = P.outTonic + ':' + P.mode;
  const src = P.detected.sources.map(r=>ROLES.find(x=>x[0] === r)[1].toLowerCase()).join(', ');
  $('#detected').textContent = `Heard from: ${src}. Detected ${P.detected.bpm} BPM in ${P.detected.key}. If the bars look shifted, nudge “Beat 1 starts”; if every note looks twice as long or short, double or halve the tempo.`;
  stop(); P.pos = 0;
  refresh();
}
function refresh(){
  const P = proj; A = arrange(P);
  $('#loopB').value = $('#loopB').value || A.bars;
  drawChordStrip();
  drawSheet();
  if(tab === 'scroll') drawScroll();
  saveProj();
}
function drawSheet(){
  const el = $('#sheet'), w = Math.max(320, $('#sheetWrap').clientWidth - 30);
  const lines = layout(A, w, false);
  const r = engrave(el, A, proj, {width:w, lines});
  sheetMarks = r.marks;
}
function drawScroll(){
  const el = $('#scrollSheet');
  const lines = layout(A, 0, true);
  const r = engrave(el, A, proj, {width:0, lines, single:true, top:0});
  scrollMarks = r.marks;
  $('#scrollWrap').style.height = (r.height + 20) + 'px';
  el.style.paddingLeft = '30vw'; el.style.paddingRight = '70vw';
}
function drawChordStrip(){
  const box = $('#chordStrip'); box.innerHTML = '';
  for(const s of A.segs){
    if(s.q < A.startBar * A.G.barQ) continue;
    const b = document.createElement('button');
    if(s.edited) b.className = 'edited';
    const bar = Math.floor(s.q / A.G.barQ) + 1;
    b.innerHTML = `${chordName(s.root, s.qual, A.flats)}<small>${proj.showRoman ? roman(s.root, s.qual, A.tonic, A.mode) + ' · ' : ''}bar ${bar}</small>`;
    b.onclick = e=>chordPicker(s, b);
    box.append(b);
  }
}
function chordPicker(seg, anchor){
  document.querySelectorAll('.pop').forEach(p=>p.remove());
  const P = proj, T = transposeBy(P);
  const pop = document.createElement('div'); pop.className = 'pop';
  const r = anchor.getBoundingClientRect();
  pop.style.left = Math.min(r.left, innerWidth - 370) + 'px'; pop.style.top = (r.bottom + 6) + 'px';
  pop.innerHTML = '<b>Change this chord</b><div class="note">Chords in this key first.</div>';
  const grid = document.createElement('div'); grid.className = 'grid';
  const tonic = A.tonic, mode = A.mode;
  const opts = (mode === 'minor' ? [[0,'min'],[2,'dim'],[3,'maj'],[5,'min'],[7,'min'],[7,'maj'],[8,'maj'],[10,'maj']] : [[0,'maj'],[2,'min'],[4,'min'],[5,'maj'],[7,'maj'],[9,'min'],[7,'7'],[11,'dim']])
    .map(([d, q])=>[(tonic + d) % 12, q]);
  const add = (root, q)=>{ const bt = document.createElement('button');
    bt.innerHTML = chordName(root, q, A.flats) + `<br><small>${roman(root, q, tonic, mode)}</small>`;
    bt.onclick = ()=>{ P.chordEdits[seg.i] = {root:(root - T + 120) % 12, q}; pop.remove(); refresh(); };
    grid.append(bt); };
  opts.forEach(o=>add(o[0], o[1]));
  pop.append(grid);
  const other = document.createElement('div'); other.className = 'row'; other.style.marginTop = '8px';
  const rs = document.createElement('select'); (A.flats ? FLAT : SHARP).forEach((n, i)=>{ const o = document.createElement('option'); o.value = i; o.textContent = n; if(i === seg.root) o.selected = true; rs.append(o); });
  const qs = document.createElement('select'); Object.keys(QUAL).forEach(q=>{ const o = document.createElement('option'); o.value = q; o.textContent = q === 'maj' ? 'major' : q === 'min' ? 'minor' : q; if(q === seg.qual) o.selected = true; qs.append(o); });
  const ok = document.createElement('button'); ok.className = 'btn sm'; ok.textContent = 'Use';
  ok.onclick = ()=>{ P.chordEdits[seg.i] = {root:(+rs.value - T + 120) % 12, q:qs.value}; pop.remove(); refresh(); };
  const reset = document.createElement('button'); reset.className = 'btn sm'; reset.textContent = 'As heard';
  reset.onclick = ()=>{ delete P.chordEdits[seg.i]; pop.remove(); refresh(); };
  other.append(rs, qs, ok, reset); pop.append(other);
  document.body.append(pop);
  setTimeout(()=>document.addEventListener('pointerdown', function h(e){ if(!pop.contains(e.target)){ pop.remove(); document.removeEventListener('pointerdown', h); } }), 0);
}
// controls
const bind = (id, fn)=>{ $(id).addEventListener('change', ()=>{ fn($(id)); refresh(); }); };
bind('#level', el=>{ proj.level = el.value; });
bind('#bpm', el=>{ const v = parseFloat(el.value); if(v > 20 && v < 300) proj.bpm = v; });
bind('#offset', el=>{ const v = parseFloat(el.value); if(!isNaN(v)) proj.offset = v; });
bind('#ts', el=>{ if(el.value === '6'){ proj.tsNum = 6; proj.tsDen = 8; } else { proj.tsNum = +el.value; proj.tsDen = 4; } proj.chordEdits = {}; });
bind('#crate', el=>{ proj.crate = el.value; proj.chordEdits = {}; });
bind('#moct', el=>{ proj.moct = +el.value; });
bind('#showChords', el=>{ proj.showChords = el.checked; });
bind('#showRoman', el=>{ proj.showRoman = el.checked; });
bind('#keyIn', el=>{ const [t, m] = el.value.split(':'); const d = transposeBy(proj); proj.tonic = +t; proj.mode = m; proj.outTonic = (proj.tonic + d + 12) % 12; fillKeys($('#keyOut'), m); $('#keyOut').value = proj.outTonic + ':' + m; });
bind('#keyOut', el=>{ proj.outTonic = +el.value.split(':')[0]; });
$('#title').addEventListener('change', ()=>{ proj.title = $('#title').value.trim() || 'My song'; saveProj(); });
$('#backBtn').onclick = ()=>{ stop(); $('#scrScore').hidden = true; $('#scrImport').hidden = false; listProjects(); };
document.querySelectorAll('.tabs button').forEach(b=>b.onclick = ()=>{
  document.querySelectorAll('.tabs button').forEach(x=>x.classList.toggle('on', x === b));
  tab = b.dataset.tab;
  $('#tabSheet').hidden = tab !== 'sheet'; $('#tabScroll').hidden = tab !== 'scroll'; $('#tabFall').hidden = tab !== 'fall';
  if(tab === 'scroll') drawScroll();
  if(tab === 'fall') sizeFall();
});
let rsT = null;
addEventListener('resize', ()=>{ clearTimeout(rsT); rsT = setTimeout(()=>{ if(proj && !$('#scrScore').hidden){ if(tab === 'sheet') drawSheet(); if(tab === 'fall') sizeFall(); } }, 200); });

/* ---------------- playback ---------------- */
const PB = {playing:false, pos:0, last:0, waiting:null, done:{}, src:null, raf:0, sounding:{}};
function events(){
  const out = [];
  A.rh.forEach(n=>out.push(Object.assign({h:'R'}, n)));
  A.lh.forEach(n=>out.push(Object.assign({h:'L'}, n)));
  return out.sort((a, b)=>a.q - b.q);
}
function pianoNote(p, when, dur, vel){
  const c = ac(), f = 440 * Math.pow(2, (p - 69)/12);
  const g = c.createGain(), lp = c.createBiquadFilter();
  lp.type = 'lowpass'; lp.frequency.value = Math.min(9000, f * 8);
  const v = 0.12 + 0.18 * (vel || .6), len = Math.max(.25, dur) + 0.6;
  g.gain.setValueAtTime(0, when); g.gain.linearRampToValueAtTime(v, when + 0.006);
  g.gain.exponentialRampToValueAtTime(v * 0.35, when + 0.25);
  g.gain.setTargetAtTime(0.0001, when + Math.max(.2, dur), 0.15);
  for(const [mul, type, amp] of [[1, 'triangle', 1], [2, 'sine', .35], [3, 'sine', .12]]){
    const o = c.createOscillator(), og = c.createGain();
    o.type = type; o.frequency.value = f * mul; og.gain.value = amp;
    o.connect(og); og.connect(lp); o.start(when); o.stop(when + len);
  }
  lp.connect(g); g.connect(c.destination);
}
const speed = ()=>parseFloat($('#speed').value);
function play(){
  if(!A) return;
  ac();
  PB.playing = true; PB.last = performance.now(); $('#playBtn').textContent = '❚❚ Pause';
  PB.evs = events(); PB.done = {};
  PB.evs.forEach((e, i)=>{ if(e.q < PB.pos - 1e-6) PB.done[i] = 1; });
  if($('#hands').value === 'orig') startOrig();
  if($('#waitOn').checked) startMic();
  cancelAnimationFrame(PB.raf); PB.raf = requestAnimationFrame(tick);
}
function stop(){
  PB.playing = false; PB.waiting = null; $('#playBtn') && ($('#playBtn').textContent = '▶ Play');
  if(PB.src){ try{ PB.src.stop(); }catch(e){} PB.src = null; }
}
function startOrig(){
  if(!origAudio){ alert('The original audio is only available right after you load the song (it is not saved). Choose a hand instead.'); $('#hands').value = 'both'; return; }
  const c = ac(), s = c.createBufferSource(); s.buffer = origAudio; s.playbackRate.value = speed();
  s.connect(c.destination);
  const at = Math.max(0, proj.offset + PB.pos * A.G.quarter);
  s.start(c.currentTime + 0.02, at); PB.src = s;
}
$('#playBtn').onclick = ()=>{ if(PB.playing) stop(); else play(); };
$('#hands').onchange = ()=>{ if(PB.playing){ stop(); play(); } };
$('#speed').onchange = ()=>{ if(PB.playing){ stop(); play(); } };
function loopRange(){ const a = (Math.max(1, +$('#loopA').value || 1) - 1 + A.startBar) * A.G.barQ, b = (Math.max(1, +$('#loopB').value || A.bars) + A.startBar) * A.G.barQ; return [a, Math.max(a + A.G.barQ, b)]; }
function tick(now){
  if(!PB.playing) return;
  const dt = Math.min(.1, (now - PB.last) / 1000); PB.last = now;
  const hands = $('#hands').value, wait = $('#waitOn').checked;
  if(!PB.waiting) PB.pos += dt * speed() / A.G.quarter;
  if($('#loopOn').checked){ const [a, b] = loopRange(); if(PB.pos >= b || PB.pos < a - 1e-6){ PB.pos = a; PB.done = {}; PB.evs.forEach((e, i)=>{ if(e.q < a - 1e-6) PB.done[i] = 1; }); if(PB.src){ PB.src.stop(); PB.src = null; startOrig(); } } }
  const c = ac();
  for(let i=0; i<PB.evs.length; i++){
    const e = PB.evs[i]; if(PB.done[i]) continue;
    if(e.q > PB.pos + 1e-6) break;
    if(wait && e.h === 'R' && !PB.waiting){
      const group = PB.evs.map((x, j)=>[x, j]).filter(([x, j])=>x.h === 'R' && Math.abs(x.q - e.q) < 1e-6 && !PB.done[j]);
      PB.waiting = {q:e.q, pitches:group.map(([x])=>x.p), idx:group.map(([, j])=>j)}; PB.pos = e.q; break;
    }
    if(wait && e.h === 'R') break;
    PB.done[i] = 1;
    const sound = hands === 'both' || hands === e.h;
    if(sound) pianoNote(e.p, c.currentTime + 0.01, e.d * A.G.quarter / speed(), e.v);
    PB.sounding[e.p] = now + e.d * A.G.quarter / speed() * 1000;
  }
  if(PB.pos > A.startBar * A.G.barQ + A.bars * A.G.barQ + 1){ stop(); PB.pos = 0; }
  showPos();
  PB.raf = requestAnimationFrame(tick);
}
function heard(p){                       // from the mic, a MIDI keyboard, or a tap on the keys
  const w = PB.waiting; if(!w) return false;
  const k = w.pitches.findIndex(x=>x === p || (x - p) % 12 === 0 && Math.abs(x - p) <= 12);
  if(k < 0) return false;
  w.idx.forEach(j=>{ PB.done[j] = 1; });
  w.pitches.forEach(x=>{ PB.sounding[x] = performance.now() + 250; });
  PB.waiting = null; PB.last = performance.now();
  return true;
}
function showPos(){
  const bar = Math.floor(PB.pos / A.G.barQ) - A.startBar + 1;
  $('#timeTxt').textContent = `bar ${Math.max(1, bar)} of ${A.bars}` + (PB.waiting ? ' · your turn' : '');
  if(tab === 'scroll' && scrollMarks) followScroll();
  if(tab === 'fall') drawFall();
}
function xAt(marks, q){
  let a = marks[0], b = marks[marks.length - 1];
  for(let i=0; i<marks.length - 1; i++) if(marks[i].q <= q && marks[i + 1].q >= q){ a = marks[i]; b = marks[i + 1]; break; }
  if(b.q === a.q) return a.x;
  return a.x + (b.x - a.x) * (q - a.q) / (b.q - a.q);
}
function followScroll(){
  const wrap = $('#scrollWrap'), x = xAt(scrollMarks, PB.pos);
  wrap.scrollLeft = x + $('#scrollSheet').offsetLeft + innerWidth*0.3 - wrap.clientWidth*0.3 - innerWidth*0.3;
}

/* ---------------- listening for a real piano ---------------- */
let mic = null;
async function startMic(){
  if(mic) return;
  if(navigator.requestMIDIAccess){
    try{ const m = await navigator.requestMIDIAccess(); m.inputs.forEach(inp=>{ inp.onmidimessage = e=>{ const [s, n, v] = e.data; if((s & 0xf0) === 0x90 && v > 0) heard(n); }; }); }catch(e){}
  }
  try{
    const stream = await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:false, noiseSuppression:false, autoGainControl:false}});
    const c = ac(), src = c.createMediaStreamSource(stream), an = c.createAnalyser();
    an.fftSize = 2048; src.connect(an);
    const buf = new Float32Array(an.fftSize);
    mic = {an, buf};
    let lastP = -1, stable = 0;
    (function listen(){
      an.getFloatTimeDomainData(buf);
      const f = pitchOf(buf, c.sampleRate);
      if(f){ const p = Math.round(69 + 12 * Math.log2(f / 440)); if(p === lastP) stable++; else { stable = 0; lastP = p; } if(stable === 2) heard(p); }
      else { stable = 0; lastP = -1; }
      requestAnimationFrame(listen);
    })();
  }catch(e){ alert('To listen to your piano, allow the microphone. You can also tap the keys in the Falling notes view.'); }
}
function pitchOf(b, sr){                 // autocorrelation with a clarity check; good for one note at a time
  let rms = 0; for(const v of b) rms += v*v; rms = Math.sqrt(rms / b.length);
  if(rms < 0.01) return 0;
  const n = b.length, half = n >> 1; let best = -1, bestV = 0, prevV = 1, rising = false;
  const c0 = b.reduce((s, v)=>s + v*v, 0);
  for(let lag = Math.floor(sr / 1400); lag < Math.min(half, sr / 50); lag++){
    let s = 0; for(let i=0; i<half; i++) s += b[i] * b[i + lag];
    const v = s / c0;
    if(v > prevV) rising = true;
    if(rising && v < prevV && prevV > 0.55){ best = lag - 1; bestV = prevV; break; }
    prevV = v;
  }
  return best > 0 ? sr / best : 0;
}

/* ---------------- falling notes ---------------- */
let fallKeys = null;
function sizeFall(){
  const cv = $('#fall'), r = cv.getBoundingClientRect(), d = Math.min(2, devicePixelRatio || 1);
  cv.width = r.width * d; cv.height = r.height * d; cv.getContext('2d').setTransform(d, 0, 0, d, 0, 0);
  drawFall();
}
const isBlack = p=>[1,3,6,8,10].includes(p % 12);
function keyboardGeo(w, h){
  const ps = A.rh.concat(A.lh).map(n=>n.p);
  let lo = Math.min(...ps, 60) - 2, hi = Math.max(...ps, 72) + 2;
  while(lo % 12 !== 0 && lo % 12 !== 5) lo--; while(hi % 12 !== 4 && hi % 12 !== 11) hi++;
  const whites = []; for(let p=lo; p<=hi; p++) if(!isBlack(p)) whites.push(p);
  const ww = w / whites.length, kh = Math.min(120, h * .22);
  const pos = {};
  whites.forEach((p, i)=>{ pos[p] = {x:i*ww, w:ww, black:false}; });
  for(let p=lo; p<=hi; p++) if(isBlack(p)) pos[p] = {x:pos[p - 1].x + ww*.68, w:ww*.64, black:true};
  return {lo, hi, pos, ww, kh, top:h - kh};
}
function drawFall(){
  const cv = $('#fall'); if(!cv || !A) return;
  const g = cv.getContext('2d'), w = cv.clientWidth, h = cv.clientHeight;
  const K = fallKeys = keyboardGeo(w, h);
  g.fillStyle = '#1d1b22'; g.fillRect(0, 0, w, h);
  const pxPerQ = Math.max(40, (K.top) / 6);
  // bar lines
  g.strokeStyle = 'rgba(255,255,255,.08)'; g.lineWidth = 1;
  for(let b=Math.floor(PB.pos / A.G.barQ); b < PB.pos / A.G.barQ + 8; b++){ const y = K.top - (b*A.G.barQ - PB.pos)*pxPerQ; g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
  // notes
  const names = A.flats ? FLAT : SHARP;
  for(const [list, col] of [[A.lh, '#3f8f5a'], [A.rh, '#2f6fb3']]){
    for(const n of list){
      const y1 = K.top - (n.q - PB.pos) * pxPerQ, y0 = y1 - n.d * pxPerQ;
      if(y1 < 0 || y0 > K.top) continue;
      const k = K.pos[n.p]; if(!k) continue;
      g.fillStyle = col; g.globalAlpha = .92;
      const r = Math.min(6, k.w/2);
      g.beginPath(); g.moveTo(k.x + 1 + r, y0); g.arcTo(k.x + k.w - 1, y0, k.x + k.w - 1, y1, r); g.arcTo(k.x + k.w - 1, y1 - 1, k.x + 1, y1 - 1, r);
      g.arcTo(k.x + 1, y1 - 1, k.x + 1, y0, r); g.arcTo(k.x + 1, y0, k.x + k.w - 1, y0, r); g.fill();
      g.globalAlpha = 1;
      if(k.w > 16 && y1 - y0 > 18){ g.fillStyle = '#fff'; g.font = '600 11px "Source Sans 3",sans-serif'; g.textAlign = 'center'; g.fillText(names[n.p % 12], k.x + k.w/2, y1 - 6); }
    }
  }
  // keys
  const now = performance.now(), want = PB.waiting ? PB.waiting.pitches : [];
  for(let p=K.lo; p<=K.hi; p++){ const k = K.pos[p]; if(k.black) continue;
    const on = (PB.sounding[p] || 0) > now;
    g.fillStyle = want.includes(p) ? '#ffd479' : on ? '#9cc6ef' : '#f6f1e7'; g.fillRect(k.x + .5, K.top, k.w - 1, K.kh);
    if(p % 12 === 0){ g.fillStyle = '#5d5446'; g.font = '11px sans-serif'; g.textAlign = 'center'; g.fillText('C' + (p/12 - 1), k.x + k.w/2, h - 6); } }
  for(let p=K.lo; p<=K.hi; p++){ const k = K.pos[p]; if(!k.black) continue;
    const on = (PB.sounding[p] || 0) > now;
    g.fillStyle = want.includes(p) ? '#d9a441' : on ? '#2f6fb3' : '#15131a'; g.fillRect(k.x, K.top, k.w, K.kh*.62); }
  g.fillStyle = '#b5832a'; g.fillRect(0, K.top - 2, w, 2);
  if(PB.waiting){ g.fillStyle = '#ffd479'; g.font = '700 15px "Source Sans 3",sans-serif'; g.textAlign = 'left';
    g.fillText('Your turn: play ' + PB.waiting.pitches.map(p=>names[p % 12] + (Math.floor(p/12) - 1)).join(' + '), 12, 22); }
}
$('#fall').addEventListener('pointerdown', e=>{
  if(!fallKeys) return;
  const r = e.target.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
  if(y < fallKeys.top) return;
  let hit = null;
  for(let p=fallKeys.lo; p<=fallKeys.hi; p++){ const k = fallKeys.pos[p]; if(k.black && y < fallKeys.top + fallKeys.kh*.62 && x >= k.x && x < k.x + k.w) hit = p; }
  if(hit === null) for(let p=fallKeys.lo; p<=fallKeys.hi; p++){ const k = fallKeys.pos[p]; if(!k.black && x >= k.x && x < k.x + k.w) hit = p; }
  if(hit !== null){ pianoNote(hit, ac().currentTime, .4, .7); PB.sounding[hit] = performance.now() + 300; heard(hit); drawFall(); }
});

/* ---------------- exports ---------------- */
function fileName(ext){ return (proj.title || 'song').replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-') + '-' + keyName(A.tonic, A.mode) + '.' + ext; }
function download(blob, name){ const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.append(a); a.click(); setTimeout(()=>{ URL.revokeObjectURL(a.href); a.remove(); }, 1000); }
function pages(){
  const W = 720, lines = layout(A, W, false), per = 4;
  const out = [];
  for(let i=0; i<lines.length; i += (i === 0 ? per - 1 : per)) out.push(lines.slice(i, i + (i === 0 ? per - 1 : per)));
  return {W, out};
}
function pageHeader(first){
  if(!first) return '';
  const T = transposeBy(proj);
  return `<div style="font-family:Georgia,serif;text-align:center;padding:16px 0 4px"><div style="font-size:26px;font-weight:700">${esc(proj.title)}</div>
    <div style="font-size:13px;color:#444;margin-top:4px">Piano · ${keyName(A.tonic, A.mode)}${T ? ' (transposed ' + (T > 0 ? 'up ' : 'down ') + Math.abs(T) + ')' : ''} · ♩ = ${proj.tsDen === 8 ? Math.round(proj.bpm*1.5) : proj.bpm}</div></div>`;
}
const esc = s=>String(s).replace(/[&<>"]/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
function renderPages(){
  const area = $('#printArea'); area.innerHTML = '';
  const {W, out} = pages();
  const svgs = [];
  out.forEach((ln, i)=>{
    const page = document.createElement('div'); page.style.cssText = 'width:' + (W + 30) + 'px;page-break-after:always;padding:10px';
    page.innerHTML = pageHeader(i === 0);
    const div = document.createElement('div'); page.append(div); area.append(page);
    const r = engrave(div, A, proj, {width:W, lines:ln, top:i === 0 ? 0 : 10});
    svgs.push({svg:r.svg, h:r.height, first:i === 0});
  });
  return svgs;
}
$('#printBtn').onclick = ()=>{ renderPages(); setTimeout(()=>window.print(), 100); };
$('#pdfBtn').onclick = async ()=>{
  const btn = $('#pdfBtn'); btn.disabled = true; btn.textContent = 'Making PDF…';
  try{
    const svgs = renderPages();
    const doc = new jspdf.jsPDF({unit:'pt', format:'letter'});
    const pw = doc.internal.pageSize.getWidth(), M = 36, scale = (pw - 2*M) / 760;
    for(let i=0; i<svgs.length; i++){
      if(i) doc.addPage();
      let y = M;
      if(svgs[i].first){
        const T = transposeBy(proj);
        doc.setFont('times', 'bold'); doc.setFontSize(22); doc.text(proj.title, pw/2, y + 16, {align:'center'});
        doc.setFont('times', 'normal'); doc.setFontSize(11);
        doc.text(`Piano · ${keyName(A.tonic, A.mode)}${T ? ' (transposed)' : ''} · ${proj.bpm} BPM`, pw/2, y + 34, {align:'center'});
        y += 46;
      }
      await doc.svg(svgs[i].svg, {x:M, y, width:760*scale, height:svgs[i].h*scale});
      doc.setFontSize(9); doc.setTextColor(120); doc.text(`${proj.title} · page ${i + 1} of ${svgs.length}`, pw/2, doc.internal.pageSize.getHeight() - 20, {align:'center'}); doc.setTextColor(0);
    }
    doc.save(fileName('pdf'));
  }catch(e){ console.error(e); alert('The PDF could not be made here. Use Print and choose “Save as PDF” instead.'); }
  btn.disabled = false; btn.textContent = 'PDF';
};
$('#midiBtn').onclick = ()=>download(new Blob([midiFile()], {type:'audio/midi'}), fileName('mid'));
$('#xmlBtn').onclick = ()=>download(new Blob([musicXml()], {type:'application/vnd.recordare.musicxml+xml'}), fileName('musicxml'));
function midiFile(){
  const TPQ = 480, vlq = n=>{ const b = [n & 0x7f]; while((n >>= 7)) b.unshift((n & 0x7f) | 0x80); return b; };
  const track = (evs, name)=>{
    const raw = [];
    raw.push([0, [0xff, 0x03, name.length, ...[...name].map(c=>c.charCodeAt(0))]]);
    if(name === 'Right hand'){ const us = Math.round(A.G.quarter * 1e6 / (proj.tsDen === 8 ? 1 : 1)); raw.push([0, [0xff, 0x51, 3, (us >> 16) & 255, (us >> 8) & 255, us & 255]]); raw.push([0, [0xff, 0x58, 4, proj.tsNum, proj.tsDen === 8 ? 3 : 2, 24, 8]]); }
    const shift = -A.startBar * A.G.barQ;
    for(const n of evs){ const t0 = Math.round((n.q + shift) * TPQ), t1 = Math.round((n.q + n.d + shift) * TPQ) - 1;
      raw.push([t0, [0x90, n.p, Math.round(50 + 50*(n.v || .6))]]); raw.push([Math.max(t0 + 1, t1), [0x80, n.p, 0]]); }
    raw.sort((a, b)=>a[0] - b[0] || (a[1][0] === 0x80 ? -1 : 1));
    const bytes = []; let t = 0;
    for(const [at, ev] of raw){ bytes.push(...vlq(at - t), ...ev); t = at; }
    bytes.push(0, 0xff, 0x2f, 0);
    return [0x4d,0x54,0x72,0x6b, (bytes.length >>> 24) & 255, (bytes.length >> 16) & 255, (bytes.length >> 8) & 255, bytes.length & 255, ...bytes];
  };
  const head = [0x4d,0x54,0x68,0x64, 0,0,0,6, 0,1, 0,2, (TPQ >> 8) & 255, TPQ & 255];
  return new Uint8Array([...head, ...track(A.rh, 'Right hand'), ...track(A.lh, 'Left hand')]);
}
function musicXml(){
  const TYPES = {16:['whole',0], 12:['half',1], 8:['half',0], 6:['quarter',1], 4:['quarter',0], 3:['eighth',1], 2:['eighth',0], 1:['16th',0]};
  const KINDS = {maj:'major', min:'minor', 7:'dominant', maj7:'major-seventh', m7:'minor-seventh', sus4:'suspended-fourth', sus2:'suspended-second', dim:'diminished'};
  const U = A.G.units;
  let x = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 4.0 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">
<score-partwise version="4.0"><work><work-title>${esc(proj.title)}</work-title></work>
<identification><encoding><software>Cover Studio</software></encoding></identification>
<part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list><part id="P1">`;
  const noteXml = (s, staff, voice)=>{
    const [type, dot] = TYPES[s.len];
    if(s.rest) return `<note><rest/><duration>${s.len}</duration><voice>${voice}</voice><type>${type}</type>${dot ? '<dot/>' : ''}<staff>${staff}</staff></note>`;
    return s.keys.map((p, i)=>{ const sp = spell(p, A.flats);
      const ties = (s.tieIn ? '<tie type="stop"/>' : '') + (s.tieOut ? '<tie type="start"/>' : '');
      const tied = (s.tieIn ? '<tied type="stop"/>' : '') + (s.tieOut ? '<tied type="start"/>' : '');
      return `<note>${i ? '<chord/>' : ''}<pitch><step>${sp.step}</step>${sp.alter ? `<alter>${sp.alter}</alter>` : ''}<octave>${sp.oct}</octave></pitch><duration>${s.len}</duration>${ties}<voice>${voice}</voice><type>${type}</type>${dot ? '<dot/>' : ''}<staff>${staff}</staff>${tied ? `<notations>${tied}</notations>` : ''}</note>`; }).join('');
  };
  const segAt = {}; A.segs.forEach(s=>{ segAt[Math.round(s.q*4)] = s; });
  for(let m=A.startBar; m<A.startBar + A.bars; m++){
    const m0 = m * U;
    const cuts = A.segs.filter(s=>Math.round(s.q*4) >= m0 && Math.round(s.q*4) < m0 + U).map(s=>Math.round(s.q*4) - m0);
    x += `<measure number="${m - A.startBar + 1}">`;
    if(m === A.startBar) x += `<attributes><divisions>4</divisions><key><fifths>${keyFifths(A.tonic, A.mode)}</fifths><mode>${A.mode}</mode></key><time><beats>${proj.tsNum}</beats><beat-type>${proj.tsDen}</beat-type></time><staves>2</staves><clef number="1"><sign>G</sign><line>2</line></clef><clef number="2"><sign>F</sign><line>4</line></clef></attributes>
<direction placement="above"><direction-type><metronome><beat-unit>${proj.tsDen === 8 ? 'quarter' : 'quarter'}</beat-unit>${proj.tsDen === 8 ? '<beat-unit-dot/>' : ''}<per-minute>${proj.bpm}</per-minute></metronome></direction-type><sound tempo="${proj.tsDen === 8 ? proj.bpm*1.5 : proj.bpm}"/></direction>`;
    for(const s of slotsFor(A.rh, m, A, cuts)){
      const sg = segAt[m0 + s.u];
      if(sg && proj.showChords){ const n = (A.flats ? FLAT : SHARP)[sg.root];
        x += `<harmony><root><root-step>${n[0]}</root-step>${n.length > 1 ? `<root-alter>${n[1] === '#' ? 1 : -1}</root-alter>` : ''}</root><kind text="${QUAL[sg.qual].sym}">${KINDS[sg.qual]}</kind><staff>1</staff></harmony>`; }
      x += noteXml(s, 1, 1);
    }
    x += `<backup><duration>${U}</duration></backup>`;
    for(const s of slotsFor(A.lh, m, A, cuts)){
      const sg = segAt[m0 + s.u];
      if(sg && proj.showRoman) x += `<direction placement="below"><direction-type><words font-style="italic">${roman(sg.root, sg.qual, A.tonic, A.mode)}</words></direction-type><staff>2</staff></direction>`;
      x += noteXml(s, 2, 5);
    }
    x += '</measure>';
  }
  return x + '</part></score-partwise>';
}

/* ---------------- a demo song, synthesised here ---------------- */
function demoSong(){
  const sr = 44100, bpm = 100, beat = 60 / bpm, lead = .5, bars = 8;
  const N = n=>{ const m = /^([A-G])(\d)$/.exec(n); return {C:0,D:2,E:4,F:5,G:7,A:9,B:11}[m[1]] + (+m[2] + 1)*12; };
  const mel = 'E5:1 E5:1 F5:1 G5:1 G5:1 F5:1 E5:1 D5:1 C5:1 C5:1 D5:1 E5:1 E5:1.5 D5:.5 D5:2 E5:1 E5:1 F5:1 G5:1 G5:1 F5:1 E5:1 D5:1 C5:1 C5:1 D5:1 E5:1 D5:1.5 C5:.5 C5:2'.split(' ').map(t=>{ const [n, d] = t.split(':'); return [N(n), +d]; });
  const len = Math.ceil((lead + bars*4*beat + 1.5) * sr), ctx = ac(), buf = ctx.createBuffer(1, len, sr), out = buf.getChannelData(0);
  const tone = (m, t0, dur, amp)=>{ const f = 440*Math.pow(2, (m - 69)/12), i0 = Math.floor(t0*sr), L = Math.floor((dur + .4)*sr);
    for(let i=0; i<L && i0 + i < len; i++){ const t = i/sr, env = Math.exp(-t*2.2)*Math.min(1, t*200)*(t > dur ? Math.exp(-(t - dur)*12) : 1);
      let v = 0; for(let h=1; h<=6; h++) v += Math.sin(2*Math.PI*f*h*t)/(h*h*.8); out[i0 + i] += v*env*amp; } };
  let t = lead; for(const [m, d] of mel){ tone(m, t, d*beat*.95, .32); t += d*beat; }
  const V = {C:['C3','E3','G3'], G:['G2','B2','D3']}, seq = ['C','G','C','G','C','G','C','C'];
  for(let b=0; b<bars; b++){ const ch = V[seq[b]]; for(let q=0; q<4; q++){ const tt = lead + (b*4 + q)*beat; if(q % 2 === 0) tone(N(ch[0]) - 12, tt, beat*1.9, .22); ch.forEach(n=>tone(N(n), tt, beat*.9, .1)); } }
  let mx = 0; for(const v of out) mx = Math.max(mx, Math.abs(v)); for(let i=0; i<len; i++) out[i] = out[i]/mx*.8;
  return buf;
}

listProjects();
