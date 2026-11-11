import {
  afterNextRender,
  afterRenderEffect,
  Component,
  computed,
  DestroyRef,
  ElementRef,
  inject,
  Injector,
  input,
  model,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { fromEvent, Subscription } from 'rxjs';
import type { OpeningTechnology } from '@content/opening';
import type { OpeningView } from '@contracts/opening';
import { researchPrerequisitesMet } from '@core/research-prerequisites';
import { technologyTree } from './technology-tree';

@Component({
  selector: 'app-technology-tree',
  templateUrl: './technology-tree.component.html',
  styleUrl: './technology-tree.component.scss',
})
export class TechnologyTreeComponent {
  public readonly technologies = input.required<readonly OpeningTechnology[]>();
  public readonly ledgers = input.required<OpeningView['ledgers']>();
  public readonly queue = input.required<readonly string[]>();
  public readonly selectedId = model.required<string>();
  public readonly tree = computed(() => technologyTree(this.technologies()));
  public readonly zoom = signal(1);
  public readonly zoomPercent = computed(() => Math.round(this.zoom() * 100));
  public readonly dragging = signal(false);
  public readonly minimumZoom = 0.1;
  public readonly maximumZoom = 2.5;
  private readonly viewport = viewChild.required<ElementRef<HTMLElement>>('treeViewport');
  private readonly injector = inject(Injector);
  private drag?: Subscription;
  private suppressClick = false;
  private zoomRevision = 0;
  private pendingScroll?: { left: number; top: number };

  public constructor() {
    afterRenderEffect((cleanup) => {
      const viewport = this.viewport().nativeElement;
      const events = new Subscription();
      events.add(
        fromEvent<WheelEvent>(viewport, 'wheel', { passive: false }).subscribe((event) => {
          event.preventDefault();
          this.zoomAt(
            this.zoom() * Math.exp(Math.max(-0.25, Math.min(0.25, -event.deltaY * 0.002))),
            event,
          );
        }),
      );
      events.add(
        fromEvent<MouseEvent>(viewport, 'click', { capture: true }).subscribe((event) => {
          if (!this.suppressClick || event.detail === 0) return;
          event.preventDefault();
          event.stopImmediatePropagation();
          this.suppressClick = false;
        }),
      );
      cleanup(() => events.unsubscribe());
    });
    afterRenderEffect(() => {
      const id = this.selectedId(),
        tree = this.tree();
      untracked(() => {
        const viewport = this.viewport().nativeElement,
          node = tree.nodes.find((entry) => entry.technology.id === id);
        if (!node || !viewport.clientHeight) return;
        const x = node.x * this.zoom(),
          y = node.y * this.zoom();
        if (
          x < viewport.scrollLeft ||
          x + 184 * this.zoom() > viewport.scrollLeft + viewport.clientWidth ||
          y < viewport.scrollTop ||
          y + 88 * this.zoom() > viewport.scrollTop + viewport.clientHeight
        )
          viewport.scrollTo({
            left: Math.max(0, x - 24),
            top: Math.max(0, y - viewport.clientHeight / 2 + 44 * this.zoom()),
          });
      });
    });
    inject(DestroyRef).onDestroy(() => this.drag?.unsubscribe());
  }

  public availability(technology: OpeningTechnology): 'researched' | 'available' | 'locked' {
    return this.ledgers()[technology.id]?.unlocked
      ? 'researched'
      : researchPrerequisitesMet(technology, this.ledgers())
        ? 'available'
        : 'locked';
  }

  public prerequisiteNames(technology: OpeningTechnology): string {
    return (
      technology.requires
        .map((id) => this.technologies().find((entry) => entry.id === id)!.name)
        .join(', ') || 'None'
    );
  }

  public select(id: string): void {
    this.selectedId.set(id);
  }

  public changeZoom(direction: -1 | 1): void {
    this.zoomAt(this.zoom() * Math.pow(1.25, direction));
  }

  public resetZoom(): void {
    this.zoomAt(1);
  }

  public fit(): void {
    const viewport = this.viewport().nativeElement,
      tree = this.tree();
    this.zoomAt(Math.min(viewport.clientWidth / tree.width, viewport.clientHeight / tree.height));
    this.pendingScroll = { left: 0, top: 0 };
  }

  private zoomAt(requested: number, pointer?: { clientX: number; clientY: number }): void {
    const next = Math.max(this.minimumZoom, Math.min(this.maximumZoom, requested)),
      previous = this.zoom();
    const viewport = this.viewport().nativeElement,
      bounds = viewport.getBoundingClientRect();
    const x = pointer
      ? pointer.clientX - bounds.left - viewport.clientLeft
      : viewport.clientWidth / 2;
    const y = pointer
      ? pointer.clientY - bounds.top - viewport.clientTop
      : viewport.clientHeight / 2;
    this.pendingScroll = {
      left: Math.max(
        0,
        (((this.pendingScroll?.left ?? viewport.scrollLeft) + x) * next) / previous - x,
      ),
      top: Math.max(
        0,
        (((this.pendingScroll?.top ?? viewport.scrollTop) + y) * next) / previous - y,
      ),
    };
    this.zoom.set(next);
    const revision = ++this.zoomRevision;
    afterNextRender(
      () => {
        if (revision !== this.zoomRevision || !this.pendingScroll) return;
        viewport.scrollTo(this.pendingScroll);
        this.pendingScroll = undefined;
      },
      { injector: this.injector },
    );
  }

  public panStart(event: PointerEvent): void {
    if (event.button !== 0 || event.pointerType === 'touch') return;
    this.drag?.unsubscribe();
    this.suppressClick = false;
    const viewport = this.viewport().nativeElement,
      origin = {
        x: event.clientX,
        y: event.clientY,
        left: viewport.scrollLeft,
        top: viewport.scrollTop,
      };
    const drag = new Subscription();
    this.drag = drag;

    const finish = (cancelled: boolean) => {
      if (cancelled) this.suppressClick = false;
      this.dragging.set(false);
      drag.unsubscribe();
      if (viewport.hasPointerCapture(event.pointerId))
        viewport.releasePointerCapture(event.pointerId);
    };

    drag.add(() => this.dragging.set(false));
    drag.add(
      fromEvent<PointerEvent>(viewport.ownerDocument, 'pointermove', { passive: false }).subscribe(
        (move) => {
          if (move.pointerId !== event.pointerId) return;
          const dx = move.clientX - origin.x,
            dy = move.clientY - origin.y;
          if (!this.dragging() && Math.hypot(dx, dy) < 5) return;
          if (!this.dragging()) viewport.setPointerCapture(event.pointerId);
          this.dragging.set(true);
          this.suppressClick = true;
          move.preventDefault();
          viewport.scrollTo({ left: origin.left - dx, top: origin.top - dy });
        },
      ),
    );
    drag.add(
      fromEvent<PointerEvent>(viewport.ownerDocument, 'pointerup').subscribe((up) => {
        if (up.pointerId === event.pointerId) finish(false);
      }),
    );
    drag.add(
      fromEvent<PointerEvent>(viewport.ownerDocument, 'pointercancel').subscribe((cancel) => {
        if (cancel.pointerId === event.pointerId) finish(true);
      }),
    );
  }

  public nodeFocus(event: FocusEvent): void {
    (event.target as HTMLElement).scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }

  public nodeKey(event: KeyboardEvent, id: string): void {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key))
      return;
    event.preventDefault();
    const nodes = this.tree().nodes,
      origin = nodes.find((node) => node.technology.id === id)!;
    const horizontal = event.key === 'ArrowLeft' || event.key === 'ArrowRight',
      direction = event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 1;
    const candidates = nodes.filter(
      (node) => direction * (horizontal ? node.x - origin.x : node.y - origin.y) > 0,
    );

    const score = (node: typeof origin) =>
      Math.abs(horizontal ? node.x - origin.x : node.y - origin.y) +
      2 * Math.abs(horizontal ? node.y - origin.y : node.x - origin.x);

    candidates.sort((a, b) => score(a) - score(b));
    const target =
      event.key === 'Home' ? nodes[0] : event.key === 'End' ? nodes.at(-1) : candidates[0];
    this.viewport()
      .nativeElement.querySelector<HTMLElement>(`[data-technology="${target?.technology.id}"]`)
      ?.focus();
  }
}
