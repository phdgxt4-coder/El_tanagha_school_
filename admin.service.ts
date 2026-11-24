import { getFunctions, httpsCallable } from 'firebase/functions';
import { app } from '../firebase/app';

export async function setUserRole(uid: string, role: string) {
  if (!app) throw new Error('Firebase غير مهيأ.');
  if (!['student','teacher','parent','admin'].includes(role)) throw new Error('الدور غير صحيح.');
  const fn = httpsCallable(getFunctions(app), 'setUserRole');
  await fn({ uid, role });
}
