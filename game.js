"use strict";
/* ═══════════════════════════════════════════════════════
   DHAAYAM — Authentic Tamil 7×7 Board Game Engine
   ═══════════════════════════════════════════════════════

   BOARD: 7×7 grid, positions as "row,col" (1-indexed, row 1 = TOP)

   MOVEMENT PATHS (Dhaayam / Chowka Bara rules):
   ─────────────────────────────────────────────
   Each player enters at a corner, travels clockwise around
   the FULL outer perimeter (24 steps), then turns inward
   along their OWN spine toward the center (4,4).

   P1 (Red)   enters at (7,4) — bottom mid — moves: right → up → left → down → inward via col4
   P2 (Black) enters at (1,4) — top mid   — moves: left → down → right → up → inward via col4

   TRACK DEFINITION:
   ─────────────────
   Outer perimeter clockwise from bottom-left corner:
     Row 7: col 1→7 (bottom left to right)
     Col 7: row 7→1 (right side bottom to top)
     Row 1: col 7→1 (top right to left)
     Col 1: row 1→7 (left side top to bottom)

   Each player starts at a specific point on this outer ring
   and travels the FULL ring (24 steps to complete outer loop),
   then follows their spine to (4,4).

   SPINE (inner path) for each player:
     P1 spine: enters outer at (7,4), after full loop comes back to (7,4)
               then goes: (6,4)→(5,4)→(4,4)  [move UP col 4]
     P2 spine: enters outer at (1,4), after full loop comes back to (1,4)
               then goes: (2,4)→(3,4)→(4,4)  [move DOWN col 4]

   ═══════════════════════════════════════════════════════ */

// ─── BOARD ───────────────────────────────────────────────
const SAFE_SQUARES = new Set([
  '1,1','1,4','1,7',
  '2,2','2,6',
  '4,1','4,4','4,7',
  '6,2','6,6',
  '7,1','7,4','7,7'
]);

const HOME_POS = '4,4';

/* ── Movement paths traced from player's drawing ──
   P1 (Red)   enters at bottom-left (7,1) — travels clockwise spiral inward
   P2 (Black) enters at top-right   (1,7) — travels clockwise spiral inward
   Both paths = 49 steps ending at center (4,4)
*/

const TRACKS = {
  p1: [
    // Outer ring — from image
    '7,4','7,5','7,6','7,7',
    '6,7','5,7','4,7','3,7','2,7','1,7',
    '1,6','1,5','1,4','1,3','1,2','1,1',
    '2,1','3,1','4,1','5,1','6,1',
    // Middle ring
    '6,2','6,3','6,4','6,5','6,6',
    '5,6','4,6','3,6','2,6',
    '2,5','2,4','2,3','2,2',
    '3,2','4,2','5,2',
    // Inner ring
    '5,3','5,4','5,5',
    // Final — click 1 from (4,5) to enter home
    '4,5','4,4'
  ],
  p2: [
    // Outer ring — top-center, clockwise
    '1,4','1,3','1,2','1,1',
    '2,1','3,1','4,1','5,1','6,1','7,1',
    '7,2','7,3','7,4','7,5','7,6','7,7',
    '6,7','5,7','4,7','3,7','2,7',
    // Middle ring — enters directly from (2,7)→(2,6)
    '2,6','2,5','2,4','2,3','2,2',
    '3,2','4,2','5,2','6,2',
    '6,3','6,4','6,5','6,6',
    '5,6','4,6','3,6',
    // Inner ring
    '3,5','3,4','3,3',
    '4,3','5,3',
    '5,4','5,5',
    '4,5',
    // Center
    '4,4'
  ]
};

// ─── DICE ────────────────────────────────────────────────
/* Dayakattai: 2 dice
   Die 1 faces: 1, 2, 3, 4, 5, 8  (no zero)
   Die 2 faces: 0, 2, 3, 4, 5, 8  (has zero, no 1)
   Special rules:
   - Die1=1 + Die2=0 (sum=1) → DHAAYAM: enter piece + extra turn
   - 1+1 impossible, 0+0 impossible
   - Sum = 5  → move + extra turn
   - Sum = 6  → move + extra turn
   - Sum = 8  → move + extra turn
   - Sum = 16 → move + extra turn
*/

