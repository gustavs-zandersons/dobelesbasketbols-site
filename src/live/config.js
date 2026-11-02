// Firebase settings for the live scoreboard (/live/admin/ and /live/overlay/).
//
// Paste the "firebaseConfig" block from Firebase → Project settings → Your apps
// here. These values are public by design (every visitor's browser needs them);
// what protects the scoreboard is the database rules in the Firebase console,
// which let only the organisers' Google accounts change it.
//
// If this is set back to null the admin page runs in test mode (nothing is sent) and the
// overlay page shows a sample scorebug, so OBS can be set up before Firebase is.
export const FIREBASE = {
  apiKey: 'AIzaSyD7FhMYFh8zif5--sV8W-46FyESPft3jwk',
  authDomain: 'dobelesbasketbols-live-admin.firebaseapp.com',
  databaseURL: 'https://dobelesbasketbols-live-admin-default-rtdb.europe-west1.firebasedatabase.app',
  projectId: 'dobelesbasketbols-live-admin',
  storageBucket: 'dobelesbasketbols-live-admin.firebasestorage.app',
  messagingSenderId: '306834677211',
  appId: '1:306834677211:web:b323068ad21a4ffba8dbfe'
};

// Where the game state lives in the Realtime Database.
export const DB_PATH = 'live';
