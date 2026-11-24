import { createUserWithEmailAndPassword, onAuthStateChanged, signInWithEmailAndPassword, signOut, updateProfile, type User } from 'firebase/auth';
import { auth } from '../firebase/auth';

function requireAuth() {
  if (!auth) throw new Error('Firebase Authentication غير مهيأ. أنشئ .env.local من .env.example.');
  return auth;
}
export function signIn(email: string, password: string) { return signInWithEmailAndPassword(requireAuth(), email, password); }
export async function signUp(email: string, password: string, displayName: string) {
  const result = await createUserWithEmailAndPassword(requireAuth(), email, password);
  if (displayName.trim()) await updateProfile(result.user, { displayName: displayName.trim() });
  return result;
}
export function observeAuth(callback: (user: User | null) => void) { return onAuthStateChanged(requireAuth(), callback); }
export function logout() { return signOut(requireAuth()); }