const DIE_FACES = [1, 2, 3, 4, 6, 8];

function rollDie() { return DIE_FACES[Math.floor(Math.random() * DIE_FACES.length)]; }

function rollBoth() {
  const d1 = rollDie();
  const sum = d1;
  const isDhaayam   = d1 === 1;
  const isExtraTurn = d1 === 1 || d1 === 5 || d1 === 6;
  const moveValue   = d1;
  return { d1, d2: 0, sum, isDhaayam, isExtraTurn, moveValue };
}

// ─── SOUND ───────────────────────────────────────────────
const Sound = (() => {
  let on = true;
  let ctx = null;

  function ac() {
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
    return ctx;
  }

  function tone(freq, type, dur, vol = 0.22) {
    if (!on) return;
    try {
      const c = ac();
      const o = c.createOscillator();
      const g = c.createGain();
      o.connect(g); g.connect(c.destination);
      o.type = type; o.frequency.value = freq;
      g.gain.setValueAtTime(vol, c.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + dur);
      o.start(); o.stop(c.currentTime + dur);
    } catch(e) {}
  }

  function seq(notes) {
    notes.forEach(([f,t,d,v]) => setTimeout(() => tone(f,'sine',d,v||0.22), t*1000));
  }

  return {
    toggle()  { on = !on; return on; },
    isOn()    { return on; },
    roll()    { for(let i=0;i<6;i++) setTimeout(()=>tone(250+Math.random()*150,'triangle',0.06,0.1),i*60); },
    move()    { tone(500,'sine',0.1,0.18); },
    enter()   { seq([[660,0,0.1,0.3],[880,0.1,0.12,0.35],[1100,0.22,0.18,0.3]]); },
    capture() { seq([[350,0,0.1,0.4],[220,0.12,0.15,0.35],[150,0.28,0.2,0.25]]); },
    safe()    { seq([[550,0,0.08],[700,0.09,0.08],[550,0.18,0.1]]); },
    home()    { seq([[523,0,0.1],[659,0.1,0.1],[784,0.2,0.12],[1047,0.32,0.25]]); },
    win()     { seq([[523,0,.12,.4],[659,.13,.12,.4],[784,.26,.12,.4],[1047,.39,.3,.5],[784,.7,.12,.3],[1047,.85,.4,.55]]); },
    extra()   { seq([[700,0,0.07,0.25],[900,0.09,0.1,0.25]]); },
    turn()    { tone(300,'sine',0.1,0.14); },
  };
})();

// ─── TWO PLAYER (Human vs Human) ───────────────────────
let G = null;
let pendingPieces = [];

function newGame() {
  const mkPieces = (pid) => [0,1,2,3].map(i => ({
    id: `${pid}-${i}`,
    pid,
    slot: i,
    isHome: true,
    isDone: false,
    pos: null,
    trackIdx: -1,
  }));

  return {
    turn: 'p1',
    rolled: false,
    roll: null,
    pieces: { p1: mkPieces('p1'), p2: mkPieces('p2') },
    captureCount: { p1: 0, p2: 0 },
    score: { p1: 0, p2: 0 },
    turnCount: 0,
    over: false,
    winner: null,
  };
}

// ─── MOVEMENT HELPERS ────────────────────────────────────
function canMove(piece, roll, st) {
  if (piece.isDone) return false;
  if (piece.isHome) {
    return roll.isDhaayam;
  }
  if (roll.moveValue === 0) return false;
  const track = TRACKS[piece.pid];
  const newIdx = piece.trackIdx + roll.moveValue;
  if (newIdx >= track.length) return false;  // overshoot — need exact count

  // Safe square → Safe square not allowed
  const newPos = track[newIdx];
  if (SAFE_SQUARES.has(piece.pos) && SAFE_SQUARES.has(newPos)) return false;
  return true;
}

function getEnemiesAt(pos, myPid, st) {
  const enemies = [];
  for (const pid of Object.keys(st.pieces)) {
    if (pid === myPid) continue;
    for (const p of st.pieces[pid]) {
      if (!p.isHome && !p.isDone && p.pos === pos) enemies.push(p);
    }
  }
  return enemies;
}

