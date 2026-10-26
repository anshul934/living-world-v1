import "./demo2d.css"
import { VisitorInput } from "./interaction/VisitorInput.js"
import { CameraInput } from "./CameraInput.js"
import { predictDisturbance } from "./ai/PredictionEngineV3.js"
import { predictDisturbance as predictDisturbanceV2 } from "./ai/PredictionEngineV2.js"
import { estimateTrendClosingSpeed } from "./ai/PredictionTrend.js"
import {
  probabilityWithinRadius,
  scaleHeatmapRiskBySpeed,
  speedRiskMultiplier,
  VisitorHeatmapPredictor
} from "./ai/VisitorHeatmap.js"
import { PredictionEvaluator } from "./ai/PredictionEvaluator.js"

const predictionEvaluator = new PredictionEvaluator ()      // V3 (primary)
const predictionEvaluatorV2 = new PredictionEvaluator ()    // V2 (baseline, same events)
const predictionTrendEvaluator = new PredictionEvaluator ()  // V3 trend-only candidate (shadow)
const predictionHeatmapEvaluator = new PredictionEvaluator () // Visitor heatmap candidate (shadow)
let visitorHeatmapVisible = false
const predictionEvaluators = [
  predictionEvaluator,
  predictionEvaluatorV2,
  predictionTrendEvaluator,
  predictionHeatmapEvaluator
]
window.comparePredictors = () => {
  const keys = ["TP", "FP", "FN", "TN", "samples", "precision", "recall", "falsePositiveRate",
    "fleeEpisodes", "evaluableFleeEpisodes", "evaluableFleeEpisodesWarned", "evaluableEpisodeRecall",
    "evaluableMedianLeadMs", "newDisturbanceCandidateEpisodes", "newDisturbanceCandidateEpisodeRecall",
    "newDisturbanceCandidateMedianLeadMs", "falsePositiveRecordsWithHighFearAndZeroThreat"]
  const a = predictionEvaluator.summary()
  const b = predictionEvaluatorV2.summary()
  const c = predictionTrendEvaluator.summary()
  const d = predictionHeatmapEvaluator.summary()
  console.table(Object.fromEntries(keys.map((k) => [
    k,
    { V3: a[k], V3Trend: c[k], V3Heatmap: d[k], V2: b[k] }
  ])))
}
window.predictionReport = () => {
  console.table({
    V3: predictionEvaluator.summary(),
    V3Trend: predictionTrendEvaluator.summary(),
    V3Heatmap: predictionHeatmapEvaluator.summary(),
    V2: predictionEvaluatorV2.summary()
  })
  console.table([
    ...predictionEvaluator.fleeEpisodes.map((e) => ({ predictor: "V3", ...e })),
    ...predictionTrendEvaluator.fleeEpisodes.map((e) => ({ predictor: "V3Trend", ...e })),
    ...predictionHeatmapEvaluator.fleeEpisodes.map((e) => ({ predictor: "V3Heatmap", ...e }))
  ].map((e) => ({
    predictor: e.predictor,
    creature: e.creatureId, startMs: e.startMs, durationMs: e.durationMs,
    predictionTriggered: e.predictionTriggered,
    predictionSource: e.predictionSource,
    warned: e.warned, leadMs: e.leadMs, measuredLeadMs: e.measuredLeadMs,
    expectedCalmToMovement: e.expectedCalmToMovement,
    eventGroup: e.eventGroup,
    continuingEncounterReflee: e.continuingEncounterReflee,
    sameVisitorAsPreviousFlee: e.sameVisitorAsPreviousFlee,
    intervalSincePreviousFleeEndMs: e.intervalSincePreviousFleeEndMs,
    inputContinuityConcern: e.inputContinuityConcern,
    maxVisitorSpeedBeforeFlee: e.maxVisitorSpeedBeforeFlee,
    highVisitorSpeedSamplesNearFlee: e.highVisitorSpeedSamplesNearFlee,
    visitorAbsenceSamplesNearFlee: e.visitorAbsenceSamplesNearFlee,
    differentVisitorIdSamplesNearFlee: e.differentVisitorIdSamplesNearFlee,
    expectedVisitorId: e.expectedVisitorId,
    expectedCalmStillnessMs: e.expectedCalmStillnessMs,
    noActiveVisitorAtEntry: e.noActiveVisitorAtEntry,
    rapidBoundaryReflee: e.rapidBoundaryReflee,
    intervalSincePreviousFleeMs: e.intervalSincePreviousFleeMs,
    maxCalmDurationMsBeforeFlee: e.maxCalmDurationMsBeforeFlee,
    visitorStillnessThresholdReachedInTrace: e.visitorStillnessThresholdReachedInTrace,
    curiosityObservedInTrace: e.curiosityObservedInTrace,
    curiosityTargetMatchedInTrace: e.curiosityTargetMatchedInTrace,
    stateAtEntry: e.entry?.state,
    visitorId: e.entry?.visitorId,
    visitorSpeed: e.entry?.visitorSpeed,
    heatmapVisitorSpeed: e.entry?.heatmapVisitorSpeed,
    heatmapSpeedMultiplier: e.entry?.heatmapSpeedMultiplier,
    heatmapRiskScore: e.entry?.heatmapRiskScore,
    calmDurationMs: e.entry?.calmDurationMs,
    dist: e.entry?.distance, approach: e.entry?.approachSpeed, threat: e.entry?.threat
  })))
  return predictionEvaluator.records
}
window.downloadPredictions = () => {
  const blob = new Blob(
    [JSON.stringify({
      summary: predictionEvaluator.summary(),
      records: predictionEvaluator.records,
      fleeEpisodes: predictionEvaluator.fleeEpisodes,
      summaryV2: predictionEvaluatorV2.summary(),
      recordsV2: predictionEvaluatorV2.records,
      fleeEpisodesV2: predictionEvaluatorV2.fleeEpisodes,
      summaryV3Trend: predictionTrendEvaluator.summary(),
      recordsV3Trend: predictionTrendEvaluator.records,
      fleeEpisodesV3Trend: predictionTrendEvaluator.fleeEpisodes,
      summaryV3Heatmap: predictionHeatmapEvaluator.summary(),
      recordsV3Heatmap: predictionHeatmapEvaluator.records,
      fleeEpisodesV3Heatmap: predictionHeatmapEvaluator.fleeEpisodes,
      visitorHeatmaps: [...visitorHeatmapForecasts.values()],
      visitorHeatmapAccuracy: [...visitorHeatmapPredictors.entries()].map(
        ([visitorId, predictor]) => ({ visitorId, ...predictor.summary() })
      )
    }, null, 2)],
    { type: "application/json" }
  )
  const a = document.createElement("a")
  a.href = URL.createObjectURL(blob)
  a.download = "prediction-records.json"
  a.click()
}
window.visitorHeatmapReport = () => ({
  forecasts: [...visitorHeatmapForecasts.values()],
  accuracyByVisitor: [...visitorHeatmapPredictors.entries()].map(
    ([visitorId, predictor]) => ({ visitorId, ...predictor.summary() })
  )
})
window.toggleVisitorHeatmap = () => {
  visitorHeatmapVisible = !visitorHeatmapVisible
  return visitorHeatmapVisible
}

const canvas = document.querySelector("#forest-canvas")
const ctx = canvas.getContext("2d")

const videoEl = document.querySelector("#webcam-video")
const statusEl = document.querySelector("#camera-status")

const visitorInput = new VisitorInput(canvas)
const cameraInput = new CameraInput(videoEl, statusEl)

// Initialize camera non-blockingly
cameraInput.init().then(() => {
  visitorInput.setCameraProvider(cameraInput)
})

const WORLD_W = 1000
const WORLD_H = 650
const MIN_ENERGY = 0.15
const ALERT_DISTANCE = 155
const CLOSE_DISTANCE = 76
const TOUCH_DISTANCE = 31
const SAFE_DISTANCE = 210
const VISITOR_DISTURBANCE_DISTANCE = 120
const HAVEN_STILLNESS_MS = 3500
const CURIOSITY_STILLNESS_MS = 2500
const GENTLE_APPROACH_SPEED = 185
const RAPID_APPROACH_SPEED = 310
const THREAT_RADIUS = 260
const PREDICTION_FLEE_DISTANCE = THREAT_RADIUS * (1 - .3)
const PREDICTIVE_FLEE_RECOVERY_MS = 1000
const PREDICTIVE_FLEE_REARM_MS = 850
const PREDICTION_CUE = true

let viewScale = 1
let offsetX = 0
let offsetY = 0
let lastFrame = performance.now()
let visitor = { x: -1000, y: -1000, active: false, approachSpeed: 0 }
let visitors = []
const visitorHavens = new Map()
const visitorCues = new Map()
const previousVisitorDistances = new Map()
let hoveredTreeIndex = -1
let forestDisturbance = 0
let lastDisturbanceTime = 0
let birdCuriosityId = null
let nextBirdCuriosityAt = 0

// Threat intensity is normalized to [0, 1]; vectors point away from the nearest active visitor.
export const ThreatProvider = {
  getThreatAt(x, y, ignoreCalmVisitors = false) {
    let threat = 0
    for (const item of visitors) {
      if (!item.active ||
          (ignoreCalmVisitors && calmOptionsFor(item, performance.now()))) continue
      const intensity = clamp(
        1 - distance(x, y, item.x, item.y) / THREAT_RADIUS,
        0,
        1
      )
      threat = Math.max(threat, intensity)
    }
    return threat
  },
  getThreatVectorAt(x, y, ignoreCalmVisitors = false) {
    const source = closestVisitor(
      x,
      y,
      ignoreCalmVisitors
        ? visitors.filter((item) => !calmOptionsFor(item, performance.now()))
        : visitors
    )
    if (!source) return { x: 0, y: 0 }
    const dx = x - source.x
    const dy = y - source.y
    const length = Math.hypot(dx, dy)
    if (length === 0) return { x: 0, y: 0 }
    return { x: dx / length, y: dy / length }
  }
}

const butterfly = {
  id : "butterfly-1",
  x: 490, y: 325,
  vx: 0, vy: 0,
  state: "REST",
  fear: 0,
  curiosityElapsed: 0,
  curiosityAngle: 0,
  curiosityVisitorId: null,
  nextVisitorSwitchAt: 0,
  energy: 1,
  restElapsed: 0,
  restDuration: 3.75,
  currentFlower: 0,
  targetFlower: 1,
  targetX: 500,
  targetY: 360,
  escapeX: 650,
  escapeY: 260,
  predictionFleeActive: false,
  predictionFleeClearSince: null,
  predictionFleeVisitorId: null,
  predictionFleeSource: null,
  predictionFleeRearmSince: null,
  lastState: "REST",
  flutterPhase: 0,
  bodyAngle: 0,
  orientationTargetAngle: 0,
  orientationStartAngle: 0,
  orientationElapsed: 0,
  orientationActive: false,
  isOrienting: false,
  headingResponse: 11,
  landing: 0,
  color: "#e7a9d0"
}
const secondButterfly = {
  ...butterfly,
  id : "butterfly-2",
  x: 735,
  y: 415,
  vx: 0,
  vy: 0,
  targetFlower: 4,
  targetX: 790,
  targetY: 472,
  curiosityVisitorId: null,
  color: "#a9d2e7"
}
const butterflies = [butterfly, secondButterfly]

const flowers = [
  { x: 155, y: 470, color: "#edb4cc", scale: 1.0 },
  { x: 300, y: 375, color: "#f3d7a0", scale: .82 },
  { x: 435, y: 515, color: "#dcb8ee", scale: .92 },
  { x: 610, y: 445, color: "#f2b6c9", scale: 1.08 },
  { x: 790, y: 490, color: "#e8d99b", scale: .92 },
  { x: 850, y: 340, color: "#d9b8ee", scale: .88 },
  { x: 675, y: 275, color: "#f3c3d6", scale: .78 },
  { x: 370, y: 250, color: "#f0dca9", scale: .85 }
]

