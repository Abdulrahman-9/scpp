import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Icon } from './operator/Icon';
import { readTheme, toggleTheme } from './theme';

/**
 * مفتاح الوضع — واحد مشترك بين الصدفتين (ops/DESIGN-V2-SPEC.md §3-د).
 *
 * `aria-label` **ثابت** («تبديل الوضع») و`title` هو المتغيّر: تسمية تتبدّل تربك قارئ الشاشة
 * الذي يستعمل الأمر الصوتي — ينادي الزرّ باسم لم يعد اسمه بعد أوّل ضغطة.
 * `aria-pressed` يحمل الحالة بدل التسمية: زرّ ثنائي الحالة يقول «مضغوط» حين يكون الداكن نشطاً.
 */
export default function ThemeToggle() {
  const { t } = useTranslation();
  const [theme, setTheme] = useState(readTheme);
  const dark = theme === 'dark';

  return (
    <button
      type="button"
      className="op-iconbtn"
      aria-label={t('theme.toggle')}
      aria-pressed={dark}
      title={t(dark ? 'theme.toLight' : 'theme.toDark')}
      onClick={() => setTheme(toggleTheme())}
    >
      <Icon name={dark ? 'sun' : 'moon'} size={16} />
    </button>
  );
}
