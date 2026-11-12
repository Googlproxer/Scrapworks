import type { Scene } from '@babylonjs/core/scene';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Vector2 } from '@babylonjs/core/Maths/math.vector';
import type { WorldDefinition } from '@contracts/world';
import { featheredCell } from '../../../../art/shaders/protagonist-builtins/feathered-cell';
import { terrainSeed } from './terrain-layout';

/** Four continuously blended paint patterns; logical cell boundaries never affect colour. */
export function terrainMaterial(scene: Scene, definition: WorldDefinition) {
  // Leave lighting headroom: the approved warm fill otherwise clips cast shadows
  // before StandardMaterial multiplies the procedural surface colour.
  const material = featheredCell(
    'layered-painted-terrain',
    scene,
    null,
    Color3.White().scale(0.65),
    0.025,
    false,
  );
  material.AddUniform(
    'swTerrainOrigin',
    'vec2',
    new Vector2(definition.grid.origin.x, definition.grid.origin.z),
  );
  material.AddUniform('swTerrainSeed', 'float', terrainSeed(definition.id) % 4093);
  material.Fragment_Definitions(`${material.CustomParts.Fragment_Definitions}
float swTerrainHash(vec2 p) {
  // Bounded integer-valued float arithmetic avoids transcendental/compiler drift.
  // High-precision intermediates stay below 2^24; a smaller fallback fits mediump.
#ifdef GL_FRAGMENT_PRECISION_HIGH
  vec2 q=mod(floor(p)+swTerrainSeed,127.0);
  float n=mod(q.x*197.0+q.y*927.0+q.x*q.y*53.0+swTerrainSeed*17.0,65521.0);
  n=mod(n*251.0+29.0,65521.0);
  n=mod(n*137.0+q.x*q.x*23.0+q.y*q.y*19.0,65521.0);
  return n/65521.0;
#else
  vec2 q=mod(floor(p)+mod(swTerrainSeed,13.0),17.0);
  float n=mod(q.x*13.0+q.y*7.0+q.x*q.y,127.0);
  return mod(n*7.0+3.0,127.0)/127.0;
#endif
}
float swTerrainNoise(vec2 p) {
  vec2 cell = floor(p), f = fract(p);
  float a=swTerrainHash(cell), b=swTerrainHash(cell+vec2(1.,0.));
  float c=swTerrainHash(cell+vec2(0.,1.)), d=swTerrainHash(cell+vec2(1.,1.));
  if(f.x+f.y<1.0) return a+(b-a)*f.x+(c-a)*f.y;
  return d+(c-d)*(1.-f.x)+(b-d)*(1.-f.y);
}
float swTerrainPattern(vec2 p, float variant) {
  vec2 q=p*2.2;
  if(variant<0.5) q=q; else if(variant<1.5) q=vec2(-q.y,q.x);
  else if(variant<2.5) q=-q; else q=vec2(q.y,-q.x);
  return swTerrainNoise(q+variant*vec2(7.3,11.1));
}
vec3 swGroundColour(vec2 p, float health) {
  // Blend rotated patterns in continuous world space, without tile UV resets or
  // neutral border bands that would reveal the invisible construction grid.
  vec2 local=p-swTerrainOrigin;
  float choice=swTerrainNoise(local/7.7+vec2(13.1,7.3))*3.0;
  float variant=floor(choice);
  float tile=mix(swTerrainPattern(local,variant),swTerrainPattern(local,min(variant+1.,3.)),
                 smoothstep(0.2,0.8,fract(choice)));
  float smallPlanes = mix(-0.035,0.035,step(0.42,tile))+0.025*step(0.67,tile);
  float macro = swTerrainNoise(p/5.3+vec2(3.71,-2.13))*0.72 + swTerrainNoise(p/11.7)*0.28;
  float coverage = smoothstep(macro-0.055,macro+0.055,health*0.67+0.02)*smoothstep(0.0,0.06,health);
  float broadShade = (floor(swTerrainNoise(p/2.7)*3.0)-1.0)*0.022;
  vec3 soil = vec3(0.70,0.51,0.29) + (smallPlanes+broadShade)*vec3(1.,0.76,0.45);
  vec3 green = vec3(0.49,0.53,0.26) + (smallPlanes+broadShade)*vec3(0.7,0.8,0.35);
  return mix(soil, green, coverage);
}`);
  material.Fragment_Before_Lights(
    'baseColor.rgb = swGroundColour(vPositionW.xz * 0.01, clamp(vColor.r, 0.0, 1.0));',
  );
  return material;
}