const trees = [
  { x: 105, y: 190, r: 74, shade: 0, sway: .2, rustle: 0 },
  { x: 280, y: 145, r: 82, shade: 1, sway: 1.3, rustle: 0 },
  { x: 475, y: 170, r: 88, shade: 2, sway: 2.1, rustle: 0 },
  { x: 700, y: 155, r: 83, shade: 1, sway: 3.4, rustle: 0 },
  { x: 900, y: 200, r: 77, shade: 0, sway: 4.4, rustle: 0 },
  { x: 180, y: 315, r: 55, shade: 2, sway: 5.1, rustle: 0 },
  { x: 840, y: 285, r: 60, shade: 0, sway: 5.8, rustle: 0 }
]
const birds = [
  { id: 1, treeIndex: 2, revealed: false, flight: null, readiness: false, predictionReadiness: false, headingAngle: 0, curiousVisitorId: null, havenVisitorId: null, predictionFleeVisitorId: null, predictionFleeRearmSince: null, nextVisitorSwitchAt: 0, orbitAngle: 0, phase: 0.3 },
  { id: 2, treeIndex: 4, revealed: false, flight: null, readiness: false, predictionReadiness: false, headingAngle: 0, curiousVisitorId: null, havenVisitorId: null, predictionFleeVisitorId: null, predictionFleeRearmSince: null, nextVisitorSwitchAt: 0, orbitAngle: 2.1, phase: 2.1 },
  { id: 3, treeIndex: 0, revealed: false, flight: null, readiness: false, predictionReadiness: false, headingAngle: 0, curiousVisitorId: null, havenVisitorId: null, predictionFleeVisitorId: null, predictionFleeRearmSince: null, nextVisitorSwitchAt: 0, orbitAngle: 1.2, phase: 1.2 },
  { id: 4, treeIndex: 1, revealed: false, flight: null, readiness: false, predictionReadiness: false, headingAngle: 0, curiousVisitorId: null, havenVisitorId: null, predictionFleeVisitorId: null, predictionFleeRearmSince: null, nextVisitorSwitchAt: 0, orbitAngle: 3.7, phase: 3.7 },
  { id: 5, treeIndex: 3, revealed: false, flight: null, readiness: false, predictionReadiness: false, headingAngle: 0, curiousVisitorId: null, havenVisitorId: null, predictionFleeVisitorId: null, predictionFleeRearmSince: null, nextVisitorSwitchAt: 0, orbitAngle: 5.1, phase: 5.1 }
]
// Last actual displayed position of each bird.
// Needed when a visitor disappears during investigation.
const birdLastPositions = new Map()
const motes = Array.from({ length: 36 }, (_, i) => ({
  x: (i * 197.3 + 53) % WORLD_W,
  y: (i * 91.7 + 21) % WORLD_H,
  size: .7 + (i % 4) * .35,
  phase: i * 1.73
}))
const grasses = Array.from({ length: 230 }, (_, i) => ({
  x: (i * 83.17 + 17) % WORLD_W,
  y: 245 + ((i * 47.13 + 19) % 360),
  h: 5 + (i % 5) * 2,
  phase: i * .73
}))

function resizeCanvas() {
  const rect = canvas.getBoundingClientRect()
  const dpr = Math.min(window.devicePixelRatio || 1, 2)
  canvas.width = Math.round(rect.width * dpr)
  canvas.height = Math.round(rect.height * dpr)
  viewScale = Math.min(rect.width / WORLD_W, rect.height / WORLD_H)
  offsetX = (rect.width - WORLD_W * viewScale) / 2
  offsetY = (rect.height - WORLD_H * viewScale) / 2
  ctx.setTransform(dpr * viewScale, 0, 0, dpr * viewScale, dpr * offsetX, dpr * offsetY)
}
window.addEventListener("resize", resizeCanvas)
resizeCanvas()

function pointerToWorld(event) {
  const rect = canvas.getBoundingClientRect()
  return {
    x: (event.clientX - rect.left - offsetX) / viewScale,
    y: (event.clientY - rect.top - offsetY) / viewScale
  }
}

canvas.addEventListener("pointermove", (event) => {
  const point = pointerToWorld(event)
  if (point.x < 0 || point.x > WORLD_W || point.y < 0 || point.y > WORLD_H) {
    hoveredTreeIndex = -1
    return
  }

  const now = performance.now()

  // Hovering over a bird's tree creates a small, deliberate rustle hint.
  const nextHovered = [...trees].reverse().findIndex((item) =>
    distance(point.x, point.y, item.x, item.y - 8) < item.r * .9
  )
  const actualIndex = nextHovered < 0 ? -1 : trees.length - 1 - nextHovered
  if (actualIndex !== hoveredTreeIndex) {
    if (hoveredTreeIndex >= 0) trees[hoveredTreeIndex].rustle = Math.max(trees[hoveredTreeIndex].rustle, .25)
    hoveredTreeIndex = actualIndex
    if (actualIndex >= 0) {
      trees[actualIndex].rustle = 1
    }
  }

  forestDisturbance = Math.min(1, forestDisturbance + .035)
  lastDisturbanceTime = now
})
canvas.addEventListener("pointerleave", () => {
  hoveredTreeIndex = -1
})

function distance(x1, y1, x2, y2) {
  return Math.hypot(x2 - x1, y2 - y1)
}
function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value))
}
function smoothstep(a, b, x) {
  const t = clamp((x - a) / (b - a), 0, 1)
  return t * t * (3 - 2 * t)
}
function chooseFlower(avoidIndex = 0) {
  let candidates = flowers.map((_, i) => i).filter((i) => i !== avoidIndex)
  if (!candidates.length) candidates = flowers.map((_, i) => i)
  return candidates[Math.floor(Math.random() * candidates.length)]
}
function visitorById(id) {
  return visitors.find((item) => item.id === id && item.active) ?? null
}
function calmOptionsFor(item, now) {
  return item.active &&
    item.lastMovedAt > 0 &&
    now - item.lastMovedAt > CURIOSITY_STILLNESS_MS
}
function calmVisitors(now) {
  return visitors.filter((item) =>
    calmOptionsFor(item, now) && !item.havenType
  )
}
function updateVisitorHavens(now) {
  const activeIds = new Set()

  for (const item of visitors) {
    activeIds.add(item.id)
    const gesture = item.gesture === "open-palm" || item.gesture === "fist"
      ? item.gesture
      : null
    const state = visitorHavens.get(item.id)
    if (!gesture || state?.gesture !== gesture) {
      visitorHavens.delete(item.id)
      continue
    }
    if (item.lastMovedAt > state.lastMovedAt) {
      state.lastMovedAt = item.lastMovedAt
      state.gestureStartedAt = now
      state.active = false
    }
  }

  const reservations = new Map()
  for (const item of visitors) {
    const state = visitorHavens.get(item.id)
    if (state?.accepted && !reservations.has(state.gesture)) {
      reservations.set(state.gesture, item.id)
    }
  }

  for (const item of visitors) {
    const gesture = item.gesture === "open-palm" || item.gesture === "fist"
      ? item.gesture
      : null
    let state = visitorHavens.get(item.id)
    if (!gesture) {
      item.havenType = null
      item.havenProgress = 0
      item.havenCharging = false
      item.havenRequestedType = null
      continue
    }
    if (!state || state.gesture !== gesture) {
      state = {
        gesture,
        gestureStartedAt: now,
        lastMovedAt: item.lastMovedAt,
        active: false,
        accepted: false,
        cueShown: false
      }
      visitorHavens.set(item.id, state)
    }

    const reservation = reservations.get(gesture)
    if (reservation === undefined) {
      state.accepted = true
      reservations.set(gesture, item.id)
    } else if (reservation !== item.id) {
      state.accepted = false
      state.active = false
      if (!state.cueShown) {
        const text = reservations.size === 2
          ? "Please wait for more forest creatures"
          : gesture === "open-palm"
            ? "The birds need a safe haven too"
            : "The butterflies need a safe haven too"
        visitorCues.set(item.id, { text, expiresAt: now + 4000 })
        state.cueShown = true
      }
    }

    if (!state.accepted && !reservation) {
      state.accepted = true
      reservations.set(gesture, item.id)
    }
    const stillSince = Math.max(state.gestureStartedAt, state.lastMovedAt)
    const progress = state.accepted
      ? clamp((now - stillSince) / HAVEN_STILLNESS_MS, 0, 1)
      : 0
    state.active = progress >= 1
    item.havenType = state.active
      ? (gesture === "open-palm" ? "butterfly" : "bird")
      : null
    item.havenProgress = progress
    item.havenCharging = state.accepted && !state.active
    item.havenRequestedType = state.accepted
      ? gesture === "open-palm" ? "butterfly" : "bird"
      : null
  }
  for (const id of visitorHavens.keys()) {
    if (!activeIds.has(id)) visitorHavens.delete(id)
  }
  for (const [id, cue] of visitorCues) {
    if (!activeIds.has(id) || now >= cue.expiresAt) visitorCues.delete(id)
  }
}
function chooseVisitor(candidates, currentId = null) {
  if (!candidates.length) return null
  const alternatives = candidates.filter((item) => item.id !== currentId)
  const pool = alternatives.length ? alternatives : candidates
  return pool[Math.floor(Math.random() * pool.length)]
}
function visitorIsDisturbed(target, now) {
  if (target.havenType === "bird") return false
  return visitors.some((other) =>
    other.id !== target.id &&
    other.active &&
    now - other.lastMovedAt < 2500 &&
    distance(other.x, other.y, target.x, target.y) < VISITOR_DISTURBANCE_DISTANCE
  )
}
function updateVisitorApproachSpeeds(dt) {
  const activeIds = new Set()
  for (const item of visitors) {
    activeIds.add(item.id)
    const previous = previousVisitorDistances.get(item.id)
    const creature = butterflies.reduce((closest, candidate) =>
      distance(item.x, item.y, candidate.x, candidate.y) <
        distance(item.x, item.y, closest.x, closest.y)
        ? candidate
        : closest
    )
    const dx = creature.x - item.x
    const dy = creature.y - item.y
    const visitorVelocityX = previous ? (item.x - previous.x) / Math.max(dt, .001) : 0
    const visitorVelocityY = previous ? (item.y - previous.y) / Math.max(dt, .001) : 0
    const rawSpeed = previous
      ? Math.min(700, Math.max(0, (visitorVelocityX * dx + visitorVelocityY * dy) /
        Math.max(distance(item.x, item.y, creature.x, creature.y), 1))
      )
      : 0
      item.velX = visitorVelocityX
      item.velY = visitorVelocityY
      item.approachSpeed = previous
      ? previous.approachSpeed * .6 + rawSpeed * .4
      : 0
    previousVisitorDistances.set(item.id, {
      x: item.x,
      y: item.y,
      approachSpeed: item.approachSpeed
    })
  }
  for (const id of previousVisitorDistances.keys()) {
    if (!activeIds.has(id)) previousVisitorDistances.delete(id)
  }
}
function closestVisitor(x, y, candidates = visitors) {
  let closest = null
  let closestDistance = Infinity
  for (const item of candidates) {
    if (!item.active) continue
    const d = distance(item.x, item.y, x, y)
    if (d < closestDistance) {
      closest = item
      closestDistance = d
    }
  }
  return closest
}
function chooseEscapeTarget(creature, allowDistantEscape = false) {
  const threatVector = ThreatProvider.getThreatVectorAt(creature.x, creature.y, true)
  const currentThreat = ThreatProvider.getThreatAt(creature.x, creature.y, true)
  let safestDirection = { x: threatVector.x, y: threatVector.y }
  let lowestThreat = Infinity
  let bestAlignment = -Infinity

  for (let i = 0; i < 8; i++) {
    const angle = i * Math.PI / 4
    const direction = { x: Math.cos(angle), y: Math.sin(angle) }
    const sampleX = clamp(creature.x + direction.x * 60, 0, WORLD_W)
    const sampleY = clamp(creature.y + direction.y * 60, 0, WORLD_H)
    const sampleThreat = ThreatProvider.getThreatAt(sampleX, sampleY, true)
    const alignment = direction.x * threatVector.x + direction.y * threatVector.y
    if (sampleThreat < lowestThreat - .0001 ||
        (Math.abs(sampleThreat - lowestThreat) <= .0001 && alignment > bestAlignment)) {
      safestDirection = direction
      lowestThreat = sampleThreat
      bestAlignment = alignment
    }
  }

  if (!Number.isFinite(lowestThreat) || (currentThreat === 0 && !allowDistantEscape)) return
  creature.escapeX = clamp(creature.x + safestDirection.x * 155, 38, WORLD_W - 38)
  creature.escapeY = clamp(creature.y + safestDirection.y * 155, 65, WORLD_H - 70)
}
function updateButterflyOrientation(creature, threatLevel, threatVector, dt) {
  if (threatLevel >= .3 || threatLevel < .1) {
    creature.orientationActive = false
    creature.isOrienting = false
    return
  }

  if (Math.hypot(threatVector.x, threatVector.y) > 0) {
    const targetAngle = Math.atan2(threatVector.y, threatVector.x) + Math.PI / 2
    const targetDifference = Math.atan2(
      Math.sin(targetAngle - creature.orientationTargetAngle),
      Math.cos(targetAngle - creature.orientationTargetAngle)
    )
    if (!creature.orientationActive || Math.abs(targetDifference) > .45) {
      creature.orientationStartAngle = creature.bodyAngle
      creature.orientationTargetAngle = targetAngle
      creature.orientationElapsed = 0
      creature.isOrienting = true
    }
    creature.orientationActive = true
  } else {
    creature.orientationActive = false
  }

  if (!creature.isOrienting) return
  creature.orientationElapsed += dt
  const progress = clamp(creature.orientationElapsed / .18, 0, 1)
  const angleDifference = Math.atan2(
    Math.sin(creature.orientationTargetAngle - creature.orientationStartAngle),
    Math.cos(creature.orientationTargetAngle - creature.orientationStartAngle)
  )
  const easedProgress = progress * progress * (3 - 2 * progress)
  creature.bodyAngle = creature.orientationStartAngle + angleDifference * easedProgress
  if (progress === 1) creature.isOrienting = false
}
function startCuriosity(creature, target = visitorById(creature.curiosityVisitorId)) {
  if (!target) return
  const angle = Math.atan2(creature.y - target.y, creature.x - target.x)
  creature.curiosityAngle = angle
  creature.curiosityElapsed = 0
  creature.vx *= .4
  creature.vy *= .4
}

