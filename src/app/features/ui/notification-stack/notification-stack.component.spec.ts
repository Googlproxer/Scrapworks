import { TestBed } from '@angular/core/testing';
import axe from 'axe-core';
import { UiService } from '../ui.service';
import { NotificationCenter } from '../notifications';
import { NotificationStackComponent } from './notification-stack.component';

describe('Viewport notifications', () => {
  it('anchors to the viewport, announces accessible notices and dismisses without stealing focus', async () => {
    const center = new NotificationCenter();
    TestBed.configureTestingModule({
      imports: [NotificationStackComponent],
      providers: [
        {
          provide: UiService,
          useValue: {
            notifications: center.visible,
            queuedNotificationCount: center.queuedCount,
            dismissNotification: (id: number) => center.dismiss(id),
            holdNotification: (id: number, reason: 'pointer' | 'focus', held: boolean) =>
              center.hold(id, reason, held),
          },
        },
      ],
    });
    const fixture = TestBed.createComponent(NotificationStackComponent);
    try {
      for (let i = 0; i < 7; i++)
        center.open({
          title: `Notice ${i + 1}`,
          message: 'Materials are needed.',
          tone: i === 0 ? 'warning' : 'info',
          colour: i === 0 ? '#f3d489' : undefined,
          icon: '!',
          timeout: 0,
        });
      await fixture.whenStable();
      const root = fixture.nativeElement as HTMLElement;
      const stack = root.querySelector<HTMLElement>('.notification-stack')!;
      expect(getComputedStyle(stack).position).toBe('fixed');
      const box = stack.getBoundingClientRect();
      expect(box.top).toBeCloseTo(16, 0);
      expect(window.innerWidth - box.right).toBeCloseTo(16, 0);
      expect(root.querySelectorAll('article')).toHaveLength(5);
      expect(root.querySelector('[role="alert"]')?.textContent).toContain('Materials are needed');
      expect(root.textContent).toContain('2 more queued');
      expect((await axe.run(root)).violations).toEqual([]);
      root.querySelector<HTMLButtonElement>('button')!.click();
      await fixture.whenStable();
      expect(root.querySelectorAll('article')).toHaveLength(5);
      expect(root.querySelector('article')?.getAttribute('aria-label')).toBe('Notice 2');
      expect(root.textContent).toContain('Notice 6');
    } finally {
      center.destroy();
    }
  });
});
