import './styles.css';
import { firebaseReady, app } from './firebase/app';
import { applyTheme } from './utils/theme';

const root = document.querySelector<HTMLElement>('#app')!;
applyTheme((localStorage.getItem('tanagha-theme') as 'light' | 'dark' | null) ?? 'light');

function showFirebaseSetup() {
  root.innerHTML = `<section class="auth-card"><img src="./assets/images/logo.jpg" class="logo big" loading="eager" alt="شعار المدرسة"><h1>إعداد Firebase مطلوب</h1><p class="muted">أنشئ ملف <code>.env.local</code> اعتمادًا على <code>.env.example</code>. لن يتم وضع أي Secret في الواجهة.</p><button type="button" class="btn ghost auth-back-link" data-home-back>العودة إلى الصفحة الرئيسية</button></section>`;
  root.querySelector<HTMLButtonElement>('[data-home-back]')?.addEventListener('click', () => void showHome());
}

async function showHome() {
  const { renderHome } = await import('./pages/home.page');
  renderHome(root, () => {
    if (!firebaseReady || !app) { showFirebaseSetup(); return; }
    void openLogin();
  });
}

async function openLogin() {
  const { renderLogin } = await import('./pages/login.page');
  renderLogin(root, () => undefined, () => void showHome());
}

async function start() {
  if (!firebaseReady || !app) {
    await showHome();
    return;
  }
  const { observeAuth } = await import('./auth/auth.service');
  let cleanup: () => void = () => undefined;
  const unsubscribe = observeAuth(async (user) => {
    if (!user) { cleanup(); await showHome(); return; }
    const { renderDashboard, cleanupDashboard } = await import('./pages/dashboard.page');
    cleanup = cleanupDashboard;
    try { await renderDashboard(root, user); } catch (error) { root.innerHTML = `<section class="auth-card"><h1>تعذر فتح لوحة التحكم</h1><p class="error">${error instanceof Error ? error.message : 'خطأ غير معروف'}</p></section>`; }
  });
  window.addEventListener('pagehide', unsubscribe, { once: true });
}
void start();