function changeState(
  creature,
  next,
  { predictionTriggered = false, predictionSource = null } = {}
) {
  if (creature.state === next) return
  const previous = creature.state
  creature.state = next
  const reason = predictionTriggered
    ? ` (${predictionSource ?? "predictor"} prediction)`
    : ""
  console.log(`[Butterfly] State: ${previous} → ${next}${reason}`)
  if (next === "FLEE") {
    for (const ev of predictionEvaluators) {
      ev.noteFlee(creature.id, performance.now(), {
        predictionTriggered,
        predictionSource
      })
    }
  }
  if (previous === "FLEE") {
    for (const ev of predictionEvaluators) ev.noteFleeEnd(creature.id, performance.now())
    creature.predictionFleeActive = false
    creature.predictionFleeClearSince = null
    creature.predictionFleeSource = null
  }
  if (next === "REST") {
    creature.restElapsed = 0
    creature.vx *= .35
    creature.vy *= .35
  }
  if (next === "EXPLORE") {
    creature.targetFlower = chooseFlower(creature.targetFlower)
    creature.targetX = flowers[creature.targetFlower].x
    creature.targetY = flowers[creature.targetFlower].y - 18
  }
  if (next === "FLEE") chooseEscapeTarget(creature, predictionTriggered)
  if (next === "CURIOUS") startCuriosity(creature)
  if (next !== "CURIOUS") creature.curiosityVisitorId = null
  if (next === "RETURN") {
    creature.targetFlower = nearestFlowerIndex(creature)
    creature.targetX = flowers[creature.targetFlower].x
    creature.targetY = flowers[creature.targetFlower].y - 18
  }
}
function nearestFlowerIndex(creature) {
  let best = 0, bestD = Infinity
  flowers.forEach((f, i) => {
    const d = distance(creature.x, creature.y, f.x, f.y - 18)
    if (d < bestD) { bestD = d; best = i }
  })
  return best
}
function updateFear(creature, dt, nearest, d, calmVisitor) {
  const movingTowardButterfly = nearest &&
    nearest.approachSpeed > GENTLE_APPROACH_SPEED

  // Proximity alone is not a threat. Fear rises when the visitor is moving
  // toward the butterfly or enters its close personal-space zone while moving.
  if (nearest && d < ALERT_DISTANCE &&
      (movingTowardButterfly || (d < CLOSE_DISTANCE && !calmVisitor))) {
    creature.fear += .15 * dt
  } else if (!nearest || d > SAFE_DISTANCE || calmVisitor) {
    // Stillness is reassuring, even if the visitor remains nearby.
    creature.fear -= (calmVisitor ? .075 : .045) * dt
  }
  creature.fear = clamp(creature.fear, 0, 1)
}
function updateEnergy(creature, dt) {
  // Energy never reaches zero. It recovers during REST only, deliberately slowly.
  if (creature.state === "FLEE") creature.energy -= .16 * dt
  else if (creature.state === "ALERT") creature.energy -= .035 * dt
  else if (creature.state === "REST") creature.energy += .025 * dt
  creature.energy = clamp(creature.energy, MIN_ENERGY, 1)
}
function updateButterflyHaven(creature, target, dt, index) {
  if (creature.state !== "HAVEN") changeState(creature, "HAVEN")
  creature.havenVisitorId = target.id
  creature.orientationActive = false
  creature.isOrienting = false

  const angle = index * Math.PI - Math.PI / 2
  const targetX = target.x + Math.cos(angle) * 21
  const targetY = target.y + Math.sin(angle) * 16
  const dx = targetX - creature.x
  const dy = targetY - creature.y
  const distanceToLanding = Math.hypot(dx, dy)
  const speed = Math.min(100, distanceToLanding * 2.4)
  const blend = 1 - Math.exp(-7 * dt)
  const desiredVX = distanceToLanding > 1 ? dx / distanceToLanding * speed : 0
  const desiredVY = distanceToLanding > 1 ? dy / distanceToLanding * speed : 0
  creature.vx += (desiredVX - creature.vx) * blend
  creature.vy += (desiredVY - creature.vy) * blend
  creature.x = clamp(creature.x + creature.vx * dt, 26, WORLD_W - 26)
  creature.y = clamp(creature.y + creature.vy * dt, 55, WORLD_H - 55)
  updateButterflyHeading(creature, dt)
  creature.fear = Math.max(0, creature.fear - .2 * dt)
  creature.energy = clamp(creature.energy + .025 * dt, MIN_ENERGY, 1)
  creature.flutterPhase += dt * 7
}

const predictionLogTimes = new Map()
const predictionDistanceHistory = new Map()
const visitorHeatmapPredictors = new Map()
const visitorHeatmapForecasts = new Map()
let activeHeatmapVisitorIds = new Set()
// Tracks when each visitor first becomes calm.
const visitorCalmSince = new Map()

function getVisitorCalmDurationMs(visitor, now) {
  if (!visitor || !visitor.active) return 0
  if (!(visitor.lastMovedAt > 0)) return 0
  // Same definition of calm the butterflies actually use (stillness).
  return Math.max(0, now - visitor.lastMovedAt)
}

function updateVisitorHeatmapForecasts(now) {
  const activeVisitorIds = new Set()
  for (const item of visitors) {
    if (!item.active) continue
    activeVisitorIds.add(item.id)
    let predictor = visitorHeatmapPredictors.get(item.id)
    if (!predictor) {
      predictor = new VisitorHeatmapPredictor({
        worldWidth: WORLD_W,
        worldHeight: WORLD_H
      })
      visitorHeatmapPredictors.set(item.id, predictor)
    }
    const forecast = predictor.update({
      visitorId: item.id,
      x: item.x,
      y: item.y
    }, now)
    if (forecast) visitorHeatmapForecasts.set(item.id, forecast)
  }

  for (const visitorId of activeHeatmapVisitorIds) {
    if (!activeVisitorIds.has(visitorId)) {
      visitorHeatmapPredictors.get(visitorId)?.end()
      visitorHeatmapForecasts.delete(visitorId)
    }
  }
  activeHeatmapVisitorIds = activeVisitorIds
}

function predictHeatmapDisturbance(x, y, now) {
  let noDisturbanceProbability = 1
  let strongestVisitor = null

  for (const item of visitors) {
    const visitorRisk = getHeatmapVisitorRisk(item, x, y, now)
    if (visitorRisk === 0) continue
    const forecast = visitorHeatmapForecasts.get(item.id)
    noDisturbanceProbability *= 1 - visitorRisk
    if (!strongestVisitor || visitorRisk > strongestVisitor.riskScore) {
      strongestVisitor = {
        visitorId: item.id,
        predictedX: forecast.predictedX,
        predictedY: forecast.predictedY,
        speed: forecast.speed,
        speedMultiplier: speedRiskMultiplier(forecast.speed),
        riskScore: visitorRisk
      }
    }
  }

  const riskScore = Number((1 - noDisturbanceProbability).toFixed(3))
  return {
    riskScore,
    predictedDisturbance: riskScore >= .5,
    horizonMs: 1500,
    visitorId: strongestVisitor?.visitorId ?? null,
    predictedVisitorX: strongestVisitor?.predictedX ?? null,
    predictedVisitorY: strongestVisitor?.predictedY ?? null,
    visitorSpeed: strongestVisitor?.speed ?? 0,
    speedMultiplier: strongestVisitor?.speedMultiplier ?? 0
  }
}

function getHeatmapVisitorRisk(item, x, y, now) {
  if (!item?.active || calmOptionsFor(item, now)) return 0
  const forecast = visitorHeatmapForecasts.get(item.id)
  if (!forecast) return 0
  const proximityProbability = probabilityWithinRadius(
    forecast,
    x,
    y,
    PREDICTION_FLEE_DISTANCE
  )
  return scaleHeatmapRiskBySpeed(proximityProbability, forecast.speed)
}

function getTrendClosingSpeed(creatureKey, visitorId, distance, now) {
  if (visitorId === null || !Number.isFinite(distance)) {
    predictionDistanceHistory.delete(creatureKey)
    return 0
  }

  const history = (predictionDistanceHistory.get(creatureKey) ?? [])
    .filter((sample) => sample.visitorId === visitorId && now - sample.t <= 900)
  const trendClosingSpeed = estimateTrendClosingSpeed(history, {
    now,
    distance,
    visitorId
  })
  history.push({ t: now, distance, visitorId })
  predictionDistanceHistory.set(creatureKey, history)
  return trendClosingSpeed
}

