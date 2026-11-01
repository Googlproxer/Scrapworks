import { Observable } from '@babylonjs/core/Misc/observable';
import { take } from 'rxjs';
import { fromBabylonObservable } from './from-babylon-observable';

describe('Babylon event subscriptions', () => {
  it('delivers event data synchronously and detaches independently owned subscriptions', () => {
    const source = new Observable<{ id: string }>();
    const first = vi.fn();
    const second = vi.fn();
    const a = fromBabylonObservable(source).subscribe(first);
    const b = fromBabylonObservable(source).subscribe(second);
    const value = { id: 'keyboard' };
    source.notifyObservers(value);
    expect(first).toHaveBeenCalledExactlyOnceWith(value);
    expect(second).toHaveBeenCalledExactlyOnceWith(value);
    a.unsubscribe();
    source.notifyObservers(value);
    expect(first).toHaveBeenCalledOnce();
    expect(second).toHaveBeenCalledTimes(2);
    b.unsubscribe();
    expect(source.hasObservers()).toBe(false);
  });

  it('handles synchronous device replay and releases a take(1) registration after add returns', () => {
    const source = new Observable<string>((observer) => {
      source.notifyObserver(observer, 'existing device');
      source.notifyObserver(observer, 'another device');
    });
    const received = vi.fn();
    const subscription = fromBabylonObservable(source).pipe(take(1)).subscribe(received);
    expect(received).toHaveBeenCalledExactlyOnceWith('existing device');
    expect(subscription.closed).toBe(true);
    expect(source.hasObservers()).toBe(false);
    source.notifyObservers('late device');
    expect(received).toHaveBeenCalledOnce();
  });
});
