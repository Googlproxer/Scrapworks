import type { CommandAcknowledgement } from './simulation';

export type MiniFabStatus =
  | 'unowned'
  | 'idle'
  | 'requested'
  | 'making'
  | 'ingredients'
  | 'handcraft'
  | 'retained-inputs'
  | 'output-full'
  | 'completed'
  | 'cancelled-retained';

/** Semantic facts, never UI wording or scheduling callbacks. */
export type OpeningEvent =
  | { kind: 'research-completed'; technology: string }
  | {
      kind: 'handcraft-ended';
      recipe: string;
      reason: 'completed' | 'stock-or-space' | 'cancelled';
    }
  | { kind: 'salvage-attention'; reason: 'range-or-depleted' | 'bag-full' }
  | { kind: 'materials-recovered'; item: string }
  | { kind: 'minifab-status'; status: MiniFabStatus; recipe: string | null };

export interface RuntimeEvent {
  readonly id: number;
  readonly tick: number;
  readonly event:
    OpeningEvent | { kind: 'command-result'; acknowledgement: CommandAcknowledgement };
}

export interface SessionEvent extends RuntimeEvent {
  readonly generation: number;
}

export type CommandSubmission =
  | { readonly status: 'queued'; readonly sequence: number; readonly generation: number }
  | { readonly status: 'unavailable' };
