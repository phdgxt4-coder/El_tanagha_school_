import '../../styles.css';
import type { Role } from '../security/authorization';
import { toggleTheme } from '../utils/theme';
import type { User } from 'firebase/auth';
import { escapeHtml } from '../components/ui';
import { getAdminDashboardData, getTeacherDashboardData } from '../database/dashboard-metrics.service';

const sections: Record<Role, string[]> = {
  student: ['المواد', 'الفيديوهات', 'الكتب', 'الواجبات', 'الامتحانات', 'الدرجات', 'الجدول', 'الإشعارات', 'البحث', 'المفضلة', 'الملف الشخصي', 'الإعدادات'],
  teacher: ['ملفات الدروس', 'فيديو YouTube', 'إنشاء امتحان', 'الواجبات', 'الحضور', 'التصحيح', 'الإحصائيات', 'بنك الأسئلة', 'إدارة المحتوى'],
  parent: ['الحضور', 'الدرجات', 'الواجبات', 'الرسائل', 'الإشعارات', 'التقارير'],
  admin: ['إدارة المستخدمين', 'الأخبار', 'الإحصائيات', 'التقارير', 'المواد', 'النسخ الاحتياطي', 'الإعدادات']
};
let dashboardController: AbortController | null = null;
let sectionController: AbortController | null = null;

function nav(role: Role) {
  const glyphs: Record<Role, string[]> = {
    student: ['◈','▶','▤','✓','⌁','↗','▦','♧','⌕','☆','◎','⚙'],
    teacher: ['▤','▶','＋','✓','◷','✎','▥','⌘','▣'],
    parent: ['◷','↗','✓','✉','♧','▥'],
    admin: ['◎','▰','▥','▤','◫','↧','⚙']
  };
  return sections[role].map((item, index) => `<button type="button" data-section="${escapeHtml(item)}" class="dash-nav-item"><span class="dash-nav-icon" aria-hidden="true">${glyphs[role][index] ?? '•'}</span><span>${escapeHtml(item)}</span></button>`).join('');
}

function timeGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'صباح الخير';
  if (hour < 17) return 'مساء الخير';
  return 'أهلًا بك في أمسيتك';
}

function studentShell(user: User) {
  const name = user.displayName?.trim() || user.email?.split('@')[0] || 'صديقي';
  return `<div class="role-dashboard dashboard-student">
    <aside class="student-rail"><div class="student-brand"><span class="student-mark">ت</span><span><b>التناغة</b><small>مساحة التعلم</small></span></div><div class="student-rail-label">مساراتي</div><nav class="student-nav">${nav('student')}</nav><div class="student-rail-foot"><button data-action="theme" class="student-theme">تبديل المظهر</button><button data-action="logout" class="student-logout">تسجيل الخروج</button></div></aside>
    <main class="student-main"><header class="student-header"><div><span class="student-eyebrow">مساحة الطالب · ${escapeHtml(new Intl.DateTimeFormat('ar', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date()))}</span><h1>${timeGreeting()}، ${escapeHtml(name)}</h1><p>استمر من حيث توقفت، خطوة صغيرة اليوم تصنع فرقًا كبيرًا.</p></div><div class="student-profile"><span class="student-avatar">${escapeHtml(name.slice(0, 1))}</span><span><b>${escapeHtml(name)}</b><small>مساحة التعلّم</small></span><button class="student-bell" data-smart="notifications" aria-label="مركز الإشعارات">♧</button></div></header>
      <section class="student-hero"><div><span class="student-kicker">مساحة الطالب</span><h2>تعلّم بخطوة واضحة</h2><p>تظهر هنا دروسك وواجباتك ومواعيدك الفعلية من المنصة.</p><button class="student-primary" data-section="المواد">استكشف المحتوى <span>←</span></button></div><div class="student-progress" aria-label="ملخص تقدّم التعلّم"><div class="student-ring" aria-hidden="true"><strong>↗</strong></div><div><b>ابدأ حين تكون مستعدًا</b><span>يُحتسب تقدمك من نشاط التعلّم.</span></div></div></section><div id="student-smart-root"></div>
    </main>
  </div>`;
}

