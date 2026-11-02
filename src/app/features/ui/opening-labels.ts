import type { OpeningView } from '@contracts/opening';
import { OPENING_RECIPES } from '../../../content/opening';

export function minifabStatus(mini: OpeningView['state']['minifab']): string {
  switch (mini.status) {
    case 'unowned':
      return 'Research and assemble a Mini Fabricator.';
    case 'idle':
      return 'Idle';
    case 'requested':
      return 'Requested';
    case 'making':
      return `Making ${OPENING_RECIPES.find((recipe) => recipe.id === mini.job?.recipe)?.name ?? 'requested item'}${mini.job?.recipe === mini.request?.recipe ? '' : ' precursor'}`;
    case 'ingredients':
      return 'Waiting for a complete ingredient set';
    case 'handcraft':
      return 'Waiting for handcraft inventory access';
    case 'retained-inputs':
      return 'Clear retained inputs before changing recipe';
    case 'output-full':
      return 'Output buffer full';
    case 'completed':
      return 'Request completed';
    case 'cancelled-retained':
      return 'Cancelled; clear retained buffers before changing inputs.';
  }
}
