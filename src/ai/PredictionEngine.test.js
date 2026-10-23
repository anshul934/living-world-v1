
import test from "node:test"
import assert from "node:assert/strict"
import { predictDisturbance } from "./PredictionEngine.js"

test("no visitor produces zero disturbance risk", () => {
  const result = predictDisturbance({
    distance: Infinity,
    approachSpeed: 0,
    fear: 0,
    calmDurationMs: 0
  })

  assert.equal(result.riskScore, 0)
  assert.equal(result.predictedDisturbance, false)
})

test("distance 70 matches the first observed log", () => {
  const result = predictDisturbance({
    distance: 70,
    approachSpeed: 203,
    fear: 0.13,
    calmDurationMs: 0
  })

  assert.equal(result.riskScore, 0.592)
  assert.equal(result.predictedDisturbance, false)
})

test("distance 40 matches the second observed log", () => {
  const result = predictDisturbance({
    distance: 40,
    approachSpeed: 203,
    fear: 0.13,
    calmDurationMs: 0
  })

  assert.equal(result.riskScore, 0.654)
  assert.equal(result.predictedDisturbance, true)
})

test("sustained calm reduces the risk score", () => {
  const moving = predictDisturbance({
    distance: 70,
    approachSpeed: 203,
    fear: 0.13,
    calmDurationMs: 0
  })

  const calm = predictDisturbance({
    distance: 70,
    approachSpeed: 203,
    fear: 0.13,
    calmDurationMs: 3000
  })

  assert.equal(calm.riskScore, 0.342)
  assert.ok(calm.riskScore < moving.riskScore)
})

test("higher fear increases the risk score", () => {
  const lowFear = predictDisturbance({
    distance: 70,
    approachSpeed: 203,
    fear: 0.13
  })

  const highFear = predictDisturbance({
    distance: 70,
    approachSpeed: 203,
    fear: 0.8
  })

  assert.ok(highFear.riskScore > lowFear.riskScore)
})

test("faster approach increases the risk score", () => {
  const slow = predictDisturbance({
    distance: 70,
    approachSpeed: 50,
    fear: 0.13
  })

  const fast = predictDisturbance({
    distance: 70,
    approachSpeed: 203,
    fear: 0.13
  })

  assert.ok(fast.riskScore > slow.riskScore)
})