function logDisturbancePrediction(creature, nearest, d, approach, now) {
  approach = nearest && Number.isFinite(nearest.velX)
    ? Math.max(0, (nearest.velX * (creature.x - nearest.x) +
        nearest.velY * (creature.y - nearest.y)) / Math.max(d, 1))
    : 0
  // Measure continuous calm duration using the existing tracker.
  const calmDurationMs = getVisitorCalmDurationMs(nearest, now)

  const threat = ThreatProvider.getThreatAt(creature.x, creature.y, true)
  const visitorSpeed = nearest && Number.isFinite(nearest.velX) && Number.isFinite(nearest.velY)
    ? Math.hypot(nearest.velX, nearest.velY)
    : 0
  const creatureIndex = butterflies.indexOf(creature)
  const creatureKey =
    creature.id ??
    (creatureIndex >= 0
      ? `butterfly-${creatureIndex + 1}`
      : "unknown-creature")
  const trendClosingSpeed = getTrendClosingSpeed(
    creatureKey,
    nearest?.id ?? null,
    d,
    now
  )
  const predictionHeatmap = predictHeatmapDisturbance(creature.x, creature.y, now)
  const prediction = predictDisturbance({
    distance: d,
    approachSpeed: approach,
    visitorSpeed,
    fear: creature.fear,
    calmDurationMs,
    threat
  })
  const predictionTrend = predictDisturbance({
    distance: d,
    approachSpeed: approach,
    visitorSpeed,
    trendClosingSpeed,
    fear: creature.fear,
    calmDurationMs,
    threat
  })
  const predictionV2 = predictDisturbanceV2({
    distance: d,
    approachSpeed: approach,
    fear: creature.fear,
    calmDurationMs,
    threat
  })
  creature.predictedDisturbance =
    predictionTrend.predictedDisturbance ||
    (predictionHeatmap.predictedDisturbance &&
      predictionHeatmap.visitorId === nearest?.id)

  predictionEvaluator.observe(
    creatureKey,
    prediction,
    {
      state: creature.state,
      visitorId: nearest?.id ?? null,
      curiosityVisitorId: creature.curiosityVisitorId ?? null,
      distance: d,
      approachSpeed: approach,
      trendClosingSpeed,
      visitorSpeed,
      fear: creature.fear,
      threat,
      calmDurationMs
    },
    now
  )

  predictionTrendEvaluator.observe(
    creatureKey,
    predictionTrend,
    {
      state: creature.state,
      visitorId: nearest?.id ?? null,
      curiosityVisitorId: creature.curiosityVisitorId ?? null,
      distance: d,
      approachSpeed: approach,
      trendClosingSpeed,
      visitorSpeed,
      fear: creature.fear,
      threat,
      calmDurationMs
    },
    now
  )

  predictionHeatmapEvaluator.observe(
    creatureKey,
    predictionHeatmap,
    {
      state: creature.state,
      visitorId: nearest?.id ?? null,
      curiosityVisitorId: creature.curiosityVisitorId ?? null,
      distance: d,
      approachSpeed: approach,
      trendClosingSpeed,
      visitorSpeed,
      fear: creature.fear,
      threat,
      calmDurationMs,
      heatmapRiskScore: predictionHeatmap.riskScore,
      heatmapVisitorSpeed: predictionHeatmap.visitorSpeed,
      heatmapSpeedMultiplier: predictionHeatmap.speedMultiplier,
      heatmapVisitorId: predictionHeatmap.visitorId,
      predictedVisitorX: predictionHeatmap.predictedVisitorX,
      predictedVisitorY: predictionHeatmap.predictedVisitorY
    },
    now
  )

  const evaluationInputs = {
    state: creature.state,
    visitorId: nearest?.id ?? null,
    curiosityVisitorId: creature.curiosityVisitorId ?? null,
    distance: d,
    approachSpeed: approach,
    trendClosingSpeed,
    visitorSpeed,
    fear: creature.fear,
    calmDurationMs,
    threat,
    heatmapRiskScore: predictionHeatmap.riskScore,
    heatmapVisitorSpeed: predictionHeatmap.visitorSpeed,
    heatmapSpeedMultiplier: predictionHeatmap.speedMultiplier,
    heatmapVisitorId: predictionHeatmap.visitorId,
    predictedVisitorX: predictionHeatmap.predictedVisitorX,
    predictedVisitorY: predictionHeatmap.predictedVisitorY
  }

  predictionEvaluatorV2.observe(creatureKey, predictionV2, evaluationInputs, now)

  const lastLogAt = predictionLogTimes.get(creatureKey) ?? -Infinity

  // Log at most once per second per creature.
  if (now - lastLogAt >= 1000) {
    predictionLogTimes.set(creatureKey, now)
    const heatmapWarningMatchesVisitor =
      predictionHeatmap.predictedDisturbance &&
      predictionHeatmap.visitorId === nearest?.id
    const behaviorWarning =
      predictionTrend.predictedDisturbance || heatmapWarningMatchesVisitor
    const diagnosticLabel = behaviorWarning
      ? "DISTURBANCE_PREDICTED"
      : "NO_DISTURBANCE_PREDICTED"
    console.log(`[PredictionDiag] ${diagnosticLabel}`, {
      time: Math.round(now),
      creatureId: creatureKey,
      state: creature.state,

      // Inputs used by the predictor.
      visitorId: nearest?.id ?? null,
      visitorActive: Boolean(nearest?.active),
      distance: Number.isFinite(d) ? Math.round(d) : null,
      approachSpeed: Math.round(approach),
      trendClosingSpeed: Math.round(trendClosingSpeed),
      visitorSpeed: Math.round(visitorSpeed),
      fear: Number(creature.fear.toFixed(3)),
      calmDurationMs: Math.round(calmDurationMs),

      // Prediction outputs.
      riskScore: prediction.riskScore,
      predictedDisturbance: prediction.predictedDisturbance,
      behaviorWarning,
      trendRiskScore: predictionTrend.riskScore,
      trendPredictedDisturbance: predictionTrend.predictedDisturbance,
      heatmapRiskScore: predictionHeatmap.riskScore,
      heatmapPredictedDisturbance: predictionHeatmap.predictedDisturbance,
      heatmapWarningMatchesVisitor,
      heatmapVisitorSpeed: Math.round(predictionHeatmap.visitorSpeed),
      heatmapSpeedMultiplier: predictionHeatmap.speedMultiplier,
      predictedVisitorX: predictionHeatmap.predictedVisitorX,
      predictedVisitorY: predictionHeatmap.predictedVisitorY,
      horizonMs: prediction.horizonMs
    })
  }

  // Snapshot recording is deferred until after the state decision below. If this
  // frame causes FLEE, record() sees state === "FLEE" and skips it instead of
  // labelling an already-occurring flee as a prospective prediction success.
  return {
    creatureKey,
    prediction,
    predictionV2,
    predictionTrend,
    predictionHeatmap,
    inputs: evaluationInputs
  }
}


