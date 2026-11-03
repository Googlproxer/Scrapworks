import { computed, signal } from '@angular/core';
import { Subscription, timer } from 'rxjs';

export type NotificationTone = 'info' | 'success' | 'warning' | 'error';

export interface NotificationOptions {
  readonly message: string;
  readonly title?: string;
  readonly tone?: NotificationTone;
  /** CSS accent; the text/background retain accessible contrast. */
  readonly colour?: string;
  /** Plain text or Unicode, never HTML. */
  readonly icon?: string;
  /** Milliseconds from becoming visible; zero means dismiss manually. */
  readonly timeout?: number;
  /** Replace the matching visible/queued notice rather than duplicating it. */
  readonly key?: string;
}

export interface UiNotification extends NotificationOptions {
  readonly id: number;
  readonly tone: NotificationTone;
  readonly icon: string;
  readonly timeout: number;
}

export interface NotificationRef {
  readonly id: number;
  dismiss(): void;
}

interface Lifetime {
  remaining: number;
  started: number;
  timer?: Subscription;
  holds: Set<'pointer' | 'focus'>;
}

const icons: Record<NotificationTone, string> = {
  info: 'i',
  success: '✓',
  warning: '!',
  error: 'x',
};

/** UI lifetime only: queued notifications never run down their timeout. */
export class NotificationCenter {
  private readonly entries = signal<readonly UiNotification[]>([]);
  private readonly lifetimes = new Map<number, Lifetime>();
  private nextId = 1;
  private destroyed = false;
  public readonly visible = computed(() => this.entries().slice(0, 5));
  public readonly queuedCount = computed(() => Math.max(0, this.entries().length - 5));

  public open(options: NotificationOptions): NotificationRef {
    const existing = options.key && this.entries().find((entry) => entry.key === options.key);
    const id = existing ? existing.id : this.nextId++;
    const tone = options.tone ?? 'info';
    const notice: UiNotification = {
      ...options,
      id,
      tone,
      icon: options.icon ?? icons[tone],
      timeout: Number.isFinite(options.timeout) ? Math.max(0, options.timeout!) : 8000,
    };
    if (!this.destroyed) {
      const holds = [...(this.lifetimes.get(id)?.holds ?? [])];
      this.stop(id);
      this.entries.update((entries) =>
        existing
          ? entries.map((entry) => (entry.id === id ? notice : entry))
          : [...entries, notice],
      );
      this.scheduleVisible();
      for (const reason of holds) this.hold(id, reason, true);
    }
    return { id, dismiss: () => this.dismiss(id) };
  }

  public dismiss(id: number): void {
    this.stop(id);
    this.entries.update((entries) => entries.filter((entry) => entry.id !== id));
    this.scheduleVisible();
  }

  public dismissKey(key: string): void {
    const entry = this.entries().find((entry) => entry.key === key);
    if (entry) this.dismiss(entry.id);
  }

  public hold(id: number, reason: 'pointer' | 'focus', held: boolean): void {
    const lifetime = this.lifetimes.get(id);
    if (!lifetime) return;
    if (held) {
      if (!lifetime.holds.size) {
        lifetime.remaining = Math.max(
          0,
          lifetime.remaining - (performance.now() - lifetime.started),
        );
        lifetime.timer?.unsubscribe();
        lifetime.timer = undefined;
      }
      lifetime.holds.add(reason);
    } else {
      lifetime.holds.delete(reason);
      if (!lifetime.holds.size && !lifetime.timer) this.start(id, lifetime);
    }
  }

  public destroy(): void {
    this.destroyed = true;
    for (const id of this.lifetimes.keys()) this.stop(id);
    this.entries.set([]);
  }

  private stop(id: number): void {
    this.lifetimes.get(id)?.timer?.unsubscribe();
    this.lifetimes.delete(id);
  }

  private scheduleVisible(): void {
    if (this.destroyed) return;
    for (const entry of this.visible()) {
      if (!entry.timeout || this.lifetimes.has(entry.id)) continue;
      const lifetime: Lifetime = { remaining: entry.timeout, started: 0, holds: new Set() };
      this.lifetimes.set(entry.id, lifetime);
      this.start(entry.id, lifetime);
    }
  }

  private start(id: number, lifetime: Lifetime): void {
    lifetime.started = performance.now();
    lifetime.timer = timer(lifetime.remaining).subscribe(() => this.dismiss(id));
  }
}
