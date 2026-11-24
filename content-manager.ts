import './content-manager.css';
import type { User } from 'firebase/auth';
import type { Role } from '../security/authorization';
import { escapeHtml } from '../components/ui';
import { invalidateCollection, listPage } from '../database/content.service';
import { featureCatalog } from './catalog';

type MediaItem = Record<string, unknown> & { id?: string };
type YoutubeMetadata = { id: string; title: string; thumbnail: string; duration: number };
type YoutubePlayer = {
  cueVideoById: (id: string) => void;
  getDuration: () => number;
  getVideoData: () => { title?: string; video_id?: string };
  destroy: () => void;
};
type YoutubeApi = { Player: new (element: HTMLElement | string, options: Record<string, unknown>) => YoutubePlayer };
type YoutubePlayerEvent = { target: YoutubePlayer };
declare global {
  interface Window {
    YT?: YoutubeApi;
    onYouTubeIframeAPIReady?: () => void;
  }
}

let youtubeApiPromise: Promise<YoutubeApi | null> | null = null;

function titleOf(item: MediaItem) { return String(item.title ?? item.name ?? 'بدون عنوان'); }
function subjectOf(item: MediaItem) { return String(item.subject ?? 'غير مصنّف'); }
function safeUrl(value: unknown) {
  if (typeof value !== 'string') return '';
  try {
    const url = new URL(value);
    return url.protocol === 'https:' ? url.href : '';
  } catch { return ''; }
}
function parseYoutubeId(value: string): string | null {
  try {
    const url = new URL(value.trim());
    const host = url.hostname.toLowerCase().replace(/^www\./, '');
    if (!['youtube.com', 'm.youtube.com', 'music.youtube.com', 'youtube-nocookie.com', 'youtu.be'].includes(host)) return null;
    let id = host === 'youtu.be' ? url.pathname.split('/').filter(Boolean)[0] : url.searchParams.get('v');
    if (!id) id = url.pathname.match(/\/(?:embed|shorts|live)\/([A-Za-z0-9_-]{11})/)?.[1] ?? null;
    return id && /^[A-Za-z0-9_-]{11}$/.test(id) ? id : null;
  } catch { return null; }
}
function formatDuration(seconds: number) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainder = seconds % 60;
  return hours ? `${hours}:${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}` : `${minutes}:${String(remainder).padStart(2, '0')}`;
}
function loadYoutubeApi(): Promise<YoutubeApi | null> {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (youtubeApiPromise) return youtubeApiPromise;
  youtubeApiPromise = new Promise((resolve) => {
    let settled = false;
    const finish = (api: YoutubeApi | null) => { if (!settled) { settled = true; resolve(api); } };
    const existing = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => { existing?.(); finish(window.YT ?? null); };
    let script = document.querySelector<HTMLScriptElement>('script[src="https://www.youtube.com/iframe_api"]');
    if (!script) {
      script = document.createElement('script');
      script.src = 'https://www.youtube.com/iframe_api';
      script.async = true;
      script.onerror = () => finish(null);
      document.head.append(script);
    }
    window.setTimeout(() => finish(window.YT ?? null), 15000);
  });
  return youtubeApiPromise;
}