function applyMove(piece, roll) {
  /* Returns { type: 'enter'|'move'|'done', captured: [] } */
  const track = TRACKS[piece.pid];

  if (piece.isHome) {
    // Enter board at index 0 of track
    piece.isHome = false;
    piece.trackIdx = 0;
    piece.pos = track[0];
    Sound.enter();
    const captured = checkCapture(piece);
    return { type: 'enter', captured };
  }

  const newIdx = piece.trackIdx + roll.moveValue;
  piece.trackIdx = newIdx;
  piece.pos = track[newIdx];
  Sound.move();

  if (piece.pos === HOME_POS) {
    piece.isDone = true;
    piece.pos = HOME_POS;
    Sound.home();
    return { type: 'done', captured: [] };
  }

  const captured = checkCapture(piece);
  return { type: 'move', captured };
}

function checkCapture(movedPiece) {
  if (movedPiece.pos === HOME_POS) return [];
  if (SAFE_SQUARES.has(movedPiece.pos)) return [];

  const captured = [];
  for (const pid of Object.keys(G.pieces)) {
    if (pid === movedPiece.pid) continue;
    for (const p of G.pieces[pid]) {
      if (!p.isHome && !p.isDone && p.pos === movedPiece.pos) {
        p.stepsAtCapture = p.trackIdx + 1; // save steps before reset
        p.isHome = true;
        p.pos = null;
        p.trackIdx = -1;
        captured.push(p);
        G.captureCount[movedPiece.pid]++;
      }
    }
  }
  return captured;
}

function checkWinner() {
  for (const pid of ['p1','p2']) {
    if (G.pieces[pid].every(p => p.isDone)) return pid;
  }
  return null;
}

// ─── RENDERING ───────────────────────────────────────────
let cellEls = {};   // "row,col" → DOM element

function buildBoard() {
  const board = document.getElementById('gameBoard');
  board.innerHTML = '';
  cellEls = {};

  for (let r = 1; r <= 7; r++) {
    for (let c = 1; c <= 7; c++) {
      const key = `${r},${c}`;
      const el = document.createElement('div');
      el.className = 'cell';
      el.dataset.pos = key;

      if (key === HOME_POS) el.classList.add('center');
      else if (SAFE_SQUARES.has(key)) el.classList.add('safe');

      // Click handler for moving on highlighted cells
      el.addEventListener('click', () => onCellClick(key));

      board.appendChild(el);
      cellEls[key] = el;
    }
  }
}

function renderPieces() {
  // Remove all pieces from board
  document.querySelectorAll('.cell .piece').forEach(el => el.remove());
  // Remove piece count attribute
  Object.values(cellEls).forEach(el => el.removeAttribute('data-count'));

  // Remove home pieces from slots
  document.querySelectorAll('.home-slot .piece').forEach(el => el.remove());

  for (const pid of ['p1','p2']) {
    for (const piece of G.pieces[pid]) {
      if (piece.isDone) continue;

      if (!piece.isHome && piece.pos) {
        // On board
        const cell = cellEls[piece.pos];
        if (!cell) continue;
        const el = makePieceEl(piece);
        cell.appendChild(el);
        // Update count for CSS positioning
        const count = cell.querySelectorAll('.piece').length;
        cell.dataset.count = count;
      } else if (piece.isHome) {
        // In home slot
        const slot = document.getElementById(`hslot-${pid}-${piece.slot}`);
        if (!slot) continue;
        const el = makePieceEl(piece);
        el.classList.add('home-piece');
        slot.appendChild(el);
      }
    }
  }

  // After inserting all pieces, fix data-count for cells with multiple pieces
  for (const el of Object.values(cellEls)) {
    const count = el.querySelectorAll('.piece').length;
    if (count > 0) el.dataset.count = count;
  }

  updateCards();
}

function makePieceEl(piece) {
  const el = document.createElement('div');
  el.className = `piece ${piece.pid}`;
  el.dataset.id = piece.id;
  el.textContent = piece.slot + 1;
  el.addEventListener('click', (e) => {
    e.stopPropagation();
    onPieceClick(piece.id);
  });
  return el;
}

