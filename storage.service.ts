import { deleteObject, getBlob, getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { storage } from '../firebase/storage';
import type { Role } from '../security/authorization';

const MAX_FILE_SIZE = 25 * 1024 * 1024;
const ALLOWED_FILE_TYPES = new Set([
  'application/pdf',
  'image/jpeg', 'image/png', 'image/gif', 'image/webp',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation'
]);

export async function uploadLessonFile(role: Role, uid: string, file: File) {
  if (role !== 'teacher' && role !== 'admin') throw new Error('رفع الملفات متاح للمدرس والمدير فقط.');
  if (!ALLOWED_FILE_TYPES.has(file.type)) throw new Error('الصيغ المسموحة: PDF، الصور، ومستندات Word أو عروض PowerPoint. لا يمكن رفع فيديو هنا.');
  if (file.size > MAX_FILE_SIZE) throw new Error('حجم الملف يجب ألا يتجاوز 25MB.');
  if (!storage) throw new Error('Firebase Storage غير مهيأ.');
  const extension = file.name.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '') || 'file';
  const path = `lessons/${uid}/${crypto.randomUUID()}.${extension}`;
  const result = await uploadBytes(ref(storage, path), file, { contentType: file.type });
  return { url: await getDownloadURL(result.ref), path };
}

export async function uploadPdf(role: Role, uid: string, file: File) {
  if (file.type !== 'application/pdf') throw new Error('يسمح برفع ملفات PDF فقط.');
  return (await uploadLessonFile(role, uid, file)).url;
}

export async function downloadLessonFile(path: string) {
  if (!storage) throw new Error('Firebase Storage غير مهيأ.');
  if (!/^lessons\/[A-Za-z0-9_-]+\/[A-Za-z0-9._-]+$/.test(path)) throw new Error('مسار الملف غير صالح.');
  return getBlob(ref(storage, path));
}

export async function deleteLessonFile(role: Role, uid: string, path: string) {
  if (role !== 'teacher' && role !== 'admin') throw new Error('حذف الملفات متاح للمدرس والمدير فقط.');
  if (!storage) throw new Error('Firebase Storage غير مهيأ.');
  if (!/^lessons\/[A-Za-z0-9_-]+\/[A-Za-z0-9._-]+$/.test(path)) throw new Error('مسار الملف غير صالح.');
  if (role === 'teacher' && !path.startsWith(`lessons/${uid}/`)) throw new Error('لا يمكن حذف ملف خارج مجلدك.');
  await deleteObject(ref(storage, path));
}
