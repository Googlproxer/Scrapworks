import { requireInvariant as check } from '@contracts/simulation';
import { RAPIER } from './rapier';

const near = (actual: number, expected: number): boolean =>
  Number.isFinite(actual) &&
  Math.abs(actual - expected) < 0.00001 * Math.max(1, Math.abs(expected));

function vectorMatches(actual: RAPIER.Vector | null, expected: RAPIER.Vector): boolean {
  return (
    !!actual &&
    near(actual.x, expected.x) &&
    near(actual.y, expected.y) &&
    near(actual.z, expected.z)
  );
}

function shapeMatches(actual: RAPIER.Shape, expected: RAPIER.Shape): boolean {
  if (actual instanceof RAPIER.Cuboid && expected instanceof RAPIER.Cuboid)
    return vectorMatches(actual.halfExtents, expected.halfExtents);
  if (actual instanceof RAPIER.HalfSpace && expected instanceof RAPIER.HalfSpace)
    return vectorMatches(actual.normal, expected.normal);
  if (
    (actual instanceof RAPIER.Cylinder && expected instanceof RAPIER.Cylinder) ||
    (actual instanceof RAPIER.Capsule && expected instanceof RAPIER.Capsule)
  )
    return near(actual.radius, expected.radius) && near(actual.halfHeight, expected.halfHeight);
  return false;
}

/** Validate immutable configuration without rebuilding native contact/solver state. */
export function assertRestoredBody(
  body: RAPIER.RigidBody | undefined,
  type: RAPIER.RigidBodyType,
  expected: RAPIER.ColliderDesc,
  ccd = false,
): asserts body is RAPIER.RigidBody {
  check(body && body.numColliders() === 1, 'Physics snapshot/body collider mismatch');
  check(
    body.bodyType() === type &&
      body.isEnabled() &&
      body.isCcdEnabled() === ccd &&
      near(body.gravityScale(), 1),
    'Physics snapshot/body configuration mismatch',
  );
  const collider = body.collider(0);
  check(shapeMatches(collider.shape, expected.shape), 'Physics snapshot/collider shape mismatch');
  const rotation = collider.rotationWrtParent();
  check(
    collider.isEnabled() &&
      !collider.isSensor() &&
      vectorMatches(collider.translationWrtParent(), expected.translation) &&
      rotation &&
      near(rotation.x, 0) &&
      near(rotation.y, 0) &&
      near(rotation.z, 0) &&
      near(Math.abs(rotation.w), 1) &&
      near(collider.friction(), expected.friction) &&
      near(collider.restitution(), expected.restitution) &&
      collider.collisionGroups() === expected.collisionGroups &&
      collider.solverGroups() === expected.solverGroups,
    'Physics snapshot/collider configuration mismatch',
  );
  if (type !== RAPIER.RigidBodyType.Fixed && expected.massPropsMode === RAPIER.MassPropsMode.Mass)
    check(
      near(collider.mass(), expected.mass) && near(body.mass(), expected.mass),
      'Physics snapshot/body mass mismatch',
    );
  for (const value of [body.translation(), body.rotation(), body.linvel(), body.angvel()])
    check(Object.values(value).every(Number.isFinite), 'Physics snapshot/nonfinite body state');
}

export function assertFixedPose(body: RAPIER.RigidBody, position: RAPIER.Vector): void {
  const rotation = body.rotation();
  check(
    vectorMatches(body.translation(), position) &&
      near(rotation.x, 0) &&
      near(rotation.y, 0) &&
      near(rotation.z, 0) &&
      near(Math.abs(rotation.w), 1),
    'Physics snapshot/static pose mismatch',
  );
}
