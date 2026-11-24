import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

initializeApp();

export const setUserRole = onCall(async (request) => {
  if (!request.auth || request.auth.token.role !== 'admin') {
    throw new HttpsError('permission-denied', 'Admin role is required.');
  }
  const uid = typeof request.data?.uid === 'string' ? request.data.uid : '';
  const role = request.data?.role;
  if (!uid || !['student', 'teacher', 'parent', 'admin'].includes(role)) {
    throw new HttpsError('invalid-argument', 'A valid uid and role are required.');
  }
  await getAuth().setCustomUserClaims(uid, { role });
  return { ok: true };
});
