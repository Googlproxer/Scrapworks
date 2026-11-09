import { OPENING_TECHNOLOGIES } from '@content/opening';
import type { Inspection } from '@contracts/simulation';
import type { WorldView } from '@contracts/world';

/** All possible copy reserves its wrapped height so live inspection controls stay anchored. */
export const MACHINE_ADVICE = {
  disabled: 'Enable this machine when you want it to work.',
  noPower:
    'Connect this machine to generation with crafted power connections. Check daylight, wind and network demand; batteries can cover shortages.',
  blocked:
    'Collect output or make room in the downstream buffer. Committed work and materials are retained.',
  depleted: 'The assigned deposit is empty. Recover the extractor and build over another deposit.',
  working:
    'Work advances with available power. Supply inputs and collect output or connect an automatic route.',
  missingInput: 'Load the recipe’s required materials from your bag or connect an upstream output.',
  recipe:
    'Choose a researched recipe supported by this fabricator’s input count, then supply its required materials.',
  renewable:
    'Renewable generation follows daylight and wind. Connect power cables to consumers; unused generation is curtailed automatically.',
  battery:
    'Connect this battery to the power network. It stores surplus generation and discharges during shortages; inspect its stored charge below.',
  coal: 'Supply coal and piped water, then connect power consumers. Forecast demand controls the slow start/stop ramp; sufficient renewable supply can keep coal off.',
  pump: 'The pump draws lake water through its lake-facing front. Check the source below; an empty lake refills naturally. Connect a facing water output downstream.',
  waterBlocked:
    'Make room in the downstream water buffers or connect a facing water output. Buffered water is retained; there is nothing to collect into the bag.',
  treatment:
    'Connect raw water from a pump and a facing clean-water output. Dirty water needs treatment power; already clean water bypasses without work.',
  greenhouse:
    'Supply clean piped water from treatment or a tank through facing water ports. Greenhouses also need power to restore nearby land and water.',
  restoring:
    'With power and clean water, this greenhouse restores nearby land and water; its influence spreads as cells fill.',
  pipes:
    'Connect facing water ports to move or store water. Check buffer space and junction overflow direction; these connections need no power.',
  waterReturn:
    'Connect clean piped water to this lake-facing return to improve lake health. No power connection is needed.',
  scrubber:
    'Supply power to reduce local pollution and restore nearby cells. This scrubber needs no material input.',
  labQueue:
    'Queue a technology in Research. All enabled, powered and supplied labs contribute to the same shared Research queue.',
  labPrerequisites:
    'Complete the current technology’s prerequisite research, or move an eligible technology to the front of the shared Research queue.',
  labHistory:
    'Meet the current technology’s cumulative extraction / production eligibility. Historical totals establish eligibility; lab materials pay for the work.',
  labInput:
    'Supply the current technology’s unpaid materials to this lab’s input buffer. Labs share the Research queue and retain invested work.',
  labWorking:
    'This lab advances the shared Research queue with available power and its own materials. Keep supplying unpaid materials until the technology completes.',
  extracting:
    'Extraction advances with available power. Collect output or connect an automatic route; no input materials are required.',
} as const;

/** Read-only presentation advice; machine status alone is not a diagnosis for passive equipment. */
export function machineAdvice(
  entity: Inspection['entity'] | null,
  world: WorldView | null,
): string {
  const machine = entity?.machine;
  if (!machine) return '';
  const kind = entity.building?.buildingId;
  if (!machine.enabled || machine.status === 'disabled') return MACHINE_ADVICE.disabled;
  if (machine.status === 'no-power') return MACHINE_ADVICE.noPower;
  if (machine.status === 'depleted') return MACHINE_ADVICE.depleted;
  if (machine.status === 'blocked')
    return machine.utility ? MACHINE_ADVICE.waterBlocked : MACHINE_ADVICE.blocked;

  switch (kind) {
    case 'solar-panel':
    case 'wind-turbine':
      return MACHINE_ADVICE.renewable;
    case 'battery':
      return MACHINE_ADVICE.battery;
    case 'coal-generator':
      return MACHINE_ADVICE.coal;
    case 'water-pump':
      return MACHINE_ADVICE.pump;
    case 'water-treatment':
      return MACHINE_ADVICE.treatment;
    case 'greenhouse':
      return machine.status === 'working' ? MACHINE_ADVICE.restoring : MACHINE_ADVICE.greenhouse;
    case 'pipe':
    case 'pipe-junction':
    case 'water-tank':
      return MACHINE_ADVICE.pipes;
    case 'water-return':
      return MACHINE_ADVICE.waterReturn;
    case 'air-scrubber':
      return MACHINE_ADVICE.scrubber;
    case 'laboratory': {
      const opening = world?.opening;
      const technology = OPENING_TECHNOLOGIES.find((t) => t.id === opening?.state.researchQueue[0]);
      if (!technology || opening?.ledgers[technology.id]?.unlocked) return MACHINE_ADVICE.labQueue;
      if (!technology.requires.every((id) => opening?.ledgers[id]?.unlocked))
        return MACHINE_ADVICE.labPrerequisites;
      if (
        !technology.eligibility.every(
          (cost) =>
            (cost.item === 'scrap'
              ? (opening?.extracted[cost.item] ?? 0)
              : (world?.productionTotals[cost.item] ?? 0)) >= cost.quantity,
        )
      )
        return MACHINE_ADVICE.labHistory;
      return machine.status === 'working' ? MACHINE_ADVICE.labWorking : MACHINE_ADVICE.labInput;
    }
    case 'basic-fabricator':
    case 'medium-fabricator':
      if (!machine.recipe) return MACHINE_ADVICE.recipe;
      break;
    case 'extractor':
      return MACHINE_ADVICE.extracting;
  }
  return machine.status === 'missing-input' ? MACHINE_ADVICE.missingInput : MACHINE_ADVICE.working;
}
