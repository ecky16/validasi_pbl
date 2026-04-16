import { initializeApp } from 'firebase/app';
import { initializeFirestore } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';

// Safely import the config file only if it exists (prevents Vercel build errors when gitignored)
const configModules = import.meta.glob('../../firebase-applet-config.json', { eager: true });
const configModule: any = configModules['../../firebase-applet-config.json'] || {};
const firebaseAppletConfig = configModule.default || configModule;

// Support both JSON file and Environment Variables (for Vercel/Production)
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || firebaseAppletConfig.apiKey,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || firebaseAppletConfig.authDomain,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || firebaseAppletConfig.projectId,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || firebaseAppletConfig.storageBucket,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || firebaseAppletConfig.messagingSenderId,
  appId: import.meta.env.VITE_FIREBASE_APP_ID || firebaseAppletConfig.appId,
  firestoreDatabaseId: import.meta.env.VITE_FIREBASE_FIRESTORE_DATABASE_ID || firebaseAppletConfig.firestoreDatabaseId || '(default)'
};

const app = initializeApp(firebaseConfig);
// Use initializeFirestore with experimentalForceLongPolling for better stability in iframe/sandboxed environments
export const db = initializeFirestore(app, {
  experimentalForceLongPolling: true,
}, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);
