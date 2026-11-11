import { EMPTY } from 'rxjs';
import { Dialog } from '@angular/cdk/dialog';
import {
  Component,
  createEnvironmentInjector,
  EnvironmentInjector,
  inject,
  InjectionToken,
  signal,
} from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { GameRuntimeService } from '../game/game-runtime.service';
import { UiService } from './ui.service';

const TEST_VALUE = new InjectionToken<number>('UI dialog test value');

@Component({ selector: 'app-test-dialog', template: '<p>Dialog test content</p>' })
class TestDialog {
  public readonly value = inject(TEST_VALUE, { optional: true });
}

@Component({ selector: 'app-alternate-dialog', template: '<p>Alternative dialog test content</p>' })
class AlternateDialog {}

describe('UiService', () => {
  let service: UiService;
  let dialog: Dialog;
  const setUiFocused = vi.fn();
  let setInputEnabled: ReturnType<typeof vi.fn<(on: boolean) => void>>;

  beforeEach(async () => {
    setInputEnabled = vi.fn<(on: boolean) => void>();
    await TestBed.configureTestingModule({
      imports: [TestDialog, AlternateDialog],
      providers: [
        UiService,
        {
          provide: GameRuntimeService,
          useValue: {
            world: signal(null),
            events$: EMPTY,
            errorMessage: signal(null),
            setInputEnabled,
            setUiFocused,
            closeMachineInspection: vi.fn(),
            fieldKitOpen: signal(false),
            isReady: signal(false),
            requestWorkExit: (continuation: () => void) => continuation(),
          },
        },
      ],
    }).compileComponents();
    dialog = TestBed.inject(Dialog);
    service = TestBed.inject(UiService);
  });

  afterEach(() => {
    dialog.closeAll();
    TestBed.resetTestingModule();
    vi.restoreAllMocks();
  });

  it('blocks input until its dialog closes', () => {
    service.openUIDialog('controls', TestDialog);
    expect(dialog.openDialogs).toHaveLength(1);
    expect(dialog.openDialogs[0].componentInstance).toBeInstanceOf(TestDialog);
    expect(setInputEnabled).toHaveBeenCalledExactlyOnceWith(false);

    dialog.openDialogs[0].close();
    expect(dialog.openDialogs).toHaveLength(0);
    expect(setInputEnabled.mock.calls).toEqual([[false], [true]]);
  });

  it('keeps live dialogs running while a stacked pause dialog owns simulation suspension', () => {
    service.openUIDialog('machine-inspection', TestDialog, undefined, 'live');
    expect(setInputEnabled).not.toHaveBeenCalled();
    expect(setUiFocused).toHaveBeenLastCalledWith(true);
    service.openUIDialog('controls', AlternateDialog);
    expect(setInputEnabled).toHaveBeenCalledExactlyOnceWith(false);
    service.closeTopDialog();
    expect(dialog.openDialogs).toHaveLength(1);
    expect(setInputEnabled.mock.calls).toEqual([[false], [true]]);
    // This generic policy test leaves machine-target ownership to the runtime tests.
    dialog.openDialogs[0].close();
    expect(setInputEnabled.mock.calls).toEqual([[false], [true]]);
  });

  it('prevents duplicate dialogs for a key', () => {
    service.openUIDialog('controls', TestDialog);
    service.openUIDialog('controls', AlternateDialog);
    expect(dialog.openDialogs).toHaveLength(1);
    expect(dialog.openDialogs[0].componentInstance).toBeInstanceOf(TestDialog);
    expect(setInputEnabled).toHaveBeenCalledExactlyOnceWith(false);
  });

  it('releases the key so another component type can be opened after closing', () => {
    service.openUIDialog('controls', TestDialog);
    dialog.openDialogs[0].close('closed');
    service.openUIDialog('controls', AlternateDialog);
    expect(dialog.openDialogs).toHaveLength(1);
    expect(dialog.openDialogs[0].componentInstance).toBeInstanceOf(AlternateDialog);
    dialog.openDialogs[0].close();
    expect(setInputEnabled.mock.calls).toEqual([[false], [true], [false], [true]]);
  });

  it('passes data and typed provider callbacks independently of the component type', () => {
    service.openUIDialog<TestDialog, { value: number }>('controls', TestDialog, {
      data: { value: 7 },
      ariaLabel: 'Dialog test',
      providers: (dialogRef, config) => {
        expect(dialogRef.config.ariaLabel).toBe('Dialog test');
        return [{ provide: TEST_VALUE, useValue: config.data?.value }];
      },
    });

    expect(dialog.openDialogs).toHaveLength(1);
    expect(dialog.openDialogs[0].componentInstance).toBeInstanceOf(TestDialog);
    expect((dialog.openDialogs[0].componentInstance as TestDialog).value).toBe(7);
  });

  it('blocks before opening and releases a failed reservation so the key can be retried', () => {
    vi.spyOn(dialog, 'open').mockImplementationOnce(() => {
      expect(setInputEnabled).toHaveBeenCalledExactlyOnceWith(false);
      throw new Error('Dialog construction failed');
    });

    service.openUIDialog('controls', TestDialog);
    expect(dialog.openDialogs).toHaveLength(0);
    expect(setInputEnabled.mock.calls).toEqual([[false], [true]]);

    service.openUIDialog('controls', TestDialog);
    expect(dialog.openDialogs).toHaveLength(1);
    expect(setInputEnabled).toHaveBeenLastCalledWith(false);
    dialog.openDialogs[0].close();
    expect(setInputEnabled.mock.calls).toEqual([[false], [true], [false], [true]]);
  });

  it.each(['escape', 'backdrop'] as const)(
    'releases input once when dismissed through %s',
    (method) => {
      service.openUIDialog('controls', TestDialog);
      const ref = dialog.openDialogs[0];

      if (method === 'escape') {
        ref.overlayRef.overlayElement.dispatchEvent(
          new KeyboardEvent('keydown', {
            key: 'Escape',
            code: 'Escape',
            keyCode: 27,
            bubbles: true,
          }),
        );
      } else {
        ref.overlayRef.backdropElement!.click();
      }

      expect(dialog.openDialogs).toHaveLength(0);
      expect(setInputEnabled.mock.calls).toEqual([[false], [true]]);
      ref.close();
      expect(setInputEnabled.mock.calls).toEqual([[false], [true]]);
    },
  );

  it('closes only its owned dialogs on destruction and completes their close subscriptions', () => {
    const owner = createEnvironmentInjector([UiService], TestBed.inject(EnvironmentInjector));
    try {
      owner.get(UiService).openUIDialog('controls', TestDialog);
      const owned = dialog.openDialogs[0];
      const other = dialog.open(AlternateDialog);
      const closed = vi.fn();
      const completed = vi.fn();
      owned.closed.subscribe({ next: closed, complete: completed });

      owner.destroy();

      expect(dialog.openDialogs).toEqual([other]);
      expect(closed).toHaveBeenCalledOnce();
      expect(completed).toHaveBeenCalledOnce();
      expect(setInputEnabled.mock.calls).toEqual([[false], [true]]);
      owned.close();
      expect(setInputEnabled.mock.calls).toEqual([[false], [true]]);
    } finally {
      if (!owner.destroyed) owner.destroy();
    }
  });
});
