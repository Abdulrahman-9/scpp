import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
// خطوط ذاتية الاستضافة — لا CDN في الإنتاج (روابط Google في design-v2-ref محظورة).
// أربعة أوزان لكل عائلة، مطابقةً لسلّم --fw-* بالضبط: 400/500/600/700.
import '@fontsource/ibm-plex-sans-arabic/400.css';
import '@fontsource/ibm-plex-sans-arabic/500.css';
import '@fontsource/ibm-plex-sans-arabic/600.css';
import '@fontsource/ibm-plex-sans-arabic/700.css';
// انحراف مصرَّح به عن §2: الحزمة المجمَّعة لـJetBrains تحمل ستّ مجموعات محارف لكل وزن
// (سيريلية ويونانية وفيتنامية ولاتينية موسَّعة) = 24 ‏@font-face و36 ملفّ خطّ. وكل مستهلكي
// ‏--font-mono جزر LTR للأرقام والرموز والتواريخ، فاللاتينية وحدها هي المستعملة. هذا وحده
// ما يُبقي حزمة CSS تحت عتبة §7-د (175 kB): المجمَّعة تدفعها إلى 195.86.
import '@fontsource/jetbrains-mono/latin-400.css';
import '@fontsource/jetbrains-mono/latin-500.css';
import '@fontsource/jetbrains-mono/latin-600.css';
import '@fontsource/jetbrains-mono/latin-700.css';
import '@masaar/tokens/css/tokens.css';
import './i18n';
import './styles.css';
import App from './App';
import ErrorBoundary from './ErrorBoundary';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* outermost: a render crash anywhere below shows the bilingual notice, never a white screen */}
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
