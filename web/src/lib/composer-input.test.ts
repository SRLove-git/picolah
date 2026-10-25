import assert from 'node:assert/strict';
import test from 'node:test';
import { getComposerInputHeight, shouldSubmitComposerKey } from './composer-input.ts';

const enter = {
  key: 'Enter',
  shiftKey: false,
  ctrlKey: false,
  altKey: false,
  metaKey: false,
  isComposing: false,
  keyCode: 13,
};

test('submits plain Enter, including events without a legacy key code', () => {
  assert.equal(shouldSubmitComposerKey(enter, false), true);
  assert.equal(shouldSubmitComposerKey({ ...enter, keyCode: undefined }, false), true);
  assert.equal(shouldSubmitComposerKey({ ...enter, key: 'a' }, false), false);
  assert.equal(shouldSubmitComposerKey({ ...enter, key: 'Process' }, false), false);
});

test('modified Enter stays in the editor instead of submitting', () => {
  for (const modifier of ['shiftKey', 'ctrlKey', 'altKey', 'metaKey'] as const) {
    assert.equal(shouldSubmitComposerKey({ ...enter, [modifier]: true }, false), false, modifier);
  }
});

test('IME composition and Safari candidate-confirmation Enter never submit', () => {
  assert.equal(shouldSubmitComposerKey({ ...enter, isComposing: true }, false), false);
  assert.equal(shouldSubmitComposerKey(enter, true), false);
  assert.equal(shouldSubmitComposerKey({ ...enter, keyCode: 229 }, false), false);
  assert.equal(shouldSubmitComposerKey({ ...enter, keyCode: 229, isComposing: true }, true), false);
  assert.equal(shouldSubmitComposerKey(enter, false), true);
});

test('textarea grows, clamps, and shrinks with the measured content', () => {
  assert.equal(getComposerInputHeight(24, 176), 24);
  assert.equal(getComposerInputHeight(72, 176), 72);
  assert.equal(getComposerInputHeight(176, 176), 176);
  assert.equal(getComposerInputHeight(420, 176), 176);
  assert.equal(getComposerInputHeight(24, 176), 24);
  assert.equal(getComposerInputHeight(31.5, 160.5), 31.5);
  assert.equal(getComposerInputHeight(0, 176), 0);
});

test('invalid measurements cannot produce negative or non-finite CSS heights', () => {
  assert.equal(getComposerInputHeight(-10, 176), 0);
  assert.equal(getComposerInputHeight(Number.NaN, 176), 0);
  assert.equal(getComposerInputHeight(Number.NEGATIVE_INFINITY, 176), 0);
  assert.equal(getComposerInputHeight(Number.POSITIVE_INFINITY, 176), 176);
  for (const maximum of [0, -1, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
    assert.equal(getComposerInputHeight(72, maximum), 0);
  }
});
