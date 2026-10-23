import test from "node:test"
import assert from "node:assert/strict"
import { PredictionEvaluator } from "./PredictionEvaluator.js"

const warning = { predictedDisturbance: true, riskScore: 0.8, horizonMs: 1500 }
const noWarning = { predictedDisturbance: false, riskScore: 0.1, horizonMs: 1500 }

function observedInputs(overrides = {}) {
  return {
    state: "REST",
    visitorId: "visitor-1",
    curiosityVisitorId: null,
    distance: 100,
    approachSpeed: 0,
    visitorSpeed: 0,
    fear: 0,
    threat: 0,
    calmDurationMs: 0,
    ...overrides
  }
}

function finishFlee(evaluator, creatureId, start, end) {
  evaluator.noteFlee(creatureId, start)
  evaluator.noteFleeEnd(creatureId, end)
}

test("warning lead clock is fresh for each flee and ignores warning time during FLEE", () => {
  const evaluator = new PredictionEvaluator()
  evaluator.observe("butterfly-1", warning, observedInputs({ state: "RETURN" }), 1000)
  finishFlee(evaluator, "butterfly-1", 1200, 1400)
  assert.equal(evaluator.fleeEpisodes[0].leadMs, 200)

  // Prediction can remain true while fleeing, but that time cannot accumulate
  // into advance-warning lead for a later flee.
  evaluator.observe("butterfly-1", warning, observedInputs({ state: "FLEE" }), 1416)
  evaluator.observe("butterfly-1", warning, observedInputs({ state: "RETURN" }), 1500)
  finishFlee(evaluator, "butterfly-1", 1900, 2200)

  assert.equal(evaluator.fleeEpisodes[1].leadMs, 400)
  assert.equal(evaluator.summary().fleeEpisodesWarned, 2)
})

test("warning clock clears after prediction has been off for longer than the grace period", () => {
  const evaluator = new PredictionEvaluator()
  evaluator.observe("butterfly-1", warning, observedInputs(), 1000)
  evaluator.observe("butterfly-1", noWarning, observedInputs(), 1100)
  evaluator.observe("butterfly-1", noWarning, observedInputs(), 1700)
  finishFlee(evaluator, "butterfly-1", 1800, 2000)

  assert.equal(evaluator.fleeEpisodes[0].warned, false)
  assert.equal(evaluator.fleeEpisodes[0].leadMs, null)
})

test("a recent calm-curiosity marker is retained if state changes before the flee hook", () => {
  const evaluator = new PredictionEvaluator()
  evaluator.observe("butterfly-1", noWarning, observedInputs({
    state: "CURIOUS",
    curiosityVisitorId: "visitor-1",
    calmDurationMs: 3000
  }), 1000)
  evaluator.observe("butterfly-1", noWarning, observedInputs({
    state: "CURIOUS",
    curiosityVisitorId: "visitor-1",
    calmDurationMs: 3400
  }), 1400)
  // This is the last observation before changeState() enters FLEE. The state
  // may already have left CURIOUS, but the same visitor is still involved.
  evaluator.observe("butterfly-1", noWarning, observedInputs({
    state: "REST",
    curiosityVisitorId: null,
    calmDurationMs: 0,
    visitorSpeed: 220
  }), 1440)
  finishFlee(evaluator, "butterfly-1", 1450, 1700)

  const episode = evaluator.fleeEpisodes[0]
  assert.equal(episode.expectedCalmToMovement, true)
  assert.equal(episode.expectedVisitorId, "visitor-1")
  assert.equal(episode.visitorStillnessThresholdReachedInTrace, true)
  assert.equal(episode.curiosityObservedInTrace, true)
  assert.equal(episode.curiosityTargetMatchedInTrace, true)
  assert.equal(evaluator.summary().expectedCalmMovementEpisodes, 1)
  assert.equal(evaluator.summary().episodesWithStillnessThresholdReached, 1)
  assert.equal(evaluator.summary().episodesWithCuriosityObserved, 1)
  assert.equal(evaluator.summary().evaluableFleeEpisodes, 0) // marker removes this one episode
})