async function extractYoutubeMetadata(id: string, signal: AbortSignal): Promise<YoutubeMetadata | null> {
  const api = await loadYoutubeApi();
  if (!api || signal.aborted) return null;
  const mount = document.createElement('div');
  mount.id = `yt-meta-${crypto.randomUUID()}`;
  mount.style.cssText = 'position:fixed;left:-10000px;top:-10000px;width:2px;height:2px;overflow:hidden;pointer-events:none';
  document.body.append(mount);
  return new Promise((resolve) => {
    let player: YoutubePlayer | undefined;
    let interval = 0;
    let timeout = 0;
    let finished = false;
    let title = '';
    let duration = 0;
    const finish = (result: YoutubeMetadata | null) => {
      if (finished) return;
      finished = true;
      window.clearInterval(interval);
      window.clearTimeout(timeout);
      signal.removeEventListener('abort', onAbort);
      try { player?.destroy(); } catch { /* iframe may not have initialized */ }
      mount.remove();
      resolve(result);
    };
    const onAbort = () => finish(null);
    signal.addEventListener('abort', onAbort, { once: true });
    const poll = () => {
      if (!player) return;
      try {
        const data = player.getVideoData();
        title = String(data?.title ?? title).trim();
        duration = Math.floor(player.getDuration() || duration);
        if (title && duration > 0) {
          finish({ id, title, thumbnail: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`, duration });
        }
      } catch { /* metadata is not ready yet */ }
    };
    try {
      player = new api.Player(mount, {
        videoId: id,
        playerVars: { controls: 0, disablekb: 1, fs: 0, rel: 0, playsinline: 1 },
        events: {
          onReady: (event: YoutubePlayerEvent) => {
            if (finished) return;
            player = event.target;
            player.cueVideoById(id);
            poll();
            interval = window.setInterval(poll, 400);
          },
          onError: () => finish(null)
        }
      });
      timeout = window.setTimeout(() => finish(title && duration > 0 ? { id, title, thumbnail: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`, duration } : null), 12000);
    } catch { finish(null); }
  });
}

function fileType(item: MediaItem) {
  return String(item.fileType ?? item.contentType ?? 'application/octet-stream').toLowerCase();
}
function fileKind(item: MediaItem) {
  const type = fileType(item);
  if (type === 'application/pdf' || String(item.fileName ?? '').toLowerCase().endsWith('.pdf')) return 'PDF';
  if (type.startsWith('image/')) return 'صورة';
  if (type.includes('word') || type.includes('document')) return 'مستند';
  if (type.includes('powerpoint') || type.includes('presentation')) return 'عرض';
  return 'ملف درس';
}
function videoIdOf(item: MediaItem) {
  const stored = typeof item.videoId === 'string' ? item.videoId : '';
  return /^[A-Za-z0-9_-]{11}$/.test(stored) ? stored : parseYoutubeId(String(item.url ?? item.youtubeUrl ?? ''));
}
function videoCard(item: MediaItem) {
  const id = videoIdOf(item);
  const thumb = safeUrl(item.thumbnail) || (id ? `https://i.ytimg.com/vi/${id}/hqdefault.jpg` : '');
  const duration = Number(item.duration) > 0 ? formatDuration(Number(item.duration)) : '';
  return `<article class="media-card"><div class="media-thumb ${thumb ? '' : 'no-thumb'}">${thumb ? `<img src="${escapeHtml(thumb)}" loading="lazy" alt="صورة مصغرة لفيديو ${escapeHtml(titleOf(item))}">` : '<span>▶ YouTube</span>'}<span class="media-duration">${duration ? escapeHtml(duration) : 'YouTube'}</span></div><div class="media-card-copy"><span class="media-kicker">فيديو YouTube</span><h3>${escapeHtml(titleOf(item))}</h3><p>${escapeHtml(subjectOf(item))}</p><div class="media-card-actions">${id ? `<button type="button" class="btn sm" data-preview-video="${escapeHtml(id)}">مشاهدة داخل الموقع</button>` : `<a class="btn sm" href="${escapeHtml(safeUrl(item.url))}" target="_blank" rel="noopener noreferrer">فتح الفيديو</a>`}</div></div></article>`;
}
function fileCard(item: MediaItem) {
  const url = safeUrl(item.fileUrl ?? item.url);
  const name = String(item.fileName ?? titleOf(item));
  const kind = fileKind(item);
  const type = fileType(item);
  const imageUrl = type.startsWith('image/') ? url : '';
  return `<article class="media-card"><div class="file-cover ${imageUrl ? 'is-image' : ''}">${imageUrl ? `<img src="${escapeHtml(imageUrl)}" loading="lazy" alt="${escapeHtml(titleOf(item))}">` : `<span class="file-kind-icon">${kind === 'PDF' ? 'PDF' : kind === 'صورة' ? 'IMG' : 'DOC'}</span>`}<span class="file-kind-pill">${escapeHtml(kind)}</span></div><div class="media-card-copy"><span class="media-kicker">${escapeHtml(subjectOf(item))}</span><h3>${escapeHtml(titleOf(item))}</h3><p class="media-filename">${escapeHtml(name)}</p><div class="media-card-actions">${url ? `<button type="button" class="btn sm" data-preview-file="${escapeHtml(url)}" data-file-type="${escapeHtml(type)}" data-file-title="${escapeHtml(titleOf(item))}">معاينة</button><button type="button" class="media-download" data-download-file="${escapeHtml(url)}" data-storage-path="${escapeHtml(String(item.storagePath ?? ''))}" data-file-name="${escapeHtml(name)}">تنزيل</button>` : '<span class="muted">لا يوجد ملف مرتبط</span>'}</div></div></article>`;
}
function subjectOptions(items: MediaItem[]) {
  const subjects = [...new Set(items.map(subjectOf).filter((subject) => subject && subject !== 'غير مصنّف'))].sort((a, b) => a.localeCompare(b, 'ar'));
  return `<label class="media-subject-filter">المادة<select id="media-subject-filter"><option value="">كل المواد</option>${subjects.map((subject) => `<option value="${escapeHtml(subject)}">${escapeHtml(subject)}</option>`).join('')}</select></label>`;
}

export async function renderContentFeature(root: HTMLElement, user: User, role: Role, section: string, signal: AbortSignal) {
  const feature = featureCatalog[role][section];
  if (!feature) return;
  const isVideoForm = feature.action === 'youtube';
  const isFileForm = feature.action === 'uploadFile';
  const isManager = feature.action === 'contentManager';
  const form = isVideoForm ? `<form id="youtube-form" class="panel content-form"><label>رابط فيديو YouTube<input name="url" type="url" inputmode="url" placeholder="https://www.youtube.com/watch?v=…" required autocomplete="url"></label><p class="content-help">ألصق رابط الفيديو فقط؛ سنجلب العنوان والصورة المصغّرة والمدة تلقائيًا من مشغّل YouTube.</p><div class="youtube-preview" id="youtube-preview" hidden><img alt="الصورة المصغّرة للفيديو"><div><b></b><small></small></div></div><p class="error" id="content-status" aria-live="polite"></p><button class="btn" type="submit" id="youtube-submit" disabled>إضافة الفيديو</button></form>` : isFileForm ? `<form id="file-form" class="panel form-grid content-form"><label>عنوان الدرس<input name="title" required maxlength="120" placeholder="مثال: مقدمة في الجبر"></label><label>المادة<input name="subject" required maxlength="80" placeholder="مثال: الرياضيات"></label><label>ملف الدرس<input name="file" type="file" accept=".pdf,.png,.jpg,.jpeg,.gif,.webp,.doc,.docx,.ppt,.pptx,application/pdf,image/*" required><small class="content-help">PDF أو صورة أو مستند/عرض. الحد الأقصى 25MB.</small></label><p class="error" id="content-status" aria-live="polite"></p><button class="btn" type="submit">رفع وحفظ الملف</button></form>` : '';
  root.innerHTML = `<section class="page-title"><span class="tag">${escapeHtml(role)}</span><h1>${escapeHtml(feature.title)}</h1><p class="muted">${escapeHtml(feature.description)}</p></section>${form}<div id="content-list" class="content-library"><div class="panel"><p class="muted">جاري تحميل المحتوى…</p></div></div><div class="media-preview-modal" id="media-preview-modal" hidden><section class="media-preview-dialog" role="dialog" aria-modal="true" aria-labelledby="media-preview-title" tabindex="-1"><header><b id="media-preview-title"></b><button type="button" data-media-close aria-label="إغلاق المعاينة">×</button></header><div class="media-preview-body" id="media-preview-body"></div></section></div>`;

  const list = root.querySelector<HTMLElement>('#content-list')!;
  let files: MediaItem[] = [];
  let videos: MediaItem[] = [];
  const status = (message: string, error = false) => {
    const node = root.querySelector<HTMLElement>('#content-status');
    if (node) { node.textContent = message; node.classList.toggle('error', error); node.classList.toggle('success', !error); }
  };
  const renderList = (filter = '') => {
    const all = isManager ? [...videos.map((item) => ({ item, kind: 'video' as const })), ...files.map((item) => ({ item, kind: 'file' as const }))] : feature.collection === 'videos' || isVideoForm ? videos.map((item) => ({ item, kind: 'video' as const })) : files.map((item) => ({ item, kind: 'file' as const }));
    const visible = all.filter(({ item }) => !filter || subjectOf(item) === filter);
    const filterHtml = subjectOptions(all.map(({ item }) => item));
    const cards = visible.map(({ item, kind }) => kind === 'video' ? videoCard(item) : fileCard(item)).join('');
    list.innerHTML = `<div class="media-toolbar">${filterHtml}<span>${visible.length} عنصر</span></div>${cards ? `<div class="media-grid">${cards}</div>` : '<div class="panel empty-mini">لا يوجد محتوى ضمن هذا التصنيف بعد.</div>'}`;
    const select = list.querySelector<HTMLSelectElement>('#media-subject-filter');
    if (select) { select.value = filter; select.addEventListener('change', () => renderList(select.value), { signal }); }
  };
  const loadItems = async () => {
    const wantVideos = isManager || feature.collection === 'videos' || isVideoForm;
    const wantFiles = isManager || feature.collection === 'lessons' || isFileForm;
    let videoResult: MediaItem[] = [];
    let fileResult: MediaItem[] = [];
    try {
      const [videoPage, filePage] = await Promise.all([
        wantVideos ? listPage<MediaItem>('videos', null, 20) : Promise.resolve(null),
        wantFiles ? listPage<MediaItem>('lessons', null, 20) : Promise.resolve(null)
      ]);
      videoResult = videoPage?.items ?? [];
      fileResult = filePage?.items ?? [];
    } catch {
      if (!signal.aborted) list.innerHTML = `<div class="panel" role="alert"><p>تعذر تحميل المكتبة. تحقق من الاتصال والصلاحيات ثم أعد المحاولة.</p><button class="btn sm" type="button" data-retry-content>إعادة المحاولة</button></div>`;
      return;
    }
    if (signal.aborted) return;
    videos = videoResult;
    files = fileResult;
    renderList();
  };
  await loadItems();
  if (signal.aborted) return;

  const fileForm = root.querySelector<HTMLFormElement>('#file-form');
  if (fileForm) fileForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const submit = fileForm.querySelector<HTMLButtonElement>('button[type="submit"]');
    if (submit) submit.disabled = true;
    status('جارٍ رفع الملف…');
    let uploadedPath: string | null = null;
    try {
      const values = new FormData(fileForm);
      const file = values.get('file');
      if (!(file instanceof File)) throw new Error('اختر ملفًا صالحًا.');
      const { uploadLessonFile } = await import('../services/storage.service');
      const { createRecord } = await import('../services/records.service');
      const uploaded = await uploadLessonFile(role, user.uid, file);
      uploadedPath = uploaded.path;
      await createRecord(role, user.uid, 'lessons', {
        title: String(values.get('title') ?? '').trim(),
        subject: String(values.get('subject') ?? '').trim(),
        fileName: file.name,
        fileType: file.type,
        fileSize: file.size,
        fileUrl: uploaded.url,
        storagePath: uploaded.path
      });
      invalidateCollection('lessons');
      fileForm.reset();
      status('تم رفع الملف وحفظه في مكتبة المادة.');
      await loadItems();
    } catch (reason) {
      let cleanupFailed = false;
      if (uploadedPath) {
        try {
          const { deleteLessonFile } = await import('../services/storage.service');
          await deleteLessonFile(role, user.uid, uploadedPath);
        } catch { cleanupFailed = true; }
      }
      const message = reason instanceof Error ? reason.message : 'تعذر رفع الملف.';
      status(cleanupFailed ? `${message} وقد يتطلب الملف المرفوع تنظيفًا إداريًا.` : message, true);
    }
    finally { if (submit) submit.disabled = false; }
  }, { signal });

  if (isVideoForm) {
    const videoForm = root.querySelector<HTMLFormElement>('#youtube-form')!;
    const urlInput = videoForm.querySelector<HTMLInputElement>('input[name="url"]')!;
    const preview = root.querySelector<HTMLElement>('#youtube-preview')!;
    const saveButton = root.querySelector<HTMLButtonElement>('#youtube-submit')!;
    let metadata: YoutubeMetadata | null = null;
    let sequence = 0;
    let scanTimer = 0;
    let metadataController: AbortController | null = null;
    const resetPreview = () => {
      const image = preview.querySelector<HTMLImageElement>('img')!;
      image.removeAttribute('src');
      preview.querySelector('b')!.textContent = '';
      preview.querySelector('small')!.textContent = '';
      preview.hidden = true;
    };
    urlInput.addEventListener('input', () => {
      const current = ++sequence;
      window.clearTimeout(scanTimer);
      metadataController?.abort();
      metadataController = new AbortController();
      metadata = null;
      saveButton.disabled = true;
      resetPreview();
      const id = parseYoutubeId(urlInput.value);
      if (!id) { status(urlInput.value ? 'أدخل رابط YouTube صالحًا.' : ''); return; }
      status('جارٍ استخراج عنوان الفيديو ومدته…');
      const image = preview.querySelector<HTMLImageElement>('img')!;
      image.src = `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
      image.alt = 'الصورة المصغّرة من YouTube';
      preview.hidden = false;
      scanTimer = window.setTimeout(async () => {
        const result = await extractYoutubeMetadata(id, metadataController!.signal);
        if (signal.aborted || current !== sequence || parseYoutubeId(urlInput.value) !== id) return;
        if (!result) {
          status('تعذر استخراج المدة والعنوان. تأكد أن الفيديو عام ويسمح بالتضمين، ثم جرّب رابطًا آخر.', true);
          return;
        }
        metadata = result;
        preview.querySelector('b')!.textContent = result.title;
        preview.querySelector('small')!.textContent = `المدة ${formatDuration(result.duration)} · YouTube`;
        saveButton.disabled = false;
        status('تم استخراج بيانات الفيديو تلقائيًا.');
      }, 450);
    }, { signal });
    signal.addEventListener('abort', () => { sequence++; window.clearTimeout(scanTimer); metadataController?.abort(); }, { once: true });
    videoForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (!metadata) { status('أدخل رابطًا صالحًا وانتظر استخراج المدة والعنوان.', true); return; }
      saveButton.disabled = true;
      try {
        const { createRecord } = await import('../services/records.service');
        await createRecord(role, user.uid, 'videos', {
          title: metadata.title,
          url: `https://www.youtube.com/watch?v=${metadata.id}`,
          videoId: metadata.id,
          thumbnail: metadata.thumbnail,
          duration: metadata.duration,
          provider: 'youtube'
        });
        invalidateCollection('videos');
        videoForm.reset(); metadata = null; resetPreview(); status('تمت إضافة الفيديو إلى مكتبة YouTube.');
        await loadItems();
      } catch (reason) { status(reason instanceof Error ? reason.message : 'تعذر حفظ الفيديو.', true); }
      finally { saveButton.disabled = !metadata; }
    }, { signal });
  }

  const modal = root.querySelector<HTMLElement>('#media-preview-modal');
  const dialog = modal?.querySelector<HTMLElement>('[role="dialog"]');
  const body = root.querySelector<HTMLElement>('#media-preview-body');
  let previewTrigger: HTMLElement | null = null;
  const showPreview = (trigger: HTMLElement) => {
    previewTrigger = trigger;
    if (modal) modal.hidden = false;
    modal?.querySelector<HTMLButtonElement>('[data-media-close]')?.focus();
  };
  const closePreview = () => {
    if (modal) modal.hidden = true;
    body?.replaceChildren();
    previewTrigger?.focus();
    previewTrigger = null;
  };
  root.addEventListener('keydown', (event: KeyboardEvent) => {
    if (!modal || modal.hidden) return;
    if (event.key === 'Escape') { event.preventDefault(); closePreview(); return; }
    if (event.key !== 'Tab' || !dialog) return;
    const items = [...dialog.querySelectorAll<HTMLElement>('button:not([disabled]), iframe, a[href], [tabindex]:not([tabindex="-1"])')];
    if (!items.length) { event.preventDefault(); dialog.focus(); return; }
    const first = items[0];
    const last = items[items.length - 1];
    if (event.shiftKey && (document.activeElement === first || !dialog.contains(document.activeElement))) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && (document.activeElement === last || !dialog.contains(document.activeElement))) { event.preventDefault(); first.focus(); }
  }, { signal });

  root.addEventListener('click', async (event) => {
    const target = event.target as HTMLElement;
    const retry = target.closest<HTMLButtonElement>('[data-retry-content]');
    if (retry) { retry.disabled = true; await loadItems(); return; }
    const close = target.closest<HTMLButtonElement>('[data-media-close]');
    if (close || target === modal) {
      closePreview();
      return;
    }
    const videoButton = target.closest<HTMLButtonElement>('[data-preview-video]');
    if (videoButton && modal && body) {
      const id = videoButton.dataset.previewVideo;
      const title = videoButton.closest('.media-card')?.querySelector('h3')?.textContent ?? 'فيديو YouTube';
      if (!id || !/^[A-Za-z0-9_-]{11}$/.test(id)) return;
      root.querySelector<HTMLElement>('#media-preview-title')!.textContent = title;
      const iframe = document.createElement('iframe');
      iframe.src = `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0&playsinline=1`;
      iframe.title = title;
      iframe.allow = 'accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture; web-share';
      iframe.allowFullscreen = true;
      iframe.referrerPolicy = 'strict-origin-when-cross-origin';
      body?.replaceChildren(iframe); showPreview(videoButton); return;
    }
    const fileButton = target.closest<HTMLButtonElement>('[data-preview-file]');
    if (fileButton && modal && body) {
      const url = safeUrl(fileButton.dataset.previewFile);
      const type = fileButton.dataset.fileType ?? '';
      const title = fileButton.dataset.fileTitle ?? 'معاينة الملف';
      if (!url) return;
      root.querySelector<HTMLElement>('#media-preview-title')!.textContent = title;
      if (type.startsWith('image/')) {
        const image = document.createElement('img'); image.src = url; image.alt = title; body?.replaceChildren(image);
      } else if (type === 'application/pdf' || url.toLowerCase().includes('.pdf')) {
        const iframe = document.createElement('iframe'); iframe.src = url; iframe.title = title; body?.replaceChildren(iframe);
      } else {
        window.open(url, '_blank', 'noopener,noreferrer'); return;
      }
      showPreview(fileButton); return;
    }
    const download = target.closest<HTMLButtonElement>('[data-download-file]');
    if (download) {
      const url = safeUrl(download.dataset.downloadFile);
      const path = download.dataset.storagePath ?? '';
      const name = download.dataset.fileName ?? 'lesson-file';
      if (!url) return;
      download.disabled = true;
      try {
        if (path) {
          const { downloadLessonFile } = await import('../services/storage.service');
          const blob = await downloadLessonFile(path);
          const objectUrl = URL.createObjectURL(blob);
          const anchor = document.createElement('a'); anchor.href = objectUrl; anchor.download = name; anchor.click();
          window.setTimeout(() => URL.revokeObjectURL(objectUrl), 30000);
        } else window.open(url, '_blank', 'noopener,noreferrer');
      } catch {
        window.open(url, '_blank', 'noopener,noreferrer');
      } finally { download.disabled = false; }
    }
  }, { signal });
}
