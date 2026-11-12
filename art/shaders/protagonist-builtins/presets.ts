/** Local visual experiment; no production renderer or shader changes. */
export const variants = [
  {
    id: 'current',
    label: 'A · Current lighting',
    detail: 'Original PBR textures · hemispheric light only',
  },
  {
    id: 'pbr-original',
    label: 'B · Original PBR + sun',
    detail: 'Original normal/metalness/roughness · shared sun/fill',
  },
  {
    id: 'pbr-matte',
    label: 'C · Matte PBR',
    detail: 'Base colour retained · no normal/specular/metalness detail',
  },
  {
    id: 'standard',
    label: 'D · Diffuse Standard',
    detail: 'Base colour retained · diffuse lighting, no gloss',
  },
  {
    id: 'cell-high',
    label: 'E · Cell five-level',
    detail: 'Stock CellMaterial · computeHighLevel = true',
  },
  {
    id: 'cell-basic',
    label: 'F · Cell two-level',
    detail: 'Stock CellMaterial · basic WebGL path, diagnostic',
  },
  {
    id: 'cell-soft',
    label: 'G · Cell with softer fill',
    detail: 'Stock five-level Cell · brighter warm fill, gentler sun/shadow',
  },
] as const;

export const featherVariants = [
  {
    id: 'cell-feather-fine',
    label: 'H · Fine blend',
    detail: 'G lighting · narrow 0.01 half-width',
    halfWidth: 0.01,
  },
  {
    id: 'cell-feather-subtle',
    label: 'I · Subtle blend',
    detail: 'G lighting · narrow 0.025 half-width',
    halfWidth: 0.025,
  },
  {
    id: 'cell-feather-soft',
    label: 'J · Softer blend',
    detail: 'G lighting · wider 0.05 half-width',
    halfWidth: 0.05,
  },
] as const;
export const bandVariants = [variants[6], ...featherVariants] as const;
export type Variant =
  (typeof variants)[number]['id'] | (typeof featherVariants)[number]['id'] | 'cell-feather-zero';
export interface VariantDescription {
  id: Variant;
  label: string;
  detail: string;
}
export type View = 'front' | 'three-quarter' | 'back' | 'overhead-near' | 'overhead-default';
export type Pose = 'Idle' | 'Walk' | 'Run';

export interface RenderRequest {
  variant: Variant;
  view: View;
  shadows: boolean;
  pose?: Pose;
  phase?: number;
}

export interface RenderResult {
  request: RenderRequest;
  camera: { alpha: number; beta: number; radius: number; target: number[]; fov: number };
  meshCount: number;
  triangles: number;
  skinInfluences: number[];
  bounds: { min: number[]; max: number[] };
  material: string;
  albedoSize: { width: number; height: number };
  bandHalfWidth?: number;
  lighting: { sun: number; fill: number; shadowDarkness: number };
  backend: string;
  gpu: { vendor: string; renderer: string; version: string };
}

declare global {
  interface Window {
    protagonistTest?: {
      render(request: RenderRequest): Promise<RenderResult>;
      dispose(): void;
    };
    protagonistTestError?: string;
  }
}
