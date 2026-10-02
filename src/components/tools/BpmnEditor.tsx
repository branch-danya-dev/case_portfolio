import { useCallback, useEffect, useRef, useState } from 'react';
import 'bpmn-js/dist/assets/diagram-js.css';
import 'bpmn-js/dist/assets/bpmn-js.css';
import 'bpmn-js/dist/assets/bpmn-font/css/bpmn.css';
import { translateModule } from '../../lib/bpmn-ru';
import { downloadText } from '../../lib/share';
import { load, save } from '../../scripts/storage';

const DRAFT_KEY = 'bpmn-editor:draft';

const EMPTY = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" id="Definitions_1" targetNamespace="http://sa-handbook.local/bpmn">
  <bpmn:process id="Process_1" isExecutable="false">
    <bpmn:startEvent id="StartEvent_1" name="Процесс начался" />
  </bpmn:process>
  <bpmndi:BPMNDiagram id="BPMNDiagram_1">
    <bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="Process_1">
      <bpmndi:BPMNShape id="StartEvent_1_di" bpmnElement="StartEvent_1">
        <dc:Bounds x="180" y="160" width="36" height="36" />
      </bpmndi:BPMNShape>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>`;

const SAMPLES = [
  { label: 'Кейс: AS-IS', url: '/case-files/idm-joiner-docs/01_business/diagrams/as-is.bpmn' },
  { label: 'Кейс: TO-BE', url: '/case-files/idm-joiner-docs/01_business/diagrams/to-be.bpmn' },
  { label: 'Пример: шлюзы XOR и AND', url: '/bpmn/examples/gateways.bpmn' },
  { label: 'Пример: два пула', url: '/bpmn/examples/collaboration.bpmn' },
];

type Modeler = {
  importXML(xml: string): Promise<{ warnings: unknown[] }>;
  saveXML(o?: { format?: boolean }): Promise<{ xml?: string }>;
  saveSVG(): Promise<{ svg: string }>;
  get<T = any>(name: string): T;
  on(event: string, cb: () => void): void;
  destroy(): void;
};

/**
 * Редактор BPMN на bpmn-js Modeler: создать схему, открыть свой .bpmn или пример,
 * редактировать, сохранить .bpmn, экспортировать SVG. Черновик — в localStorage.
 */
export default function BpmnEditor() {
  const canvasRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const modelerRef = useRef<Modeler | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState('diagram.bpmn');
  const nameRef = useRef(name);
  nameRef.current = name;
  const [status, setStatus] = useState('Загружаю редактор…');
  const [warnings, setWarnings] = useState(0);

  const open = useCallback(async (xml: string, fileName?: string) => {
    const m = modelerRef.current;
    if (!m) return;
    try {
      const { warnings } = await m.importXML(xml);
      setWarnings(warnings.length);
      m.get('canvas').zoom('fit-viewport', 'auto');
      if (fileName) setName(fileName);
      // Открытый файл сразу становится черновиком: после перезагрузки страницы откроется он же
      save(DRAFT_KEY, { xml, name: fileName ?? nameRef.current });
      setStatus(fileName ? `Открыт файл ${fileName}` : 'Схема открыта');
    } catch (e) {
      setStatus(`Не удалось открыть схему: ${(e as Error).message}`);
    }
  }, []);

  useEffect(() => {
    let destroyed = false;
    (async () => {
      const { default: Modeler } = await import('bpmn-js/lib/Modeler');
      if (destroyed || !canvasRef.current) return;
      const modeler = new Modeler({
        container: canvasRef.current,
        additionalModules: [translateModule],
      }) as unknown as Modeler;
      modelerRef.current = modeler;
      let saveTimer: ReturnType<typeof setTimeout>;
      modeler.on('commandStack.changed', () => {
        clearTimeout(saveTimer);
        saveTimer = setTimeout(async () => {
          const { xml } = await modeler.saveXML({ format: true });
          if (xml) save(DRAFT_KEY, { xml, name: nameRef.current });
        }, 500);
      });
      const draft = load<{ xml: string; name: string } | null>(DRAFT_KEY, null);
      await open(draft?.xml ?? EMPTY, draft?.name);
      setStatus(draft ? 'Восстановлен черновик из этого браузера' : 'Новая схема');
    })();
    return () => {
      destroyed = true;
      modelerRef.current?.destroy();
      modelerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const exportXml = async () => {
    const r = await modelerRef.current?.saveXML({ format: true });
    if (r?.xml) downloadText(name.endsWith('.bpmn') ? name : `${name}.bpmn`, r.xml, 'application/xml');
  };
  const exportSvg = async () => {
    const r = await modelerRef.current?.saveSVG();
    if (r?.svg) downloadText(name.replace(/\.bpmn$/, '') + '.svg', r.svg, 'image/svg+xml');
  };
  const command = (cmd: 'undo' | 'redo') => modelerRef.current?.get('commandStack')[cmd]();
  const fit = () => modelerRef.current?.get('canvas').zoom('fit-viewport', 'auto');
  const fullscreen = async () => {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await rootRef.current?.requestFullscreen?.();
    setTimeout(() => {
      modelerRef.current?.get('canvas').resized();
      fit();
    }, 150);
  };

  return (
    <div className="bpmn-viewer bpmn-editor not-content" ref={rootRef}>
      <div className="bpmn-viewer__head">
        <div className="bpmn-viewer__actions">
          <button type="button" className="sa-btn" onClick={() => confirm('Начать новую схему? Текущая будет заменена.') && open(EMPTY, 'diagram.bpmn')}>
            Новая
          </button>
          <button type="button" className="sa-btn" onClick={() => fileRef.current?.click()}>
            Открыть файл…
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".bpmn,.xml"
            hidden
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (f) await open(await f.text(), f.name);
              e.target.value = '';
            }}
          />
          <select
            className="sa-btn"
            defaultValue=""
            aria-label="Открыть пример"
            onChange={async (e) => {
              const s = SAMPLES.find((x) => x.url === e.target.value);
              e.target.value = '';
              if (!s) return;
              const res = await fetch(s.url);
              await open(await res.text(), s.url.split('/').pop());
            }}
          >
            <option value="" disabled>
              Пример…
            </option>
            {SAMPLES.map((s) => (
              <option key={s.url} value={s.url}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
        <div className="bpmn-viewer__actions">
          <button type="button" className="sa-btn" onClick={() => command('undo')}>Отменить</button>
          <button type="button" className="sa-btn" onClick={() => command('redo')}>Повторить</button>
          <button type="button" className="sa-btn" onClick={fit}>Вписать</button>
          <button type="button" className="sa-btn" onClick={fullscreen}>Во весь экран</button>
          <button type="button" className="sa-btn" onClick={exportSvg}>Скачать SVG</button>
          <button type="button" className="sa-btn sa-btn--primary" onClick={exportXml}>Сохранить .bpmn</button>
        </div>
      </div>
      <div className="bpmn-viewer__canvas" ref={canvasRef} style={{ height: 620 }} />
      <p className="bpmn-viewer__hint" role="status" aria-live="polite">
        {status}
        {warnings > 0 && ` · предупреждений при импорте: ${warnings}`} · Файл: {name}
      </p>
    </div>
  );
}