function teacherShell(user: User) {
  const name = user.displayName?.trim() || user.email?.split('@')[0] || 'المدرس';
  return `<div class="role-dashboard dashboard-teacher"><aside class="teacher-rail"><div class="teacher-brand"><span class="teacher-logo" aria-hidden="true">T</span><div><b>TEACHER HUB</b><small>مدرسة التناغة</small></div></div><div class="teacher-command">مساحة التدريس</div><nav aria-label="أقسام المدرس">${nav('teacher')}</nav><div class="teacher-rail-bottom"><button data-action="theme">المظهر</button><button data-action="logout">خروج آمن</button></div></aside><main class="teacher-main"><header class="teacher-topbar"><div><span class="teacher-overline">إدارة الفصول والمحتوى</span><h1>مرحبًا، ${escapeHtml(name)}</h1></div><div class="teacher-actions"><button class="teacher-outline" data-section="إدارة المحتوى">إضافة محتوى</button><span class="teacher-avatar" aria-hidden="true">${escapeHtml(name.slice(0, 1))}</span></div></header><section class="teacher-alert"><div class="teacher-alert-badge" aria-hidden="true">+</div><div><b>مساحة صفك جاهزة للعمل</b><span>الأعداد من سجلات Firestore؛ 20+ تعني وجود سجلات إضافية. عدد الطلاب محجوب بصلاحيات الدور.</span></div><button data-section="إدارة المحتوى">إدارة المحتوى ←</button></section><section class="teacher-metrics" aria-label="مؤشرات الفصل">
    <article><span class="metric-label">الطلاب</span><strong data-metric="students">—</strong><small data-metric-note="students">يظهر العدد عند توفر مصدر طلاب مصرح</small></article>
    <article><span class="metric-label">الدروس</span><strong data-metric="lessons">…</strong><small data-metric-note="lessons">جارٍ تحميل العدد</small></article>
    <article><span class="metric-label">فيديوهات YouTube</span><strong data-metric="videos">…</strong><small data-metric-note="videos">جارٍ تحميل العدد</small></article>
    <article><span class="metric-label">الامتحانات</span><strong data-metric="exams">…</strong><small data-metric-note="exams">جارٍ تحميل العدد</small></article>
    </section><section class="teacher-grid"><article class="teacher-panel teacher-chart"><div class="teacher-panel-head"><div><h2>مؤشرات التفاعل</h2><span>البيانات التحليلية تظهر بعد توفر سجلات نشاط موثوقة</span></div></div><div class="teacher-data-empty" role="status">لا توجد بيانات أداء كافية للرسم البياني بعد. يمكنك متابعة المحتوى المضاف حديثًا والواجبات من هذه اللوحة.</div></article><article class="teacher-panel teacher-tasks"><div class="teacher-panel-head"><div><h2>إجراءات سريعة</h2><span>اختصارات المدرس</span></div></div><button data-section="ملفات الدروس"><span class="task-icon purple" aria-hidden="true">PDF</span><b>إضافة ملف درس</b><small>PDF أو صورة تعليمية</small></button><button data-section="فيديو YouTube"><span class="task-icon orange" aria-hidden="true">YT</span><b>إضافة فيديو</b><small>رابط YouTube فقط</small></button><button data-section="إنشاء امتحان"><span class="task-icon blue" aria-hidden="true">EX</span><b>إنشاء امتحان</b><small>إعداد تقييم للطلاب</small></button></article><article class="teacher-panel teacher-table"><div class="teacher-panel-head"><div><h2>المحتوى المضاف مؤخرًا</h2><span>أحدث ملفات الدروس وفيديوهات YouTube</span></div><button data-section="إدارة المحتوى">فتح المكتبة ←</button></div><div class="teacher-recent-list" data-dashboard-feed><p class="teacher-data-empty" role="status">جارٍ تحميل المحتوى المنشور…</p></div></article><article class="teacher-panel teacher-pending"><div class="teacher-panel-head"><div><h2>المهام والواجبات</h2><span>ملخص سجلات المنصة</span></div><button data-section="الواجبات">إدارة ←</button></div><div class="teacher-pending-count"><strong data-metric="assignments">…</strong><span data-metric-note="assignments">جارٍ قراءة الواجبات المنشورة</span></div><p class="teacher-data-empty">عدد السجلات المنشورة ليس بديلًا عن مراجعة إجابات الطلاب أو مواعيد التسليم.</p></article></section></main></div>`;
}
function parentShell() {
  return `<div class="role-dashboard dashboard-parent"><header class="parent-top"><div class="parent-brand"><span class="parent-sun" aria-hidden="true">ن</span><div><b>بوابة الأسرة</b><small>مدرسة التناغة الشرقية</small></div></div><div class="parent-top-actions"><button data-action="theme">المظهر</button><button data-action="logout" class="parent-exit">تسجيل الخروج</button></div></header><main class="parent-main"><section class="parent-welcome"><div><span class="parent-overline">متابعة الأسرة</span><h1>رحلة أبنائك الدراسية</h1><p>تظهر بيانات الحضور والدرجات والواجبات عند ربط حسابات الطلاب بهذه البوابة.</p></div></section><section class="parent-children"><article class="child-card selected parent-empty-state"><div class="child-head"><span class="child-avatar" aria-hidden="true">◎</span><div><b>لا توجد حسابات مرتبطة بعد</b><small>تواصل مع المدرسة لربط حساب ولي الأمر بالطلاب.</small></div></div></article></section><section class="parent-columns"><article class="parent-panel parent-timeline"><div class="parent-panel-head"><div><span class="parent-kicker">المتابعة الدراسية</span><h2>الحضور والدرجات</h2></div><button data-section="الحضور">فتح السجل ←</button></div><p class="parent-data-empty" role="status">لا توجد سجلات مرتبطة بهذا الحساب حاليًا.</p></article><article class="parent-panel parent-message"><span class="parent-kicker">التواصل مع المدرسة</span><h2>الرسائل</h2><p>استخدم صندوق الرسائل للتواصل مع المدرسة، وستظهر الردود هنا عند توفرها.</p><div class="message-by"><span class="teacher-mini" aria-hidden="true">ن</span><span><b>صندوق الرسائل</b><small>مراسلات حسابك</small></span><button data-section="الرسائل">فتح الرسائل ←</button></div></article></section><section class="parent-insights" aria-label="رسوم متابعة الطالب"><article class="parent-panel"><div class="parent-panel-head"><div><span class="parent-kicker">الأداء الأكاديمي</span><h2>تطور الدرجات</h2></div><button data-section="الدرجات">عرض الدرجات ←</button></div><div class="parent-chart-empty" role="status"><span>—</span><b>الرسم البياني ينتظر ربط حساب الطالب</b><small>لن نعرض نتائج افتراضية؛ ستظهر الدرجات عند توفر السجلات المصرح بها.</small></div></article><article class="parent-panel"><div class="parent-panel-head"><div><span class="parent-kicker">الحضور المدرسي</span><h2>نسبة الحضور</h2></div><button data-section="الحضور">سجل الحضور ←</button></div><div class="parent-chart-empty attendance-empty" role="status"><span>—</span><b>لا توجد سجلات حضور مرتبطة</b><small>تواصل مع المدرسة لربط حساب ابنك أو ابنتك.</small></div></article></section><section class="parent-schedule-grid"><article class="parent-panel"><div class="parent-panel-head"><div><span class="parent-kicker">قريبًا</span><h2>الاختبارات القادمة</h2></div><button data-section="الجدول">الجدول ←</button></div><p class="parent-data-empty" role="status">لا توجد اختبارات مرتبطة بحساب طالب حتى الآن.</p></article><article class="parent-panel"><div class="parent-panel-head"><div><span class="parent-kicker">اليوم الدراسي</span><h2>الجدول</h2></div><button data-section="التقارير">التقارير ←</button></div><p class="parent-data-empty" role="status">سيظهر الجدول بعد ربط بيانات الطالب.</p></article></section><nav class="parent-bottom-nav" aria-label="متابعة الأبناء"><button data-section="الحضور"><span>01</span>الحضور</button><button data-section="الدرجات"><span>02</span>الدرجات</button><button data-section="الواجبات"><span>03</span>الواجبات</button><button data-section="التقارير"><span>04</span>التقارير</button></nav></main></div>`;
}
function adminShell() {
  const today = new Intl.DateTimeFormat('ar', { dateStyle: 'medium' }).format(new Date());
  return `<div class="role-dashboard dashboard-admin"><aside class="admin-rail"><div class="admin-brand"><span class="admin-symbol" aria-hidden="true">T</span><span>CONTROL<br><b>ROOM</b></span></div><div class="admin-live">إدارة المنصة</div><nav aria-label="أقسام الإدارة">${nav('admin')}</nav><div class="admin-operator"><span aria-hidden="true">م</span><div><b>مسؤول المنصة</b><small>لوحة الإدارة</small></div><button data-action="logout" aria-label="تسجيل الخروج">↗</button></div></aside><main class="admin-main"><header class="admin-top"><div><span class="admin-overline">إدارة منصة المدرسة</span><h1>مركز التحكم</h1></div><div class="admin-top-right"><span class="admin-date">${escapeHtml(today)}</span><button data-action="theme" aria-label="تبديل المظهر">المظهر</button></div></header><section class="admin-command"><div><span class="admin-overline">مصادر البيانات</span><h2>مركز الإدارة</h2><p>تعكس المؤشرات سجلات Firestore المتاحة لا حسابات Authentication؛ 20+ تعني وجود سجلات إضافية.</p></div><span class="admin-status" data-system-health>جارٍ فحص الاتصال</span></section><section class="admin-metrics" aria-label="مؤشرات المنصة"><article><span>ملفات المستخدمين</span><strong data-metric="users">…</strong><small>عينة محدودة من سجلات users</small></article><article><span>ملفات الطلاب</span><strong data-metric="students">…</strong><small>بحسب حقل role في ملف المستخدم</small></article><article><span>ملفات المدرسين</span><strong data-metric="teachers">…</strong><small>بحسب حقل role في ملف المستخدم</small></article><article><span>المحتوى المنشور</span><strong data-metric="content">…</strong><small>دروس وفيديوهات وامتحانات، عينة محدودة</small></article></section><section class="admin-grid"><article class="admin-panel admin-activity"><div class="admin-panel-title"><div><span>سجل المحتوى الحديث</span><h2>آخر الإضافات</h2></div></div><div class="admin-feed" data-dashboard-feed><p class="admin-empty" role="status">جارٍ تحميل أحدث المحتوى…</p></div></article><article class="admin-panel admin-distribution"><div class="admin-panel-title"><div><span>إحصاءات المستخدمين</span><h2>توزيع الملفات المسجلة</h2></div></div><div class="admin-role-counts"><p>طلاب مسجلون <b data-role-count="students">—</b></p><p>مدرسون مسجلون <b data-role-count="teachers">—</b></p><small>تُحسب من ملفات Firestore التي تحتوي حقل الدور؛ لا تُعرض بيانات حسابات الدخول الخاصة.</small></div></article><article class="admin-panel admin-actions"><div class="admin-panel-title"><div><span>أدوات الإدارة</span><h2>اختصارات</h2></div></div><button data-section="إدارة المستخدمين"><b>01</b><span>إدارة المستخدمين</span><i aria-hidden="true">←</i></button><button data-section="التقارير"><b>02</b><span>التقارير</span><i aria-hidden="true">←</i></button><button data-section="النسخ الاحتياطي"><b>03</b><span>تصدير التقارير</span><i aria-hidden="true">←</i></button></article></section></main></div>`;
}