function updateButterfly(creature, dt, now) {
  const threatLevel = ThreatProvider.getThreatAt(creature.x, creature.y, true)
  const threatVector = ThreatProvider.getThreatVectorAt(creature.x, creature.y, true)

  const butterflyHavens = visitors.filter((item) =>
    item.active && item.havenType === "butterfly"
  )
  const currentHaven = visitorById(creature.havenVisitorId)
  const havenTarget = currentHaven?.havenType === "butterfly"
    ? currentHaven
    : chooseVisitor(butterflyHavens, creature.havenVisitorId)
  if (havenTarget) {
    creature.curiosityVisitorId = null
    updateButterflyHaven(creature, havenTarget, dt, butterflies.indexOf(creature))
    return
  }
  if (creature.havenVisitorId) {
    creature.havenVisitorId = null
    if (creature.state === "HAVEN") changeState(creature, "RETURN")
  }

  const closest = closestVisitor(creature.x, creature.y)
  const threatVisitor = closestVisitor(
    creature.x,
    creature.y,
    visitors.filter((item) => {
      const d = distance(item.x, item.y, creature.x, creature.y)
      const visitorIsCalm = calmOptionsFor(item, now)
      return d <= TOUCH_DISTANCE ||
        (d < ALERT_DISTANCE &&
          (item.approachSpeed > GENTLE_APPROACH_SPEED ||
            (d < CLOSE_DISTANCE && !visitorIsCalm)))
    })
  )
  const nearest = threatVisitor ?? closest
  const d = nearest ? distance(nearest.x, nearest.y, creature.x, creature.y) : Infinity
  const approach = nearest?.approachSpeed ?? 0
  const calmOptions = calmVisitors(now)
  const predictionContext = logDisturbancePrediction(creature, nearest, d, approach, now)
  const predictionVisitorId = predictionContext.inputs.visitorId
  if (creature.predictionFleeVisitorId !== null) {
    if (
      predictionVisitorId !== creature.predictionFleeVisitorId ||
      predictionContext.inputs.calmDurationMs >= CURIOSITY_STILLNESS_MS
    ) {
      creature.predictionFleeVisitorId = null
      creature.predictionFleeRearmSince = null
    } else if (
      d >= SAFE_DISTANCE &&
      predictionContext.predictionHeatmap.riskScore < .25 &&
      predictionContext.inputs.trendClosingSpeed <= 0
    ) {
      if (creature.predictionFleeRearmSince === null) {
        creature.predictionFleeRearmSince = now
      } else if (
        now - creature.predictionFleeRearmSince >= PREDICTIVE_FLEE_REARM_MS
      ) {
        creature.predictionFleeVisitorId = null
        creature.predictionFleeRearmSince = null
      }
    } else {
      creature.predictionFleeRearmSince = null
    }
  }
  const trendWarning = predictionContext.predictionTrend.predictedDisturbance
  const heatmapWarning =
    predictionContext.predictionHeatmap.predictedDisturbance &&
    predictionContext.predictionHeatmap.visitorId === predictionVisitorId
  const predictionSource = trendWarning && heatmapWarning
    ? "V3Trend + V3Heatmap"
    : trendWarning
      ? "V3Trend"
      : heatmapWarning
        ? "V3Heatmap"
        : null
  const predictionTriggeredFlee =
    threatLevel < .3 &&
    predictionSource !== null &&
    predictionVisitorId !== creature.predictionFleeVisitorId
  const predictionFleeTriggeredNow =
    predictionTriggeredFlee && creature.state !== "FLEE"
  if (predictionFleeTriggeredNow) {
    creature.predictionFleeActive = true
    creature.predictionFleeClearSince = null
    creature.predictionFleeVisitorId = predictionVisitorId
    creature.predictionFleeSource = predictionSource
    creature.predictionFleeRearmSince = null
  } else if (creature.predictionFleeActive) {
    if (d >= SAFE_DISTANCE && threatLevel < .3 && !predictionTriggeredFlee) {
      if (creature.predictionFleeClearSince === null) {
        creature.predictionFleeClearSince = now
      } else if (now - creature.predictionFleeClearSince >= PREDICTIVE_FLEE_RECOVERY_MS) {
        creature.predictionFleeActive = false
        creature.predictionFleeClearSince = null
      }
    } else {
      creature.predictionFleeClearSince = null
    }
  }
  // Preserve the original state/heading response order while ensuring the
  // current visitor observation exists before changeState("FLEE") records it.
  if (threatLevel >= .3) changeState(creature, "FLEE")
  updateButterflyOrientation(
    creature,
    predictionTriggeredFlee ? .3 : threatLevel,
    threatVector,
    dt
  )
  let curiosityTarget = visitorById(creature.curiosityVisitorId)
  if (
    calmOptions.length &&
    (!curiosityTarget ||
      !calmOptions.some((item) => item.id === curiosityTarget.id) ||
      now >= creature.nextVisitorSwitchAt)
  ) {
    curiosityTarget = chooseVisitor(calmOptions, creature.curiosityVisitorId)
    creature.curiosityVisitorId = curiosityTarget.id
    creature.nextVisitorSwitchAt = now + 4500 + Math.random() * 4000
    if (creature.state === "CURIOUS") startCuriosity(creature, curiosityTarget)
  }
  const isCalm = Boolean(curiosityTarget && calmOptions.some((item) => item.id === curiosityTarget.id))
  const curiosityTargetIsDisturbed = Boolean(
    curiosityTarget && visitorIsDisturbed(curiosityTarget, now)
  )
  const nearestIsCalm = nearest ? calmOptionsFor(nearest, now) : false
  const effectiveThreatLevel = threatLevel
  const nearbyThreat = Boolean(nearest && d < ALERT_DISTANCE && !nearestIsCalm)
  updateFear(creature, dt, nearest, d, nearestIsCalm)
  updateEnergy(creature, dt)

  const visitorTooClose = visitors.some((item) =>
    item.active &&
    !calmOptionsFor(item, now) &&
    distance(item.x, item.y, creature.x, creature.y) <= TOUCH_DISTANCE
  )

  if (
    visitorTooClose ||
    effectiveThreatLevel >= .3 ||
    curiosityTargetIsDisturbed ||
    predictionTriggeredFlee
  ) {
    changeState(creature, "FLEE", {
      predictionTriggered: predictionFleeTriggeredNow,
      predictionSource: predictionFleeTriggeredNow ? predictionSource : null
    })
  } else if (
    creature.state === "FLEE" &&
    (creature.predictionFleeActive ||
      (d < SAFE_DISTANCE && !(nearestIsCalm && creature.fear < .55)))
  ) {
    // Keep escaping while the visitor is actively threatening. If the visitor
    // settles and fear has eased, allow the butterfly to recover nearby.
  } else if (nearest && approach > RAPID_APPROACH_SPEED && d < ALERT_DISTANCE) {
    changeState(creature, "FLEE")
  } else if (
    !nearbyThreat &&
    isCalm &&
    creature.fear < .58
  ) {
    if (creature.state !== "CURIOUS") changeState(creature, "CURIOUS")
  } else if (creature.state === "CURIOUS" && (!isCalm || nearbyThreat)) {
    if (nearest && d < ALERT_DISTANCE) changeState(creature, "ALERT")
    else changeState(creature, "EXPLORE")
  } else if (nearest && d < ALERT_DISTANCE &&
             (approach > GENTLE_APPROACH_SPEED || (d < CLOSE_DISTANCE && !nearestIsCalm))) {
    changeState(creature, "ALERT")
  } else if (creature.state === "FLEE" &&
             (!nearest || d >= SAFE_DISTANCE || (nearestIsCalm && creature.fear < .55))) {
    changeState(creature, "RETURN")
  } else if (creature.state === "ALERT" && (!nearest || d >= SAFE_DISTANCE)) {
    changeState(creature, "RETURN")
  }

  // Record only after behaviour selection. noteFlee() has now seen this frame's
  // observation, and samples from a frame that actually enters FLEE are skipped.
  const snapshotState = predictionContext.inputs.state === "FLEE" || creature.state === "FLEE"
    ? "FLEE"
    : predictionContext.inputs.state
  predictionEvaluator.record(
    predictionContext.creatureKey,
    snapshotState,
    predictionContext.inputs,
    predictionContext.prediction,
    now
  )
  predictionEvaluatorV2.record(
    predictionContext.creatureKey,
    snapshotState,
    predictionContext.inputs,
    predictionContext.predictionV2,
    now
  )
  predictionTrendEvaluator.record(
    predictionContext.creatureKey,
    snapshotState,
    predictionContext.inputs,
    predictionContext.predictionTrend,
    now
  )
  predictionHeatmapEvaluator.record(
    predictionContext.creatureKey,
    snapshotState,
    predictionContext.inputs,
    predictionContext.predictionHeatmap,
    now
  )

  let tx = creature.x, ty = creature.y, speed = 0
  if (creature.state === "REST") {
    creature.restElapsed += dt
    if (creature.restElapsed >= creature.restDuration && creature.energy > .22) {
      changeState(creature, "EXPLORE")
    }
  } else if (creature.state === "EXPLORE") {
    tx = creature.targetX; ty = creature.targetY
    speed = 77 * (1 - creature.fear * .45) * (.72 + creature.energy * .28)
    if (distance(creature.x, creature.y, tx, ty) < 13) {
      creature.x = tx; creature.y = ty
      changeState(creature, "REST")
      speed = 0
    }
    if (nearest && d < ALERT_DISTANCE) {
      if (d < CLOSE_DISTANCE) {
        const len = Math.max(d, 1)
        tx = creature.x + ((creature.x - nearest.x) / len) * 65
        ty = creature.y + ((creature.y - nearest.y) / len) * 65
        speed = 45
      } else {
        speed *= .52
      }
    }
  } else if (creature.state === "ALERT") {
    if (d < CLOSE_DISTANCE && nearest) {
      const len = Math.max(d, 1)
      tx = creature.x + ((creature.x - nearest.x) / len) * 80
      ty = creature.y + ((creature.y - nearest.y) / len) * 80
      speed = 68
    } else {
      tx = creature.targetX; ty = creature.targetY
      speed = 42
    }
  } else if (creature.state === "CURIOUS") {
    // Approach the visitor's personal space gently, then hover on a small orbit.
    creature.curiosityElapsed += dt
    const target = visitorById(creature.curiosityVisitorId) ?? curiosityTarget
    if (!target) {
      changeState(creature, "EXPLORE")
    } else {
      const desiredRadius = 77
      creature.curiosityAngle += dt * .48
      tx = target.x + Math.cos(creature.curiosityAngle) * desiredRadius
      ty = target.y + Math.sin(creature.curiosityAngle) * desiredRadius * .68
      tx = clamp(tx, 35, WORLD_W - 35)
      ty = clamp(ty, 60, WORLD_H - 60)
      speed = 35 + Math.min(1, creature.curiosityElapsed / 1.8) * 10
      if (distance(target.x, target.y, creature.x, creature.y) < 48) {
        tx = target.x + Math.cos(creature.curiosityAngle) * 72
        ty = target.y + Math.sin(creature.curiosityAngle) * 58
        speed = 46
      }
    }
  } else if (creature.state === "FLEE") {
    tx = creature.escapeX; ty = creature.escapeY; speed = 245
    if (distance(creature.x, creature.y, tx, ty) < 15) {
      // Re-target only if still threatened; otherwise keep this destination.
      if (nearest && d < SAFE_DISTANCE) chooseEscapeTarget(creature)
      else speed = 0
    }
  } else if (creature.state === "RETURN") {
    tx = creature.targetX; ty = creature.targetY; speed = 72
    if (distance(creature.x, creature.y, tx, ty) < 13) {
      creature.x = tx; creature.y = ty
      changeState(creature, "REST")
      speed = 0
    }
  }

  if (creature.isOrienting) {
    tx = creature.x
    ty = creature.y
    speed = 0
  }
  const deltaX = tx - creature.x
  const deltaY = ty - creature.y
  const len = Math.hypot(deltaX, deltaY)
  let desiredVX = len > 1 ? deltaX / len * speed : 0
  let desiredVY = len > 1 ? deltaY / len * speed : 0
  const response = creature.state === "FLEE" ? 12 : 5.5
  const blend = 1 - Math.exp(-response * dt)
  creature.vx += (desiredVX - creature.vx) * blend
  creature.vy += (desiredVY - creature.vy) * blend
  creature.x = clamp(creature.x + creature.vx * dt, 26, WORLD_W - 26)
  creature.y = clamp(creature.y + creature.vy * dt, 55, WORLD_H - 55)
  updateButterflyHeading(creature, dt)
  const cue = PREDICTION_CUE && creature.predictedDisturbance && creature.state !== "FLEE"
  creature.flutterPhase += dt * (creature.state === "FLEE" ? 22 : cue ? 17 : 12)
}
function updateButterflyHeading(creature, dt) {
  const movementSpeed = Math.hypot(creature.vx, creature.vy)
  if (creature.isOrienting || movementSpeed <= 8) return
  const targetAngle = Math.atan2(creature.vy, creature.vx) + Math.PI / 2
  const angleDifference = Math.atan2(
    Math.sin(targetAngle - creature.bodyAngle),
    Math.cos(targetAngle - creature.bodyAngle)
  )
  creature.bodyAngle += angleDifference * (1 - Math.exp(-creature.headingResponse * dt))
}
function updateEnvironment(dt, now) {
  if (now - lastDisturbanceTime > 800) forestDisturbance = Math.max(0, forestDisturbance - dt * .18)

  for (const tree of trees) {
    tree.rustle = Math.max(0, tree.rustle - dt * 1.6)
  }

  const calmOptions = calmVisitors(now)
  const birdHavens = visitors.filter((target) =>
    target.active && target.havenType === "bird"
  )

  if (birdCuriosityId !== null) {
    const curiousBird = birds.find((bird) => bird.id === birdCuriosityId)
    const target = visitorById(
      curiousBird?.curiousVisitorId ?? curiousBird?.flight?.toVisitorId
    )
    const curiosityStillValid = target &&
      (target.havenType === "bird" ||
        (calmOptions.some((item) => item.id === target.id) &&
          !visitorIsDisturbed(target, now)))
    if (!curiosityStillValid || now >= (curiousBird?.nextVisitorSwitchAt ?? Infinity)) {
      if (curiousBird && !curiousBird.havenVisitorId) {
        
        
        const curiosityTimerExpired =
          now >= (curiousBird?.nextVisitorSwitchAt ?? Infinity)

        console.log("[BirdCuriosityDiag] END", {
          time: Math.round(now),
          birdId: curiousBird?.id ?? birdCuriosityId,
          visitorId: target?.id ?? null,
          sessionDurationMs: curiousBird
            ? Math.round(
                now - (birdCuriosityStartTimes.get(curiousBird.id) ?? now)
              )
            : null,
          investigationDurationMs: curiousBird &&
            birdInvestigationStartTimes.has(curiousBird.id)
              ? Math.round(
                  now - birdInvestigationStartTimes.get(curiousBird.id)
                )
              : null,  
          reason: curiosityTimerExpired
            ? "INVESTIGATION_TIMER_EXPIRED"
            : !target
              ? "TARGET_MISSING"
              : visitorIsDisturbed(target, now)
                ? "VISITOR_DISTURBED"
                : "CURIOSITY_NO_LONGER_VALID"
        })
        
        if (curiousBird) {
          birdCuriosityStartTimes.delete(curiousBird.id)
          birdInvestigationStartTimes.delete(curiousBird.id)
        }


        lastBirdCuriosityEndAt = now


        const currentPosition = curiousBird.flight
          ? birdFlightPosition(curiousBird, now)
          : curiousBird.curiousVisitorId
            ? birdVisitorPosition(curiousBird, target, now)
            : null
        curiousBird.flight = null
        curiousBird.curiousVisitorId = null
        startBirdFlight(curiousBird, null, now, currentPosition)
      }
      birdCuriosityId = null
      nextBirdCuriosityAt = now + 2500 + Math.random() * 2500
    }
  }

  for (const hiddenBird of birds) {
    const perchPosition = birdTreePosition(hiddenBird)
    const perchPrediction = predictHeatmapDisturbance(
      perchPosition.x,
      perchPosition.y,
      now
    )
    const latchedVisitor = visitorById(hiddenBird.predictionFleeVisitorId)
    if (hiddenBird.predictionFleeVisitorId !== null) {
      const latchedRisk = getHeatmapVisitorRisk(
        latchedVisitor,
        perchPosition.x,
        perchPosition.y,
        now
      )
      if (!latchedVisitor || calmOptionsFor(latchedVisitor, now)) {
        hiddenBird.predictionFleeVisitorId = null
        hiddenBird.predictionFleeRearmSince = null
      } else if (
        distance(
          latchedVisitor.x,
          latchedVisitor.y,
          perchPosition.x,
          perchPosition.y
        ) >= SAFE_DISTANCE &&
        latchedRisk < .25
      ) {
        if (hiddenBird.predictionFleeRearmSince === null) {
          hiddenBird.predictionFleeRearmSince = now
        } else if (
          now - hiddenBird.predictionFleeRearmSince >= PREDICTIVE_FLEE_REARM_MS
        ) {
          hiddenBird.predictionFleeVisitorId = null
          hiddenBird.predictionFleeRearmSince = null
        }
      } else {
        hiddenBird.predictionFleeRearmSince = null
      }
    }
    if (!hiddenBird.flight && !hiddenBird.curiousVisitorId) {
      const perchThreat = ThreatProvider.getThreatAt(perchPosition.x, perchPosition.y)
      hiddenBird.predictionReadiness =
        perchThreat < .3 && perchPrediction.riskScore >= .25
      hiddenBird.readiness =
        (perchThreat >= .3 && perchThreat < .6) ||
        hiddenBird.predictionReadiness
    } else {
      hiddenBird.readiness = false
      hiddenBird.predictionReadiness = false
    }
    updateBirdHeading(hiddenBird, now, dt)

    const currentHaven = visitorById(hiddenBird.havenVisitorId)
    if (hiddenBird.havenVisitorId && currentHaven?.havenType !== "bird") {
      const endedHavenId = hiddenBird.havenVisitorId
      hiddenBird.havenVisitorId = null
      if (hiddenBird.curiousVisitorId === endedHavenId ||
          hiddenBird.flight?.toVisitorId === endedHavenId) {
        const currentPosition = hiddenBird.flight
          ? birdFlightPosition(hiddenBird, now)
          : currentHaven
            ? birdVisitorPosition(hiddenBird, currentHaven, now)
            : birdTreePosition(hiddenBird)
        hiddenBird.flight = null
        hiddenBird.curiousVisitorId = null
        startBirdFlight(hiddenBird, null, now, currentPosition)
        nextBirdCuriosityAt = now + 2500 + Math.random() * 2500
        continue
      }
    }
    const havenTarget = visitorById(hiddenBird.havenVisitorId) ??
      chooseVisitor(birdHavens, hiddenBird.havenVisitorId)
    if (havenTarget) {
      const alreadyAtHaven = hiddenBird.curiousVisitorId === havenTarget.id
      const alreadyFlyingToHaven = hiddenBird.flight?.toVisitorId === havenTarget.id
      if (!alreadyAtHaven && !alreadyFlyingToHaven) {
        const currentPosition = hiddenBird.flight
          ? birdFlightPosition(hiddenBird, now)
          : hiddenBird.curiousVisitorId
            ? birdVisitorPosition(
              hiddenBird,
              visitorById(hiddenBird.curiousVisitorId),
              now
            )
            : null
        hiddenBird.flight = null
        hiddenBird.curiousVisitorId = null
        startBirdFlight(hiddenBird, havenTarget, now, currentPosition)
        continue
      }
      if (alreadyAtHaven) continue
    }

    if (
      !hiddenBird.flight &&
      !hiddenBird.curiousVisitorId &&
      !hiddenBird.havenVisitorId &&
      ThreatProvider.getThreatAt(perchPosition.x, perchPosition.y) < .3 &&
      perchPrediction.predictedDisturbance &&
      perchPrediction.visitorId !== hiddenBird.predictionFleeVisitorId
    ) {
      const destinationTreeIndex = choosePredictiveBirdEscapeTree(
        hiddenBird,
        perchPrediction.predictedVisitorX,
        perchPrediction.predictedVisitorY
      )
      hiddenBird.predictionFleeVisitorId = perchPrediction.visitorId
      hiddenBird.predictionFleeRearmSince = null
      hiddenBird.readiness = false
      hiddenBird.predictionReadiness = false
      startBirdTreeFlight(hiddenBird, destinationTreeIndex, now, 1100)
      hiddenBird.flight.predictionSource = "V3Heatmap"
      console.log("[BirdPrediction] Forecast warning; moving to a safer tree", {
        time: Math.round(now),
        birdId: hiddenBird.id,
        visitorId: perchPrediction.visitorId,
        riskScore: perchPrediction.riskScore,
        predictedVisitorX: Math.round(perchPrediction.predictedVisitorX),
        predictedVisitorY: Math.round(perchPrediction.predictedVisitorY),
        destinationTreeIndex
      })
      continue
    }

    if (hiddenBird.flight) {
      if (hiddenBird.flight.toVisitorId) {
        const target = visitorById(hiddenBird.flight.toVisitorId)
        const stillValid = target &&
          (target.havenType === "bird" ||
            (calmOptions.some((item) => item.id === target.id) &&
              !visitorIsDisturbed(target, now)))
        if (!stillValid) {
          const currentPosition = birdFlightPosition(hiddenBird, now)
          hiddenBird.flight = null
          hiddenBird.curiousVisitorId = null
          if (birdCuriosityId === hiddenBird.id) {
            birdCuriosityId = null
            nextBirdCuriosityAt = now + 2500 + Math.random() * 2500
          }
          startBirdFlight(hiddenBird, null, now, currentPosition)
          continue
        }
      }
      if (now - hiddenBird.flight.startTime < hiddenBird.flight.duration) continue
      const flight = hiddenBird.flight
      if (flight.toVisitorId) {
        const target = visitorById(flight.toVisitorId)
        if (target && (target.havenType === "bird" || calmOptionsFor(target, now))) {
          hiddenBird.flight = null
          hiddenBird.revealed = false
          hiddenBird.curiousVisitorId = target.id
          if (target.havenType !== "bird") {
            birdInvestigationStartTimes.set(hiddenBird.id, now)

            console.log("[BirdCuriosityDiag] ARRIVED", {
              time: Math.round(now),
              birdId: hiddenBird.id,
              visitorId: target.id
            })
          }
          if (target.havenType === "bird") {
            birdCuriosityId = null
          } else {
            hiddenBird.nextVisitorSwitchAt = now + 4500 + Math.random() * 4000
          }
        } else {
          const currentPosition = birdFlightPosition(hiddenBird, now)
          hiddenBird.flight = null
          hiddenBird.revealed = false
          startBirdFlight(hiddenBird, null, now, currentPosition)
        }
      } else {
        hiddenBird.flight = null
        hiddenBird.revealed = false
        hiddenBird.treeIndex = flight.toTreeIndex
      }
      continue
    }

    if (hiddenBird.curiousVisitorId) {
      const currentTarget = visitorById(hiddenBird.curiousVisitorId)
      const isCalm = currentTarget &&
        calmOptions.some((item) => item.id === currentTarget.id) &&
        !visitorIsDisturbed(currentTarget, now)
      if (!isCalm) startBirdFlight(hiddenBird, null, now)
      continue
    }

    if (birdCuriosityId === null && now >= nextBirdCuriosityAt && calmOptions.length) {
      const undisturbedVisitors = calmOptions.filter((target) =>
        !visitorIsDisturbed(target, now)
      )
      const target = chooseVisitor(undisturbedVisitors)
      const availableBirds = birds.filter((bird) =>
        !bird.flight && !bird.curiousVisitorId && !bird.havenVisitorId
      )
      
    if (target && availableBirds.length) {
      const curiousBird =
        availableBirds[Math.floor(Math.random() * availableBirds.length)]

      console.log("[BirdCuriosityDiag] START", {
        time: Math.round(now),
        birdId: curiousBird.id,
        visitorId: target.id,
        gapSincePreviousEndMs: lastBirdCuriosityEndAt === null
          ? null
          : Math.round(now - lastBirdCuriosityEndAt),
        calmVisitorCount: calmOptions.length,
        eligibleVisitorCount: undisturbedVisitors.length,
        availableBirdCount: availableBirds.length,
        scheduledTime: Math.round(nextBirdCuriosityAt),
        waitOverdueMs: Math.round(now - nextBirdCuriosityAt)
      })
      birdCuriosityStartTimes.set(curiousBird.id, now)

      birdCuriosityId = curiousBird.id
      curiousBird.nextVisitorSwitchAt = Infinity
      startBirdFlight(curiousBird, target, now)
      continue
    }

    }
    if (hiddenBird.flight || hiddenBird.havenVisitorId) {
      continue
    }
  }
}