function highlightMovable(pieces) {
  clearHighlights();
  for (const piece of pieces) {
    const el = document.querySelector(`[data-id="${piece.id}"]`);
    if (el) el.classList.add('movable');
  }
}

function clearHighlights() {
  document.querySelectorAll('.piece.movable').forEach(el => el.classList.remove('movable'));
  document.querySelectorAll('.cell.highlight').forEach(el => el.classList.remove('highlight'));
}

// ─── PLAYER CARDS ────────────────────────────────────────
function updateCards() {
  for (const pid of ['p1','p2']) {
    const card = document.getElementById(`card-${pid}`);
    const statusEl = document.getElementById(`pstatus-${pid}`);
    const turnIcon = document.getElementById(`turn-icon-${pid}`);
    const isActive = G.turn === pid && !G.over;

    card.classList.toggle('active', isActive);
    if (turnIcon) turnIcon.style.opacity = isActive ? '1' : '0';

    // Glow home slots if this player can unlock
    const canEnter = isActive && G.rolled && G.roll && G.roll.isDhaayam;
    [0,1,2,3].forEach(i => {
      const slot = document.getElementById(`hslot-${pid}-${i}`);
      if (!slot) return;
      const hasPiece = slot.querySelector('.piece');
      slot.classList.toggle('glow', canEnter && !!hasPiece);
    });

    const done = G.pieces[pid].filter(p => p.isDone).length;
    const home = G.pieces[pid].filter(p => p.isHome).length;
    const out  = 4 - done - home;

    const scoreEl = document.getElementById(`score-${pid}`);
    if (scoreEl) scoreEl.textContent = `${done} / 4`;

    if (isActive && !G.over) {
      statusEl.textContent = G.rolled ? 'Select a piece to move' : 'Click a number to move';
    } else {
      statusEl.textContent = `✅ ${done} done  🏠 ${home} home  ♟ ${out} out`;
    }
  }

  const turnsEl = document.getElementById('score-turns');
  if (turnsEl) turnsEl.textContent = G.turnCount;
}

// ─── LOG (removed) ───────────────────────────────────────
function log() {} // Game log removed

// ─── SCOREBOARD ──────────────────────────────────────────
function updateScoreboard() {
  document.getElementById('sb-score-p1').textContent = G.score.p1;
  document.getElementById('sb-score-p2').textContent = G.score.p2;
}

// ─── TOAST ───────────────────────────────────────────────
let toastTimer = null;
function toast(msg, dur = 2400) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), dur);
}

// ─── DICE ANIMATION ──────────────────────────────────────
function clearDieHighlights() {
  document.querySelectorAll('.outer-die-num').forEach(el => {
    el.classList.remove('active', 'flicker');
  });
}

function highlightDieNum(die, val, cls) {
  document.querySelectorAll(`.outer-die-num[data-die="${die}"][data-val="${val}"]`)
    .forEach(el => el.classList.add(cls));
}

function animateDice(d1, d2, cb) {
  const face1 = document.getElementById('dface1');
  const box1  = document.getElementById('diebox1');

  box1.classList.add('rolling');
  Sound.roll();

  let t = 0;
  const flicker = setInterval(() => {
    const r1 = DIE_FACES[Math.floor(Math.random() * DIE_FACES.length)];
    face1.textContent = r1;
    t++;
    if (t > 16) {
      clearInterval(flicker);
      box1.classList.remove('rolling');
      face1.textContent = d1;
      cb();
    }
  }, 55);
}

// ─── TURN ENGINE ─────────────────────────────────────────
// Player 1 (Human): clicks LEFT column freely — any number to move
// Player 2 (AI):    rolls dice automatically, moves automatically

function startTurn() {
  G.rolled = false;
  G.roll = null;
  G.pendingConfirm = false;
  pendingPieces = [];
  clearHighlights();
  enableDieColumns(false);
  updateCards();

  document.getElementById('dface1').textContent = '—';
  document.getElementById('dface2').textContent = '—';
  document.getElementById('diceTotal').textContent = '—';
  document.getElementById('diceMsg').textContent = '';

  const pid = G.turn;
  const pname = pid === 'p1' ? 'Player 1 🔴' : 'Player 2 ⚫';
  const col = pid === 'p1' ? 'left' : 'right';
  log(`── ${pname}'s turn ──`, 'sys');
  document.getElementById('diceMsg').textContent = `${pname}: click a number on the ${col} to move`;
  Sound.turn();
  enableLeftColumn(true);
}