function metricText(value: number | string | null) { return value === null ? '—' : typeof value === 'number' ? new Intl.NumberFormat('ar').format(value) : value; }

function renderRecentItems(host: HTMLElement, items: { title: string; subject: string; kind: string; createdAt: number | null }[], emptyText: string) {
  if (!items.length) {
    host.innerHTML = `<p class="teacher-data-empty" role="status">${escapeHtml(emptyText)}</p>`;
    return;
  }
  host.innerHTML = items.map((item) => {
    const date = item.createdAt ? new Intl.DateTimeFormat('ar', { day: 'numeric', month: 'short' }).format(item.createdAt) : '—';
    return `<div class="teacher-recent-row"><span class="teacher-recent-type">${escapeHtml(item.kind === 'فيديو YouTube' ? 'YT' : 'PDF')}</span><span><b>${escapeHtml(item.title)}</b><small>${escapeHtml(item.subject)} · ${escapeHtml(item.kind)}</small></span><time>${escapeHtml(date)}</time></div>`;
  }).join('');
}

async function hydrateTeacherDashboard(root: HTMLElement) {
  try {
    const { metrics, recentUploads } = await getTeacherDashboardData();
    for (const [key, value] of Object.entries(metrics)) {
      root.querySelectorAll<HTMLElement>(`[data-metric="${key}"]`).forEach((node) => { node.textContent = metricText(value); });
      root.querySelectorAll<HTMLElement>(`[data-metric-note="${key}"]`).forEach((node) => {
        node.textContent = value === null ? (key === 'students' ? 'غير متاح وفق صلاحيات المدرس الحالية' : 'تعذر الجلب؛ تحقق من اتصال Firestore وصلاحية القراءة') : key === 'assignments' ? 'واجبات مسجلة؛ + تعني أكثر من 20' : 'حتى 20 سجلًا؛ + تعني وجود المزيد';
      });
    }
    const feed = root.querySelector<HTMLElement>('.teacher-recent-list');
    if (feed) renderRecentItems(feed, recentUploads, 'لا توجد ملفات أو فيديوهات منشورة حتى الآن.');
  } catch {
    root.querySelectorAll<HTMLElement>('[data-metric]').forEach((node) => { node.textContent = '—'; });
    root.querySelectorAll<HTMLElement>('[data-metric-note]').forEach((node) => { node.textContent = 'تعذر تحميل البيانات من Firestore.'; });
    const feed = root.querySelector<HTMLElement>('.teacher-recent-list');
    if (feed) renderRecentItems(feed, [], 'تعذر تحميل المحتوى. تحقق من الاتصال ثم أعد المحاولة من المكتبة.');
  }
}

