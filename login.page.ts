import { signIn, signUp } from '../auth/auth.service';
import { validEmail, passwordForFirebase, required } from '../utils/validation';

export function renderLogin(root: HTMLElement, onSuccess: () => void, onBack?: () => void) {
  root.innerHTML = `<section class="auth-card"><img src="./assets/images/logo.jpg" class="logo big" alt="شعار المدرسة"><h1>تسجيل الدخول الآمن</h1><p class="muted">تتم إدارة الحسابات عبر Firebase Authentication. لا تحفظ المنصة كلمات المرور.</p><form id="auth-form"><label>الاسم عند التسجيل<input name="name" autocomplete="name"></label><label>البريد الإلكتروني<input name="email" type="email" autocomplete="email" required></label><label>كلمة المرور<input name="password" type="password" autocomplete="current-password" minlength="8" required></label><div class="auth-actions"><button class="btn" data-mode="login">تسجيل الدخول</button><button class="btn ghost" data-mode="signup">إنشاء حساب</button></div><p id="auth-error" class="error" role="alert"></p>${onBack ? '<button type="button" class="auth-back-link" data-login-back>العودة إلى الصفحة الرئيسية</button>' : ''}</form></section>`;
  const form = root.querySelector<HTMLFormElement>('#auth-form')!;
  root.querySelector<HTMLButtonElement>('[data-login-back]')?.addEventListener('click', () => onBack?.());
  form.onsubmit = async (event) => {
    event.preventDefault();
    const submitter = (event.submitter as HTMLButtonElement | null)?.dataset.mode ?? 'login';
    const formData = new FormData(form);
    const error = root.querySelector<HTMLElement>('#auth-error')!;
    try {
      const email = validEmail(String(formData.get('email') ?? ''));
      const password = passwordForFirebase(String(formData.get('password') ?? ''));
      if (submitter === 'signup') await signUp(email, password, required(String(formData.get('name') ?? ''), 'الاسم'));
      else await signIn(email, password);
      onSuccess();
    } catch (reason) { error.textContent = reason instanceof Error ? reason.message : 'تعذر تنفيذ العملية.'; }
  };
}
