// Firebase settings for the live scoreboard (/live/admin/ and /live/overlay/).
//
// Paste the "firebaseConfig" block from Firebase → Project settings → Your apps
// here. These values are public by design (every visitor's browser needs them);
// what protects the scoreboard is the database rules in the Firebase console,
// which let only the organisers' Google accounts change it.
//
// While this is null the admin page runs in test mode (nothing is sent) and the
// overlay page shows a sample scorebug, so OBS can be set up before Firebase is.
export const FIREBASE = null;

// Where the game state lives in the Realtime Database.
export const DB_PATH = 'live';
