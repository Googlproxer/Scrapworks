import type { GameTickHandler } from './game-tick';
import type { ActionFrame, BindingProfile, ButtonControl, Context, ControllerInfo } from './input';
import type {
  GridCell,
  PlacementResult,
  PlacementRejection,
  WorldDefinition,
  WorldView,
} from './world';

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
  initialize(definition: WorldDefinition): Promise<void>;
  registerCompletedTickHandler(handler: GameTickHandler, order?: number): () => void;
  frame(
    seconds: number,
    movement: { x: number; z: number },
    sprint: boolean,
    active: boolean,
    simulationActive?: boolean,
  ): WorldView;
  /** Drain presentation notifications and submit credits after this frame pins its completed view. */
  completeFrame(): void;
  /** Suspend input/time without sampling or publishing another view during teardown. */
  suspend(): void;
  /** Presentation may keep animating while gameplay input belongs to UI. */
  isSimulationActive(): boolean;
}

/** Renderer diagnostics stay separate from gameplay and application load errors. */
export interface InspectorState {
  readonly phase: 'closed' | 'loading' | 'open' | 'error';
  readonly errorMessage: string | null;
}

export interface PlacementPort {
  /** Missing only in the isolated legacy development-fixture presentation tests. */
  current?(): {
    readonly key: string;
    readonly slot?: number;
    readonly footprint: { readonly width: number; readonly depth: number };
  } | null;
  /** Power connections use an optional first-machine anchor; machines use one click. */
  place(cell: GridCell, rotation: 0 | 1 | 2 | 3, anchor?: string): void;
  preview(cell: GridCell, rotation: 0 | 1 | 2 | 3, anchor?: string): PlacementResult;
}

export interface ActionFrameSink {
  dispatch(frame: ActionFrame): void;
}

export type WorldSelection =
  | { readonly kind: 'entity'; readonly id: string }
  | { readonly kind: 'cell'; readonly cell: GridCell }
  | null;

export interface PlacementFeedback {
  readonly valid: boolean;
  readonly reason: PlacementRejection | null;
  readonly connection?: 'start' | 'end' | 'cancel';
}