function enableLeftColumn(enabled) {
  const pid = G ? G.turn : 'p1';
  if (pid === 'p1') {
    // Player 1 uses LEFT column
    document.querySelectorAll('.outer-die-num[data-die="1"]').forEach(el => {
      if (el.classList.contains('blocked')) return;
      el.style.pointerEvents = enabled ? 'auto' : 'none';
      el.style.opacity = '1';
    });
    document.querySelectorAll('.outer-die-num[data-die="2"]').forEach(el => {
      el.style.pointerEvents = 'none';
      el.style.opacity = '1';
    });
  } else {
    // Player 2 uses RIGHT column
    document.querySelectorAll('.outer-die-num[data-die="2"]').forEach(el => {
      if (el.classList.contains('blocked')) return;
      el.style.pointerEvents = enabled ? 'auto' : 'none';
      el.style.opacity = '1';
    });
    document.querySelectorAll('.outer-die-num[data-die="1"]').forEach(el => {
      el.style.pointerEvents = 'none';
      el.style.opacity = '1';
    });
  }
}

function enableDieColumns(enabled, highlightVal) {
  document.querySelectorAll('.outer-die-num').forEach(el => {
    el.style.pointerEvents = 'none';
    el.style.opacity = el.classList.contains('blocked') ? '0.45' : '1';
    el.classList.remove('pulse', 'active', 'selected', 'flicker');
  });
}

// Player clicks a number in the LEFT column → that's their move
// Each number has 2 boxes — clicking one blocks it permanently
function onDieNumClick(die, val, boxEl) {
  if (!G || G.over) return;
  if (G.rolled) return;
  if (boxEl.classList.contains('blocked')) return;

  // Player 1 uses left column (die=1), Player 2 uses right column (die=2)
  if (G.turn === 'p1' && die !== '1') return;
  if (G.turn === 'p2' && die !== '2') return;

  // Block the clicked box permanently
  boxEl.classList.add('blocked');
  boxEl.style.pointerEvents = 'none';

  const moveVal = parseInt(val);
  const isDhaayam   = moveVal === 1;
  const isExtraTurn = moveVal === 1 || moveVal === 6 || moveVal === 8;
  const roll = { d1: moveVal, d2: 0, sum: moveVal, isDhaayam, isExtraTurn, moveValue: moveVal };

  G.roll = roll;
  G.rolled = true;

  // Disable the current player's column (move has been chosen)
  const activeDie = G.turn === 'p1' ? '1' : '2';
  document.querySelectorAll(`.outer-die-num[data-die="${activeDie}"]`).forEach(el => {
    el.style.pointerEvents = 'none';
  });

  const pname = G.turn === 'p1' ? 'Player 1' : 'Player 2';
  document.getElementById('dface1').textContent = moveVal;
  document.getElementById('diceTotal').textContent = `${moveVal}`;
  let msg = isDhaayam ? '🔓 DHAAYAM! Click a piece to enter!' : isExtraTurn ? `⭐ ${moveVal} — extra turn!` : `Move ${moveVal} steps — click a piece!`;
  document.getElementById('diceMsg').textContent = msg;
  log(`🎯 ${pname} chose ${moveVal}${isDhaayam ? ' 🔓' : ''}${isExtraTurn && !isDhaayam ? ' ⭐' : ''}`, G.turn);
  Sound.move();

  afterRoll();
}