const birdCuriosityStartTimes = new Map()
let lastBirdCuriosityEndAt = null
const birdInvestigationStartTimes = new Map()
const previousBirdDiagnosticStates = new Map()
function getBirdDiagnosticState(bird) {
  if (bird.flight) {
    return bird.flight.toVisitorId != null
      ? "FLYING_TO_VISITOR"
      : "FLYING_TO_TREE"
  }

  if (bird.curiousVisitorId != null) {
    return "INVESTIGATING_VISITOR"
  }

  if (bird.havenVisitorId != null) {
    return "AT_BIRD_HAVEN"
  }

  if (bird.readiness) {
    return "PERCHED_READINESS_FLUTTER"
  }

  return "PERCHED"
}


function logBirdStateChanges(now) {
  for (const bird of birds) {
    const state = getBirdDiagnosticState(bird)
    const previousState = previousBirdDiagnosticStates.get(bird.id)    
    if (
      previousState === "FLYING_TO_VISITOR" &&
      state === "FLYING_TO_TREE"
    ) {
      console.log("[BirdCuriosityDiag] RETURN_TO_TREE", {
        time: Math.round(now),
        birdId: bird.id,
        visitorId: bird.curiousVisitorId ?? null,
        sharedCuriosityOwner: birdCuriosityId,
        reason: birdCuriosityId === bird.id
          ? "SHARED_CURIOSITY_OWNER_STILL_ASSIGNED"
          : "SHARED_CURIOSITY_OWNER_ALREADY_CLEARED"
      })
    }

    // Do not print anything when this bird's state has not changed.
    if (previousState === state) {
      continue
    }

    // Save the new state before the next animation frame.
    previousBirdDiagnosticStates.set(bird.id, state)

    // Calculate the threat score at this bird's current tree.
    const perch = birdTreePosition(bird)
    const threat = ThreatProvider.getThreatAt(perch.x, perch.y)

    // Describe the bird's destination, if it is flying.
    let destination = "none"

    if (bird.flight) {
      destination = bird.flight.toVisitorId != null
        ? `visitor:${bird.flight.toVisitorId}`
        : `tree:${bird.flight.toTreeIndex}`
    }

    const visitorTarget =
      bird.curiousVisitorId ??
      bird.flight?.toVisitorId ??
      "none"

    console.log(
      `[BirdDiag] ${Math.round(now)}ms` +
      ` | bird=${bird.id}` +
      ` | ${previousState ?? "START"} -> ${state}` +
      ` | tree=${bird.treeIndex}` +
      ` | destination=${destination}` +
      ` | visitorTarget=${visitorTarget}` +
      ` | revealed=${bird.revealed}` +
      ` | readiness=${bird.readiness}` +
      ` | predictionReadiness=${bird.predictionReadiness}` +
      ` | predictionSource=${bird.flight?.predictionSource ?? "none"}` +
      ` | perchThreat=${threat.toFixed(2)}`
    )
  }
}



function birdTreePosition(bird) {
  const tree = trees[bird.treeIndex]
  return { x: tree.x + tree.r * .22, y: tree.y + tree.r * .22 }
}
function choosePredictiveBirdEscapeTree(bird, predictedX, predictedY) {
  const availableTrees = trees
    .map((tree, index) => ({ tree, index }))
    .filter(({ index }) =>
      index !== bird.treeIndex &&
      !birds.some((other) => other !== bird &&
        (other.treeIndex === index || other.flight?.toTreeIndex === index))
    )
  const candidates = availableTrees.length
    ? availableTrees
    : trees.map((tree, index) => ({ tree, index }))
      .filter(({ index }) => index !== bird.treeIndex)
  candidates.sort((a, b) =>
    distance(b.tree.x, b.tree.y, predictedX, predictedY) -
    distance(a.tree.x, a.tree.y, predictedX, predictedY)
  )
  return candidates[0]?.index ?? bird.treeIndex
}
function startBirdTreeFlight(bird, destinationTreeIndex, now, duration) {
  const currentTarget = visitorById(bird.curiousVisitorId)
  const from = currentTarget
    ? birdVisitorPosition(bird, currentTarget, now)
    : birdTreePosition(bird)
  const destination = birdTreePosition({ treeIndex: destinationTreeIndex })
  const travelDistance = distance(from.x, from.y, destination.x, destination.y)
  bird.flight = {
    fromX: from.x,
    fromY: from.y,
    toX: destination.x,
    toY: destination.y,
    arcHeight: clamp(travelDistance * .22, 30, 95),
    toVisitorId: null,
    toTreeIndex: destinationTreeIndex,
    startTime: now,
    duration
  }
  bird.curiousVisitorId = null
  bird.havenVisitorId = null
}
function startBirdFlight(bird, target, now, currentPosition = null) {
  const currentTarget = visitorById(bird.curiousVisitorId)
  const lastKnownPosition = birdLastPositions.get(bird.id)

  const from = currentPosition ?? (
    bird.flight
      ? birdFlightPosition(bird, now)
      : bird.curiousVisitorId
        ? currentTarget
          ? birdVisitorPosition(bird, currentTarget, now)
          : lastKnownPosition ?? birdTreePosition(bird)
        : birdTreePosition(bird)
  )

  let destination
  if (target) {
    destination = birdVisitorPosition(bird, target, now)
    bird.havenVisitorId = target.havenType === "bird" ? target.id : null
  } else {
    destination = birdTreePosition(bird)
    bird.havenVisitorId = null
  }
  const travelDistance = distance(from.x, from.y, destination.x, destination.y)
  bird.flight = {
    fromX: from.x,
    fromY: from.y,
    toX: destination.x,
    toY: destination.y,
    arcHeight: clamp(travelDistance * .22, 30, 95),
    toVisitorId: target?.id ?? null,
    toTreeIndex: bird.treeIndex,
    startTime: now,
    duration: clamp(travelDistance / 230, 1.2, 3.5) * 1000
  }
  bird.curiousVisitorId = null
  bird.orbitAngle += Math.PI * (0.7 + Math.random() * .6)
}

function birdVisitorPosition(bird, target, now) {
  // A missing or invalid visitor must never send a bird to (0, 0).
  if (
    !target ||
    !Number.isFinite(target.x) ||
    !Number.isFinite(target.y)
  ) {
    const lastPosition = birdLastPositions.get(bird.id)

    if (
      lastPosition &&
      Number.isFinite(lastPosition.x) &&
      Number.isFinite(lastPosition.y)
    ) {
      return { x: lastPosition.x, y: lastPosition.y }
    }

    // Safe initialization fallback if the bird has never investigated.
    return birdTreePosition(bird)
  }

  const angle = (bird.orbitAngle || 0) + now * 0.0011

  return {
    x: target.x + Math.cos(angle) * 44,
    y: target.y - 28 + Math.sin(angle) * 22
  }
}

