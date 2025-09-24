import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: "AIzaSyCPQqCufM8BHclkqy26vHsPuVyvcjuVHs0",
  authDomain: "hannam-move-calculate.firebaseapp.com",
  projectId: "hannam-move-calculate",
  storageBucket: "hannam-move-calculate.firebasestorage.app",
  messagingSenderId: "578721983901",
  appId: "1:578721983901:web:84c3ff829069cb5ecf1374",
  measurementId: "G-V8M6DR6202"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
