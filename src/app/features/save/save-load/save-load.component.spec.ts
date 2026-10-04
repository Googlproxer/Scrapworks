import { DialogRef } from '@angular/cdk/dialog';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { SaveLoadComponent } from './save-load.component';

describe('SaveLoadComponent', () => {
  let component: SaveLoadComponent;
  let fixture: ComponentFixture<SaveLoadComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SaveLoadComponent],
      providers: [{ provide: DialogRef, useValue: { close: vi.fn() } }],
    }).compileComponents();

    fixture = TestBed.createComponent(SaveLoadComponent);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
