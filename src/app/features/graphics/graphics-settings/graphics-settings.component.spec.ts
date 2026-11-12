import { DialogRef } from '@angular/cdk/dialog';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { signal } from '@angular/core';
import axe from 'axe-core';
import {
  defaultGraphicsSettings,
  validateGraphicsSettings,
  type GraphicsSettings,
} from '@contracts/graphics';
import { GameRuntimeService } from '../../game/game-runtime.service';
import { GraphicsSettingsService } from '../graphics-settings.service';
import { GraphicsSettingsComponent } from './graphics-settings.component';

describe('GraphicsSettingsComponent', () => {
  let fixture: ComponentFixture<GraphicsSettingsComponent>;
  const active = signal<GraphicsSettings>({ ...defaultGraphicsSettings });
  const close = vi.fn();
  const save = vi.fn(async (value: unknown) => {
    active.set(validateGraphicsSettings(value));
    return true;
  });
  beforeEach(async () => {
    active.set({ ...defaultGraphicsSettings });
    close.mockClear();
    save.mockClear();
    TestBed.configureTestingModule({
      imports: [GraphicsSettingsComponent],
      providers: [
        { provide: DialogRef, useValue: { close } },
        {
          provide: GraphicsSettingsService,
          useValue: { settings: active, error: signal(null), ready: Promise.resolve(), save },
        },
        { provide: GameRuntimeService, useValue: { graphicsStatus: signal({ notice: null }) } },
      ],
    });
    fixture = TestBed.createComponent(GraphicsSettingsComponent);
    // CDK supplies this labelled dialog container in the application.
    fixture.nativeElement.setAttribute('role', 'dialog');
    fixture.nativeElement.setAttribute('aria-label', 'Graphics');
    await fixture.whenStable();
  });

  const select = async (id: string, value: string) => {
    const control = fixture.nativeElement.querySelector(`#${id}`) as HTMLSelectElement;
    control.value = value;
    control.dispatchEvent(new Event('input', { bubbles: true }));
    control.dispatchEvent(new Event('change', { bubbles: true }));
    await fixture.whenStable();
  };

  it('applies presets and custom shadow/resolution selections through signal forms', async () => {
    const apply = fixture.nativeElement.querySelector('button.primary') as HTMLButtonElement;
    const before = apply.getBoundingClientRect().y;
    await select('graphics-preset', 'high');
    expect(fixture.componentInstance.draft()).toEqual({
      preset: 'high',
      shadows: 'high',
      renderScale: '100',
    });
    await select('graphics-shadows', 'off');
    await select('graphics-resolution', '50');
    await fixture.componentInstance.apply();
    await fixture.whenStable();
    expect(save).toHaveBeenLastCalledWith({
      version: 1,
      preset: 'custom',
      shadows: 'off',
      renderScale: 50,
    });
    expect(fixture.nativeElement.textContent).toContain('Graphics settings applied.');
    expect(close).not.toHaveBeenCalled();
    expect(apply.getBoundingClientRect().y).toBe(before);
  });

  it('discards unapplied changes and restores defaults only on Apply', async () => {
    await select('graphics-preset', 'low');
    fixture.componentInstance.close();
    expect(close).toHaveBeenCalledOnce();
    expect(save).not.toHaveBeenCalled();
    fixture.componentInstance.reset();
    await fixture.componentInstance.apply();
    expect(active()).toEqual(defaultGraphicsSettings);
  });

  it('has labelled controls and no axe violations', async () => {
    expect((await axe.run(fixture.nativeElement)).violations).toEqual([]);
  });
});
