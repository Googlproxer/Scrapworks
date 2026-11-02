import test from 'node:test';
import assert from 'node:assert/strict';
import { authoringEventRelevant } from './watch.ts';

test('directory metadata never triggers authored-file work; rename and missing names reconcile the inventory', () => {
  assert.equal(authoringEventRelevant('change', 'game.scene', true, true), false);
  assert.equal(authoringEventRelevant('change', 'game.scene/config.json', false, true), true);
  assert.equal(authoringEventRelevant('change', 'scripts.ts', false, false), false);
  assert.equal(authoringEventRelevant('change', '.cache', false, false), false);
  assert.equal(authoringEventRelevant('rename', 'new.scene', true, true), true);
  assert.equal(authoringEventRelevant('rename', 'removed.scene', false, true), true);
  assert.equal(authoringEventRelevant('rename', 'parent-of-attached-script', true, false), true);
  assert.equal(authoringEventRelevant('rename', undefined, false, false), true);
});
