/** Пакет материалов экзаменационного кейса: вкладки документов, нужные заданию — первыми. */
import { useState } from 'react';
import type { ExamCase } from '../../data/assessment/types';
import { md } from './engine';

export default function CaseMaterials({ data, highlight = [] }: { data: ExamCase; highlight?: string[] }) {
  const docs = [...data.materials].sort((a, b) => Number(highlight.includes(b.id)) - Number(highlight.includes(a.id)));
  const [open, setOpen] = useState(docs[0]?.id);
  const doc = data.materials.find((m) => m.id === open) ?? docs[0];
  return (
    <details className="exam-case" open>
      <summary>
        Материалы кейса «{data.title}» <span className="exam-muted">· {highlight.length ? 'для этого задания нужны выделенные документы' : 'все документы пакета'}</span>
      </summary>
      <div className="exam-case__tabs" role="tablist" aria-label="Документы кейса">
        {docs.map((m) => (
          <button
            key={m.id}
            type="button"
            role="tab"
            aria-selected={m.id === doc.id}
            className={`exam-case__tab${m.id === doc.id ? ' is-active' : ''}${highlight.includes(m.id) ? ' is-needed' : ''}`}
            onClick={() => setOpen(m.id)}
          >
            {m.title}
          </button>
        ))}
      </div>
      <div className="exam-case__doc" role="tabpanel" dangerouslySetInnerHTML={{ __html: md(doc.body) }} />
    </details>
  );
}
