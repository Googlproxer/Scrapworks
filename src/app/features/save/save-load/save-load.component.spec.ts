import { DialogRef } from '@angular/cdk/dialog';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { SaveService } from '../save.service';
import { SaveLoadComponent } from './save-load.component';
import { waitForSignal } from '../../../../testing/wait-for-state';

describe('SaveLoadComponent', () => {
  let component: SaveLoadComponent;
  let fixture: ComponentFixture<SaveLoadComponent>;
  let fileInput: HTMLInputElement;
  let saves: { import: ReturnType<typeof vi.fn>; loadAll: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    saves = {
      import: vi.fn(async () => undefined),
      loadAll: vi.fn(async () => [{ id: 1, name: 'Existing', value: 0.1 }]),
    };
    await TestBed.configureTestingModule({
      imports: [SaveLoadComponent],
      providers: [
        { provide: DialogRef, useValue: { close: vi.fn() } },
        { provide: SaveService, useValue: saves },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(SaveLoadComponent);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  afterEach(() => vi.restoreAllMocks());

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('reports a failed import and retains the last committed occupancy', async () => {
    await waitForSignal(component.busy, (busy) => !busy, fixture.componentRef.injector);
    saves.import.mockRejectedValueOnce(new Error('Storage rejected the import'));
    await openPicker();
    select(new File(['[]'], 'failed.json'));
    await waitForSignal(component.error, (error) => error !== null, fixture.componentRef.injector);
    expect(component.error()).toBe('Storage rejected the import');
    expect(component.slots()[0].occupied).toBe(true);
    expect(saves.loadAll).toHaveBeenCalledTimes(1);
  });

  function select(file: File) {
    const transfer = new DataTransfer();
    transfer.items.add(file);
    fileInput.files = transfer.files;
    fileInput.dispatchEvent(new Event('change'));
  }

  async function openPicker() {
    const click = vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(() => undefined);
    await waitForSignal(component.busy, (busy) => !busy, fixture.componentRef.injector);
    await component.import();
    fileInput = click.mock.contexts.at(-1) as HTMLInputElement;
  }

  it('imports the chosen file once and refreshes the displayed slots', async () => {
    await openPicker();
    saves.loadAll.mockResolvedValueOnce([{ id: 1, name: 'Imported', value: 0.42 }]);
    select(new File(['{"value":0.42}'], 'save.json'));
    fileInput.dispatchEvent(new Event('change'));
    await waitForSignal(
      component.slots,
      (slots) => slots[0].value === 0.42,
      fixture.componentRef.injector,
    );
    await waitForSignal(component.busy, (busy) => !busy, fixture.componentRef.injector);
    expect(saves.loadAll).toHaveBeenCalledTimes(2);
    expect(saves.import).toHaveBeenCalledExactlyOnceWith('{"value":0.42}');
    expect(component.slots()[0]).toMatchObject({ occupied: true, value: 0.42 });
  });

  it('releases a cancelled picker without starting a later import', async () => {
    await openPicker();
    fileInput.dispatchEvent(new Event('cancel'));
    select(new File(['{}'], 'late.json'));
    await Promise.resolve();
    expect(saves.import).not.toHaveBeenCalled();
  });

  it('stops a pending file read from starting storage work after component destruction', async () => {
    let finish!: (data: string) => void;
    const file = new File([], 'pending.json');
    vi.spyOn(file, 'text').mockReturnValue(
      new Promise<string>((resolve) => {
        finish = resolve;
      }),
    );
    await openPicker();
    select(file);
    fixture.destroy();
    finish('{}');
    await Promise.resolve();
    await Promise.resolve();
    expect(saves.import).not.toHaveBeenCalled();
  });
});