test("calm-curiosity marker does not classify a flee associated with a different visitor", () => {
  const evaluator = new PredictionEvaluator()
  evaluator.observe("butterfly-1", noWarning, observedInputs({
    state: "CURIOUS",
    curiosityVisitorId: "visitor-1",
    calmDurationMs: 3000
  }), 1000)
  evaluator.observe("butterfly-1", noWarning, observedInputs({
    state: "REST",
    visitorId: "visitor-2",
    distance: 90,
    calmDurationMs: 0
  }), 1100)
  finishFlee(evaluator, "butterfly-1", 1110, 1300)

  assert.equal(evaluator.fleeEpisodes[0].expectedCalmToMovement, false)
})

test("episodes with no visitor input remain in raw counts but are not treated as predictor misses", () => {
  const evaluator = new PredictionEvaluator()
  evaluator.observe("butterfly-1", noWarning, observedInputs({
    visitorId: null,
    distance: Infinity
  }), 1000)
  finishFlee(evaluator, "butterfly-1", 1010, 1200)

  const summary = evaluator.summary()
  assert.equal(summary.fleeEpisodes, 1)
  assert.equal(summary.noVisitorFleeEpisodes, 1)
  assert.equal(summary.evaluableFleeEpisodes, 0)
  assert.equal(summary.evaluableEpisodeRecall, null)
})

test("rapid flee-return-flee near the boundary is flagged for diagnosis but remains in raw counts", () => {
  const evaluator = new PredictionEvaluator()
  const input = observedInputs({ distance: 182, threat: 0.3 })
  evaluator.observe("butterfly-1", noWarning, input, 1000)
  finishFlee(evaluator, "butterfly-1", 1010, 1300)
  evaluator.observe("butterfly-1", noWarning, input, 2300)
  finishFlee(evaluator, "butterfly-1", 2410, 2600)

  const summary = evaluator.summary()
  assert.equal(evaluator.fleeEpisodes[1].rapidBoundaryReflee, true)
  assert.equal(summary.rapidBoundaryRefleeEpisodes, 1)
  assert.equal(summary.fleeEpisodes, 2)
})

test("a warning that starts in the flee-triggering frame is not advance warning", () => {
  const evaluator = new PredictionEvaluator()
  evaluator.observe("butterfly-1", warning, observedInputs(), 1000)
  finishFlee(evaluator, "butterfly-1", 1020, 1200)

  assert.equal(evaluator.fleeEpisodes[0].warned, false)
  assert.equal(evaluator.fleeEpisodes[0].leadMs, null)
  assert.equal(evaluator.fleeEpisodes[0].measuredLeadMs, 20)
  assert.equal(evaluator.summary().fleeEpisodesWarned, 0)
  assert.equal(evaluator.summary().medianMeasuredLeadMs, 20)
})

test("a rapid boundary re-flee remains visible and is separately excluded by the conservative metric", () => {
  const evaluator = new PredictionEvaluator()
  const input = observedInputs({ distance: 182, threat: 0.3 })
  evaluator.observe("butterfly-1", warning, input, 1000)
  finishFlee(evaluator, "butterfly-1", 1200, 1300)
  evaluator.observe("butterfly-1", warning, input, 2300)
  finishFlee(evaluator, "butterfly-1", 2500, 2600)

  const summary = evaluator.summary()
  assert.equal(summary.fleeEpisodes, 2)
  assert.equal(summary.rapidBoundaryRefleeEpisodes, 1)
  assert.equal(summary.boundaryAdjustedFleeEpisodes, 1)
  assert.equal(summary.boundaryAdjustedFleeEpisodesWarned, 1)
  assert.equal(summary.boundaryAdjustedEpisodeRecall, 1)
})



test("same visitor fleeing again soon after the prior flee ends is grouped as one continuing encounter", () => {
  const evaluator = new PredictionEvaluator()
  evaluator.observe("butterfly-1", noWarning, observedInputs({
    state: "RETURN", distance: 180, threat: 0.3
  }), 1000)
  finishFlee(evaluator, "butterfly-1", 1010, 1210)

  evaluator.observe("butterfly-1", warning, observedInputs({
    state: "RETURN", distance: 45, threat: 0.83
  }), 1290)
  finishFlee(evaluator, "butterfly-1", 1300, 1500)

  const second = evaluator.fleeEpisodes[1]
  assert.equal(second.intervalSincePreviousFleeEndMs, 90)
  assert.equal(second.sameVisitorAsPreviousFlee, true)
  assert.equal(second.continuingEncounterReflee, true)
  assert.equal(second.eventGroup, "CONTINUING_ENCOUNTER")
  assert.equal(evaluator.summary().continuingEncounterEpisodes, 1)
  assert.equal(evaluator.summary().newDisturbanceCandidateEpisodes, 1)
})