async function hydrateAdminDashboard(root: HTMLElement) {
  try {
    const { metrics, recentUploads, connected } = await getAdminDashboardData();
    for (const [key, value] of Object.entries(metrics)) {
      root.querySelectorAll<HTMLElement>(`[data-metric="${key}"]`).forEach((node) => { node.textContent = metricText(value); });
      root.querySelectorAll<HTMLElement>(`[data-role-count="${key}"]`).forEach((node) => { node.textContent = metricText(value); });
    }
    const health = root.querySelector<HTMLElement>('[data-system-health]');
    if (health) health.textContent = connected ? 'مصادر متصلة' : 'البيانات غير متاحة';
    const feed = root.querySelector<HTMLElement>('.admin-feed');
    if (feed) {
      if (!recentUploads.length) feed.innerHTML = '<p class="admin-empty" role="status">لا توجد إضافات حديثة أو لا تسمح الصلاحيات بقراءتها.</p>';
      else feed.innerHTML = recentUploads.map((item, index) => `<div><i class="feed-dot ${index % 2 ? 'blue' : 'green'}"></i><span><b>${escapeHtml(item.title)}</b><small>${escapeHtml(item.kind)} · ${escapeHtml(item.subject)}</small></span><time>${item.createdAt ? escapeHtml(new Intl.DateTimeFormat('ar', { day: 'numeric', month: 'short' }).format(item.createdAt)) : '—'}</time></div>`).join('');
    }
  } catch {
    root.querySelectorAll<HTMLElement>('[data-metric]').forEach((node) => { node.textContent = '—'; });
    const health = root.querySelector<HTMLElement>('[data-system-health]');
    if (health) health.textContent = 'تعذر الاتصال';
  }
}

