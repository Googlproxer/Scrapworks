import { DestroyRef, inject, Service } from '@angular/core';
import type { ActionFrame } from '@contracts/input';
import { GameRuntimeService } from '../game/game-runtime.service';
import { GameMenuComponent } from './game-menu/game-menu.component';
import { UiService } from './ui.service';

type Direction = 'up' | 'down' | 'left' | 'right';

@Service({ autoProvided: false })
export class UiInputAdapterService {
  private readonly runtime = inject(GameRuntimeService);
  private readonly ui = inject(UiService);
  private page?: HTMLElement;
  private readonly cleanup: (() => void)[] = [];
  private lastDirection = '';
  private nextRepeat = 0;

  public constructor() {
    this.cleanup.push(this.runtime.subscribeActions((frame) => this.dispatch(frame)));
    inject(DestroyRef).onDestroy(() => this.cleanup.splice(0).forEach((cleanup) => cleanup()));
  }

  public attach(page: HTMLElement): void {
    this.page = page;
    const document = page.ownerDocument;
    const capturedPointers = new Map<number, Set<number>>();
    const capturedClicks = new Set<number>();
    const keyboard = (event: KeyboardEvent) => {
      if (this.runtime.inspectorActive()) {
        // Inspector can render outside this page. Releases still clear old app input,
        // including releases its native widgets have already handled.
        if (event.type === 'keyup')
          this.runtime.handleUiKeyboard({ code: event.code, down: false });
        return;
      }
      const target = event.target as HTMLElement | null;
      if (!target || (!page.contains(target) && !this.ui.activeElement?.contains(target))) return;
      if (target.tagName === 'CANVAS') {
        if (event.code === 'Escape' && event.type === 'keydown' && !event.repeat) {
          event.preventDefault();
          this.openMenu();
        }
        return;
      }
      if (event.defaultPrevented) return;
      if (event.type === 'keydown' && event.code === 'Tab' && !this.runtime.capturingBinding())
        return;
      const editable =
        target.matches('input,textarea,select') ||
        target.isContentEditable ||
        this.scrollable(target);
      if (
        this.runtime.handleUiKeyboard({
          code: event.code,
          down: event.type === 'keydown',
          repeat: event.repeat,
          composing: event.isComposing,
          editable,
        })
      )
        event.preventDefault();
    };
    const pointer = (event: PointerEvent) => {
      if (event.type !== 'pointerdown') {
        const buttons = capturedPointers.get(event.pointerId);
        if (!buttons) return;
        const released = event.type === 'pointercancel' ? [...buttons] : [event.button];
        for (const button of released) {
          if (buttons.delete(button)) this.runtime.handleUiPointer({ button, down: false });
          if (event.type === 'pointercancel') capturedClicks.delete(button);
        }
        if (!buttons.size) capturedPointers.delete(event.pointerId);
        return;
      }
      capturedClicks.delete(event.button);
      if (this.runtime.inspectorActive()) return;
      if (!this.runtime.capturingBinding()) return;
      const target = event.target as HTMLElement | null;
      if (
        !target ||
        target.closest('[data-capture-cancel]') ||
        !this.ui.activeElement?.contains(target)
      )
        return;
      if (this.runtime.handleUiPointer({ button: event.button, down: true })) {
        const buttons = capturedPointers.get(event.pointerId) ?? new Set<number>();
        buttons.add(event.button);
        capturedPointers.set(event.pointerId, buttons);
        capturedClicks.add(event.button);
        event.preventDefault();
      }
    };
    const click = (event: MouseEvent) => {
      if (this.runtime.inspectorActive()) {
        capturedClicks.delete(event.button);
        return;
      }
      if (event.type !== 'contextmenu' && event.detail === 0) return;
      if (!capturedClicks.delete(event.button)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
    };
    const focus = (event: FocusEvent) => {
      if (this.runtime.inspectorActive()) return;
      const target = event.target as HTMLElement | null;
      if (target && (page.contains(target) || this.ui.activeElement?.contains(target)))
        this.runtime.setUiFocused(target.tagName !== 'CANVAS');
    };
    document.addEventListener('keydown', keyboard);
    document.addEventListener('keyup', keyboard);
    document.addEventListener('pointerdown', pointer);
    document.addEventListener('pointerup', pointer);
    document.addEventListener('pointercancel', pointer);
    document.addEventListener('click', click, true);
    document.addEventListener('auxclick', click, true);
    document.addEventListener('contextmenu', click, true);
    document.addEventListener('focusin', focus);
    this.cleanup.push(() => {
      document.removeEventListener('keydown', keyboard);
      document.removeEventListener('keyup', keyboard);
      document.removeEventListener('pointerdown', pointer);
      document.removeEventListener('pointerup', pointer);
      document.removeEventListener('pointercancel', pointer);
      document.removeEventListener('click', click, true);
      document.removeEventListener('auxclick', click, true);
      document.removeEventListener('contextmenu', click, true);
      for (const buttons of capturedPointers.values())
        for (const button of buttons) this.runtime.handleUiPointer({ button, down: false });
      capturedPointers.clear();
      capturedClicks.clear();
      document.removeEventListener('focusin', focus);
    });
  }

  public openMenu(): void {
    if (!this.runtime.inspectorActive() && this.runtime.currentSceneKey() === 'Game')
      this.ui.openUIDialog('game-menu', GameMenuComponent, { ariaLabelledBy: 'game-menu-title' });
  }

  private dispatch(frame: ActionFrame): void {
    if (this.runtime.inspectorActive()) {
      this.lastDirection = '';
      this.nextRepeat = 0;
      return;
    }
    if (this.runtime.capturingBinding()) return;
    const pressed = (name: string) => {
      const action = frame.states[name];
      return action?.kind === 'button' && action.pressed;
    };
    if (frame.context === 'gameplay') {
      if (pressed('menu')) this.openMenu();
      return;
    }
    if (frame.context !== 'ui') return;
    if (pressed('cancel')) {
      if (!this.ui.closeTopDialog() && this.runtime.currentSceneKey() === 'Game')
        this.runtime.focusViewport();
      return;
    }
    const root = this.ui.activeElement ?? this.page;
    if (!root) return;
    const active = root.ownerDocument.activeElement as HTMLElement | null;
    if (pressed('submit')) {
      if (
        active &&
        root.contains(active) &&
        !active.matches('textarea') &&
        !active.isContentEditable
      )
        active.click();
      return;
    }
    const navigation = frame.states['navigate'];
    const value = navigation?.kind === 'vector2' ? navigation.value : { x: 0, y: 0 };
    const direction =
      Math.abs(value.x) > 0.5
        ? value.x > 0
          ? 'right'
          : 'left'
        : Math.abs(value.y) > 0.5
          ? value.y > 0
            ? 'up'
            : 'down'
          : '';
    if (!direction) {
      this.lastDirection = '';
      return;
    }
    const now = performance.now();
    if (direction === this.lastDirection && now < this.nextRepeat) return;
    this.nextRepeat = now + (direction === this.lastDirection ? 110 : 350);
    this.lastDirection = direction;
    if (active && root.contains(active) && this.moveWithinTabs(active, direction)) return;
    const forward = direction === 'right' || direction === 'down';
    if (active && root.contains(active) && (direction === 'right' || direction === 'left')) {
      if (active instanceof HTMLSelectElement) {
        for (
          let index = active.selectedIndex + (forward ? 1 : -1);
          index >= 0 && index < active.options.length;
          index += forward ? 1 : -1
        ) {
          const option = active.options[index];
          if (option.disabled || option.hidden || option.closest('optgroup:disabled')) continue;
          active.selectedIndex = index;
          active.dispatchEvent(new Event('change', { bubbles: true }));
          break;
        }
        return;
      }
      if (active instanceof HTMLInputElement && active.type === 'range') {
        const previous = active.value;
        if (forward) active.stepUp();
        else active.stepDown();
        if (active.value !== previous) active.dispatchEvent(new Event('input', { bubbles: true }));
        return;
      }
    }
    this.moveSpatially(root, active, direction);
  }

  private available(element: HTMLElement): boolean {
    return (
      !element.matches(':disabled,[aria-disabled="true"]') &&
      !element.closest('[inert],[aria-hidden="true"]') &&
      element.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }) &&
      element.getClientRects().length > 0
    );
  }

  private scrollable(element: HTMLElement): boolean {
    if (element.tabIndex < 0) return false;
    const style = element.ownerDocument.defaultView?.getComputedStyle(element);
    return (
      !!style &&
      ((element.scrollWidth > element.clientWidth && /auto|scroll/.test(style.overflowX)) ||
        (element.scrollHeight > element.clientHeight && /auto|scroll/.test(style.overflowY)))
    );
  }

  private moveWithinTabs(active: HTMLElement, direction: Direction): boolean {
    if (active.getAttribute('role') !== 'tab') return false;
    const tablist = active.closest('[role="tablist"]');
    if (!tablist) return false;
    const vertical = tablist.getAttribute('aria-orientation') === 'vertical';
    if (vertical !== (direction === 'up' || direction === 'down')) return false;
    const tabs = [...tablist.querySelectorAll<HTMLElement>('[role="tab"]')].filter((tab) =>
      this.available(tab),
    );
    const index = tabs.indexOf(active);
    if (index < 0 || tabs.length < 2) return true;
    const step = direction === 'right' || direction === 'down' ? 1 : -1;
    const next = tabs[(index + step + tabs.length) % tabs.length];
    next.focus();
    next.click();
    return true;
  }

  private moveSpatially(root: HTMLElement, active: HTMLElement | null, direction: Direction): void {
    const focusable = [
      ...root.querySelectorAll<HTMLElement>(
        'button,input,select,textarea,a[href],summary,[tabindex],[contenteditable="true"]',
      ),
    ].filter(
      (element) => element.tagName !== 'CANVAS' && element.tabIndex >= 0 && this.available(element),
    );
    // Scroll regions remain native Tab stops, but their child controls own spatial navigation.
    const elements = focusable.filter(
      (element) => !focusable.some((child) => child !== element && element.contains(child)),
    );
    if (!elements.length) return;
    if (
      !active ||
      active.tagName === 'CANVAS' ||
      !root.contains(active) ||
      !this.available(active)
    ) {
      elements[0].focus();
      return;
    }

    const children = elements.filter((element) => element !== active && active.contains(element));
    if (children.length) {
      const bounds = active.getBoundingClientRect();
      const visibleChildren = children.filter((element) => {
        const rect = element.getBoundingClientRect();
        return (
          rect.top < bounds.bottom &&
          rect.bottom > bounds.top &&
          rect.left < bounds.right &&
          rect.right > bounds.left
        );
      });
      const entries = visibleChildren.length ? visibleChildren : children;
      (direction === 'down' || direction === 'right' ? entries[0] : entries.at(-1))?.focus();
      return;
    }

    const origin = active.getBoundingClientRect();
    const scrollRegion = active.closest('[role="region"][tabindex]');
    const vertical = direction === 'up' || direction === 'down';
    const forward = direction === 'down' || direction === 'right';
    const originStart = vertical ? origin.top : origin.left;
    const originEnd = vertical ? origin.bottom : origin.right;
    const originCrossStart = vertical ? origin.left : origin.top;
    const originCrossEnd = vertical ? origin.right : origin.bottom;
    const candidates = elements.flatMap((element) => {
      if (element === active) return [];
      const rect = element.getBoundingClientRect();
      const start = vertical ? rect.top : rect.left;
      const end = vertical ? rect.bottom : rect.right;
      const crossStart = vertical ? rect.left : rect.top;
      const crossEnd = vertical ? rect.right : rect.bottom;
      const distance = forward ? start - originEnd : originStart - end;
      // Overlapping controls are in the same row/column, not the requested direction.
      if (distance < -1) return [];
      const crossGap = Math.max(originCrossStart - crossEnd, crossStart - originCrossEnd, 0);
      const centerDistance = Math.abs((start + end - originStart - originEnd) / 2);
      // Avoid jumping almost sideways to a remote footer at the edge of a row.
      if (crossGap > centerDistance) return [];
      const crossDistance = Math.abs(
        (crossStart + crossEnd - originCrossStart - originCrossEnd) / 2,
      );
      return [
        {
          element,
          inRegion: !!scrollRegion?.contains(element),
          aligned: crossGap === 0,
          distance,
          crossDistance,
        },
      ];
    });
    candidates.sort(
      (left, right) =>
        Number(right.inRegion) - Number(left.inRegion) ||
        Number(right.aligned) - Number(left.aligned) ||
        left.distance - right.distance ||
        left.crossDistance - right.crossDistance,
    );
    candidates[0]?.element.focus();
  }
}
