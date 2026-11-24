import './student-smart.css';
import './student-smart-controls.css';
import type { User } from 'firebase/auth';
import { escapeHtml } from '../components/ui';
import { listPage, listStudentAssignments } from '../database/content.service';

type SmartItem = Record<string, unknown> & { id?: string };
type OpenItem = { id: string; title: string; section: string; openedAt: number };
type Activity = { text: string; at: number };
type SmartState = {
  dailyGoalMinutes: number;
  weeklyGoalMinutes: number;
  notes: string;
  bookmarks: Record<string, { title: string; section: string }>;
  completed: string[];
  opened: OpenItem[];
  activity: Activity[];
  studySeconds: Record<string, number>;
};

const DEFAULT_STATE: SmartState = {
  dailyGoalMinutes: 30,
  weeklyGoalMinutes: 180,
  notes: '',
  bookmarks: {},
  completed: [],
  opened: [],
  activity: [],
  studySeconds: {}
};

const dateKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const safeTitle = (item: SmartItem) => String(item.title ?? item.name ?? item.subject ?? 'درس بدون عنوان');
const safeSubject = (item: SmartItem) => String(item.subject ?? item.description ?? 'درس');
const idOf = (item: SmartItem, fallback: string) => String(item.id ?? fallback);
const formatMinutes = (seconds: number) => `${Math.floor(seconds / 60)} دقيقة`;

function readState(uid: string): SmartState {
  try {
    const parsed = JSON.parse(localStorage.getItem(`tanagha-smart-v1:${uid}`) ?? 'null') as Partial<SmartState> | null;
    if (!parsed || typeof parsed !== 'object') return structuredClone(DEFAULT_STATE);
    return {
      ...structuredClone(DEFAULT_STATE),
      ...parsed,
      dailyGoalMinutes: Number.isFinite(parsed.dailyGoalMinutes) ? Math.max(15, parsed.dailyGoalMinutes!) : 30,
      weeklyGoalMinutes: Number.isFinite(parsed.weeklyGoalMinutes) ? Math.max(60, parsed.weeklyGoalMinutes!) : 180,
      notes: typeof parsed.notes === 'string' ? parsed.notes.slice(0, 5000) : '',
      bookmarks: parsed.bookmarks && typeof parsed.bookmarks === 'object'
        ? Object.fromEntries(Object.entries(parsed.bookmarks).filter(([, value]) => value && typeof value.title === 'string' && typeof value.section === 'string').slice(0, 100))
        : {},
      completed: Array.isArray(parsed.completed) ? parsed.completed.filter((id): id is string => typeof id === 'string').slice(-500) : [],
      opened: Array.isArray(parsed.opened) ? parsed.opened.filter((entry) => entry && typeof entry.id === 'string' && typeof entry.title === 'string' && typeof entry.section === 'string').slice(0, 10) : [],
      activity: Array.isArray(parsed.activity) ? parsed.activity.filter((entry) => entry && typeof entry.text === 'string' && Number.isFinite(Number(entry.at))).slice(0, 20) : [],
      studySeconds: parsed.studySeconds && typeof parsed.studySeconds === 'object'
        ? Object.fromEntries(Object.entries(parsed.studySeconds).filter(([day, seconds]) => /^\d{4}-\d{2}-\d{2}$/.test(day) && Number.isFinite(Number(seconds))).map(([day, seconds]) => [day, Math.max(0, Number(seconds))]).slice(0, 45))
        : {}
    };
  } catch {
    return structuredClone(DEFAULT_STATE);
  }
}

function itemDate(item: SmartItem): Date | null {
  for (const key of ['dueDate', 'examDate', 'startAt', 'scheduledAt', 'date']) {
    const value = item[key];
    if (!value) continue;
    let date: Date | null = null;
    if (value instanceof Date) date = value;
    else if (typeof value === 'string' || typeof value === 'number') date = new Date(value);
    else if (typeof value === 'object' && value !== null && 'toDate' in value && typeof (value as { toDate?: unknown }).toDate === 'function') date = (value as { toDate: () => Date }).toDate();
    else if (typeof value === 'object' && value !== null && 'seconds' in value) date = new Date(Number((value as { seconds: unknown }).seconds) * 1000);
    if (date && !Number.isNaN(date.getTime())) return date;
  }
  return null;
}

function startOfWeek(date: Date) {
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const mondayOffset = (start.getDay() + 6) % 7;
  start.setDate(start.getDate() - mondayOffset);
  return start;
}

function fullDate(date: Date) {
  return new Intl.DateTimeFormat('ar', { weekday: 'long', day: 'numeric', month: 'long' }).format(date);
}

function recordActivity(state: SmartState, text: string) {
  state.activity.unshift({ text, at: Date.now() });
  state.activity = state.activity.slice(0, 20);
}

