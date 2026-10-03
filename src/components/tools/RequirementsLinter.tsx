import { useEffect, useMemo, useState } from 'react';
import { analyzeStory, highlight, INVEST, lint, type InvestLetter, type Severity } from '../../lib/req-lint';
import { load, save } from '../../scripts/storage';
import './RequirementsLinter.css';

const KEY = 'requirements-linter';
const SEV_LABEL: Record<Severity, string> = { error: 'Ошибка', warn: 'Замечание', info: 'Подсказка' };

const BAD_EXAMPLE = [
  'FR-01. Система должна быстро создавать учётные записи для новых сотрудников и должна уведомлять всех заинтересованных лиц.',
  'FR-02. Интерфейс портала должен быть удобным и интуитивно понятным.',
  'FR-03. Отчёт может выгружаться в Excel при необходимости.',
  'FR-04. Должно быть обеспечено резервное копирование данных и т. д.',
  'FR-05. Это поле должно проверяться по правилам TBD.',
  'FR-06. Руководитель нажимает кнопку «Согласовать» в модальном окне.',
].join('\n');

const CASE_EXAMPLE = [
  'FR-06. IdM должна генерировать уникальный логин по правилу из раздела 2.1.',
  'FR-07. IdM должна создавать учётные записи за 3 рабочих дня до даты выхода в заблокированном состоянии; если до выхода меньше 3 рабочих дней — сразу.',
  'FR-08. IdM должна активировать учётные записи в 07:00 по часовому поясу подразделения в дату выхода.',
  'NFR-01. 95% кадровых событий обрабатываются (от получения до формирования задач провижининга) не дольше 5 минут.',
  'NFR-09. IdM хранит минимально необходимый набор ПДн: ФИО, табельный номер, подразделение, должность, мобильный телефон; дата рождения и паспортные данные не передаются.',
].join('\n');

const STORY_EXAMPLE = {
  story: 'Как HR-специалист, я хочу, чтобы подготовка доступов запускалась после проведения приказа, чтобы не уведомлять руководителя вручную.',
  criteria:
    'Сценарий: Новое событие о приёме\n  Дано в HRMS проведён приказ о приёме сотрудника с personId "P-100500"\n  Когда IdM получает событие HIRE с eventId "e-1"\n  Тогда в IdM создаётся идентичность в статусе PRE_HIRE\n  И в журнале аудита есть запись с основанием "eventId e-1"',
};

interface Saved {
  text: string;
  showInfo: boolean;
  story: string;
  criteria: string;
  checks: Partial<Record<InvestLetter, boolean>>;
}
const DEFAULTS: Saved = { text: BAD_EXAMPLE, showInfo: true, story: '', criteria: '', checks: {} };

