import { useCallback, useEffect, useRef, useState } from 'react';
import 'bpmn-js/dist/assets/diagram-js.css';
import 'bpmn-js/dist/assets/bpmn-js.css';
import 'bpmn-js/dist/assets/bpmn-font/css/bpmn.css';

interface Props {
  /** URL .bpmn-файла на этом же сайте (например, /case-files/idm-joiner-docs/01_business/diagrams/to-be.bpmn). */
  src: string;
  title: string;
  /** Высота холста в px. */
  height?: number;
  /** URL статического SVG-превью (для печати и без JS). */
  previewSrc?: string;
}

type Viewer = {
  importXML(xml: string): Promise<{ warnings: unknown[] }>;
  get<T = any>(name: string): T;
  destroy(): void;
};

/**
 * Просмотр BPMN через bpmn-js (NavigatedViewer): перетаскивание мышью, зум колёсиком с Ctrl,
 * кнопки масштаба, «Вписать», полный экран, скачивание исходника. Всё локально, без сети.
 */
export default function BpmnViewer({ src, title, height = 460, previewSrc }: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<Viewer | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [{ default: NavigatedViewer }, res] = await Promise.all([
          import('bpmn-js/lib/NavigatedViewer'),
          fetch(src),
        ]);
        if (!res.ok) throw new Error(`файл не найден (HTTP ${res.status})`);
        const xml = await res.text();
        if (cancelled || !canvasRef.current) return;
        const viewer = new NavigatedViewer({ container: canvasRef.current }) as unknown as Viewer;
        viewerRef.current = viewer;
        await viewer.importXML(xml);
        viewer.get('canvas').zoom('fit-viewport', 'auto');
        setStatus('ready');
      } catch (e) {
        if (!cancelled) {
          setError((e as Error).message);
          setStatus('error');
        }
      }
    })();
    return () => {
      cancelled = true;
      viewerRef.current?.destroy();
      viewerRef.current = null;
    };
  }, [src]);

  const zoom = useCallback((factor: number | 'fit') => {
    const canvas = viewerRef.current?.get('canvas');
    if (!canvas) return;
    if (factor === 'fit') canvas.zoom('fit-viewport', 'auto');
    else canvas.zoom(canvas.zoom() * factor);
  }, []);

  const toggleFullscreen = useCallback(async () => {
    const el = rootRef.current;
    if (!el) return;
    if (document.fullscreenElement) await document.exitFullscreen();
    else await el.requestFullscreen?.();
    // Холст меняет размер — вписываем схему заново
    setTimeout(() => {
      viewerRef.current?.get('canvas').resized();
      zoom('fit');
    }, 150);
  }, [zoom]);

  const fileName = src.split('/').pop();

  return (
    <div className="bpmn-viewer not-content" ref={rootRef} role="group" aria-label={`BPMN-схема: ${title}`}>
      <div className="bpmn-viewer__head">
        <p className="bpmn-viewer__title">{title}</p>
        <div className="bpmn-viewer__actions">
          <button type="button" className="sa-btn" onClick={() => zoom(1.2)} aria-label="Увеличить">+</button>
          <button type="button" className="sa-btn" onClick={() => zoom(1 / 1.2)} aria-label="Уменьшить">−</button>
          <button type="button" className="sa-btn" onClick={() => zoom('fit')}>Вписать</button>
          <button type="button" className="sa-btn" onClick={toggleFullscreen}>Во весь экран</button>
          <a className="sa-btn" href={src} download={fileName}>Скачать .bpmn</a>
          {previewSrc && (
            <a className="sa-btn" href={previewSrc} target="_blank" rel="noopener">SVG-превью</a>
          )}
        </div>
      </div>
      <div className="bpmn-viewer__canvas" ref={canvasRef} style={{ height }}>
        {status === 'loading' && <p className="bpmn-viewer__status">Загружаю схему…</p>}
        {status === 'error' && (
          <p className="bpmn-viewer__status">Не удалось открыть схему: {error}</p>
        )}
      </div>
      <p className="bpmn-viewer__hint">
        Перетаскивайте схему мышью, масштаб — кнопками или Ctrl + колесо мыши.
      </p>
    </div>
  );
}