test("same visitor after a longer gap is a new disturbance candidate, not a continuing encounter", () => {
  const evaluator = new PredictionEvaluator()
  evaluator.observe("butterfly-1", noWarning, observedInputs({
    state: "RETURN", distance: 180, threat: 0.3
  }), 1000)
  finishFlee(evaluator, "butterfly-1", 1010, 1210)

  evaluator.observe("butterfly-1", noWarning, observedInputs({
    state: "REST", distance: 80, threat: 0.7
  }), 3500)
  finishFlee(evaluator, "butterfly-1", 3510, 3710)

  const second = evaluator.fleeEpisodes[1]
  assert.equal(second.intervalSincePreviousFleeEndMs, 2300)
  assert.equal(second.continuingEncounterReflee, false)
  assert.equal(second.eventGroup, "NEW_DISTURBANCE_CANDIDATE")
})

test("high visitor speed is flagged as an input continuity diagnostic, not auto-excluded", () => {
  const evaluator = new PredictionEvaluator()
  evaluator.observe("butterfly-1", noWarning, observedInputs({
    state: "RETURN", visitorSpeed: 1400, distance: 180, threat: 0.3
  }), 1000)
  finishFlee(evaluator, "butterfly-1", 1010, 1210)

  const episode = evaluator.fleeEpisodes[0]
  assert.equal(episode.inputContinuityConcern, true)
  assert.equal(episode.maxVisitorSpeedBeforeFlee, 1400)
  assert.equal(episode.highVisitorSpeedSamplesNearFlee, 1)
  assert.equal(episode.eventGroup, "NEW_DISTURBANCE_CANDIDATE")
  assert.equal(evaluator.summary().episodesWithHighVisitorSpeedNearFlee, 1)
  assert.equal(evaluator.summary().evaluableFleeEpisodes, 1)
})

test("calm-to-movement classification takes precedence over a continuing-encounter label", () => {
  const evaluator = new PredictionEvaluator()
  evaluator.observe("butterfly-1", noWarning, observedInputs({
    state: "RETURN", distance: 180, threat: 0.3
  }), 1000)
  finishFlee(evaluator, "butterfly-1", 1010, 1210)

  evaluator.observe("butterfly-1", noWarning, observedInputs({
    state: "CURIOUS", curiosityVisitorId: "visitor-1", calmDurationMs: 3000,
    distance: 100, threat: 0.5
  }), 1250)
  evaluator.observe("butterfly-1", noWarning, observedInputs({
    state: "RETURN", curiosityVisitorId: null, calmDurationMs: 0,
    distance: 80, threat: 0.7, visitorSpeed: 200
  }), 1290)
  finishFlee(evaluator, "butterfly-1", 1300, 1500)

  const second = evaluator.fleeEpisodes[1]
  assert.equal(second.expectedCalmToMovement, true)
  assert.equal(second.eventGroup, "UNANTICIPATED_CALM_TO_MOVEMENT")
})


test("summary flags high-speed snapshot samples and high-fear zero-threat false positives", () => {
  const evaluator = new PredictionEvaluator()
  const inputs = observedInputs({
    state: "RETURN", distance: 316, visitorSpeed: 5419, fear: 0.999, threat: 0
  })
  evaluator.record("butterfly-1", "RETURN", inputs, {
    riskScore: 0.8, predictedDisturbance: true, horizonMs: 1500
  }, 1000)
  evaluator.resolve(2500)

  const summary = evaluator.summary()
  assert.equal(summary.FP, 1)
  assert.equal(summary.snapshotRecordsWithHighVisitorSpeed, 1)
  assert.equal(summary.maxRecordedVisitorSpeed, 5419)
  assert.equal(summary.falsePositiveRecordsWithHighFearAndZeroThreat, 1)
})