/** Линтер требований и проверка user story по INVEST. Всё считается в браузере, текст хранится в localStorage. */
export default function RequirementsLinter() {
  const [tab, setTab] = useState<'reqs' | 'invest'>('reqs');
  const [st, setSt] = useState<Saved>(DEFAULTS);
  useEffect(() => setSt({ ...DEFAULTS, ...load<Partial<Saved>>(KEY, {}) }), []);
  const update = (patch: Partial<Saved>) =>
    setSt((s) => {
      const next = { ...s, ...patch };
      save(KEY, next);
      return next;
    });

  const results = useMemo(() => lint(st.text), [st.text]);
  const count = (sev: Severity) => results.reduce((n, r) => n + r.issues.filter((i) => i.severity === sev).length, 0);
  const clean = results.filter((r) => r.issues.every((i) => i.severity === 'info')).length;
  const story = useMemo(() => analyzeStory(st.story, st.criteria), [st.story, st.criteria]);

  return (
    <div className="rlint not-content">
      <div className="rlint__tabs" role="tablist">
        <button type="button" role="tab" aria-selected={tab === 'reqs'} className={tab === 'reqs' ? 'is-active' : ''} onClick={() => setTab('reqs')}>
          Требования
        </button>
        <button type="button" role="tab" aria-selected={tab === 'invest'} className={tab === 'invest' ? 'is-active' : ''} onClick={() => setTab('invest')}>
          User story и INVEST
        </button>
      </div>

      {tab === 'reqs' && (
        <>
          <label className="rlint__label" htmlFor="rlint-text">
            Требования — по одному в строке; можно вставить строки таблицы Markdown или «FR-01. текст»
          </label>
          <textarea id="rlint-text" className="rlint__input" rows={8} value={st.text} onChange={(e) => update({ text: e.target.value })} />
          <div className="rlint__bar">
            <button type="button" className="sa-btn" onClick={() => update({ text: BAD_EXAMPLE })}>
              Пример с ошибками
            </button>
            <button type="button" className="sa-btn" onClick={() => update({ text: CASE_EXAMPLE })}>
              Требования кейса
            </button>
            <button type="button" className="sa-btn" onClick={() => update({ text: '' })}>
              Очистить
            </button>
            <label className="rlint__check">
              <input type="checkbox" checked={st.showInfo} onChange={(e) => update({ showInfo: e.target.checked })} /> показывать подсказки
            </label>
          </div>

          {results.length > 0 && (
            <p className="rlint__summary" aria-live="polite">
              Требований: <strong>{results.length}</strong> · без ошибок и замечаний: <strong>{clean}</strong> ·{' '}
              <span className="sev-error">ошибок: {count('error')}</span> · <span className="sev-warn">замечаний: {count('warn')}</span> ·{' '}
              <span className="sev-info">подсказок: {count('info')}</span>
            </p>
          )}

          <ol className="rlint__list">
            {results.map((r, i) => {
              const issues = st.showInfo ? r.issues : r.issues.filter((x) => x.severity !== 'info');
              return (
                <li key={i} className={issues.length ? '' : 'is-clean'}>
                  <p className="rlint__text">
                    {r.id && <span className="rlint__id">{r.id}</span>}
                    {highlight(r.text, issues).map((p, j) =>
                      p.hit ? (
                        <mark key={j} className={`sev-${p.hit}`}>
                          {p.s}
                        </mark>
                      ) : (
                        <span key={j}>{p.s}</span>
                      ),
                    )}
                  </p>
                  {issues.length === 0 ? (
                    <p className="rlint__ok">Замечаний нет</p>
                  ) : (
                    <ul className="rlint__issues">
                      {issues.map((x, j) => (
                        <li key={j} className={`sev-${x.severity}`}>
                          <span className="rlint__sev">{SEV_LABEL[x.severity]}</span> {x.message}. <small>{x.hint}.</small>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ol>
        </>
      )}

      {tab === 'invest' && (
        <div className="rlint__invest">
          <div className="rlint__story">
            <label className="rlint__label" htmlFor="rlint-story">
              История: «Как &lt;роль&gt;, я хочу &lt;действие&gt;, чтобы &lt;ценность&gt;»
            </label>
            <textarea id="rlint-story" className="rlint__input" rows={3} value={st.story} onChange={(e) => update({ story: e.target.value })} />
            <label className="rlint__label" htmlFor="rlint-crit">
              Критерии приёмки или сценарии Gherkin
            </label>
            <textarea id="rlint-crit" className="rlint__input" rows={6} value={st.criteria} onChange={(e) => update({ criteria: e.target.value })} />
            <div className="rlint__bar">
              <button type="button" className="sa-btn" onClick={() => update({ ...STORY_EXAMPLE, checks: {} })}>
                Пример из кейса (US-01)
              </button>
              <button type="button" className="sa-btn" onClick={() => update({ story: '', criteria: '', checks: {} })}>
                Очистить
              </button>
            </div>
            {story.role && (
              <dl className="rlint__parsed">
                <dt>Роль</dt>
                <dd>{story.role}</dd>
                <dt>Действие</dt>
                <dd>{story.want}</dd>
                <dt>Ценность</dt>
                <dd>{story.benefit ?? <em>не найдена</em>}</dd>
              </dl>
            )}
          </div>

          <ul className="rlint__investlist">
            {INVEST.map((c) => {
              const hints = story.hints[c.letter] ?? [];
              return (
                <li key={c.letter} className={hints.length ? 'has-hints' : ''}>
                  <label>
                    <input
                      type="checkbox"
                      checked={Boolean(st.checks[c.letter])}
                      onChange={(e) => update({ checks: { ...st.checks, [c.letter]: e.target.checked } })}
                    />
                    <span className="rlint__letter">{c.letter}</span>
                    <span>
                      <strong>
                        {c.ru} <small>({c.name})</small>
                      </strong>
                      <br />
                      {c.question}
                    </span>
                  </label>
                  {hints.length > 0 && (
                    <ul>
                      {hints.map((h, i) => (
                        <li key={i}>{h}</li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
          <p className="rlint__note">
            Автоматические подсказки ловят только явные признаки. Отметьте критерий, когда ответили на вопрос сами; отмеченные:{' '}
            {INVEST.filter((c) => st.checks[c.letter]).length} из 6.
          </p>
        </div>
      )}
    </div>
  );
}
