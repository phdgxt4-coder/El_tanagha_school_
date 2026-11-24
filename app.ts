import { getApps, initializeApp } from 'firebase/app';
import { firebaseConfig, hasFirebaseConfig } from '../config/firebase.config';

export const firebaseReady = hasFirebaseConfig();
export const app = firebaseReady ? (getApps()[0] ?? initializeApp(firebaseConfig)) : null;