function afterRoll() {
  const pid     = G.turn;
  const roll    = G.roll;
  const movable = G.pieces[pid].filter(p => canMove(p, roll, G));

  if (!movable.length) {
    // Check if safe→safe rule is blocking pieces
    const safeBlocked = G.pieces[pid].filter(p =>
      !p.isHome && !p.isDone &&
      SAFE_SQUARES.has(p.pos) &&
      (() => {
        const track = TRACKS[p.pid];
        const newIdx = p.trackIdx + roll.moveValue;
        return newIdx < track.length && SAFE_SQUARES.has(track[newIdx]);
      })()
    );
    if (safeBlocked.length > 0) {
      log('⛔ Invalid move! Safe square → Safe square not allowed.', 'sys');
      toast('⛔ Invalid! Safe square → Safe square not allowed!', 3000);
    } else {
      log('No moves available. Turn passes.', 'sys');
      toast('No moves! Turn passes.');
    }
    setTimeout(() => nextTurn(false), 2000);
    return;
  }

  // Both players are human — highlight pieces and wait for click
  pendingPieces = movable;
  highlightMovable(movable);
  if (roll.isDhaayam && movable.some(p => p.isHome)) {
    const pname = pid === 'p1' ? 'Player 1' : 'Player 2';
    toast(`🔓 DHAAYAM! ${pname} click a home piece to enter!`, 3000);
  }
  updateCards();
}

// Simple AI: prefers captures > entering > advancing furthest piece

function doMove(piece) {
  clearHighlights();
  pendingPieces = [];

  // Hop animation
  const el = document.querySelector(`[data-id="${piece.id}"]`);
  if (el) { el.classList.add('hop'); el.classList.remove('movable'); }

  setTimeout(() => {
    const result = applyMove(piece, G.roll);
    const pid = piece.pid;
    const name = pid === 'p1' ? 'Player 1' : 'Player 2';
    let extraTurn = G.roll.isExtraTurn;

    if (result.type === 'enter') {
      log(`🔓 ${name} entered piece ${piece.slot+1}`, pid);
      toast(`🔓 ${name} piece ${piece.slot+1} on the board!`);
    } else if (result.type === 'done') {
      log(`🏠 ${name}'s piece ${piece.slot+1} reached HOME! 🎉`, pid);
      toast(`🏠 ${name} piece reached center! Score x4! 🎉`);
      // Multiply total score by 4 when piece reaches home
      G.score[pid] = G.score[pid] * 4;
      extraTurn = true;
    } else {
      log(`♟ ${name} moved piece ${piece.slot+1} → ${piece.pos}`, pid);
    }

    // Update score — add steps moved (only for non-home moves)
    if (result.type !== 'done') {
      G.score[pid] += G.roll.moveValue;
    }
    updateScoreboard();

    if (result.captured.length > 0) {
      Sound.capture();
      extraTurn = true;
      result.captured.forEach(cp => {
        const capName = cp.pid === 'p1' ? 'Player 1' : 'Player 2';
        log(`💥 ${name} captured ${capName}'s piece ${cp.slot+1}!`, 'sys');
        // Decrease captured player's score by the steps that piece had moved
        const stepsLost = cp.stepsAtCapture || 0;
        G.score[cp.pid] = Math.max(0, G.score[cp.pid] - stepsLost);
      });
      toast(`💥 ${name} captured! Extra turn!`, 2500);
      updateScoreboard();
    }

    if (!piece.isHome && !piece.isDone && SAFE_SQUARES.has(piece.pos) && result.type !== 'enter') {
      Sound.safe();
      toast(`🛡️ ${name} on safe square!`, 2000);
    }

    if (extraTurn && result.type !== 'done') {
      Sound.extra();
      log(`⭐ ${name} gets an extra turn!`, 'sys');
      toast(`⭐ ${name} gets an extra turn!`);
    }

    renderPieces();

    // Check win
    const winner = checkWinner();
    if (winner) {
      setTimeout(() => showWin(winner), 600);
      return;
    }

    setTimeout(() => nextTurn(extraTurn), extraTurn ? 900 : 500);

  }, 350);
}

function nextTurn(samePlayer = false) {
  if (!samePlayer) {
    G.turn = G.turn === 'p1' ? 'p2' : 'p1';
    G.turnCount++;
  }
  G.rolled = false;
  G.roll = null;
  G.pendingConfirm = false;
  startTurn();
}

function setRollBtn(enabled) {
  document.getElementById('rollBtn').disabled = !enabled;
}



