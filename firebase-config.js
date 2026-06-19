const firebaseConfig = {
  apiKey:            "AIzaSyBQVpWJx0v5vaO91Diz1J5RiSkIjAitctw",
  authDomain:        "sayathub-d302a.firebaseapp.com",
  projectId:         "sayathub-d302a",
  storageBucket:     "sayathub-d302a.firebasestorage.app",
  messagingSenderId: "801731013149",
  appId:             "1:801731013149:web:e0f3889e2def3c43df74f4",
  measurementId:     "G-F2EX33LRDH"
};

firebase.initializeApp(firebaseConfig);

const auth    = firebase.auth();
const db      = firebase.firestore();
const storage = firebase.storage();

db.settings({ ignoreUndefinedProperties: true });
