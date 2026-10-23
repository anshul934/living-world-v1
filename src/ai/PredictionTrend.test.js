import test from "node:test"
import assert from "node:assert/strict"
import { estimateTrendClosingSpeed } from "./PredictionTrend.js"

const sample = (t, distance, visitorId = "visitor-1") => ({ t, distance, visitorId })

test("estimates positive closing speed from same-visitor distance change", () => {
  assert.equal(
    estimateTrendClosingSpeed([sample(400, 260)], {
      now: 1000,
      distance: 200,
      visitorId: "visitor-1"
    }),
    100
  )
})

test("returns negative speed when distance is increasing", () => {
  assert.equal(
    estimateTrendClosingSpeed([sample(400, 200)], {
      now: 1000,
      distance: 260,
      visitorId: "visitor-1"
    }),
    -100
  )
})

test("ignores other visitors and samples outside the measurement window", () => {
  const history = [
    sample(400, 260, "visitor-2"),
    sample(49, 260),
    sample(600, 240)
  ]
  assert.equal(
    estimateTrendClosingSpeed(history, {
      now: 1000,
      distance: 200,
      visitorId: "visitor-1"
    }),
    0
  )
})

test("ignores implausible speed spikes and invalid current observations", () => {
  assert.equal(
    estimateTrendClosingSpeed([sample(400, 800)], {
      now: 1000,
      distance: 200,
      visitorId: "visitor-1"
    }),
    0
  )
  assert.equal(
    estimateTrendClosingSpeed([sample(400, 260)], {
      now: 1000,
      distance: Infinity,
      visitorId: "visitor-1"
    }),
    0
  )
})
