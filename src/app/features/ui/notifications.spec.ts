import { NotificationCenter } from './notifications';

describe('Notification lifetime and queue', () => {
  let center: NotificationCenter;
  beforeEach(() => {
    vi.useFakeTimers();
    center = new NotificationCenter();
  });
  afterEach(() => {
    center.destroy();
    vi.useRealTimers();
  });

  it('shows five in FIFO order and promotes queued notices only after dismissal', () => {
    const refs = Array.from({ length: 7 }, (_, i) =>
      center.open({ message: `Notice ${i + 1}`, timeout: 0 }),
    );
    expect(center.visible().map((notice) => notice.message)).toEqual([
      'Notice 1',
      'Notice 2',
      'Notice 3',
      'Notice 4',
      'Notice 5',
    ]);
    expect(center.queuedCount()).toBe(2);
    refs[0].dismiss();
    expect(center.visible().map((notice) => notice.message)).toEqual([
      'Notice 2',
      'Notice 3',
      'Notice 4',
      'Notice 5',
      'Notice 6',
    ]);
    refs[0].dismiss();
    expect(center.queuedCount()).toBe(1);
    refs[2].dismiss();
    expect(center.visible().at(-1)?.message).toBe('Notice 7');
  });

  it('starts the entire timeout on promotion, supports persistent notices and cleans up', () => {
    const refs = Array.from({ length: 5 }, () =>
      center.open({ message: 'Persistent', timeout: 0 }),
    );
    center.open({ message: 'Queued', timeout: 1000 });
    vi.advanceTimersByTime(10000);
    expect(center.queuedCount()).toBe(1);
    refs[0].dismiss();
    vi.advanceTimersByTime(999);
    expect(center.visible().at(-1)?.message).toBe('Queued');
    vi.advanceTimersByTime(1);
    expect(center.visible()).toHaveLength(4);
    center.open({ message: 'Temporary' });
    center.destroy();
    vi.advanceTimersByTime(10000);
    expect(center.visible()).toEqual([]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('pauses remaining time while hovered or focused and resumes only after both leave', () => {
    const ref = center.open({ message: 'Read me', timeout: 1000 });
    vi.advanceTimersByTime(400);
    center.hold(ref.id, 'pointer', true);
    center.hold(ref.id, 'focus', true);
    vi.advanceTimersByTime(5000);
    center.hold(ref.id, 'pointer', false);
    vi.advanceTimersByTime(5000);
    expect(center.visible()).toHaveLength(1);
    center.hold(ref.id, 'focus', false);
    vi.advanceTimersByTime(599);
    expect(center.visible()).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(center.visible()).toEqual([]);
  });

  it('configures colour/icon/timing and updates matching visible or queued keys without duplicates', () => {
    const first = center.open({
      key: 'materials',
      message: 'Missing scrap',
      tone: 'warning',
      colour: '#f3d489',
      icon: '⚒',
      timeout: 0,
    });
    const replaced = center.open({
      key: 'materials',
      message: 'Missing wire',
      tone: 'error',
      timeout: 0,
    });
    expect(replaced.id).toBe(first.id);
    expect(center.visible()).toHaveLength(1);
    expect(center.visible()[0]).toMatchObject({
      message: 'Missing wire',
      tone: 'error',
      icon: 'x',
      timeout: 0,
    });
    for (let i = 0; i < 4; i++) center.open({ message: 'Other', timeout: 0 });
    const queued = center.open({ key: 'queued', message: 'Before', timeout: 0 });
    expect(center.open({ key: 'queued', message: 'After', timeout: 0 }).id).toBe(queued.id);
    expect(center.queuedCount()).toBe(1);
    first.dismiss();
    expect(center.visible().at(-1)?.message).toBe('After');
  });
});
