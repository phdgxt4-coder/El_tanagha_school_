export function required(value: string, label: string) {
  if (!value.trim()) throw new Error(`${label} مطلوب.`);
  return value.trim();
}

export function validEmail(value: string) {
  const email = value.trim().toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(email)) throw new Error('البريد الإلكتروني غير صحيح.');
  return email;
}

export function passwordForFirebase(value: string) {
  if (value.length < 8) throw new Error('كلمة المرور يجب ألا تقل عن 8 أحرف.');
  return value;
}
