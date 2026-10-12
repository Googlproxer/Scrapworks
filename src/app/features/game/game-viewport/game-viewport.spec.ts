import { ComponentFixture, TestBed } from '@angular/core/testing';
import type { GameClient } from '@contracts/game-client';
import { GAME_CLIENT_FACTORY } from '../game-client-factory';
import { GameRuntimeService } from '../game-runtime.service';
import { GameViewport } from './game-viewport';

describe('GameViewport', () => {
  let component: GameViewport;
  let fixture: ComponentFixture<GameViewport>;
  let client: GameClient;
  let factory: ReturnType<typeof vi.fn<(host: HTMLElement) => GameClient>>;

  beforeEach(async () => {
    client = { subscribe: vi.fn(() => () => undefined), setScene: vi.fn(), destroy: vi.fn() };
    factory = vi.fn(() => client);
    await TestBed.configureTestingModule({
      imports: [GameViewport],
      providers: [GameRuntimeService, { provide: GAME_CLIENT_FACTORY, useValue: factory }],
    }).compileComponents();

    fixture = TestBed.createComponent(GameViewport);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('mounts into a renderer-neutral host and destroys the client with the viewport', () => {
    expect(component).toBeTruthy();
    const host = (fixture.nativeElement as HTMLElement).querySelector('.game-container');
    expect(host).toBeInstanceOf(HTMLDivElement);
    expect(factory).toHaveBeenCalledExactlyOnceWith(host);
    expect(host?.querySelector('canvas')).toBeNull();
    fixture.destroy();
    expect(client.destroy).toHaveBeenCalledOnce();
  });
});