export async function mountStudentSmart(host: HTMLElement, user: User, signal: AbortSignal) {
  const state = readState(user.uid);
  let lessons: SmartItem[] = [];
  let videos: SmartItem[] = [];
  let exams: SmartItem[] = [];
  let assignments: SmartItem[] = [];
  let weekOffset = 0;
  let selectedDay = dateKey(new Date());
  let timerRemaining = 25 * 60;
  let timerInterval: number | undefined;
  let timerRunning = false;
  let lastTick = Date.now();
  let persistTick = 0;
  let paletteOpener: HTMLElement | null = null;

  const save = () => {
    try { localStorage.setItem(`tanagha-smart-v1:${user.uid}`, JSON.stringify(state)); } catch { /* storage may be disabled or full */ }
  };
  const todaySeconds = () => state.studySeconds[dateKey(new Date())] ?? 0;
  const weekSeconds = () => {
    const weekStart = startOfWeek(new Date());
    return Object.entries(state.studySeconds).reduce((sum, [key, seconds]) => {
      const day = new Date(`${key}T00:00:00`);
      return day >= weekStart && day < new Date(weekStart.getTime() + 7 * 86400000) ? sum + Number(seconds || 0) : sum;
    }, 0);
  };
  const allContent = () => [
    ...lessons.map((item, i) => ({ item, id: idOf(item, `lesson-${i}`), section: 'المواد', type: 'درس' })),
    ...videos.map((item, i) => ({ item, id: idOf(item, `video-${i}`), section: 'الفيديوهات', type: 'فيديو' }))
  ];
  const allDated = () => [
    ...exams.map((item, i) => ({ item, id: idOf(item, `exam-${i}`), section: 'الامتحانات', type: 'امتحان' })),
    ...assignments.map((item, i) => ({ item, id: idOf(item, `assignment-${i}`), section: 'الواجبات', type: 'واجب' }))
  ].map((entry) => ({ ...entry, date: itemDate(entry.item) })).filter((entry): entry is typeof entry & { date: Date } => !!entry.date).sort((a, b) => a.date.getTime() - b.date.getTime());
  const upcoming = () => allDated().filter((entry) => entry.date.getTime() >= new Date(new Date().setHours(0, 0, 0, 0)).getTime());
  const daysLeft = (date: Date) => Math.ceil((new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime() - new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate()).getTime()) / 86400000);
  const dayLabel = (date: Date) => daysLeft(date) === 0 ? 'اليوم' : daysLeft(date) === 1 ? 'غدًا' : `بعد ${daysLeft(date)} أيام`;
  const itemTitle = (item: SmartItem) => safeTitle(item);
  const openItem = (id: string, title: string, section: string) => {
    state.opened = [{ id, title, section, openedAt: Date.now() }, ...state.opened.filter((entry) => entry.id !== id)].slice(0, 10);
    recordActivity(state, `فتحت ${title}`);
    save();
  };
  const viewDate = () => {
    const weekStart = startOfWeek(new Date());
    weekStart.setDate(weekStart.getDate() + weekOffset * 7);
    return weekStart;
  };
  const eventForDay = (key: string) => allDated().filter((entry) => dateKey(entry.date) === key);
  const hasAchievement = (kind: string) => {
    if (kind === 'focus') return weekSeconds() >= 15 * 60;
    if (kind === 'explorer') return new Set(state.opened.map((item) => item.id)).size >= 3;
    if (kind === 'goal') return todaySeconds() >= state.dailyGoalMinutes * 60;
    if (kind === 'finisher') return state.completed.length >= 3;
    return false;
  };

  const render = () => {
    const content = allContent();
    const suggested = content.filter(({ id }) => !state.completed.includes(id)).slice(0, 3);
    const lessonContent = content.filter(({ section }) => section === 'المواد');
    const subjectGroups = new Map<string, { id: string; item: SmartItem }[]>();
    lessonContent.forEach(({ item, id }) => {
      const subject = typeof item.subject === 'string' && item.subject.trim() ? item.subject.trim() : 'غير مصنف';
      subjectGroups.set(subject, [...(subjectGroups.get(subject) ?? []), { id, item }]);
    });
    const completedLessons = lessonContent.filter(({ id }) => state.completed.includes(id)).length;
    const completionPercent = lessonContent.length ? Math.round(completedLessons / lessonContent.length * 100) : 0;
    const subjectHtml = subjectGroups.size ? [...subjectGroups.entries()].slice(0, 6).map(([subject, items]) => {
      const completed = items.filter(({ id }) => state.completed.includes(id)).length;
      const percent = Math.round(completed / items.length * 100);
      return `<article class="smart-subject"><div class="smart-subject-ring" style="--subject-progress:${percent}%" role="img" aria-label="${escapeHtml(subject)}: ${percent} بالمئة"><b>${percent}%</b></div><span><b>${escapeHtml(subject)}</b><small>${completed} من ${items.length} درس</small></span></article>`;
    }).join('') : '<p class="smart-empty">تظهر المواد هنا بعد نشر الدروس وربطها باسم المادة.</p>';
    const todayDeadlines = upcoming().filter(({ date }) => daysLeft(date) === 0);
    const todayTasksHtml = `<button class="smart-today-task" data-smart="timer-toggle"><span class="smart-task-check ${todaySeconds() >= state.dailyGoalMinutes * 60 ? 'is-done' : ''}">${todaySeconds() >= state.dailyGoalMinutes * 60 ? '✓' : '◷'}</span><span><b>جلسة مذاكرة اليوم</b><small>${todaySeconds() >= state.dailyGoalMinutes * 60 ? 'اكتمل هدفك اليومي' : `هدفك ${state.dailyGoalMinutes} دقيقة · أنجزت ${Math.floor(todaySeconds() / 60)} دقيقة`}</small></span><i>ابدأ ←</i></button>${todayDeadlines.length ? todayDeadlines.map(({ item, section, type }) => `<button class="smart-today-task" data-section="${section}"><span class="smart-task-check">!</span><span><b>${escapeHtml(itemTitle(item))}</b><small>${type} اليوم · ${escapeHtml(safeSubject(item))}</small></span><i>افتح ←</i></button>`).join('') : '<p class="smart-empty">لا توجد واجبات أو اختبارات مستحقة اليوم.</p>'}`;
    const current = state.opened[0] ?? (content[0] ? { id: content[0].id, title: safeTitle(content[0].item), section: content[0].section, openedAt: 0 } : null);
    const due = upcoming().slice(0, 5);
    const weekStart = viewDate();
    const selectedEvents = eventForDay(selectedDay);
    const today = todaySeconds();
    const weekly = weekSeconds();
    const todayPercent = Math.min(100, Math.round(today / (state.dailyGoalMinutes * 60) * 100));
    const weekPercent = Math.min(100, Math.round(weekly / (state.weeklyGoalMinutes * 60) * 100));
    const openedHtml = state.opened.length ? state.opened.slice(0, 4).map((entry) => `<button class="smart-recent-item" data-smart="open-recent" data-id="${escapeHtml(entry.id)}" data-title="${escapeHtml(entry.title)}" data-section="${escapeHtml(entry.section)}"><span class="smart-recent-mark">↗</span><span><b>${escapeHtml(entry.title)}</b><small>${escapeHtml(entry.section)}</small></span></button>`).join('') : '<p class="smart-empty">ستظهر هنا الدروس التي تفتحها لتعود إليها بسرعة.</p>';
    const suggestedHtml = suggested.length ? suggested.map(({ item, id, section, type }) => `<article class="smart-lesson"><span class="smart-lesson-icon">${type === 'فيديو' ? '▶' : '✦'}</span><span class="smart-lesson-copy"><b>${escapeHtml(itemTitle(item))}</b><small>${escapeHtml(safeSubject(item))} · ${type}</small></span><button class="smart-icon-action ${state.bookmarks[id] ? 'is-saved' : ''}" aria-label="${state.bookmarks[id] ? 'إزالة من المحفوظات' : 'حفظ للرجوع'}" title="${state.bookmarks[id] ? 'إزالة من المحفوظات' : 'حفظ الدرس'}" data-smart="bookmark" data-id="${escapeHtml(id)}" data-title="${escapeHtml(itemTitle(item))}" data-section="${section}">☆</button><button class="smart-open" data-smart="open-item" data-id="${escapeHtml(id)}" data-title="${escapeHtml(itemTitle(item))}" data-section="${section}">ابدأ</button></article>`).join('') : '<p class="smart-empty">أضف الدروس والفيديوهات إلى المنصة لتظهر هنا اقتراحات مناسبة لك.</p>';
    const dueHtml = due.length ? due.map(({ item, id, section, type, date }) => `<button class="smart-deadline" data-section="${section}"><span class="smart-deadline-date"><b>${escapeHtml(new Intl.DateTimeFormat('ar', { day: 'numeric' }).format(date))}</b><small>${escapeHtml(new Intl.DateTimeFormat('ar', { month: 'short' }).format(date))}</small></span><span class="smart-deadline-copy"><b>${escapeHtml(itemTitle(item))}</b><small>${type} · ${escapeHtml(safeSubject(item))}</small></span><em>${escapeHtml(dayLabel(date))}</em></button>`).join('') : '<p class="smart-empty">لا توجد مواعيد قادمة مسجّلة حاليًا.</p>';
    const weekDays = Array.from({ length: 7 }, (_, i) => { const date = new Date(weekStart); date.setDate(date.getDate() + i); const key = dateKey(date); return `<button class="smart-day ${key === selectedDay ? 'is-selected' : ''} ${key === dateKey(new Date()) ? 'is-today' : ''} ${eventForDay(key).length ? 'has-event' : ''}" data-smart="select-day" data-date="${key}"><small>${escapeHtml(new Intl.DateTimeFormat('ar', { weekday: 'short' }).format(date))}</small><b>${escapeHtml(new Intl.DateTimeFormat('ar', { day: 'numeric' }).format(date))}</b><i></i></button>`; }).join('');
    const selectedHtml = selectedEvents.length ? selectedEvents.map(({ item, section, type, date }) => `<button class="smart-calendar-event" data-section="${section}"><span class="smart-event-dot ${type === 'امتحان' ? 'exam' : 'homework'}"></span><span><b>${escapeHtml(itemTitle(item))}</b><small>${type} · ${escapeHtml(new Intl.DateTimeFormat('ar', { hour: 'numeric', minute: '2-digit' }).format(date))}</small></span></button>`).join('') : '<p class="smart-empty compact">لا يوجد موعد مسجّل في هذا اليوم.</p>';
    const savedHtml = Object.entries(state.bookmarks).length ? Object.entries(state.bookmarks).slice(0, 4).map(([id, saved]) => `<button class="smart-saved-item" data-smart="open-item" data-id="${escapeHtml(id)}" data-title="${escapeHtml(saved.title)}" data-section="${escapeHtml(saved.section)}"><span>☆</span><b>${escapeHtml(saved.title)}</b><small>${escapeHtml(saved.section)}</small></button>`).join('') : '<p class="smart-empty">احفظ درسًا من الاقتراحات ليظهر هنا.</p>';
    const activityHtml = state.activity.length ? state.activity.slice(0, 4).map((entry) => `<li><i></i><span>${escapeHtml(entry.text)}</span><small>${escapeHtml(new Intl.DateTimeFormat('ar', { hour: 'numeric', minute: '2-digit' }).format(entry.at))}</small></li>`).join('') : '<li class="smart-empty">ابدأ نشاطًا لتظهر رحلتك هنا.</li>';
    const notifications = [...due.filter(({ date }) => daysLeft(date) <= 3).map(({ item, type, date }) => `${type}: ${safeTitle(item)} · ${dayLabel(date)}`), ...(todayPercent >= 100 ? ['أكملت هدفك اليومي — أحسنت!'] : [])];
    const achievementRows = [
      ['focus', 'جلسة تركيز', 'ذاكر 15 دقيقة على الأقل', '◷'],
      ['explorer', 'مستكشف الدروس', 'افتح 3 دروس مختلفة', '⌕'],
      ['goal', 'هدف اليوم', 'أكمل هدفك اليومي', '◎'],
      ['finisher', 'منجز المهام', 'أكمل 3 دروس', '✓']
    ].map(([kind, title, hint, icon]) => `<div class="smart-badge ${hasAchievement(kind) ? 'is-earned' : ''}"><span>${icon}</span><b>${title}</b><small>${hasAchievement(kind) ? 'تم فتح الإنجاز' : hint}</small></div>`).join('');

    host.innerHTML = `<section class="smart-hub" aria-label="مركز التعلّم الذكي">
      <header class="smart-hub-head"><div><span class="smart-eyebrow">مساحة التعلّم الذكي</span><h2>خطوتك التالية تبدأ هنا</h2><p>تعلّم بوتيرتك، وتابع تقدمك، واجمع كل ما تحتاجه في مكان واحد.</p></div><div class="smart-head-actions"><button class="smart-search-trigger" data-smart="command"><span>⌕</span> ابحث في المنصة <kbd>Ctrl K</kbd></button><button class="smart-notify-trigger" data-smart="notifications" aria-label="مركز الإشعارات">♧${notifications.length ? `<i>${notifications.length}</i>` : ''}</button></div></header>
      <div class="smart-main-grid">
        <section class="smart-panel smart-continue"><div class="smart-panel-head"><div><span class="smart-eyebrow">تابع من حيث توقفت</span><h3>متابعة التعلّم</h3></div><span class="smart-status-pill">${current ? 'جاهز للمتابعة' : 'ابدأ أول درس'}</span></div>${current ? `<div class="smart-continue-body"><span class="smart-continue-art">${escapeHtml(current.title.slice(0, 1))}</span><div class="smart-continue-copy"><b>${escapeHtml(current.title)}</b><small>${escapeHtml(current.section)} · ${state.opened[0] ? 'آخر ما فتحته' : 'اقتراح البداية'}</small><button class="smart-primary" data-smart="open-item" data-id="${escapeHtml(current.id)}" data-title="${escapeHtml(current.title)}" data-section="${escapeHtml(current.section)}">${state.opened[0] ? 'تابع الدرس' : 'استكشف الدرس'} <span>←</span></button></div></div>` : '<p class="smart-empty">عند إضافة محتوى تعليمي سيظهر هنا خيار المتابعة.</p>'}</section>
        <section class="smart-panel smart-timer"><div class="smart-panel-head"><div><span class="smart-eyebrow">ركّز على خطوة واحدة</span><h3>مؤقت المذاكرة</h3></div><span class="smart-timer-mode">Pomodoro</span></div><div class="smart-clock" role="timer" aria-live="polite">${String(Math.floor(timerRemaining / 60)).padStart(2, '0')}:${String(timerRemaining % 60).padStart(2, '0')}</div><div class="smart-timer-presets"><button data-smart="preset" data-minutes="25" class="${timerRemaining === 25 * 60 ? 'active' : ''}">25 دقيقة</button><button data-smart="preset" data-minutes="50" class="${timerRemaining === 50 * 60 ? 'active' : ''}">50 دقيقة</button></div><div class="smart-timer-actions"><button class="smart-primary" data-smart="timer-toggle">${timerRunning ? 'إيقاف مؤقت' : 'ابدأ جلسة التركيز'}</button><button class="smart-reset" data-smart="timer-reset" aria-label="إعادة ضبط المؤقت">إعادة</button></div><small class="smart-timer-caption">وقت مذاكرتك اليوم: ${formatMinutes(today)}</small></section>
      </div>
      <div class="smart-progress-grid"><section class="smart-panel smart-progress-panel"><div class="smart-panel-head"><div><span class="smart-eyebrow">تقدمك الشخصي</span><h3>أهداف اليوم والأسبوع</h3></div><button class="smart-quiet" data-smart="goal-edit">تعديل الأهداف</button></div><div class="smart-goal"><div class="smart-goal-copy"><b>هدف اليوم</b><span>${formatMinutes(today)} من ${state.dailyGoalMinutes} دقيقة</span></div><div class="smart-track"><i style="width:${todayPercent}%"></i></div><small>${todayPercent >= 100 ? 'أحسنت، أكملت هدف اليوم!' : `بقي ${Math.max(0, state.dailyGoalMinutes - Math.floor(today / 60))} دقيقة`}</small></div><div class="smart-goal"><div class="smart-goal-copy"><b>هدف الأسبوع</b><span>${formatMinutes(weekly)} من ${state.weeklyGoalMinutes} دقيقة</span></div><div class="smart-track weekly"><i style="width:${weekPercent}%"></i></div><small>${weekPercent >= 100 ? 'حققت هدف هذا الأسبوع!' : `بقي ${Math.max(0, state.weeklyGoalMinutes - Math.floor(weekly / 60))} دقيقة`}</small></div></section><section class="smart-panel smart-stats-panel"><div class="smart-panel-head"><div><span class="smart-eyebrow">نظرة على عاداتك</span><h3>إحصائيات التعلّم</h3></div></div><div class="smart-stat-list"><div><b>${formatMinutes(weekly)}</b><small>مذاكرة هذا الأسبوع</small></div><div><b>${state.completed.length}</b><small>دروس أكملتها</small></div><div><b>${Object.keys(state.bookmarks).length}</b><small>دروس محفوظة</small></div></div></section></div>
      <div class="smart-content-grid"><section class="smart-panel smart-recommendations"><div class="smart-panel-head"><div><span class="smart-eyebrow">محتوى مقترح من المنصة</span><h3>دروس قد تناسبك</h3></div><button class="smart-quiet" data-section="المواد">كل الدروس ←</button></div><div class="smart-lesson-list">${suggestedHtml}</div></section><section class="smart-panel smart-deadlines"><div class="smart-panel-head"><div><span class="smart-eyebrow">لا يفوتك موعد</span><h3>الاختبارات والواجبات القادمة</h3></div></div><div class="smart-deadline-list">${dueHtml}</div></section></div>
      <div class="smart-content-grid"><section class="smart-panel smart-subjects"><div class="smart-panel-head"><div><span class="smart-eyebrow">تقدم حسب المادة</span><h3>مساراتك الدراسية</h3></div><span class="smart-count">${lessonContent.length} درس</span></div><div class="smart-subject-list">${subjectHtml}</div><small class="smart-local-note">يُحسب التقدم من الدروس التي سجلت إكمالها على هذا الجهاز.</small></section><section class="smart-panel smart-today"><div class="smart-panel-head"><div><span class="smart-eyebrow">خطوة بخطوة</span><h3>مهام اليوم</h3></div><span class="smart-count">${todayDeadlines.length + 1}</span></div><div class="smart-today-list">${todayTasksHtml}</div></section></div>
      <div class="smart-content-grid smart-lower-grid"><section class="smart-panel smart-calendar"><div class="smart-panel-head"><div><span class="smart-eyebrow">خطط أسبوعك</span><h3>التقويم الدراسي</h3></div><div class="smart-calendar-nav"><button data-smart="week-back" aria-label="الأسبوع السابق">‹</button><button data-smart="week-next" aria-label="الأسبوع التالي">›</button></div></div><div class="smart-week-days">${weekDays}</div><div class="smart-calendar-date">${escapeHtml(fullDate(new Date(`${selectedDay}T00:00:00`)))}</div><div class="smart-calendar-events">${selectedHtml}</div><small class="smart-local-note">يعرض المواعيد المسجّلة في المنصة.</small></section><section class="smart-panel smart-notes"><div class="smart-panel-head"><div><span class="smart-eyebrow">مسودتك الخاصة</span><h3>ملاحظاتي</h3></div><span id="smart-note-status" class="smart-note-status">${state.notes ? 'محفوظة محليًا' : 'احفظ فكرة مهمة'}</span></div><textarea data-smart-input="notes" maxlength="5000" placeholder="اكتب فكرة، سؤالًا، أو نقطة تريد مراجعتها…">${escapeHtml(state.notes)}</textarea><small class="smart-local-note">تُحفظ على هذا الجهاز لهذا الحساب فقط، ولا تُرسل إلى المدرسة.</small></section></div>
      <div class="smart-content-grid smart-lower-grid"><section class="smart-panel smart-bookmarks"><div class="smart-panel-head"><div><span class="smart-eyebrow">للرجوع لاحقًا</span><h3>المحفوظات</h3></div><span class="smart-count">${Object.keys(state.bookmarks).length}</span></div><div class="smart-saved-list">${savedHtml}</div></section><section class="smart-panel smart-recently"><div class="smart-panel-head"><div><span class="smart-eyebrow">أين كنت؟</span><h3>المفتوحة مؤخرًا</h3></div></div><div class="smart-recent-list">${openedHtml}</div></section><section class="smart-panel smart-activity"><div class="smart-panel-head"><div><span class="smart-eyebrow">خطواتك الصغيرة تُحسب</span><h3>النشاط الأخير</h3></div></div><ul class="smart-activity-list">${activityHtml}</ul></section></div>
      <section class="smart-panel smart-achievements"><div class="smart-panel-head"><div><span class="smart-eyebrow">كل إنجاز يبدأ بمحاولة</span><h3>إنجازاتك</h3></div><span class="smart-count">${[...['focus', 'explorer', 'goal', 'finisher']].filter(hasAchievement).length}/4</span></div><div class="smart-badges">${achievementRows}</div></section>
      <div class="smart-overlay" data-smart-overlay hidden><section class="smart-dialog" role="dialog" aria-modal="true" aria-label="البحث والأوامر"><div class="smart-dialog-head"><span>⌕</span><input data-smart-input="search" type="search" placeholder="ابحث عن درس أو واجب أو اختبار…" autocomplete="off"><kbd>Esc</kbd></div><div class="smart-command-list" data-smart-results><p class="smart-command-label">ابدأ البحث أو اختر قسمًا</p><div class="smart-command-shortcuts"><button data-section="المواد">المواد</button><button data-section="الفيديوهات">الفيديوهات</button><button data-section="الواجبات">الواجبات</button><button data-section="الامتحانات">الامتحانات</button><button data-section="الجدول">الجدول الدراسي</button><button data-smart="show-saved">المحفوظات</button></div></div></section></div>
      <div class="smart-toast" role="status" aria-live="polite"></div>
    </section>`;
    const dashboard = host.closest<HTMLElement>('.dashboard-student');
    const progressRing = dashboard?.querySelector<HTMLElement>('.student-ring');
    const progressValue = progressRing?.querySelector<HTMLElement>('strong');
    if (progressRing && progressValue) {
      progressValue.textContent = `${completionPercent}%`;
      progressRing.style.setProperty('--student-progress', `${completionPercent * 3.6}deg`);
      progressRing.setAttribute('aria-label', `${completionPercent} بالمئة من الدروس مكتملة`);
      progressRing.removeAttribute('aria-hidden');
    }
    const progressCopy = dashboard?.querySelector<HTMLElement>('.student-progress>div:last-child');
    if (progressCopy) progressCopy.innerHTML = `<b>${lessonContent.length ? 'إنجازك يتراكم' : 'ابدأ حين تكون مستعدًا'}</b><span>${lessonContent.length ? `${completedLessons} من ${lessonContent.length} درس مكتمل` : 'يُحتسب تقدمك من الدروس المنشورة.'}</span>`;
    host.querySelectorAll<HTMLElement>('.smart-lesson').forEach((row, index) => {
      const item = suggested[index];
      if (!item) return;
      const button = document.createElement('button');
      button.className = 'smart-complete';
      button.dataset.smart = 'complete';
      button.dataset.id = item.id;
      button.dataset.title = safeTitle(item.item);
      button.textContent = state.completed.includes(item.id) ? 'مكتمل' : 'تم';
      button.disabled = state.completed.includes(item.id);
      row.append(button);
    });
  };

  render();

  const updateTimerDisplay = () => {
    const clock = host.querySelector<HTMLElement>('.smart-clock');
    if (clock) clock.textContent = `${String(Math.floor(timerRemaining / 60)).padStart(2, '0')}:${String(timerRemaining % 60).padStart(2, '0')}`;
    const toggle = host.querySelector<HTMLButtonElement>('[data-smart="timer-toggle"]');
    if (toggle) toggle.textContent = timerRunning ? 'إيقاف مؤقت' : 'ابدأ جلسة التركيز';
    const label = host.querySelector<HTMLElement>('.smart-timer-caption');
    if (label) label.textContent = `وقت مذاكرتك اليوم: ${formatMinutes(todaySeconds())}`;
    const goalLabel = host.querySelector<HTMLElement>('.smart-goal span');
    if (goalLabel) goalLabel.textContent = `${formatMinutes(todaySeconds())} من ${state.dailyGoalMinutes} دقيقة`;
    const track = host.querySelector<HTMLElement>('.smart-goal .smart-track i');
    if (track) track.style.width = `${Math.min(100, Math.round(todaySeconds() / (state.dailyGoalMinutes * 60) * 100))}%`;
  };
  const toast = (message: string) => {
    const node = host.querySelector<HTMLElement>('.smart-toast');
    if (!node) return;
    node.textContent = message;
    node.classList.add('is-visible');
    window.setTimeout(() => node.classList.remove('is-visible'), 2200);
  };
  const showNotifications = () => {
    const old = host.querySelector<HTMLElement>('.smart-notification-popover');
    if (old) { old.remove(); return; }
    const messages = [...upcoming().filter(({ date }) => daysLeft(date) <= 3).map(({ item, type, date }) => `${type}: ${safeTitle(item)} · ${dayLabel(date)}`), ...(todaySeconds() >= state.dailyGoalMinutes * 60 ? ['أكملت هدفك اليومي — أحسنت!'] : [])];
    const popover = document.createElement('div');
    popover.className = 'smart-notification-popover';
    popover.innerHTML = `<b>مركز الإشعارات</b>${messages.length ? messages.map((text) => `<p>${escapeHtml(text)}</p>`).join('') : '<p>لا توجد تنبيهات جديدة.</p>'}`;
    host.querySelector('.smart-head-actions')?.append(popover);
  };
  const openPalette = () => {
    const overlay = host.querySelector<HTMLElement>('[data-smart-overlay]');
    if (!overlay) return;
    if (overlay.hidden) paletteOpener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    overlay.hidden = false;
    host.querySelector<HTMLInputElement>('[data-smart-input="search"]')?.focus();
  };
  const closePalette = () => {
    const overlay = host.querySelector<HTMLElement>('[data-smart-overlay]');
    if (!overlay || overlay.hidden) return;
    overlay.hidden = true;
    paletteOpener?.focus();
    paletteOpener = null;
  };
  const renderSearchResults = (queryText: string) => {
    const results = host.querySelector<HTMLElement>('[data-smart-results]');
    if (!results) return;
    const q = queryText.trim().toLocaleLowerCase('ar');
    if (!q) {
      results.innerHTML = '<p class="smart-command-label">ابدأ البحث أو اختر قسمًا</p><div class="smart-command-shortcuts"><button data-section="المواد">المواد</button><button data-section="الفيديوهات">الفيديوهات</button><button data-section="الواجبات">الواجبات</button><button data-section="الامتحانات">الامتحانات</button><button data-section="الجدول">الجدول الدراسي</button><button data-smart="show-saved">المحفوظات</button></div>';
      return;
    }
    const matches = [
      ...allContent().map(({ item, id, section }) => ({ id, title: safeTitle(item), subtitle: safeSubject(item), section, type: 'محتوى' })),
      ...upcoming().map(({ item, id, section, type, date }) => ({ id, title: safeTitle(item), subtitle: `${type} · ${dayLabel(date)}`, section, type })),
      ...Object.entries(state.bookmarks).map(([id, item]) => ({ id, title: item.title, subtitle: 'في المحفوظات', section: item.section, type: 'محفوظ' }))
    ].filter((item) => `${item.title} ${item.subtitle} ${item.section}`.toLocaleLowerCase('ar').includes(q)).slice(0, 8);
    results.innerHTML = matches.length ? `<p class="smart-command-label">نتائج البحث (${matches.length})</p>${matches.map((item) => `<button class="smart-command-result" data-smart="open-item" data-id="${escapeHtml(item.id)}" data-title="${escapeHtml(item.title)}" data-section="${escapeHtml(item.section)}"><span>⌕</span><b>${escapeHtml(item.title)}</b><small>${escapeHtml(item.subtitle)}</small><kbd>${escapeHtml(item.section)}</kbd></button>`).join('')}` : '<p class="smart-empty">لم نعثر على نتائج. جرّب كلمة أخرى.</p>';
  };
  const onClick = (event: Event) => {
    const target = event.target as HTMLElement;
    const button = target.closest<HTMLButtonElement>('[data-smart]');
    if (!button) return;
    const action = button.dataset.smart;
    if (action === 'command') openPalette();
    else if (action === 'notifications') showNotifications();
    else if (action === 'close-palette') closePalette();
    else if (action === 'timer-toggle') {
      if (timerRunning) { timerRunning = false; window.clearInterval(timerInterval); save(); }
      else {
        timerRunning = true; lastTick = Date.now();
        timerInterval = window.setInterval(() => {
          const now = Date.now();
          const elapsed = Math.max(1, Math.floor((now - lastTick) / 1000));
          lastTick += elapsed * 1000;
          timerRemaining = Math.max(0, timerRemaining - elapsed);
          const key = dateKey(new Date());
          state.studySeconds[key] = (state.studySeconds[key] ?? 0) + elapsed;
          updateTimerDisplay();
          if (++persistTick % 10 === 0) save();
          if (timerRemaining === 0) {
            timerRunning = false; window.clearInterval(timerInterval); save();
            recordActivity(state, 'أكملت جلسة تركيز'); save(); render(); toast('انتهت جلسة التركيز — خذ استراحة قصيرة.');
          }
        }, 1000);
      }
      render();
    } else if (action === 'timer-reset') {
      timerRunning = false; window.clearInterval(timerInterval); timerRemaining = 25 * 60; render();
    } else if (action === 'preset') {
      timerRunning = false; window.clearInterval(timerInterval); timerRemaining = Number(button.dataset.minutes) * 60; render();
    } else if (action === 'goal-edit') {
      const oldEditor = host.querySelector('.smart-goal-editor');
      if (oldEditor) oldEditor.remove();
      else {
        const editor = document.createElement('div');
        editor.className = 'smart-goal-editor';
        editor.innerHTML = `<div><span>الهدف اليومي</span><div class="smart-goal-controls"><button data-smart="goal-adjust" data-scope="daily" data-delta="-15">−</button><small>${state.dailyGoalMinutes} دقيقة</small><button data-smart="goal-adjust" data-scope="daily" data-delta="15">+</button></div></div><div><span>الهدف الأسبوعي</span><div class="smart-goal-controls"><button data-smart="goal-adjust" data-scope="weekly" data-delta="-60">−</button><small>${state.weeklyGoalMinutes} دقيقة</small><button data-smart="goal-adjust" data-scope="weekly" data-delta="60">+</button></div></div>`;
        button.closest('.smart-panel-head')?.after(editor);
      }
    } else if (action === 'goal-adjust') {
      const delta = Number(button.dataset.delta);
      if (button.dataset.scope === 'daily') state.dailyGoalMinutes = Math.max(15, Math.min(240, state.dailyGoalMinutes + delta));
      else state.weeklyGoalMinutes = Math.max(60, Math.min(1200, state.weeklyGoalMinutes + delta));
      recordActivity(state, 'عدّلت أهداف المذاكرة'); save(); render();
    } else if (action === 'week-back' || action === 'week-next') {
      weekOffset += action === 'week-back' ? -1 : 1;
      const start = viewDate(); start.setDate(start.getDate() + 3); selectedDay = dateKey(start); render();
    } else if (action === 'select-day') { selectedDay = button.dataset.date ?? dateKey(new Date()); render(); }
    else if (action === 'open-item' || action === 'open-recent') {
      const id = button.dataset.id ?? ''; const title = button.dataset.title ?? 'درس'; const section = button.dataset.section ?? 'المواد';
      openItem(id, title, section); closePalette();
      button.dataset.section = section;
      toast(`تم فتح ${title}`); render();
    } else if (action === 'bookmark') {
      const id = button.dataset.id ?? ''; const title = button.dataset.title ?? 'درس'; const section = button.dataset.section ?? 'المواد';
      if (state.bookmarks[id]) { delete state.bookmarks[id]; toast('أزيل من المحفوظات.'); }
      else { state.bookmarks[id] = { title, section }; toast('حُفظ للرجوع إليه لاحقًا.'); }
      recordActivity(state, state.bookmarks[id] ? `حفظت ${title}` : `أزلت ${title} من المحفوظات`); save(); render();
    } else if (action === 'complete') {
      const id = button.dataset.id ?? ''; const title = button.dataset.title ?? 'درس';
      if (!state.completed.includes(id)) state.completed.push(id);
      recordActivity(state, `أكملت ${title}`); save(); render(); toast('تم تسجيل إكمال الدرس.');
    } else if (action === 'show-saved') { closePalette(); host.querySelector('.smart-bookmarks')?.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
  };
  const onInput = (event: Event) => {
    const target = event.target as HTMLInputElement | HTMLTextAreaElement;
    if (target.dataset.smartInput === 'search') renderSearchResults(target.value);
    if (target.dataset.smartInput === 'notes') {
      state.notes = target.value.slice(0, 5000); save();
      const status = host.querySelector<HTMLElement>('#smart-note-status');
      if (status) status.textContent = 'محفوظة على هذا الجهاز';
    }
  };
  const onKeydown = (event: KeyboardEvent) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); openPalette(); }
    const overlay = host.querySelector<HTMLElement>('[data-smart-overlay]');
    if (overlay && !overlay.hidden && event.key === 'Tab') {
      const items = [...overlay.querySelectorAll<HTMLElement>('input:not([disabled]), button:not([disabled]), [tabindex]:not([tabindex="-1"])')];
      const first = items[0];
      const last = items[items.length - 1];
      if (!first) { event.preventDefault(); return; }
      if (event.shiftKey && (document.activeElement === first || !overlay.contains(document.activeElement))) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || !overlay.contains(document.activeElement))) { event.preventDefault(); first.focus(); }
    }
    if (event.key === 'Escape') closePalette();
    if (event.key === 'Enter' && (event.target as HTMLElement).matches('[data-smart-input="search"]')) {
      const first = host.querySelector<HTMLButtonElement>('.smart-command-result'); first?.click();
    }
  };
  host.addEventListener('click', onClick, { signal });
  host.addEventListener('input', onInput, { signal });
  document.addEventListener('keydown', onKeydown, { signal });
  signal.addEventListener('abort', () => { window.clearInterval(timerInterval); save(); }, { once: true });

  try {
    const pages = await Promise.allSettled([
      listPage<SmartItem>('lessons', null, 20),
      listPage<SmartItem>('videos', null, 20),
      listPage<SmartItem>('exams', null, 20),
      listStudentAssignments(user.uid, null, 20)
    ]);
    if (signal.aborted) return;
    if (pages[0].status === 'fulfilled') lessons = pages[0].value.items;
    if (pages[1].status === 'fulfilled') videos = pages[1].value.items;
    if (pages[2].status === 'fulfilled') exams = pages[2].value.items;
    if (pages[3].status === 'fulfilled') assignments = pages[3].value.items;
  } catch { /* dashboard remains useful when optional collections are unavailable */ }
  if (!signal.aborted) render();
}
