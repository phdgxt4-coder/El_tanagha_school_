import type { User } from 'firebase/auth';
import { where, type QueryConstraint } from 'firebase/firestore/lite';
import { getUserRole, type Role } from '../security/authorization';
import { getOwnProfile, listPage, listStudentAssignments } from '../database/content.service';
import { featureCatalog, type Field } from '../features/catalog';
import { escapeHtml } from '../components/ui';
import { debounce } from '../utils/debounce';
import { exportJson } from '../utils/export';

function fieldHtml(field: Field) { return `<label>${escapeHtml(field.label)}<input name="${escapeHtml(field.name)}" type="${field.type ?? 'text'}" placeholder="${escapeHtml(field.placeholder ?? '')}" ${field.accept ? `accept="${escapeHtml(field.accept)}"` : ''} ${field.required === false ? '' : 'required'}></label>`; }
function itemsHtml(items: Record<string, unknown>[]) { return items.map((item) => `<article class="panel"><h3>${escapeHtml(item.title ?? item.name ?? item.subject ?? 'عنصر')}</h3><p class="muted">${escapeHtml(item.subject ?? item.description ?? item.status ?? 'متاح حسب الصلاحية')}</p></article>`).join(''); }

export async function renderFeature(root: HTMLElement, user: User, section: string, signal: AbortSignal) {
  const role = await getUserRole(user); if (!role) throw new Error('لا يوجد دور موثق للحساب.');
  const feature = featureCatalog[role][section]; if (!feature) throw new Error('القسم غير متاح لهذا الدور.');
  if (feature.action === 'youtube' || feature.action === 'uploadFile' || feature.action === 'contentManager' || feature.collection === 'videos' || feature.collection === 'lessons') {
    const { renderContentFeature } = await import('../features/content-manager');
    await renderContentFeature(root, user, role, section, signal);
    return;
  }
  root.innerHTML = `<section class="page-title"><span class="tag">${escapeHtml(role)}</span><h1>${escapeHtml(feature.title)}</h1><p class="muted">${escapeHtml(feature.description)}</p></section>${feature.fields?.length ? `<form id="feature-form" class="panel form-grid">${feature.fields.map(fieldHtml).join('')}<button class="btn" type="submit">حفظ</button><p id="feature-error" class="error" role="status" aria-live="polite"></p></form>` : ''}<div id="feature-list" class="secure-grid"><article class="panel"><p class="muted">${feature.action === 'theme' ? 'غيّر الوضع من زر الإعدادات في القائمة.' : 'جاري تحميل البيانات…'}</p></article></div>`;
  if (feature.action === 'theme' || signal.aborted) return;
  const list = root.querySelector<HTMLElement>('#feature-list')!;
  let page;
  if (role === 'student' && feature.collection === 'assignments') page = await listStudentAssignments(user.uid, null, 20);
  else if (role === 'student' && feature.collection === 'users') {
    const profile = await getOwnProfile(user.uid);
    page = { items: profile ? [profile] : [], cursor: null, hasMore: false };
  } else if (feature.collection) {
    const constraints: QueryConstraint[] = [];
    if (role === 'student' && ['grades', 'attendance'].includes(feature.collection)) constraints.push(where('studentId', '==', user.uid));
    if (role === 'student' && feature.collection === 'favorites') constraints.push(where('ownerId', '==', user.uid));
    if (role === 'parent' && ['assignments', 'grades', 'attendance', 'reports'].includes(feature.collection)) constraints.push(where('parentIds', 'array-contains', user.uid));
    if (role === 'parent' && feature.collection === 'messages') constraints.push(where('recipientId', '==', user.uid));
    if ((role === 'student' || role === 'parent') && feature.collection === 'notifications') constraints.push(where('recipientId', '==', user.uid));
    page = await listPage<Record<string, unknown>>(feature.collection, null, 20, constraints);
  }
  if (signal.aborted) return;
  if (page) list.innerHTML = page.items.length ? itemsHtml(page.items) : '<article class="panel"><p class="muted">لا توجد بيانات بعد.</p></article>';
  const form = root.querySelector<HTMLFormElement>('#feature-form');
  if (form) {
    form.addEventListener('submit', async (event) => {
      event.preventDefault(); const error = root.querySelector<HTMLElement>('#feature-error')!; error.textContent = ''; error.setAttribute('role', 'status');
      try {
        const values = Object.fromEntries(new FormData(form).entries());
        if (feature.action === 'uploadPdf') { const { uploadPdf } = await import('../services/storage.service'); const { createRecord } = await import('../services/records.service'); const file = values.file as File; const url = await uploadPdf(role, user.uid, file); await createRecord(role, user.uid, 'lessons', { title: values.title, subject: values.subject, fileUrl: url }); }
        else if (feature.action === 'role') { const { setUserRole } = await import('../services/admin.service'); await setUserRole(String(values.uid), String(values.role)); }
        else if (feature.collection) { const { createRecord } = await import('../services/records.service'); const collection = role === 'student' && feature.collection === 'assignments' ? 'submissions' : feature.collection; const payload = feature.collection === 'messages' ? { ...values, senderId: user.uid } : { ...values, ...(collection === 'submissions' ? { studentId: user.uid } : {}) }; await createRecord(role, user.uid, collection, payload); }
        form.reset(); error.textContent = 'تم الحفظ بنجاح.';
      } catch (reason) { error.setAttribute('role', 'alert'); error.textContent = reason instanceof Error ? reason.message : 'تعذر تنفيذ العملية.'; }
    }, { signal });
  }
  if (feature.action === 'search') {
    const input = form?.querySelector<HTMLInputElement>('input[name="query"]');
    const search = debounce(() => { const q = input?.value.trim().toLowerCase() ?? ''; list.querySelectorAll<HTMLElement>('.panel').forEach((card) => { card.hidden = !!q && !card.textContent?.toLowerCase().includes(q); }); });
    input?.addEventListener('input', search, { signal }); signal.addEventListener('abort', search.cancel, { once: true });
  }
  if (feature.action === 'export') exportJson('tanagha-report.json', { role, exportedAt: new Date().toISOString(), items: page?.items ?? [] });
}