// ─── CLICK HANDLERS ──────────────────────────────────────
function onPieceClick(id) {
  if (!G || G.over) return;
  if (!G.rolled || !pendingPieces.length) return;

  const pid = G.turn;
  const piece = G.pieces[pid].find(p => p.id === id);
  if (!piece) return;

  if (!pendingPieces.some(p => p.id === id)) {
    // Check if specifically a safe→safe violation
    if (!piece.isHome && !piece.isDone && G.roll) {
      const track = TRACKS[pid];
      const newIdx = piece.trackIdx + G.roll.moveValue;
      if (newIdx < track.length) {
        const newPos = track[newIdx];
        if (SAFE_SQUARES.has(piece.pos) && SAFE_SQUARES.has(newPos)) {
          toast('🚫 Invalid! Safe square → Safe square not allowed!', 2500);
          log('🚫 Invalid! Cannot move from one safe square to another.', 'sys');
          return;
        }
      }
    }
    toast("That piece can't move right now!", 1200);
    return;
  }
  doMove(piece);
}

function onCellClick(pos) {
  // Not needed for Dhaayam (click piece directly), but kept for future use
}

// ─── WIN SCREEN ──────────────────────────────────────────
function showWin(winner) {
  G.over = true;
  G.winner = winner;
  Sound.win();

  const wname = winner === 'p1' ? 'Player 1 🔴' : 'Player 2 ⚫';
  document.getElementById('winTrophy').textContent = '🏆';
  document.getElementById('winTitle').textContent  = `${wname} Wins!`;
  document.getElementById('winMsg').textContent = `${wname} mastered the ancient board of Dhaayam!`;

  const p1done = G.pieces.p1.filter(p => p.isDone).length;
  const p2done = G.pieces.p2.filter(p => p.isDone).length;
  document.getElementById('winStats').innerHTML =
    `Player 1 pieces home: ${p1done}/4<br>` +
    `Player 2 pieces home: ${p2done}/4<br>` +
    `Total turns: ${G.turnCount}<br>` +
    `P1 captures: ${G.captureCount.p1} · P2 captures: ${G.captureCount.p2}`;

  showScreen('win-screen');
}

// ─── SCREENS ─────────────────────────────────────────────
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

function startGame() {
  G = newGame();
  buildBoard();
  renderPieces();
  // Reset ALL blocked boxes for new game (both columns)
  document.querySelectorAll('.outer-die-num').forEach(el => {
    el.classList.remove('blocked');
    el.style.opacity = '1';
  });
  // Reset scoreboard
  document.getElementById('sb-score-p1').textContent = '0';
  document.getElementById('sb-score-p2').textContent = '0';
  document.getElementById('logList') && (document.getElementById('logList').innerHTML = '');
  log('🎮 Game started! Player 1 = Red 🔴. Player 2 = Black ⚫.', 'sys');
  log('📍 Red enters at bottom-left (7,1). Black enters at top-right (1,7).', 'sys');
  showScreen('game-screen');
  startTurn();
}

// ─── EVENT LISTENERS ─────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {

  // Start
  document.getElementById('startBtn').addEventListener('click', startGame);

  // Rules
  document.getElementById('rulesBtn').addEventListener('click', () => showScreen('rules-screen'));
  document.getElementById('backFromRules').addEventListener('click', () => showScreen('home-screen'));

  // Back to menu
  document.getElementById('backBtn').addEventListener('click', () => {
    if (confirm('Return to menu? Current game will be lost.')) showScreen('home-screen');
  });

  // Roll button — hidden (AI rolls automatically, human uses left column)
  const rollBtn = document.getElementById('rollBtn');
  if (rollBtn) rollBtn.style.display = 'none';

  // Sound
  document.getElementById('soundBtn').addEventListener('click', () => {
    const on = Sound.toggle();
    document.getElementById('soundBtn').textContent = on ? '🔊' : '🔇';
    toast(on ? 'Sound ON 🔊' : 'Sound OFF 🔇', 1200);
  });

  // Win screen
  document.getElementById('playAgainBtn').addEventListener('click', startGame);
  document.getElementById('menuBtn').addEventListener('click', () => showScreen('home-screen'));

  // Die column clicks — left column for Player 1
  document.querySelectorAll('.outer-die-num').forEach(el => {
    el.addEventListener('click', () => {
      onDieNumClick(el.dataset.die, el.dataset.val, el);
    });
  });
});