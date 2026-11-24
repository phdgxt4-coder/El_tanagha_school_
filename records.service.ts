import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase/firestore';
import type { Role } from '../security/authorization';
import { invalidateCollection } from '../database/content.service';

const allowed: Record<Role, string[]> = {
  student: ['submissions','favorites'], teacher: ['lessons','videos','exams','assignments','attendance','grades','questions'], parent: ['messages'], admin: ['news','subjects','lessons','videos']
};
export async function createRecord(role: Role, uid: string, collectionName: string, payload: Record<string, unknown>) {
  if (!allowed[role]?.includes(collectionName)) throw new Error('هذه العملية غير متاحة لهذا الدور.');
  if (!db) throw new Error('Firestore غير مهيأ.');
  const result = await addDoc(collection(db, collectionName), { ...payload, ownerId: uid, createdAt: serverTimestamp() });
  invalidateCollection(collectionName);
  return result;
}
