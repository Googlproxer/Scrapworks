import { fromEvent, Subscription } from 'rxjs';
import { WindingTravel } from '../../../../src/core/winding-travel.ts';

/** Standalone presentation demo. No gameplay commands, storage or simulation. */
const capacity = 60;
const secondsPerDegree = capacity / (5 * 360);
const artworkAngle = -45;

function required<T extends Element>(parent: ParentNode, selector: string): T {
  const element = parent.querySelector<T>(selector);
  if (!element) throw new Error(`Incomplete crank demo: ${selector}`);
  return element;
}

function mountCrank(panel: HTMLElement): void {
  const handle = required<HTMLButtonElement>(panel, '[data-crank-handle]');
  const progress = required<HTMLElement>(panel, '[data-crank-progress]');
  const fill = required<HTMLElement>(progress, 'span');
  const readout = required<HTMLElement>(panel, '[data-crank-readout]');
  const announcement = required<HTMLElement>(panel, '[data-crank-announcement]');

  const document = handle.ownerDocument;
  const window = document.defaultView;
  if (!window) return;
  const subscriptions = new Subscription();
  const travel = new WindingTravel();
  let pointer: number | null = null;
  let angle = artworkAngle;
  let charge = Math.max(0, Math.min(capacity, Number(progress.getAttribute('aria-valuenow')) || 0));

  function render(): void {
    handle.style.setProperty('--crank-angle', `${angle - artworkAngle}deg`);
    progress.setAttribute('aria-valuenow', charge.toFixed(1));
    fill.style.width = `${(charge / capacity) * 100}%`;
    readout.textContent = `${charge.toFixed(1)} / ${capacity} active boost seconds`;
  }

  function sample(x: number, y: number): void {
    const movement = travel.sample(x, y);
    if (!movement) return;
    angle = movement.angle;
    const previous = charge;
    charge = Math.min(capacity, charge + Math.abs(movement.degrees) * secondsPerDegree);
    if (capacity - charge < 1e-6) charge = capacity;
    if (previous < capacity && charge >= capacity) announcement.textContent = 'Fully charged.';
    render();
  }

  function release(): void {
    const captured = pointer;
    pointer = null;
    travel.reset();
    handle.removeAttribute('data-dragging');
    if (captured !== null && handle.hasPointerCapture(captured)) {
      handle.releasePointerCapture(captured);
    }
  }

  function move(event: PointerEvent): void {
    if (event.pointerId !== pointer) return;
    const bounds = handle.getBoundingClientRect();
    sample(
      (event.clientX - bounds.left - bounds.width / 2) / (bounds.width / 2),
      (event.clientY - bounds.top - bounds.height / 2) / (bounds.height / 2),
    );
    event.preventDefault();
  }

  function turn(degrees: number): void {
    if (pointer !== null) return;
    const radians = (angle * Math.PI) / 180;
    travel.reset();
    travel.sample(Math.cos(radians), Math.sin(radians));
    const next = ((angle + degrees) * Math.PI) / 180;
    sample(Math.cos(next), Math.sin(next));
    travel.reset();
  }

  subscriptions.add(
    fromEvent<PointerEvent>(handle, 'pointerdown', { passive: false }).subscribe((event) => {
      if (event.button !== 0 || !event.isPrimary || pointer !== null) return;
      handle.focus({ preventScroll: true });
      handle.setPointerCapture(event.pointerId);
      pointer = event.pointerId;
      travel.reset();
      announcement.textContent = '';
      handle.setAttribute('data-dragging', 'true');
      move(event);
    }),
  );
  subscriptions.add(
    fromEvent<PointerEvent>(handle, 'pointermove', { passive: false }).subscribe(move),
  );
  for (const name of ['pointerup', 'pointercancel', 'lostpointercapture']) {
    subscriptions.add(
      fromEvent<PointerEvent>(handle, name).subscribe((event) => {
        if (event.pointerId === pointer) release();
      }),
    );
  }
  subscriptions.add(fromEvent(handle, 'blur').subscribe(release));
  subscriptions.add(fromEvent(window, 'blur').subscribe(release));
  subscriptions.add(fromEvent(window, 'resize').subscribe(release));
  subscriptions.add(
    fromEvent(document, 'visibilitychange').subscribe(() => {
      if (document.hidden) release();
    }),
  );
  subscriptions.add(
    fromEvent<KeyboardEvent>(handle, 'keydown').subscribe((event) => {
      if (event.isComposing || event.altKey || event.ctrlKey || event.metaKey) return;
      if (event.code === 'Escape') {
        release();
        event.preventDefault();
      } else if (event.code === 'Home') {
        event.preventDefault();
        release();
        charge = 0;
        angle = artworkAngle;
        announcement.textContent = 'Charge reset.';
        render();
      } else if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.code)) {
        event.preventDefault();
        if (!event.repeat)
          turn(event.code === 'ArrowLeft' || event.code === 'ArrowDown' ? -90 : 90);
      } else if ((event.code === 'Space' || event.code === 'Enter') && event.repeat) {
        event.preventDefault();
      }
    }),
  );
  // Native keyboard/assistive activation winds once; pointer clicks alone do not.
  subscriptions.add(
    fromEvent<MouseEvent>(handle, 'click').subscribe((event) => {
      if (event.detail === 0) turn(90);
    }),
  );
  subscriptions.add(
    fromEvent<PageTransitionEvent>(window, 'pagehide').subscribe((event) => {
      release();
      if (!event.persisted) subscriptions.unsubscribe();
    }),
  );
  render();
}

for (const panel of document.querySelectorAll<HTMLElement>('[data-crank-demo]')) mountCrank(panel);