function mountRoleCommandPalette(root: HTMLElement, role: Exclude<Role, 'student'>, signal: AbortSignal) {
  const fab = document.createElement('button');
  fab.type = 'button';
  fab.className = 'role-command-fab';
  fab.dataset.action = 'command';
  fab.setAttribute('aria-label', 'البحث السريع في أقسام المنصة');
  fab.innerHTML = '<span aria-hidden="true">⌕</span><span>بحث سريع</span><kbd>Ctrl K</kbd>';
  root.append(fab);

  const overlay = document.createElement('div');
  overlay.className = 'role-command-overlay';
  overlay.hidden = true;
  overlay.innerHTML = '<section class="role-command-dialog" role="dialog" aria-modal="true" aria-label="البحث السريع"><label><span aria-hidden="true">⌕</span><input type="search" autocomplete="off" placeholder="ابحث عن قسم أو إجراء…"><kbd>Esc</kbd></label><div class="role-command-results" role="listbox"></div></section>';
  root.append(overlay);
  const input = overlay.querySelector<HTMLInputElement>('input')!;
  const results = overlay.querySelector<HTMLElement>('.role-command-results')!;
  let opener: HTMLElement | null = null;
  const close = () => {
    if (overlay.hidden) return;
    overlay.hidden = true;
    opener?.focus();
    opener = null;
  };
  const draw = (queryText = '') => {
    const query = queryText.trim().toLocaleLowerCase('ar');
    const matches = sections[role].filter((item) => !query || item.toLocaleLowerCase('ar').includes(query));
    results.innerHTML = matches.length
      ? matches.map((item) => `<button type="button" role="option" data-section="${escapeHtml(item)}"><span>${escapeHtml(item)}</span><kbd>فتح</kbd></button>`).join('')
      : '<p role="status">لا توجد أقسام مطابقة. جرّب كلمة أخرى.</p>';
  };
  const open = (source: HTMLElement) => {
    opener = source;
    draw();
    overlay.hidden = false;
    input.value = '';
    input.focus();
  };
  overlay.addEventListener('keydown', (event) => {
    if (event.key !== 'Tab') return;
    const focusable = [...overlay.querySelectorAll<HTMLElement>('input:not([disabled]),button:not([disabled])')];
    if (!focusable.length) { event.preventDefault(); input.focus(); return; }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }, { signal });
  root.addEventListener('input', (event) => {
    if (event.target === input) draw(input.value);
  }, { signal });
  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) close();
  }, { signal });
  document.addEventListener('keydown', (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      open(fab);
    } else if (event.key === 'Escape') close();
    else if (event.key === 'Enter' && !overlay.hidden && event.target === input) {
      event.preventDefault();
      results.querySelector<HTMLButtonElement>('button[data-section]')?.click();
    }
  }, { signal });
  root.addEventListener('click', (event) => {
    const target = event.target as HTMLElement;
    if (target.closest('[data-action="command"]')) open(target.closest<HTMLElement>('[data-action="command"]')!);
    if (target.closest('.role-command-results [data-section]')) close();
  }, { signal });
}

