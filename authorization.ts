import type { User } from 'firebase/auth';
import { db } from '../firebase/firestore';

export type Role = 'student' | 'teacher' | 'parent' | 'admin';

export async function getUserRole(user: User): Promise<Role | null> {
  const token = await user.getIdTokenResult();
  const claimRole = token.claims.role;
  if (claimRole === 'student' || claimRole === 'teacher' || claimRole === 'parent' || claimRole === 'admin') return claimRole;
  const { db } = await import('../firebase/firestore-lite');
  if (!db) return null;
  const { doc, getDoc } = await import('firebase/firestore/lite');
  const profile = await getDoc(doc(db, 'users', user.uid));
  const profileRole = profile.data()?.role;
  return profileRole === 'student' || profileRole === 'teacher' || profileRole === 'parent' || profileRole === 'admin' ? profileRole : null;
}

export function assertRole(actual: Role | null, allowed: Role[]): asserts actual is Role {
  if (!actual || !allowed.includes(actual)) throw new Error('ليس لديك صلاحية لتنفيذ هذا الإجراء.');
}