test("visitor disappearance and reappearance near a flee is flagged without excluding the episode", () => {
  const evaluator = new PredictionEvaluator()
  evaluator.observe("butterfly-1", noWarning, observedInputs({
    visitorId: null, distance: Infinity, state: "REST"
  }), 500)
  evaluator.observe("butterfly-1", noWarning, observedInputs({
    visitorId: "visitor-1", state: "RETURN", distance: 180, threat: 0.3
  }), 1000)
  finishFlee(evaluator, "butterfly-1", 1010, 1210)

  const episode = evaluator.fleeEpisodes[0]
  assert.ok(episode.visitorAbsenceSamplesNearFlee > 0)
  assert.equal(episode.inputContinuityConcern, true)
  assert.equal(episode.eventGroup, "NEW_DISTURBANCE_CANDIDATE")
  assert.equal(evaluator.summary().episodesWithVisitorAbsenceNearFlee, 1)
  assert.equal(evaluator.summary().evaluableFleeEpisodes, 1)
})

test("a changed visitor ID near a flee is flagged for review", () => {
  const evaluator = new PredictionEvaluator()
  evaluator.observe("butterfly-1", noWarning, observedInputs({
    visitorId: "visitor-2", state: "RETURN", distance: 160, threat: 0.4
  }), 500)
  evaluator.observe("butterfly-1", noWarning, observedInputs({
    visitorId: "visitor-1", state: "RETURN", distance: 180, threat: 0.3
  }), 1000)
  finishFlee(evaluator, "butterfly-1", 1010, 1210)

  const episode = evaluator.fleeEpisodes[0]
  assert.equal(episode.differentVisitorIdSamplesNearFlee, 1)
  assert.equal(episode.inputContinuityConcern, true)
  assert.equal(evaluator.summary().episodesWithDifferentVisitorIdsNearFlee, 1)
})

test("distance trend is appended to the trace without changing existing columns", () => {
  const evaluator = new PredictionEvaluator()
  for (let i = 0; i < 7; i++) {
    evaluator.observe("butterfly-1", noWarning, observedInputs({
      distance: 200 - i,
      approachSpeed: 10,
      trendClosingSpeed: 12,
      threat: 0.3,
      calmDurationMs: 250,
      visitorSpeed: 15
    }), 1000 + i * 100)
  }
  finishFlee(evaluator, "butterfly-1", 1700, 1800)

  const trace = evaluator.fleeEpisodes[0].trace
  assert.equal(trace[0][3], 0.3)
  assert.equal(trace[0][4], 250)
  assert.equal(trace[0][5], 15)
  assert.equal(trace[0][11], 12)
})

test("prediction-triggered flee is identified in episode diagnostics", () => {
  const evaluator = new PredictionEvaluator()
  evaluator.observe("butterfly-1", warning, observedInputs({ state: "RETURN" }), 1000)
  evaluator.noteFlee("butterfly-1", 1200, {
    predictionTriggered: true,
    predictionSource: "V3Heatmap"
  })
  evaluator.noteFleeEnd("butterfly-1", 1400)

  assert.equal(evaluator.fleeEpisodes[0].predictionTriggered, true)
  assert.equal(evaluator.fleeEpisodes[0].predictionSource, "V3Heatmap")
  assert.equal(evaluator.summary().predictionTriggeredFleeEpisodes, 1)
})

test("heatmap diagnostics are appended to the trace for offline review", () => {
  const evaluator = new PredictionEvaluator()
  for (let i = 0; i < 7; i++) {
    evaluator.observe("butterfly-1", noWarning, observedInputs({
      distance: 200,
      heatmapRiskScore: 0.72,
      heatmapVisitorSpeed: 180,
      heatmapSpeedMultiplier: 0.648,
      predictedVisitorX: 350,
      predictedVisitorY: 240,
      heatmapVisitorId: "visitor-1"
    }), 1000 + i * 100)
  }
  finishFlee(evaluator, "butterfly-1", 1700, 1800)

  const trace = evaluator.fleeEpisodes[0].trace[0]
  assert.equal(trace[11], 0)
  assert.equal(trace[12], 0.72)
  assert.equal(trace[13], 180)
  assert.equal(trace[14], 0.65)
  assert.equal(trace[15], 350)
  assert.equal(trace[16], 240)
  assert.equal(trace[17], "visitor-1")
})