function createSectionOverlay(root: HTMLElement, onClose: () => void, section: string) {
  const overlay = document.createElement('div');
  overlay.id = 'section-root';
  overlay.className = 'role-feature-overlay';
  overlay.innerHTML = `<section class="feature-dialog" role="dialog" aria-modal="true" aria-label="${escapeHtml(section)}" tabindex="-1"><button class="feature-back" type="button">← العودة إلى لوحة التحكم</button><div class="feature-content"></div></section>`;
  const dialog = overlay.querySelector<HTMLElement>('.feature-dialog')!;
  const back = overlay.querySelector<HTMLButtonElement>('.feature-back')!;
  back.addEventListener('click', onClose);
  dialog.addEventListener('keydown', (event: KeyboardEvent) => {
    if (event.key === 'Escape') { event.preventDefault(); onClose(); return; }
    if (event.key !== 'Tab') return;
    const focusable = [...dialog.querySelectorAll<HTMLElement>('button:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])')]
      .filter((element) => !element.hidden && element.getAttribute('aria-hidden') !== 'true');
    if (!focusable.length) { event.preventDefault(); dialog.focus(); return; }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && (document.activeElement === first || !dialog.contains(document.activeElement))) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && (document.activeElement === last || !dialog.contains(document.activeElement))) { event.preventDefault(); first.focus(); }
  });
  root.append(overlay);
  dialog.focus();
  return overlay;
}

