import { WindingTravel } from './winding-travel';

describe('WindingTravel', () => {
  it('credits a cardinal cycle and reversals proportionally, with no charge from a stationary hold', () => {
    const travel = new WindingTravel();
    const samples = [
      [0, -1],
      [1, 0],
      [0, 1],
      [-1, 0],
      [0, -1],
      [-1, 0],
    ];
    let total = 0;
    for (const [x, y] of samples) total += Math.abs(travel.sample(x, y)!.degrees);
    expect(total).toBe(450);
    expect(travel.sample(-1, 0)!.degrees).toBe(0);
  });

  it('resets across centre, focus loss and jumps, while accumulating slow deliberate movement', () => {
    const travel = new WindingTravel();
    travel.sample(1, 0);
    expect(travel.sample(-1, 0)!.degrees).toBe(0);
    travel.sample(0, 0);
    expect(travel.sample(0, -1)!.degrees).toBe(0);
    travel.reset();
    travel.sample(1, 0);
    let total = 0;
    for (let n = 1; n <= 20; n++) {
      const radians = (n * 0.05 * Math.PI) / 180;
      total += travel.sample(Math.cos(radians), Math.sin(radians))!.degrees;
    }
    expect(total).toBeGreaterThan(0.8);
    expect(total).toBeLessThanOrEqual(1.01);
  });
});
