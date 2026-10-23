import { Dialog } from '@angular/cdk/dialog';
import {
  Component,
  createEnvironmentInjector,
  EnvironmentInjector,
  inject,
  InjectionToken,
} from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { GameRuntimeService } from '../game/game-runtime.service';
import { UiService } from './ui.service';

const TEST_SLOT = new InjectionToken<number>('UI dialog test slot');

@Component({ template: '<p>Save dialog test content</p>' })
class TestDialog {
  public readonly slot = inject(TEST_SLOT, { optional: true });
}

@Component({ template: '<p>Alternative dialog test content</p>' })
class AlternateDialog {}

describe('UiService', () => {
  let service: UiService;
  let dialog: Dialog;
  let setInputEnabled: ReturnType<typeof vi.fn<(on: boolean) => void>>;

  beforeEach(async () => {
    setInputEnabled = vi.fn<(on: boolean) => void>();
    await TestBed.configureTestingModule({
      imports: [TestDialog, AlternateDialog],
      providers: [UiService, { provide: GameRuntimeService, useValue: { setInputEnabled } }],
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
    service.openUIDialog('save-dialog', TestDialog);
    expect(dialog.openDialogs).toHaveLength(1);
    expect(dialog.openDialogs[0].componentInstance).toBeInstanceOf(TestDialog);
    expect(setInputEnabled).toHaveBeenCalledExactlyOnceWith(false);

    dialog.openDialogs[0].close();
    expect(dialog.openDialogs).toHaveLength(0);
    expect(setInputEnabled.mock.calls).toEqual([[false], [true]]);
  });

  it('prevents duplicate dialogs for a key', () => {
    service.openUIDialog('save-dialog', TestDialog);
    service.openUIDialog('save-dialog', AlternateDialog);
    expect(dialog.openDialogs).toHaveLength(1);
    expect(dialog.openDialogs[0].componentInstance).toBeInstanceOf(TestDialog);
    expect(setInputEnabled).toHaveBeenCalledExactlyOnceWith(false);
  });

  it('releases the key so another component type can be opened after closing', () => {
    service.openUIDialog('save-dialog', TestDialog);
    dialog.openDialogs[0].close('saved');
    service.openUIDialog('save-dialog', AlternateDialog);
    expect(dialog.openDialogs).toHaveLength(1);
    expect(dialog.openDialogs[0].componentInstance).toBeInstanceOf(AlternateDialog);
    dialog.openDialogs[0].close();
    expect(setInputEnabled.mock.calls).toEqual([[false], [true], [false], [true]]);
  });

  it('passes data and typed provider callbacks independently of the component type', () => {
    service.openUIDialog<TestDialog, { slot: number }>('save-dialog', TestDialog, {
      data: { slot: 7 },
      ariaLabel: 'Save test',
      providers: (dialogRef, config) => {
        expect(dialogRef.config.ariaLabel).toBe('Save test');
        return [{ provide: TEST_SLOT, useValue: config.data?.slot }];
      },
    });

    expect(dialog.openDialogs).toHaveLength(1);
    expect(dialog.openDialogs[0].componentInstance).toBeInstanceOf(TestDialog);
    expect((dialog.openDialogs[0].componentInstance as TestDialog).slot).toBe(7);
  });

  it('blocks before opening and releases a failed reservation so the key can be retried', () => {
    vi.spyOn(dialog, 'open').mockImplementationOnce(() => {
      expect(setInputEnabled).toHaveBeenCalledExactlyOnceWith(false);
      throw new Error('Dialog construction failed');
    });

    service.openUIDialog('save-dialog', TestDialog);
    expect(dialog.openDialogs).toHaveLength(0);
    expect(setInputEnabled.mock.calls).toEqual([[false], [true]]);

    service.openUIDialog('save-dialog', TestDialog);
    expect(dialog.openDialogs).toHaveLength(1);
    expect(setInputEnabled).toHaveBeenLastCalledWith(false);
    dialog.openDialogs[0].close();
    expect(setInputEnabled.mock.calls).toEqual([[false], [true], [false], [true]]);
  });

  it.each(['escape', 'backdrop'] as const)(
    'releases input once when dismissed through %s',
    (method) => {
      service.openUIDialog('save-dialog', TestDialog);
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
      owner.get(UiService).openUIDialog('save-dialog', TestDialog);
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
