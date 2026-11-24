import { collection, getDocs, limit, orderBy, query, where } from 'firebase/firestore/lite';
import { db } from '../firebase/firestore-lite';

type Metric = number | '20+' | null;
type RecentItem = { id: string; title: string; subject: string; kind: string; createdAt: number | null };

function requireDb() {
  if (!db) throw new Error('Firestore غير مهيأ.');
  return db;
}

async function count(name: string, role?: string): Promise<Metric> {
  try {
    const constraints = role ? [where('role', '==', role), limit(21)] : [limit(21)];
    const snapshot = await getDocs(query(collection(requireDb(), name), ...constraints));
    return snapshot.size > 20 ? '20+' : snapshot.size;
  } catch {
    return null;
  }
}

function timestamp(value: unknown): number | null {
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'number' || typeof value === 'string') {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date.getTime();
  }
  if (value && typeof value === 'object' && 'toDate' in value && typeof value.toDate === 'function') {
    const date = (value as { toDate: () => Date }).toDate();
    return Number.isNaN(date.getTime()) ? null : date.getTime();
  }
  if (value && typeof value === 'object' && 'seconds' in value) {
    const seconds = Number((value as { seconds: unknown }).seconds);
    return Number.isFinite(seconds) ? seconds * 1000 : null;
  }
  return null;
}

async function recent(name: 'lessons' | 'videos' | 'exams' | 'assignments', kind: string): Promise<RecentItem[]> {
  try {
    const result = await getDocs(query(collection(requireDb(), name), orderBy('createdAt', 'desc'), limit(5)));
    return result.docs.map((item) => {
      const data = item.data();
      return {
        id: item.id,
        title: String(data.title ?? data.name ?? (kind === 'فيديو' ? 'فيديو تعليمي' : 'محتوى تعليمي')),
        subject: String(data.subject ?? 'غير مصنف'),
        kind,
        createdAt: timestamp(data.createdAt)
      };
    });
  } catch {
    return [];
  }
}

export async function getTeacherDashboardData() {
  const [lessons, videos, exams, assignments, lessonItems, videoItems] = await Promise.all([
    count('lessons'), count('videos'), count('exams'), count('assignments'),
    recent('lessons', 'ملف درس'), recent('videos', 'فيديو YouTube')
  ]);
  return {
    metrics: { students: null as Metric, lessons, videos, exams, assignments },
    recentUploads: [...lessonItems, ...videoItems].sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0)).slice(0, 6)
  };
}

export async function getAdminDashboardData() {
  const [users, students, teachers, lessons, videos, exams, lessonItems, videoItems] = await Promise.all([
    count('users'), count('users', 'student'), count('users', 'teacher'), count('lessons'), count('videos'), count('exams'),
    recent('lessons', 'ملف درس'), recent('videos', 'فيديو YouTube')
  ]);
  const contentValues = [lessons, videos, exams];
  const content = contentValues.some((value) => value === null) ? null : (() => {
    const capped = contentValues.includes('20+');
    const total = contentValues.reduce<number>((sum, value) => sum + (typeof value === 'number' ? value : value === '20+' ? 20 : 0), 0);
    return capped ? `${new Intl.NumberFormat('ar').format(total)}+` : total;
  })();
  return {
    metrics: { users, students, teachers, content },
    recentUploads: [...lessonItems, ...videoItems].sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0)).slice(0, 6),
    connected: users !== null || lessons !== null || videos !== null || exams !== null
  };
}
