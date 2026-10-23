import test from "node:test"
import assert from "node:assert/strict"
import { predictDisturbance as p } from "./PredictionEngineV3.js"

test("no visitor -> zero risk", () => {
  const r = p({ distance: Infinity })
  assert.equal(r.riskScore, 0); assert.equal(r.predictedDisturbance, false)
})
test("distant visitor with high fear does not trigger (V2 false-positive case)", () => {
  const r = p({ distance: 316, fear: 0.999, threat: 0, approachSpeed: 0, visitorSpeed: 5419 })
  assert.equal(r.predictedDisturbance, false)
})
test("calm visitor nearby (threat ignored by engine) -> zero risk", () => {
  assert.equal(p({ distance: 90, threat: 0, calmDurationMs: 3000 }).riskScore, 0)
})
test("inside flee radius -> risk 1", () => {
  assert.equal(p({ distance: 150, threat: 0.42 }).riskScore, 1)
})
test("fast approach from outside radius is predicted before the flee", () => {
  // threat 0.2 -> 208 px, 26 px to go, 150 px/s -> 0.17 s
  const r = p({ distance: 208, threat: 0.2, approachSpeed: 150 })
  assert.equal(r.predictedDisturbance, true); assert.ok(r.riskScore < 1)
})
test("distance trend can warn while current visitor motion is zero", () => {
  const current = p({ distance: 215, threat: 1 - 215 / 260 })
  const trending = p({
    distance: 215,
    threat: 1 - 215 / 260,
    trendClosingSpeed: 50
  })
  assert.equal(current.predictedDisturbance, false)
  assert.equal(trending.predictedDisturbance, true)
})
test("distance trend does not count movement away as closing", () => {
  const current = p({ distance: 215, threat: 1 - 215 / 260 })
  const movingAway = p({
    distance: 215,
    threat: 1 - 215 / 260,
    trendClosingSpeed: -50
  })
  assert.equal(movingAway.riskScore, current.riskScore)
})
test("slow approach far away is not predicted", () => {
  assert.equal(p({ distance: 250, threat: 0.04, approachSpeed: 20 }).predictedDisturbance, false)
})
test("fast visitor movement raises risk compared with slow movement at the same distance", () => {
  const slow = p({
    distance: 200,
    threat: 1 - 200 / 260,
    visitorSpeed: 20
  })
  const fast = p({
    distance: 200,
    threat: 1 - 200 / 260,
    visitorSpeed: 300
  })

  assert.ok(fast.riskScore > slow.riskScore)
  assert.equal(slow.predictedDisturbance, false)
  assert.equal(fast.predictedDisturbance, true)
})
test("hovering just outside the radius without approach does not warn", () => {
  const r = p({ distance: 190, threat: 0.269, approachSpeed: 0, visitorSpeed: 0 })
  assert.equal(r.predictedDisturbance, false)
})
test("horizon boundary: time-to-flee 1.5 s warns, 2 s does not", () => {
  assert.equal(p({ distance: 232, threat: 1 - 232 / 260, approachSpeed: 100 }).predictedDisturbance, true)  // 50px/100 = .5s
  assert.equal(p({ distance: 232, threat: 1 - 232 / 260, approachSpeed: 20 }).predictedDisturbance, false) // 2.5s
})
test("stillness lowers proximity risk", () => {
  const moving = p({ distance: 200, threat: 1 - 200 / 260, calmDurationMs: 0, approachSpeed: 30 })
  const still = p({ distance: 200, threat: 1 - 200 / 260, calmDurationMs: 2000, approachSpeed: 30 })
  assert.ok(still.riskScore < moving.riskScore)
})
test("speed spikes above the cap are ignored as tracker glitches", () => {
  const still = p({ distance: 300, threat: 0, visitorSpeed: 0 })
  const spike = p({ distance: 300, threat: 0, visitorSpeed: 9000 })
  assert.equal(still.riskScore, spike.riskScore)
})
