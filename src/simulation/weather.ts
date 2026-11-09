import type { WeatherKind, WeatherState } from '@contracts/environment';
import { ENVIRONMENT_SETTINGS as settings } from '@content/environment';
import { renewableFactors } from '@content/factory';

const random = (state: WeatherState): number => {
  let n = state.random;
  n ^= n << 13;
  n ^= n >>> 17;
  n ^= n << 5;
  state.random = n >>> 0 || 1;
  return state.random / 0x100000000;
};

function schedule(state: WeatherState, tick: number): void {
  state.nextTick = tick + (180 + Math.floor(random(state) * 121)) * 20;
  state.nextDuration = (45 + Math.floor(random(state) * 31)) * 20;
  state.nextKind = random(state) < 2 / 3 ? 'rain' : 'dunkelflaute';
}

export function newWeather(seed = 0x7158f213): WeatherState {
  const weather: WeatherState = {
    random: seed,
    kind: 'clear',
    endTick: 0,
    nextKind: 'rain',
    nextTick: 0,
    nextDuration: 0,
  };
  schedule(weather, 0);
  return weather;
}

export function advanceWeather(weather: WeatherState, tick: number): void {
  if (weather.kind !== 'clear' && tick >= weather.endTick) {
    weather.kind = 'clear';
    schedule(weather, tick);
  }
  if (weather.kind === 'clear' && tick >= weather.nextTick) {
    weather.kind = weather.nextKind;
    weather.endTick = weather.nextTick + weather.nextDuration;
  }
}

export function weatherFactors(
  weather: WeatherState,
  tick: number,
  now = tick,
): { daylight: number; wind: number; windScale: number } {
  let kind: WeatherKind = weather.kind;
  if (tick >= weather.endTick && kind !== 'clear') kind = 'clear';
  if (
    weather.kind === 'clear' &&
    weather.nextTick - now <= settings.forecastLeadTicks &&
    tick >= weather.nextTick &&
    tick < weather.nextTick + weather.nextDuration
  )
    kind = weather.nextKind;
  const base = renewableFactors(tick);
  return {
    daylight: base.daylight * (kind === 'rain' ? 0.4 : kind === 'dunkelflaute' ? 0.2 : 1),
    wind: base.wind,
    windScale: kind === 'rain' ? 1.5 : kind === 'dunkelflaute' ? 0.05 : 1,
  };
}
