// The OBS browser source (/live/overlay/): a transparent 1920×1080 page that
// draws whatever the admin page has put on screen. It only reads the game state,
// so it needs no sign-in. Without Firebase settings it shows a sample scorebug,
// so the source can be placed in OBS before the scoreboard is connected.
import { connect } from './sync.js';
import * as R from './render.js';

const D = JSON.parse(document.getElementById('live-data').textContent);
const stage = document.getElementById('stage');
const note = document.getElementById('note');
let sync = null;
let S = null;
const now = () => (sync ? sync.now() : Date.now());

function fit() {
  const k = Math.min(window.innerWidth / 1920, window.innerHeight / 1080);
  stage.style.transform = 'scale(' + k + ')';
}
window.addEventListener('resize', fit);
fit();

const overlay = R.createOverlay(stage, D, now);
const inObs = typeof window.obsstudio !== 'undefined';

// Outside OBS a short note explains the page; OBS never shows it.
function say(text) {
  if (inObs) return;
  note.textContent = text;
  note.hidden = !text;
}

function show(s) {
  S = R.validState(s, D) ? s : null;
  if (S) overlay.update(S);
}

function loop() {
  if (S) overlay.tick(R.remaining(S.clock, now()), (S.startAt || 0) - now());
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

(async function start() {
  try {
    sync = await connect({ auth: false });
  } catch (e) {
    sync = null;
  }
  if (!sync) {
    show(R.demoState(D, Date.now()));
    say('Sample scorebug: the scoreboard is not connected to Firebase yet. In OBS add this address as a Browser source, 1920 × 1080.');
    return;
  }
  say('Stream overlay for OBS: add this address as a Browser source, 1920 × 1080. It shows what the admin page puts on screen.');
  sync.onState(show);
})();
