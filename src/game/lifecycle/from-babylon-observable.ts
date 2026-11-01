import type { Observable as BabylonObservable, Observer } from '@babylonjs/core/Misc/observable';
import { fromEventPattern, type Observable } from 'rxjs';

/** Babylon supplies EventState as a second argument; consumers receive only the event data. */
export function fromBabylonObservable<T>(
  source: Pick<BabylonObservable<T>, 'add' | 'remove'>,
): Observable<T> {
  return fromEventPattern<T>(
    (emit) => source.add((value) => emit(value)),
    (_emit, observer: Observer<T> | null) => source.remove(observer),
  );
}
