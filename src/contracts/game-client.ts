import type { GameState, SceneKey } from './game-state';
import type { GameTickHandler } from './game-tick';
import type { ActionFrame, BindingProfile, ButtonControl, Context, ControllerInfo } from './input';
import type { GridCell, WorldDefinition, WorldView } from './world';

export interface UiKeyInput {
  readonly code: string;
  readonly down: boolean;
  readonly repeat?: boolean;
  readonly composing?: boolean;
  readonly editable?: boolean;
}

export interface GameInputPort {
  setContext(context: Context | null): void;
  updateBindings(profile: BindingProfile): void;
  selectController(id: string | null): boolean;
  subscribeControllers(listener: (controllers: readonly ControllerInfo[]) => void): () => void;
  captureBinding(listener: (control: ButtonControl) => void): () => void;
  handleUiKeyboard(input: UiKeyInput): boolean;
  handleUiPointer(input: { button: number; down: boolean }): boolean;
  focus(): void;
}

/** The application owns the session; the renderer supplies its single frame source. */
export interface WorldSessionBridge {
  initialize(definition: WorldDefinition): void;
  registerTickHandler(handler: GameTickHandler, order?: number): () => void;
  frame(
    seconds: number,
    movement: { x: number; z: number },
    sprint: boolean,
    active: boolean,
  ): WorldView;
  place(cell: GridCell, rotation: 0 | 1 | 2 | 3): void;
  preview(
    cell: GridCell,
    rotation: 0 | 1 | 2 | 3,
  ): { valid: boolean; reason: string | null; cells: readonly GridCell[] };
}

export interface GameClientOptions {
  readonly bindings?: BindingProfile;
  readonly session?: WorldSessionBridge;
  readonly developerFixture?: boolean;
  readonly onActionFrame?: (frame: ActionFrame) => void;
  readonly onWorldView?: (view: WorldView) => void;
  readonly onSelection?: (selection: string | null) => void;
  readonly onInspectorState?: (state: InspectorState) => void;
}

/** Renderer diagnostics stay separate from gameplay and application load errors. */
export interface InspectorState {
  readonly phase: 'closed' | 'loading' | 'open' | 'error';
  readonly errorMessage: string | null;
}

export interface GameClient {
  readonly input?: GameInputPort;
  subscribe(listener: (state: GameState) => void): () => void;
  destroy(): void;

  //  methods angular may need to access
  setScene(key: SceneKey): void;
  setInputEnabled(on: boolean): void;
  toggleInspector?(): Promise<void>;
}
