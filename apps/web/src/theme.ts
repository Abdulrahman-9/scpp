/**
 * الوضع الفاتح/الداكن — ops/DESIGN-V2-SPEC.md §3.
 *
 * السمة على <html> صريحة دائماً (`data-theme="light" | "dark"`): سكربت ما قبل الرسم في
 * index.html يحلّ تفضيل النظام إلى قيمة صريحة، فلا يبقى للـCSS إلا محدّد واحد للداكن.
 *
 * المفتاح خارج مفاتيح الأعمال (`masaar-operator-v10`, `masaar-session-v2`) — نقطة لا شرطة،
 * نفس عقد `masaar.nav.sec` القائم: لا تجرفه هجرة بيانات ولا يجرفها.
 */

export type Theme = 'light' | 'dark';

export const THEME_KEY = 'masaar.theme';

const DARK_QUERY = '(prefers-color-scheme: dark)';

/** ما رُسم فعلاً — لا ما نتمنّاه: السمة على <html> هي الحقيقة الوحيدة. */
export function readTheme(): Theme {
  return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
}

/** ما اختاره المستخدم صراحةً، أو null إن لم يختر بعد (فيتبع النظام). */
function storedTheme(): Theme | null {
  try {
    const s = localStorage.getItem(THEME_KEY);
    return s === 'light' || s === 'dark' ? s : null;
  } catch {
    return null;   // نافذة خاصة أو متصفّح يمنع بيانات المواقع
  }
}

export function applyTheme(t: Theme): void {
  document.documentElement.setAttribute('data-theme', t);
  try {
    localStorage.setItem(THEME_KEY, t);
  } catch {
    /* التفضيل لا يُحفظ، لكن الوضع يُطبَّق — التخزين ليس شرطاً للعرض */
  }
}

export function toggleTheme(): Theme {
  const next: Theme = readTheme() === 'dark' ? 'light' : 'dark';
  applyTheme(next);
  return next;
}

/**
 * يتبع النظام **فقط** ما لم يوجد تفضيل مخزَّن — اختيار المستخدم يغلب النظام دائماً.
 * يعيد دالّة فكّ الاشتراك (تنظيف useEffect).
 */
export function watchSystemTheme(): () => void {
  if (typeof matchMedia !== 'function') return () => {};
  const mq = matchMedia(DARK_QUERY);
  const onChange = (e: MediaQueryListEvent) => {
    if (storedTheme() !== null) return;
    document.documentElement.setAttribute('data-theme', e.matches ? 'dark' : 'light');
  };
  mq.addEventListener('change', onChange);
  return () => mq.removeEventListener('change', onChange);
}