async function loadSection(root: HTMLElement, user: User, role: Role, section: string) {
  sectionController?.abort();
  const controller = new AbortController();
  sectionController = controller;
  const { renderFeature } = await import('./feature.page');
  if (controller.signal.aborted) return;
  try {
    await renderFeature(root, user, section, controller.signal);
  } catch (error) {
    if (controller.signal.aborted) return;
    root.innerHTML = `<section class="panel" role="alert"><h2>تعذر تحميل هذا القسم</h2><p class="muted">${escapeHtml(error instanceof Error ? error.message : 'حدث خطأ غير متوقع.')}</p><button class="btn sm feature-retry" type="button">إعادة المحاولة</button></section>`;
    root.querySelector('button')?.addEventListener('click', () => void loadSection(root, user, role, section), { signal: controller.signal });
  }
}

export async function renderDashboard(root: HTMLElement, user: User) {
  const { getUserRole } = await import('../security/authorization');
  const role = await getUserRole(user);
  if (!role) throw new Error('لم يتم تعيين دور لهذا الحساب.');
  cleanupDashboard();
  dashboardController = new AbortController();
  const shells: Record<Role, () => string> = { student: () => studentShell(user), teacher: () => teacherShell(user), parent: parentShell, admin: adminShell };
  root.innerHTML = shells[role]();
  if (role !== 'student') mountRoleCommandPalette(root, role, dashboardController.signal);
  if (role === 'teacher') void hydrateTeacherDashboard(root);
  if (role === 'admin') void hydrateAdminDashboard(root);
  if (role === 'student') {
    const smartRoot = root.querySelector<HTMLElement>('#student-smart-root');
    if (smartRoot) {
      const { mountStudentSmart } = await import('../features/student-smart');
      if (!dashboardController.signal.aborted) await mountStudentSmart(smartRoot, user, dashboardController.signal);
    }
  }
  const onClick = async (event: Event) => {
    const target = event.target as HTMLElement;
    const sectionButton = target.closest<HTMLButtonElement>('[data-section]');
    const action = target.closest<HTMLButtonElement>('[data-action]')?.dataset.action;
    const smartAction = target.closest<HTMLButtonElement>('[data-smart]')?.dataset.smart;
    if (sectionButton) {
      const section = sectionButton.dataset.section;
      if (!section) return;
      let overlay = root.querySelector<HTMLElement>('#section-root');
      if (!overlay) {
        const opener = sectionButton;
        overlay = createSectionOverlay(root, () => {
          sectionController?.abort();
          sectionController = null;
          overlay?.remove();
          opener.focus();
        }, section);
      }
      const activeOverlay = overlay;
      activeOverlay.setAttribute('aria-label', section);
      const contentRoot = activeOverlay.querySelector<HTMLElement>('.feature-content');
      if (contentRoot) await loadSection(contentRoot, user, role, section);
    } else if (action === 'command') {
      return;
    } else if (smartAction === 'notifications' && !target.closest('#student-smart-root')) {
      root.querySelector<HTMLButtonElement>('#student-smart-root [data-smart="notifications"]')?.click();
    } else if (action === 'logout') {
      cleanupDashboard();
      const { logout } = await import('../auth/auth.service');
      await logout();
    } else if (action === 'theme') toggleTheme();
  };
  root.addEventListener('click', onClick, { signal: dashboardController.signal });
}

export function cleanupDashboard() {
  dashboardController?.abort();
  sectionController?.abort();
  dashboardController = null;
  sectionController = null;
}
