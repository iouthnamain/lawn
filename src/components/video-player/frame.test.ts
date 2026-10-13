import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_FRAME_RATE,
  estimateFrameRate,
  formatTimecode,
  frameIndexAtTime,
  resolveFrameRate,
  steppedTime,
  timeAtFrameIndex,
} from "./frame";

const closeTo = (actual: number, expected: number) =>
  assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} !== ${expected}`);

test("resolveFrameRate falls back to 30 fps for unknown or implausible values", () => {
  for (const candidate of [undefined, null, Number.NaN, 0, -24, Infinity, 5, 500]) {
    assert.equal(resolveFrameRate(candidate), DEFAULT_FRAME_RATE);
  }
});

test("resolveFrameRate keeps known rates and snaps near-miss measurements to them", () => {
  assert.equal(resolveFrameRate(23.976), 23.976);
  assert.equal(resolveFrameRate(24), 24);
  assert.equal(resolveFrameRate(25), 25);
  assert.equal(resolveFrameRate(29.97), 29.97);
  assert.equal(resolveFrameRate(30), 30);
  assert.equal(resolveFrameRate(48), 48);
  assert.equal(resolveFrameRate(50), 50);
  assert.equal(resolveFrameRate(59.94), 59.94);
  assert.equal(resolveFrameRate(60), 60);
  // Values measured from presented-frame callbacks land close to, not on, the rate.
  assert.equal(resolveFrameRate(29.97002997), 29.97);
  assert.equal(resolveFrameRate(23.98), 23.976);
  // A plausible but non-standard rate is kept as-is rather than forced to a neighbour.
  assert.equal(resolveFrameRate(90), 90);
});

test("frameIndexAtTime and timeAtFrameIndex are inverses on frame boundaries", () => {
  assert.equal(frameIndexAtTime(0, 30), 0);
  assert.equal(frameIndexAtTime(1, 30), 30);
  assert.equal(frameIndexAtTime(10 + 1 / 30, 30), 301);
  assert.equal(frameIndexAtTime(-5, 30), 0);
  closeTo(timeAtFrameIndex(31, 30), 31 / 30);
  closeTo(timeAtFrameIndex(0, 30), 0);
  closeTo(timeAtFrameIndex(-3, 30), 0);
  for (const fps of [23.976, 24, 29.97, 60]) {
    assert.equal(frameIndexAtTime(timeAtFrameIndex(1234, fps), fps), 1234);
  }
});

test("steppedTime moves exactly one frame from an aligned time", () => {
  closeTo(steppedTime(10, 1, 30, 20), 10 + 1 / 30);
  closeTo(steppedTime(10, -1, 30, 20), 10 - 1 / 30);
  closeTo(steppedTime(10, 1, 24, 20), 10 + 1 / 24);
  closeTo(steppedTime(10, 10, 30, 20), 10 + 10 / 30);
  closeTo(steppedTime(10, -10, 30, 20), 10 - 10 / 30);
});

test("steppedTime lands on the neighbouring frame from a mid-frame time", () => {
  // 10.05s at 30 fps is inside frame 301 (10.0333s-10.0666s).
  closeTo(steppedTime(10.05, 1, 30, 20), 302 / 30);
  closeTo(steppedTime(10.05, -1, 30, 20), 300 / 30);
  // A time produced by a previous step steps cleanly instead of sticking on float error.
  closeTo(steppedTime(302 / 30, -1, 30, 20), 301 / 30);
  closeTo(steppedTime(302 / 30, 1, 30, 20), 303 / 30);
});

test("steppedTime clamps to the start and end of the video", () => {
  assert.equal(steppedTime(0, -1, 30, 20), 0);
  assert.equal(steppedTime(0.01, -1, 30, 20), 0);
  assert.equal(steppedTime(20, 1, 30, 20), 20);
  closeTo(steppedTime(19.99, 1, 30, 20), 20);
  closeTo(steppedTime(20, -1, 30, 20), 599 / 30);
  closeTo(steppedTime(10, 1, 30), 10 + 1 / 30);
  closeTo(steppedTime(10, 1, 30, Infinity), 10 + 1 / 30);
  // An unknown rate still steps, using the 30 fps fallback.
  closeTo(steppedTime(10, 1, 0, 20), 10 + 1 / 30);
});

test("formatTimecode renders HH:MM:SS:FF using the frame rate", () => {
  assert.equal(formatTimecode(0, 30), "00:00:00:00");
  assert.equal(formatTimecode(83.5, 30), "00:01:23:15");
  assert.equal(formatTimecode(10 + 1 / 30, 30), "00:00:10:01");
  assert.equal(formatTimecode(3661.5, 30), "01:01:01:15");
  assert.equal(formatTimecode(1.9999, 30), "00:00:01:29");
  assert.equal(formatTimecode(2.5, 29.97), "00:00:02:14");
  assert.equal(formatTimecode(-3, 30), "00:00:00:00");
});

test("estimateFrameRate derives a snapped rate from presented-frame samples", () => {
  assert.equal(
    estimateFrameRate(
      { mediaTime: 10, presentedFrames: 300 },
      { mediaTime: 11, presentedFrames: 330 },
    ),
    30,
  );
  assert.equal(
    estimateFrameRate(
      { mediaTime: 0, presentedFrames: 0 },
      { mediaTime: 10.01, presentedFrames: 300 },
    ),
    29.97,
  );
  assert.equal(
    estimateFrameRate(
      { mediaTime: 4, presentedFrames: 96 },
      { mediaTime: 8, presentedFrames: 192 },
    ),
    24,
  );
});

test("estimateFrameRate returns null when samples cannot support a rate", () => {
  assert.equal(estimateFrameRate(null, { mediaTime: 1, presentedFrames: 30 }), null);
  assert.equal(estimateFrameRate({ mediaTime: 1, presentedFrames: 30 }, null), null);
  assert.equal(
    estimateFrameRate({ mediaTime: 1, presentedFrames: 30 }, { mediaTime: 1, presentedFrames: 60 }),
    null,
  );
  assert.equal(
    estimateFrameRate({ mediaTime: 2, presentedFrames: 30 }, { mediaTime: 1, presentedFrames: 60 }),
    null,
  );
  assert.equal(
    estimateFrameRate({ mediaTime: 0, presentedFrames: 30 }, { mediaTime: 1, presentedFrames: 30 }),
    null,
  );
});
