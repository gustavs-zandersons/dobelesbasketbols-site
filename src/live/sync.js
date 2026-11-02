// The link between the admin page and the OBS overlay: one small JSON document
// (the game state) in Firebase's Realtime Database. The admin writes it, the
// overlay listens. Both use Firebase's server clock, so the game clock reads the
// same on the phone and in OBS even if the two devices' clocks disagree.
import { FIREBASE, DB_PATH } from './config.js';

const SDK = 'https://www.gstatic.com/firebasejs/10.14.1/';

// Returns null when Firebase isn't set up yet (config.js), otherwise
// { now, onState, write, onConnection } and, with { auth: true },
// { onUser, signIn, signOut } for the admin page.
export async function connect(opts) {
  if (!FIREBASE || !FIREBASE.databaseURL) return null;
  const appMod = await import(SDK + 'firebase-app.js');
  const dbMod = await import(SDK + 'firebase-database.js');
  const app = appMod.initializeApp(FIREBASE);
  const db = dbMod.getDatabase(app);
  const stateRef = dbMod.ref(db, DB_PATH + '/state');

  let offset = 0;
  dbMod.onValue(dbMod.ref(db, '.info/serverTimeOffset'), (snap) => { offset = Number(snap.val()) || 0; });

  const api = {
    now: () => Date.now() + offset,
    onState: (cb) => dbMod.onValue(stateRef, (snap) => cb(snap.val())),
    write: (state) => dbMod.set(stateRef, state),
    onConnection: (cb) => dbMod.onValue(dbMod.ref(db, '.info/connected'), (snap) => cb(!!snap.val()))
  };

  if (opts && opts.auth) {
    const authMod = await import(SDK + 'firebase-auth.js');
    const auth = authMod.getAuth(app);
    api.onUser = (cb) => authMod.onAuthStateChanged(auth, cb);
    api.signIn = () => authMod.signInWithPopup(auth, new authMod.GoogleAuthProvider());
    api.signOut = () => authMod.signOut(auth);
  }
  return api;
}
