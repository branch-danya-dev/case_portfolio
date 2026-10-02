import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { parse } from 'yaml';
import { marked } from 'marked';

/**
 * Лёгкий просмотрщик AsyncAPI 3.x: инфо, серверы, операции, каналы, сообщения,
 * схема полезной нагрузки (с разрешением локальных $ref) и примеры. Всё локально.
 */
interface Props {
  /** URL спецификации на этом сайте. */
  src?: string;
  /** Или сам текст спецификации (для инструментов). */
  text?: string;
}

type Obj = Record<string, any>;

function resolvePointer(root: Obj, ref: string): any {
  if (!ref.startsWith('#/')) return undefined;
  return ref
    .slice(2)
    .split('/')
    .map((p) => p.replace(/~1/g, '/').replace(/~0/g, '~'))
    .reduce((acc, key) => (acc == null ? acc : acc[key]), root as any);
}

/** Разрешает $ref рекурсивно (с защитой от циклов). */
function deref(root: Obj, node: any, seen = new Set<string>()): any {
  if (!node || typeof node !== 'object') return node;
  if (typeof node.$ref === 'string') {
    if (seen.has(node.$ref)) return { $circular: node.$ref };
    const target = resolvePointer(root, node.$ref);
    return { ...deref(root, target, new Set([...seen, node.$ref])), $refName: node.$ref.split('/').pop() };
  }
  if (Array.isArray(node)) return node.map((n) => deref(root, n, seen));
  return Object.fromEntries(Object.entries(node).map(([k, v]) => [k, deref(root, v, seen)]));
}

const md = (s?: string) => (s ? { __html: marked.parse(s, { async: false }) as string } : undefined);

function Constraints({ s }: { s: Obj }) {
  const parts: ReactNode[] = [];
  if (s.format) parts.push(<span key="f">формат: <code>{s.format}</code></span>);
  if (s.enum) parts.push(<span key="e">значения: {s.enum.map((v: unknown) => <code key={String(v)}>{String(v)}</code>).reduce((a: ReactNode[], b: ReactNode) => [...a, ' ', b], [])}</span>);
  if (s.const !== undefined) parts.push(<span key="c">константа: <code>{String(s.const)}</code></span>);
  if (s.pattern) parts.push(<span key="p">шаблон: <code>{s.pattern}</code></span>);
  if (s.maxLength) parts.push(<span key="m">макс. длина: {s.maxLength}</span>);
  if (s.additionalProperties === false) parts.push(<span key="a">лишние поля запрещены</span>);
  return parts.length ? <div className="aa-constraints">{parts}</div> : null;
}

function SchemaRows({ schema, depth = 0 }: { schema: Obj; depth?: number }) {
  const props: Obj = schema.properties ?? {};
  const required = new Set<string>(schema.required ?? []);
  return (
    <>
      {Object.entries(props).map(([name, s]: [string, Obj]) => (
        <SchemaRow key={name} name={name} s={s} required={required.has(name)} depth={depth} />
      ))}
    </>
  );
}

function SchemaRow({ name, s, required, depth }: { name: string; s: Obj; required: boolean; depth: number }) {
  const type = s.type ?? (s.$circular ? 'цикл' : 'object');
  return (
    <>
      <tr>
        <td style={{ paddingInlineStart: `${0.6 + depth * 1.2}rem` }}>
          <code>{name}</code>
          {required && <span className="aa-req" title="Обязательное поле"> *</span>}
        </td>
        <td>
          <code>{type}</code>
          {s.$refName && <span className="aa-ref"> ({s.$refName})</span>}
        </td>
        <td>
          {s.description && <div className="aa-desc" dangerouslySetInnerHTML={md(s.description)} />}
          <Constraints s={s} />
        </td>
      </tr>
      {s.properties && <SchemaRows schema={s} depth={depth + 1} />}
    </>
  );
}

function SchemaTable({ schema }: { schema: Obj }) {
  return (
    <div className="aa-table-wrap">
      <table className="aa-table">
        <thead>
          <tr>
            <th>Поле</th>
            <th>Тип</th>
            <th>Описание и ограничения</th>
          </tr>
        </thead>
        <tbody>
          <SchemaRows schema={schema} />
        </tbody>
      </table>
      {(schema.if || schema.then) && (
        <details className="aa-cond">
          <summary>Условные правила (if / then)</summary>
          <pre>{JSON.stringify({ if: schema.if, then: schema.then }, null, 2)}</pre>
        </details>
      )}
    </div>
  );
}

