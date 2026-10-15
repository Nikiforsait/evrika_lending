import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { TourStep } from '@/data/tour.ts';
import { Button, buttonClass } from '../primitives/Button.tsx';
import { Card } from '../primitives/Card.tsx';

const PAD = 8;

/**
 * Guided tour: dims the page, spotlights the element marked data-tour="<target>"
 * and explains it in a card. Steps without a target are shown centred.
 */
export function Tour({ steps, onDone }: { steps: TourStep[]; onDone: () => void }) {
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const nextRef = useRef<HTMLButtonElement>(null);
  const step = steps[index]!;
  const last = index === steps.length - 1;

  // Scroll the target into view and keep its box in sync while the page scrolls or resizes.
  useEffect(() => {
    const el = step.target ? document.querySelector<HTMLElement>(`[data-tour="${step.target}"]`) : null;
    if (!el) {
      setRect(null);
      return;
    }
    el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    let raf = 0;
    const measure = () => setRect(el.getBoundingClientRect());
    const onChange = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(measure);
    };
    measure();
    const timer = window.setTimeout(measure, 400);
    window.addEventListener('scroll', onChange, true);
    window.addEventListener('resize', onChange);
    return () => {
      window.clearTimeout(timer);
      cancelAnimationFrame(raf);
      window.removeEventListener('scroll', onChange, true);
      window.removeEventListener('resize', onChange);
    };
  }, [index, step.target]);

  useEffect(() => {
    nextRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onDone();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [index, onDone]);

  const next = () => (last ? onDone() : setIndex((i) => i + 1));
  // The card sits at the bottom, or at the top when the target is in the lower half of the screen.
  const atTop = rect !== null && rect.top + rect.height / 2 > window.innerHeight * 0.55;

  return createPortal(
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-labelledby="tour-title">
      {rect ? (
        <div
          aria-hidden="true"
          className="absolute rounded-2xl ring-2 ring-[#e879f9] transition-all duration-300"
          style={{ top: rect.top - PAD, left: rect.left - PAD, width: rect.width + PAD * 2, height: rect.height + PAD * 2, boxShadow: '0 0 0 9999px rgba(7, 3, 13, 0.74)' }}
        />
      ) : (
        <div aria-hidden="true" className="absolute inset-0 bg-[#07030d]/80" />
      )}
      <div className={`absolute inset-x-4 mx-auto max-w-md ${rect === null ? 'top-1/2 -translate-y-1/2' : atTop ? 'top-6' : 'bottom-24 lg:bottom-8'}`}>
        <Card glow="strong" className="p-5">
          <p className="text-xs text-muted">
            Шаг {index + 1} из {steps.length}
          </p>
          <h2 id="tour-title" className="mt-1 font-display text-lg font-bold">
            {step.title}
          </h2>
          <p className="mt-2 text-[15px] leading-relaxed text-ink/90">{step.text}</p>
          <div className="mt-4 flex justify-end gap-2">
            {!last && (
              <Button variant="ghost" onClick={onDone}>
                Пропустить
              </Button>
            )}
            <button ref={nextRef} type="button" className={buttonClass('cta')} onClick={next}>
              {last ? 'Готово' : 'Дальше'}
            </button>
          </div>
        </Card>
      </div>
    </div>,
    document.body,
  );
}