function birdFlightPosition(bird, now) {
  const flight = bird.flight
  const progress = smoothstep(0, 1, clamp((now - flight.startTime) / flight.duration, 0, 1))
  const position = {
    x: flight.fromX + (flight.toX - flight.fromX) * progress,
    y: flight.fromY + (flight.toY - flight.fromY) * progress -
      Math.sin(progress * Math.PI) * flight.arcHeight
  }
  flight.lastX = position.x
  flight.lastY = position.y
  return position
}
function updateBirdHeading(bird, now, dt) {
  let directionX = 0
  let directionY = 0
  if (bird.flight) {
    const progress = clamp((now - bird.flight.startTime) / bird.flight.duration, 0, 1)
    directionX = bird.flight.toX - bird.flight.fromX
    directionY = bird.flight.toY - bird.flight.fromY -
      Math.cos(progress * Math.PI) * Math.PI * bird.flight.arcHeight
  } else if (bird.curiousVisitorId) {
    const target = visitorById(bird.curiousVisitorId)
    if (target) {
      const position = birdVisitorPosition(bird, target, now)
      const nextPosition = birdVisitorPosition(bird, target, now + 16)
      directionX = nextPosition.x - position.x
      directionY = nextPosition.y - position.y
    }
  } else {
    directionX = Math.cos(bird.headingAngle)
    directionY = Math.sin(bird.headingAngle)
  }
  if (Math.hypot(directionX, directionY) < .001) return
  const targetAngle = Math.atan2(directionY, directionX)
  const difference = Math.atan2(
    Math.sin(targetAngle - bird.headingAngle),
    Math.cos(targetAngle - bird.headingAngle)
  )
  bird.headingAngle += difference * (1 - Math.exp(-12 * dt))
}
function drawBackground(now) {
  const bg = ctx.createLinearGradient(0, 0, 0, WORLD_H)
  bg.addColorStop(0, "#244a3a")
  bg.addColorStop(.5, "#2c5a40")
  bg.addColorStop(1, "#183b2e")
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, WORLD_W, WORLD_H)

  // Distant canopy bands.
  ctx.fillStyle = "rgba(10,35,28,.24)"
  ctx.beginPath()
  ctx.moveTo(0, 0); ctx.lineTo(WORLD_W, 0); ctx.lineTo(WORLD_W, 135)
  for (let x = WORLD_W; x >= 0; x -= 40) ctx.lineTo(x, 100 + Math.sin(x * .018) * 17 + Math.cos(x * .04) * 8)
  ctx.closePath(); ctx.fill()

  // Patches of filtered sunlight.
  for (let i = 0; i < 7; i++) {
    const x = 80 + i * 147 + Math.sin(now * .00018 + i) * 20
    const y = 210 + (i % 3) * 95
    const glow = ctx.createRadialGradient(x, y, 3, x, y, 115)
    glow.addColorStop(0, "rgba(220,220,135,.09)")
    glow.addColorStop(1, "rgba(220,220,135,0)")
    ctx.fillStyle = glow
    ctx.fillRect(x - 120, y - 120, 240, 240)
  }

  // Soft winding path.
  ctx.beginPath()
  ctx.moveTo(-20, 590); ctx.bezierCurveTo(220, 520, 250, 640, 480, 575)
  ctx.bezierCurveTo(670, 520, 735, 610, 1020, 550)
  ctx.strokeStyle = "rgba(177,157,103,.16)"; ctx.lineWidth = 82; ctx.stroke()
  ctx.strokeStyle = "rgba(225,209,155,.08)"; ctx.lineWidth = 52; ctx.stroke()

  // Foreground grass lines lean away from a nearby visitor.
  for (const g of grasses) {
    let lean = Math.sin(now * .001 + g.phase) * 2
    for (const item of visitors) {
      if (!item.active) continue
      const d = distance(item.x, item.y, g.x, g.y)
      const influence = (1 - smoothstep(40, 185, d)) * (0.25 + forestDisturbance)
      lean += clamp((g.x - item.x) / 70, -1, 1) * influence * 11
    }
    ctx.strokeStyle = "rgba(159,199,125,.35)"
    ctx.lineWidth = 1.2
    ctx.beginPath()
    ctx.moveTo(g.x, g.y); ctx.quadraticCurveTo(g.x + lean * .5, g.y - g.h * .6, g.x + lean, g.y - g.h)
    ctx.stroke()
  }

  // Ambient motes.
  for (const m of motes) {
    const bob = Math.sin(now * .0005 + m.phase) * 8
    const alpha = .15 + (Math.sin(now * .001 + m.phase) + 1) * .12
    ctx.fillStyle = `rgba(226,232,160,${alpha})`
    ctx.beginPath(); ctx.arc(m.x + Math.sin(now * .0002 + m.phase) * 7, m.y + bob, m.size, 0, Math.PI * 2); ctx.fill()
  }
}
function drawTree(tree, index, now) {
  const d = Math.min(...visitors
    .filter((item) => item.active)
    .map((item) => distance(item.x, item.y, tree.x, tree.y - 8)), Infinity)
  const isHovered = hoveredTreeIndex === index
  const influence = Number.isFinite(d) ? (1 - smoothstep(35, 190, d)) * (0.35 + forestDisturbance * .65) : 0
  const rustle = Math.max(tree.rustle, isHovered ? .55 : 0)
  const sway = Math.sin(now * .0013 + tree.sway) * (2 + influence * 7 + rustle * 8)
  const palette = [
    ["#315d3c", "#3c7046", "#477b4c"],
    ["#2a5539", "#356842", "#42784a"],
    ["#386744", "#47794b", "#588552"]
  ][tree.shade]
  // trunk
  ctx.fillStyle = "#72573b"
  ctx.beginPath()
  ctx.moveTo(tree.x - tree.r * .13, tree.y + tree.r * .6)
  ctx.lineTo(tree.x - tree.r * .08, tree.y + tree.r * 1.65)
  ctx.lineTo(tree.x + tree.r * .17, tree.y + tree.r * 1.65)
  ctx.lineTo(tree.x + tree.r * .13, tree.y + tree.r * .6)
  ctx.closePath(); ctx.fill()
  ctx.strokeStyle = "rgba(215,183,125,.22)"; ctx.lineWidth = 3
  ctx.beginPath(); ctx.moveTo(tree.x, tree.y + tree.r * .8); ctx.lineTo(tree.x + 2, tree.y + tree.r * 1.55); ctx.stroke()

  // canopy clusters sway subtly; proximity makes them react visibly.
  const clusters = [
    [-.38, .08, .61], [0, -.2, .72], [.4, .02, .62],
    [-.18, .32, .63], [.25, .34, .59], [0, .08, .72]
  ]
  clusters.forEach(([ox, oy, scale], j) => {
    const x = tree.x + ox * tree.r + sway * (j % 2 ? .65 : 1)
    const y = tree.y + oy * tree.r + Math.sin(now * .001 + tree.sway + j) * (influence * 3 + rustle * 3)
    ctx.fillStyle = palette[j % palette.length]
    ctx.beginPath(); ctx.arc(x, y, tree.r * scale, 0, Math.PI * 2); ctx.fill()
    ctx.fillStyle = "rgba(166,204,119,.10)"
    ctx.beginPath(); ctx.arc(x - tree.r * .18, y - tree.r * .2, tree.r * scale * .42, 0, Math.PI * 2); ctx.fill()
  })

  if (influence > .04 || rustle > .08) {
    ctx.strokeStyle = `rgba(228,220,143,${Math.max(influence * .32, rustle * .22)})`
    ctx.lineWidth = 2
    ctx.beginPath(); ctx.arc(tree.x, tree.y + 2, tree.r * 1.03 + Math.sin(now * .006) * 3, 0, Math.PI * 2); ctx.stroke()
  }
  // Each bird peeks from its own occupied tree and hides when visitors approach.

  // Draw perched birds only. Flying birds are drawn once,
  // after all trees, so they cannot be covered by another canopy.
  for (const hiddenBird of birds) {
    if (hiddenBird.flight || hiddenBird.curiousVisitorId) continue;
    if (hiddenBird.treeIndex !== index) continue;

    const visitorDistance = Math.min(...visitors
      .filter((item) => item.active)
      .map((item) => distance(item.x, item.y, tree.x, tree.y)), Infinity)

    // Hide perched birds while the visitor is close.
    if (visitorDistance <= 110) continue;

    const peeking =
      0.76 + Math.sin(now * 0.0012 + hiddenBird.phase) * 0.08;

    drawBirdAt(
      tree.x + tree.r * 0.22,
      tree.y + tree.r * 0.22,
      now,
      peeking,
      false,
      hiddenBird.phase,
      hiddenBird.readiness,
      hiddenBird.headingAngle
    );
  }
}

function drawFlyingBirds(now) {
  for (const hiddenBird of birds) {
    if (!hiddenBird.flight) continue;

    const position = birdFlightPosition(hiddenBird, now)
    drawBirdAt(position.x, position.y, now, 1, true, hiddenBird.phase, false, hiddenBird.headingAngle);
  }
}


function drawCuriousBirds(now) {
  for (const bird of birds) {
    if (bird.flight || !bird.curiousVisitorId) continue

    const target = visitorById(bird.curiousVisitorId)
    if (!target) continue

    const position = birdVisitorPosition(bird, target, now)

    // Save the actual position used for this frame.
    birdLastPositions.set(bird.id, {
      x: position.x,
      y: position.y
    })

    drawBirdAt(
      position.x,
      position.y,
      now,
      1,
      true,
      bird.phase,
      false,
      bird.headingAngle
    )
  }
}



