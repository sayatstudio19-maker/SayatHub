// ═══════════════════════════════════════════════════════════
//  SAYATHUB — FIREBASE CONFIGURATION
//  👉 Replace the values below with your Firebase project keys
//  Firebase Console: https://console.firebase.google.com
// ═══════════════════════════════════════════════════════════

const firebaseConfig = {
  apiKey:            "YOUR_API_KEY",
  authDomain:        "YOUR_PROJECT_ID.firebaseapp.com",
  projectId:         "YOUR_PROJECT_ID",
  storageBucket:     "YOUR_PROJECT_ID.appspot.com",
  messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
  appId:             "YOUR_APP_ID"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);

// ─── Service shortcuts (used throughout app.js) ───
const auth    = firebase.auth();
const db      = firebase.firestore();
const storage = firebase.storage();

// ─── Firestore settings ───
db.settings({ ignoreUndefinedProperties: true });

console.log("✅ Firebase initialized — SayatHub");
