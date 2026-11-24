import { collection, doc, getDoc, getDocs, limit, orderBy, query, startAfter, where, type DocumentData, type QueryConstraint, type QueryDocumentSnapshot } from 'firebase/firestore/lite';
import { db } from '../firebase/firestore-lite';
import type { Role } from '../security/authorization';

const PAGE_SIZE = 20;
const CACHE_TTL_MS = 30_000;
const cache = new Map<string, { expiresAt: number; value: unknown[] }>();
function requireDb() { if (!db) throw new Error('Firestore غير مهيأ.'); return db; }

export type Page<T> = { items: T[]; cursor: QueryDocumentSnapshot<DocumentData> | null; hasMore: boolean };
export async function listPage<T = DocumentData>(name: string, cursor: QueryDocumentSnapshot<DocumentData> | null = null, pageSize = PAGE_SIZE, constraints: QueryConstraint[] = []): Promise<Page<T>> {
  const key = `${name}:${pageSize}:${constraints.length}`;
  const cacheable = constraints.length === 0;
  if (!cursor && cacheable) {
    const hit = cache.get(key);
    if (hit && hit.expiresAt > Date.now()) return { items: hit.value as T[], cursor: null, hasMore: hit.value.length === pageSize };
  }
  const clauses = [...constraints, orderBy('createdAt', 'desc'), limit(pageSize)];
  if (cursor) clauses.splice(clauses.length - 1, 0, startAfter(cursor));
  const snapshot = await getDocs(query(collection(requireDb(), name), ...clauses));
  const items = snapshot.docs.map((item) => ({ id: item.id, ...item.data() })) as T[];
  if (!cursor && cacheable) cache.set(key, { expiresAt: Date.now() + CACHE_TTL_MS, value: items });
  return { items, cursor: snapshot.docs.at(-1) ?? null, hasMore: snapshot.docs.length === pageSize };
}
export function invalidateCollection(name: string) { for (const key of cache.keys()) if (key.startsWith(`${name}:`)) cache.delete(key); }
export async function getOwnProfile(uid: string) {
  if (!db) throw new Error('Firestore غير مهيأ.');
  const snapshot = await getDoc(doc(db, 'users', uid));
  return snapshot.exists() ? ({ id: snapshot.id, ...snapshot.data() } as Record<string, unknown>) : null;
}
export async function listStudentAssignmentsPage(uid: string, cursor: QueryDocumentSnapshot<DocumentData> | null = null, pageSize = PAGE_SIZE) {
  return listPage('assignments', cursor, pageSize, [where('studentId', '==', uid)]);
}
export async function listStudentAssignments(uid: string, cursor: QueryDocumentSnapshot<DocumentData> | null = null, pageSize = PAGE_SIZE) {
  return listStudentAssignmentsPage(uid, cursor, pageSize);
}
export async function createTeacherContent(role: Role, collectionName: 'lessons' | 'videos' | 'assignments', data: DocumentData) {
  if (role !== 'teacher' && role !== 'admin') throw new Error('هذه العملية متاحة للمدرس أو المدير فقط.');
  const { addDoc, collection } = await import('firebase/firestore');
  const { db: writeDb } = await import('../firebase/firestore');
  if (!writeDb) throw new Error('Firestore غير مهيأ.');
  const result = await addDoc(collection(writeDb, collectionName), { ...data, createdAt: new Date() });
  invalidateCollection(collectionName);
  return result;
}
