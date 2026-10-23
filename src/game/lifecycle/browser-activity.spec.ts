import { BrowserActivity } from './browser-activity';

describe('BrowserActivity document ownership', () => {
  let hidden: boolean;
  let focused: boolean;
  const owners: BrowserActivity[] = [];
  beforeEach(() => {
    hidden = false;
    focused = true;
    vi.spyOn(document, 'hidden', 'get').mockImplementation(() => hidden);
    vi.spyOn(document, 'hasFocus').mockImplementation(() => focused);
  });
  afterEach(() => {
    for (const owner of owners.splice(0)) owner.release();
    vi.restoreAllMocks();
  });
  function acquire(doc = document) {
    const owner = new BrowserActivity(doc);
    owners.push(owner);
    return owner;
  }
  it.each([
    { hidden: false, focused: true },
    { hidden: true, focused: false },
  ])('immediately replays current activity $hidden/$focused', (initial) => {
    hidden = initial.hidden;
    focused = initial.focused;
    const owner = acquire();
    const visibility: boolean[] = [];
    const focus: boolean[] = [];
    owner.visibleObs.subscribe((value) => visibility.push(value));
    owner.hasFocusObs.subscribe((value) => focus.push(value));
    expect(visibility).toEqual([!hidden]);
    expect(focus).toEqual([focused]);
  });
  it('tracks focus and visibility independently', () => {
    const owner = acquire();
    focused = false;
    window.dispatchEvent(new Event('blur'));
    expect(owner.hasFocus).toBe(false);
    expect(owner.isVisible).toBe(true);
    hidden = true;
    document.dispatchEvent(new Event('visibilitychange'));
    expect(owner.isVisible).toBe(false);
    focused = true;
    window.dispatchEvent(new Event('focus'));
    expect(owner.hasFocus).toBe(true);
  });
  it('shares one listener set while another owner lives, then removes and completes it', () => {
    const add = vi.spyOn(window, 'addEventListener');
    const remove = vi.spyOn(window, 'removeEventListener');
    const first = acquire();
    const second = acquire();
    expect(add.mock.calls.filter(([event]) => event === 'focus')).toHaveLength(1);
    const complete = vi.fn();
    second.hasFocusObs.subscribe({ complete });
    first.release();
    first.release();
    focused = false;
    window.dispatchEvent(new Event('blur'));
    expect(second.hasFocus).toBe(false);
    expect(complete).not.toHaveBeenCalled();
    second.release();
    expect(complete).toHaveBeenCalledOnce();
    expect(remove.mock.calls.filter(([event]) => event === 'focus')).toHaveLength(1);
    acquire();
    expect(add.mock.calls.filter(([event]) => event === 'focus')).toHaveLength(2);
  });
  it('uses the owner document for activity and active element', () => {
    const other = document.implementation.createHTMLDocument('Other viewport');
    const hasFocus = vi.spyOn(other, 'hasFocus').mockReturnValue(false);
    vi.spyOn(other, 'hidden', 'get').mockReturnValue(true);
    const owner = acquire(other);
    expect(owner.hasFocus).toBe(false);
    expect(owner.isVisible).toBe(false);
    expect(owner.activeElement).toBe(other.activeElement);
    hidden = false;
    focused = true;
    document.dispatchEvent(new Event('visibilitychange'));
    window.dispatchEvent(new Event('focus'));
    expect(owner.hasFocus).toBe(false);
    expect(owner.isVisible).toBe(false);
    expect(hasFocus).toHaveBeenCalledOnce();
  });
});