export default function AsyncApiViewer({ src, text }: Props) {
  const [raw, setRaw] = useState<string | undefined>(text);
  const [error, setError] = useState('');

  useEffect(() => {
    if (text !== undefined) return setRaw(text);
    if (!src) return;
    fetch(src)
      .then((r) => (r.ok ? r.text() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then(setRaw)
      .catch((e) => setError(e.message));
  }, [src, text]);

  const parsed = useMemo(() => {
    if (!raw) return undefined;
    try {
      const root = parse(raw) as Obj;
      return { doc: { root, spec: deref(root, root) as Obj }, error: '' };
    } catch (e) {
      return { doc: undefined, error: `ошибка разбора YAML: ${(e as Error).message}` };
    }
  }, [raw]);
  const doc = parsed?.doc;
  const parseError = parsed?.error;

  if (error || parseError) return <p className="aa-status">Не удалось открыть спецификацию: {error || parseError}</p>;
  if (!doc) return <p className="aa-status">Загружаю спецификацию…</p>;

  const { spec } = doc;
  const version = String(spec.asyncapi ?? '');
  if (!version.startsWith('3.')) {
    return <p className="aa-status">Поддерживается AsyncAPI 3.x, а в файле указана версия «{version || 'не указана'}».</p>;
  }
  const servers: Obj = spec.servers ?? {};
  const channels: Obj = spec.channels ?? {};
  const operations: Obj = spec.operations ?? {};
  const messages: Obj = spec.components?.messages ?? {};

  return (
    <div className="aa">
      <header className="aa-head">
        <h2 className="aa-title">{spec.info?.title}</h2>
        <p className="aa-meta">
          Версия контракта <code>{spec.info?.version}</code> · AsyncAPI <code>{version}</code>
        </p>
        {spec.info?.description && <div className="aa-desc" dangerouslySetInnerHTML={md(spec.info.description)} />}
      </header>

      {Object.keys(servers).length > 0 && (
        <section>
          <h3>Серверы</h3>
          <div className="aa-table-wrap">
            <table className="aa-table">
              <thead><tr><th>Имя</th><th>Хост</th><th>Протокол</th><th>Описание</th></tr></thead>
              <tbody>
                {Object.entries(servers).map(([name, s]: [string, Obj]) => (
                  <tr key={name}><td><code>{name}</code></td><td><code>{s.host}</code></td><td>{s.protocol}</td><td>{s.description}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section>
        <h3>Операции</h3>
        {Object.entries(operations).map(([id, op]: [string, Obj]) => (
          <div className="aa-card" key={id}>
            <p className="aa-card-title">
              <span className={`aa-badge aa-badge--${op.action}`}>{op.action === 'send' ? 'send · отправляет' : op.action === 'receive' ? 'receive · получает' : op.action}</span>
              <code>{id}</code>
            </p>
            {op.summary && <p>{op.summary}</p>}
            <p className="aa-small">
              Канал: <code>{op.channel?.address ?? op.channel?.$refName}</code>
              {op.messages?.length ? <> · сообщения: {op.messages.map((m: Obj) => <code key={m.name ?? m.$refName}>{m.name ?? m.$refName}</code>)}</> : null}
            </p>
          </div>
        ))}
      </section>

      <section>
        <h3>Каналы</h3>
        <div className="aa-table-wrap">
          <table className="aa-table">
            <thead><tr><th>Канал</th><th>Адрес (топик)</th><th>Описание</th><th>Сообщения</th></tr></thead>
            <tbody>
              {Object.entries(channels).map(([id, ch]: [string, Obj]) => (
                <tr key={id}>
                  <td><code>{id}</code></td>
                  <td><code>{ch.address}</code></td>
                  <td>{ch.description}</td>
                  <td>{Object.values(ch.messages ?? {}).map((m: any) => <code key={m.name ?? m.$refName}>{m.name ?? m.$refName}</code>)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h3>Сообщения</h3>
        {Object.entries(messages).map(([id, m]: [string, Obj]) => (
          <div className="aa-card" key={id}>
            <p className="aa-card-title">
              <code>{m.name ?? id}</code> {m.title && <span>— {m.title}</span>}
            </p>
            <p className="aa-small">
              {m.contentType && <>Content-Type: <code>{m.contentType}</code></>}
              {m.bindings?.kafka?.key && (
                <> · ключ Kafka: <code>{m.bindings.kafka.key.type}</code> — {m.bindings.kafka.key.description}</>
              )}
            </p>
            {m.payload && (
              <>
                <h4>Полезная нагрузка {m.payload.$refName && <code>{m.payload.$refName}</code>}</h4>
                <p className="aa-small"><span className="aa-req">*</span> — обязательное поле</p>
                <SchemaTable schema={m.payload} />
              </>
            )}
            {m.examples?.length > 0 && (
              <>
                <h4>Примеры</h4>
                {m.examples.map((ex: Obj, i: number) => (
                  <details className="aa-example" key={ex.name ?? i}>
                    <summary>
                      <code>{ex.name ?? `пример ${i + 1}`}</code> {ex.summary && `— ${ex.summary}`}
                    </summary>
                    <pre>{JSON.stringify(ex.payload, null, 2)}</pre>
                  </details>
                ))}
              </>
            )}
          </div>
        ))}
      </section>

      <details className="aa-raw">
        <summary>Исходный YAML</summary>
        <pre>{raw}</pre>
      </details>
    </div>
  );
}