function drawBirdAt(
  anchorX,
  anchorY,
  now,
  peek,
  flying = false,
  phase = 0,
  readiness = false,
  headingAngle = 0
) {
  // The bird remains partly behind leaves until it feels safe enough to peek.
  const x = anchorX + 5
  const y = anchorY + 27 - peek * 21 + Math.sin(now * .006 + phase) * 1.8
  const flap = flying
    ? Math.sin(now * .035 + phase) * .9
    : readiness
      ? Math.sin(now * .09 + phase) * .75
      : 0
  const bodyWidth = readiness ? 1 + .05 * ((Math.sin(now * .012 + phase) + 1) / 2) : 1
  ctx.save()
  ctx.globalAlpha = flying ? 1 : .25 + peek * .75
  ctx.translate(x, y)
  const facingLeft = Math.cos(headingAngle) < 0
  const tilt = Math.atan2(Math.sin(headingAngle), Math.abs(Math.cos(headingAngle)))
  ctx.rotate(clamp(tilt, -.65, .65))
  ctx.scale(facingLeft ? -1 : 1, 1)
  ctx.fillStyle = "#e0d5a0"
  ctx.beginPath(); ctx.ellipse(0, 0, 11 * bodyWidth, 7, -.15, 0, Math.PI * 2); ctx.fill()
  ctx.beginPath(); ctx.arc(8, -7, 5.5, 0, Math.PI * 2); ctx.fill()
  ctx.fillStyle = "#d4a76d"
  ctx.beginPath(); ctx.moveTo(13, -7); ctx.lineTo(20, -5); ctx.lineTo(13, -3); ctx.closePath(); ctx.fill()
  ctx.fillStyle = "#6f9770"
  ctx.beginPath(); ctx.ellipse(-2, -2, 5, 9, -.6 + flap, 0, Math.PI * 2); ctx.fill()
  ctx.beginPath(); ctx.ellipse(-5, -3, 3.5, 7, .45 - flap * .8, 0, Math.PI * 2); ctx.fill()
  ctx.fillStyle = "#172f26"
  ctx.beginPath(); ctx.arc(9, -8, 1.2, 0, Math.PI * 2); ctx.fill()
  ctx.restore()
}
function drawFlower(f, now, i) {
  const sway = Math.sin(now * .0018 + i * 1.4) * 2
  ctx.strokeStyle = "#83aa69"; ctx.lineWidth = 2.5
  ctx.beginPath(); ctx.moveTo(f.x, f.y + 10); ctx.quadraticCurveTo(f.x + sway, f.y - 2, f.x + sway, f.y - 16 * f.scale); ctx.stroke()
  ctx.fillStyle = "#8db978"
  ctx.beginPath(); ctx.ellipse(f.x - 5, f.y + 1, 7, 3, -.5, 0, Math.PI * 2); ctx.fill()
  const cx = f.x + sway, cy = f.y - 18 * f.scale
  for (let p = 0; p < 6; p++) {
    const a = p * Math.PI / 3 + now * .00015
    ctx.fillStyle = f.color
    ctx.beginPath(); ctx.ellipse(cx + Math.cos(a) * 7 * f.scale, cy + Math.sin(a) * 7 * f.scale, 5 * f.scale, 3.5 * f.scale, a, 0, Math.PI * 2); ctx.fill()
  }
  ctx.fillStyle = "#e8c86f"; ctx.beginPath(); ctx.arc(cx, cy, 3.4 * f.scale, 0, Math.PI * 2); ctx.fill()
  for (const creature of butterflies) {
    if (i === creature.targetFlower && ["REST", "RETURN"].includes(creature.state)) {
      ctx.strokeStyle = "rgba(239,222,153,.35)"
      ctx.beginPath(); ctx.ellipse(f.x, f.y + 4, 22 + Math.sin(now * .004) * 2, 9, 0, 0, Math.PI * 2); ctx.stroke()
    }
  }
}
function drawButterfly(creature, now) {
  const x = creature.x, y = creature.y
  const flap = Math.sin(creature.flutterPhase) * (creature.state === "FLEE" ? .65 : .42)
  const wingScale = 1 + flap * .22
  // soft presence shadow
  ctx.fillStyle = "rgba(13,34,27,.24)"
  ctx.beginPath(); ctx.ellipse(x, y + 13, 12, 4, 0, 0, Math.PI * 2); ctx.fill()
  // wings
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(creature.bodyAngle + Math.sin(now * .001 + x * .01) * .06)
  ctx.fillStyle = creature.color
  ctx.strokeStyle = "#f6d6e9"; ctx.lineWidth = 1.5
  ctx.beginPath(); ctx.ellipse(-7, -5, 10 * wingScale, 14, -.5, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
  ctx.beginPath(); ctx.ellipse(7, -5, 10 * wingScale, 14, .5, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
  ctx.fillStyle = "rgba(255,239,248,.65)"
  ctx.beginPath(); ctx.arc(-9, -9, 2.3, 0, Math.PI * 2); ctx.fill()
  ctx.beginPath(); ctx.arc(9, -9, 2.3, 0, Math.PI * 2); ctx.fill()
  ctx.strokeStyle = "#4c383f"; ctx.lineWidth = 2
  ctx.beginPath(); ctx.moveTo(0, -8); ctx.lineTo(0, 9); ctx.stroke()
  ctx.strokeStyle = "#4c383f"; ctx.lineWidth = 1
  ctx.beginPath(); ctx.moveTo(-1, -7); ctx.quadraticCurveTo(-9, -18, -7, -19); ctx.moveTo(1, -7); ctx.quadraticCurveTo(9, -18, 7, -19); ctx.stroke()
  ctx.restore()
}
function drawVisitor(item, now, index) {
  if (!item.active) return
  const nearestButterflyDistance = Math.min(...butterflies.map((creature) =>
    distance(item.x, item.y, creature.x, creature.y)
  ))
  const d = nearestButterflyDistance
  const proximity = 1 - smoothstep(45, 240, d)
  const isHaven = Boolean(item.havenType)
  const gestureType = item.havenRequestedType
  const havenType = item.havenType ?? gestureType
  const accent = havenType === "butterfly"
    ? { red: 157, green: 229, blue: 210, hex: "#a5e4d2" }
    : { red: 239, green: 199, blue: 130, hex: "#efc782" }
  const pulse = .5 + Math.sin(now * .007) * .5
  const baseRadius = 18 + proximity * 14 + Math.sin(now * .005) * 2
  const havenProgress = gestureType || isHaven ? item.havenProgress ?? 0 : 0
  const easedHavenProgress = smoothstep(0, 1, havenProgress)
  const radius = baseRadius + (61 - baseRadius) * easedHavenProgress
  const colorProgress = gestureType || isHaven ? .18 + easedHavenProgress * .82 : 0
  const markerColor = `rgb(${Math.round(248 + (accent.red - 248) * colorProgress)},${Math.round(229 + (accent.green - 229) * colorProgress)},${Math.round(167 + (accent.blue - 167) * colorProgress)})`
  const haloRadius = 70 + proximity * 20 + easedHavenProgress * 12
  const halo = ctx.createRadialGradient(item.x, item.y, 1, item.x, item.y, haloRadius)
  halo.addColorStop(0, `rgba(${accent.red},${accent.green},${accent.blue},${.16 + proximity * .12 + easedHavenProgress * .08})`)
  halo.addColorStop(1, `rgba(${accent.red},${accent.green},${accent.blue},0)`)
  ctx.fillStyle = halo
  ctx.beginPath(); ctx.arc(item.x, item.y, haloRadius, 0, Math.PI * 2); ctx.fill()
  if (gestureType || isHaven) {
    ctx.fillStyle = `rgba(${accent.red},${accent.green},${accent.blue},${easedHavenProgress * .12})`
    ctx.beginPath(); ctx.arc(item.x, item.y, radius - 2, 0, Math.PI * 2); ctx.fill()
  }
  ctx.strokeStyle = markerColor
  ctx.lineWidth = 1.5
  ctx.beginPath(); ctx.arc(item.x, item.y, radius, 0, Math.PI * 2); ctx.stroke()
  ctx.strokeStyle = `rgba(${accent.red},${accent.green},${accent.blue},${.28 + proximity * .25 + easedHavenProgress * .1})`
  ctx.beginPath(); ctx.arc(item.x, item.y, radius + 8, 0, Math.PI * 2); ctx.stroke()
  if (item.havenCharging) {
    ctx.strokeStyle = `rgba(${accent.red},${accent.green},${accent.blue},${.35 + pulse * .45})`
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.arc(item.x, item.y, 25 + pulse * 4, -Math.PI / 2, Math.PI * 1.5)
    ctx.stroke()
    ctx.strokeStyle = accent.hex
    ctx.lineWidth = 2.5
    ctx.beginPath()
    ctx.arc(item.x, item.y, 25 + pulse * 4, -Math.PI / 2,
      -Math.PI / 2 + Math.PI * 2 * (item.havenProgress ?? 0))
    ctx.stroke()
  }
  ctx.fillStyle = markerColor
  ctx.beginPath(); ctx.arc(item.x, item.y, 2.5, 0, Math.PI * 2); ctx.fill()
  ctx.font = "700 9px DM Sans, sans-serif"
  ctx.textAlign = "center"
  ctx.fillStyle = markerColor
  ctx.fillText(visitors.length > 1 ? `YOU ${index + 1}` : "YOU",
    item.x, item.y + radius + 20)

  const cue = visitorCues.get(item.id)
  if (cue) {
    ctx.font = "600 11px DM Sans, sans-serif"
    const cueWidth = Math.min(ctx.measureText(cue.text).width + 20, WORLD_W - 24)
    const cueHeight = 28
    const cueX = clamp(item.x - cueWidth / 2, 12, WORLD_W - cueWidth - 12)
    const cueY = item.y - radius - cueHeight - 13 < 8
      ? item.y + radius + 37
      : item.y - radius - cueHeight - 13
    ctx.fillStyle = "rgba(12,29,25,.94)"
    ctx.beginPath()
    ctx.roundRect(cueX, cueY, cueWidth, cueHeight, 8)
    ctx.fill()
    ctx.strokeStyle = "rgba(188,231,176,.42)"
    ctx.lineWidth = 1
    ctx.stroke()
    ctx.fillStyle = "#edf3e8"
    ctx.textAlign = "center"
    ctx.textBaseline = "middle"
    ctx.fillText(cue.text, cueX + cueWidth / 2, cueY + cueHeight / 2, cueWidth - 14)
    ctx.textBaseline = "alphabetic"
  }
}
function draw(now) {
  ctx.save()
  ctx.clearRect(-offsetX / viewScale, -offsetY / viewScale, canvas.width / viewScale, canvas.height / viewScale)
  drawBackground(now)
  if (visitorHeatmapVisible) {
    for (const forecast of visitorHeatmapForecasts.values()) {
      const peak = Math.max(...forecast.cells.map((cell) => cell.probability), 0)
      if (peak <= 0) continue
      for (const cell of forecast.cells) {
        const intensity = cell.probability / peak
        if (intensity < .04) continue
        ctx.fillStyle = `rgba(255, 104, 67, ${intensity * .34})`
        ctx.fillRect(
          cell.column * forecast.cellSize,
          cell.row * forecast.cellSize,
          forecast.cellSize,
          forecast.cellSize
        )
      }
    }
  }
  // Tree order creates a little depth; lower trees overlap more foreground.
  trees
    .map((tree, index) => ({ tree, index }))
    .sort((a, b) => a.tree.y - b.tree.y)
    .forEach(({ tree, index }) => drawTree(tree, index, now))
  drawFlyingBirds(now)
  drawCuriousBirds(now)
  flowers.forEach((flower, i) => drawFlower(flower, now, i))
  // Butterfly is drawn above plants for visibility.
  butterflies.forEach((creature) => drawButterfly(creature, now))
  visitors.forEach((item, index) => drawVisitor(item, now, index))
  ctx.restore()
}
function handleForestClick(clickX, clickY) {
  if (butterflies.some((creature) => distance(clickX, clickY, creature.x, creature.y) < 30)) {
    return
  }

  const treeIndex = trees.map((item, index) => ({ item, index }))
    .reverse()
    .find(({ item }) => distance(clickX, clickY, item.x, item.y - 8) < item.r * .9)?.index

  if (treeIndex !== undefined) {
    const now = performance.now()
    const tree = trees[treeIndex]
    tree.rustle = 1
    forestDisturbance = Math.min(1, forestDisturbance + .35)
    lastDisturbanceTime = now

    const birdHere = birds.find((b) => b.treeIndex === treeIndex && !b.flight)
    if (birdHere) {
      const destinationCandidates = trees
        .map((t, index) => index)
        .filter((index) =>
          index !== treeIndex &&
          !birds.some((bird) => bird !== birdHere &&
            (bird.treeIndex === index || bird.flight?.toTreeIndex === index))
        )
      birdHere.revealed = true
      if (destinationCandidates.length) {
        const destination = destinationCandidates[
          Math.floor(Math.random() * destinationCandidates.length)
        ]
        startBirdTreeFlight(birdHere, destination, now, 850)
      }
    }
  } else {
    forestDisturbance = Math.min(1, forestDisturbance + .12)
    lastDisturbanceTime = performance.now()
  }
}

function frame(now) {
  const dt = Math.min(Math.max((now - lastFrame) / 1000, 0), .05)
  lastFrame = now
  // 1. Update modular input provider
  visitorInput.update(WORLD_W, WORLD_H)
  visitors = visitorInput.getVisitors()
  updateVisitorHeatmapForecasts(now)
  updateVisitorApproachSpeeds(dt)
  updateVisitorHavens(now)

  // Keep legacy single-visitor consumers focused on the closest visitor.
  const nearestVisitor = closestVisitor(butterfly.x, butterfly.y)
  visitor = nearestVisitor
    ? { ...nearestVisitor, approachSpeed: nearestVisitor.approachSpeed }
    : { x: -1000, y: -1000, active: false, approachSpeed: 0 }

  // 3. Handle click/pinch triggers
  for (const item of visitors) {
    if (item.isClicked) handleForestClick(item.clickX ?? item.x, item.clickY ?? item.y)
  }

  // 4. Run existing updates & renders
  for (const creature of butterflies) updateButterfly(creature, dt, now)
  updateEnvironment(dt, now)
  logBirdStateChanges(now)
  for (const ev of predictionEvaluators) ev.resolve(now)
  draw(now)
  requestAnimationFrame(frame)
}

console.log("[Living World 2D] Demo initialized. Move your pointer into the forest to be noticed.")
requestAnimationFrame(frame)