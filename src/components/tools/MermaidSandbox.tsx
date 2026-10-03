import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { starters } from '../../data/mermaid-starters';
import { copyText, decodeCode, downloadText, encodeCode, MERMAID_SANDBOX_PATH } from '../../lib/share';
import { load, save } from '../../scripts/storage';

const DRAFT_KEY = 'mermaid-sandbox:draft';

/**
 * Песочница Mermaid: редактор, живое превью, стартовые примеры, экспорт SVG, ссылка «поделиться».
 * Код может прийти из фрагмента URL (#code=…) — так работает кнопка «Открыть в песочнице» у диаграмм сайта.
 * Черновик хранится в localStorage этого браузера.
 */
export default function MermaidSandbox() {
  const [code, setCode] = useState('');
  const [svg, setSvg] = useState('');
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [dark, setDark] = useState(true);
  const seq = useRef(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Начальный код: из #code=, иначе черновик, иначе первый пример
  useEffect(() => {
    const hash = new URLSearchParams(location.hash.slice(1)).get('code');
    let initial = '';
    if (hash) {
      try {
        initial = decodeCode(hash);
      } catch {
        setStatus('Не удалось прочитать код из ссылки — открыт черновик');
      }
    }
    setCode(initial || load<string>(DRAFT_KEY, '') || starters[0].code);
  }, []);

  // Тема сайта
  useEffect(() => {
    const read = () => setDark(document.documentElement.dataset.theme !== 'light');
    read();
    const mo = new MutationObserver(read);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => mo.disconnect();
  }, []);

  // Рендер с задержкой 300 мс после ввода
  useEffect(() => {
    if (!code) return;
    save(DRAFT_KEY, code);
    const my = ++seq.current;
    const t = setTimeout(async () => {
      const { default: mermaid } = await import('mermaid');
      mermaid.initialize({
        startOnLoad: false,
        securityLevel: 'strict',
        theme: dark ? 'dark' : 'default',
        fontFamily: getComputedStyle(document.body).fontFamily,
      });
      try {
        await mermaid.parse(code);
        const { svg } = await mermaid.render(`sandbox-${my}`, code);
        if (my === seq.current) {
          setSvg(svg);
          setError('');
        }
      } catch (e) {
        if (my === seq.current) setError(((e as Error).message ?? String(e)).trim());
        // mermaid при ошибке может оставить в body временный элемент — убираем
        document.getElementById(`dsandbox-${my}`)?.remove();
      }
    }, 300);
    return () => clearTimeout(t);
  }, [code, dark]);

  const flash = (text: string) => {
    setStatus(text);
    setTimeout(() => setStatus(''), 2000);
  };

  const onKeyDown = useCallback((e: KeyboardEvent<HTMLTextAreaElement>) => {
    // Tab вставляет 4 пробела; Esc + Tab — обычный переход фокуса (Esc снимает «захват»)
    const ta = e.currentTarget;
    if (e.key === 'Escape') {
      ta.dataset.tabEscape = '1';
      return;
    }
    if (e.key === 'Tab' && !e.shiftKey && ta.dataset.tabEscape !== '1') {
      e.preventDefault();
      const { selectionStart: s, selectionEnd: end, value } = ta;
      const next = value.slice(0, s) + '    ' + value.slice(end);
      setCode(next);
      requestAnimationFrame(() => ta.setSelectionRange(s + 4, s + 4));
    }
    if (e.key !== 'Tab') delete ta.dataset.tabEscape;
  }, []);

  return (
    <div className="sandbox not-content">
      <div className="sandbox__toolbar">
        <label className="sandbox__starter">
          <span>Пример:</span>
          <select
            onChange={(e) => {
              const s = starters.find((x) => x.id === e.target.value);
              if (s && (code === '' || confirmReplace())) setCode(s.code);
              e.target.value = '';
            }}
            defaultValue=""
          >
            <option value="" disabled>
              выберите…
            </option>
            {starters.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        <div className="sandbox__actions">
          <button type="button" className="sa-btn" onClick={async () => flash((await copyText(code)) ? 'Код скопирован' : 'Не удалось скопировать')}>
            Копировать код
          </button>
          <button
            type="button"
            className="sa-btn"
            onClick={async () => {
              const url = `${location.origin}${MERMAID_SANDBOX_PATH}#code=${encodeCode(code)}`;
              flash((await copyText(url)) ? 'Ссылка скопирована' : 'Не удалось скопировать');
            }}
          >
            Ссылка на диаграмму
          </button>
          <button type="button" className="sa-btn" onClick={() => downloadText('diagram.mmd', code)}>
            Скачать .mmd
          </button>
          <button type="button" className="sa-btn sa-btn--primary" disabled={!svg || !!error} onClick={() => downloadText('diagram.svg', svg, 'image/svg+xml')}>
            Скачать SVG
          </button>
        </div>
      </div>
      <p className="sandbox__status" role="status" aria-live="polite">
        {status}
      </p>
      <div className="sandbox__panes">
        <label className="sandbox__editor">
          <span className="sr-only">Код Mermaid</span>
          <textarea
            ref={textareaRef}
            value={code}
            spellCheck={false}
            onChange={(e) => setCode(e.target.value)}
            onKeyDown={onKeyDown}
            aria-describedby="sandbox-hint"
          />
        </label>
        <div className="sandbox__preview" role="region" aria-label="Превью диаграммы">
          {error ? (
            <pre className="sandbox__error">{error}</pre>
          ) : (
            <div className="sandbox__svg" dangerouslySetInnerHTML={{ __html: svg }} />
          )}
        </div>
      </div>
      <p className="sandbox__hint" id="sandbox-hint">
        Tab в редакторе вставляет отступ; чтобы перейти к следующему элементу с клавиатуры, нажмите Esc, затем Tab. Черновик
        сохраняется в этом браузере автоматически.
      </p>
    </div>
  );

  function confirmReplace() {
    return confirm('Заменить текущий код примером? Черновик будет перезаписан.');
  }
}
