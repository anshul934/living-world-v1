import "./demo2d.css"

const canvas = document.querySelector("#forest-canvas")
const ctx = canvas.getContext("2d")
const ui = {
  state: document.querySelector("#state-label"),
  stateDot: document.querySelector("#state-dot"),
  stateDescription: document.querySelector("#state-description"),
  fearValue: document.querySelector("#fear-value"),
  fearBar: document.querySelector("#fear-bar"),
  energyValue: document.querySelector("#energy-value"),
  energyBar: document.querySelector("#energy-bar"),
  response: document.querySelector("#forest-response"),
  presence: document.querySelector("#presence-label"),
  toast: document.querySelector("#scene-toast"),
  birdStatus: document.querySelector("#bird-status"),
  birdDot: document.querySelector("#bird-status-dot"),
  discoveryCopy: document.querySelector("#discovery-copy"),
  reset: document.querySelector("#reset-button")
}

const WORLD_W = 1000
const WORLD_H = 650
const MIN_ENERGY = 0.15
const ALERT_DISTANCE = 155
const CLOSE_DISTANCE = 76
const TOUCH_DISTANCE = 31
const SAFE_DISTANCE = 210
const GENTLE_APPROACH_SPEED = 185
const RAPID_APPROACH_SPEED = 310

let viewScale = 1
let offsetX = 0
let offsetY = 0
let lastFrame = performance.now()
let elapsed = 0
let lastUiUpdate = 0
let lastLogTime = 0
let toastUntil = 0
let toastMessage = ""
let visitor = { x: -1000, y: -1000, active: false, approachSpeed: 0 }
let previousVisitorDistance = null
let previousPointerTime = null
let smoothedApproachSpeed = 0
let lastVisitorMoveAt = 0
let lastVisitorWorldX = null
let lastVisitorWorldY = null
let hoveredTreeIndex = -1
let lastHoverHintAt = 0
let clickedTree = null
let birdDiscovered = false
let forestDisturbance = 0
let lastDisturbanceTime = 0

// Timed wildlife encounter: first a bird investigates, then the butterfly,
// and later the second bird briefly takes the visitor's attention.
let visitorStillSince = 0
let firstBirdVisitComplete = false
let secondBirdVisitStarted = false
let secondBirdVisitComplete = false
let butterflyExploreSince = 0
let birdVisitorPhase = "WAITING"
let nextBirdVisitAt = 0
let nextCuriousBirdId = 1
let activeCuriousBirdId = 0

const butterfly = {
  x: 490, y: 325,
  vx: 0, vy: 0,
  state: "REST",
  fear: 0,
  curiosityElapsed: 0,
  curiosityAngle: 0,
  energy: 1,
  restElapsed: 0,
  restDuration: 3.75,
  currentFlower: 0,
  targetFlower: 1,
  targetX: 500,
  targetY: 360,
  escapeX: 650,
  escapeY: 260,
  lastState: "REST",
  flutterPhase: 0,
  landing: 0
}

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
// Only two birds inhabit the forest. They can move between trees when startled.
const birds = [
  { id: 1, treeIndex: 2, revealed: false, flight: null, mode: "PERCHED", phase: 0.3, orbitX: 54, orbitY: 35, orbitRate: .00091, nextMoveAt: performance.now() + 14000 },
  { id: 2, treeIndex: 4, revealed: false, flight: null, mode: "PERCHED", phase: 2.1, orbitX: 67, orbitY: 44, orbitRate: .00117, nextMoveAt: performance.now() + 23000 }
]
const motes = Array.from({ length: 36 }, (_, i) => ({
  x: (i * 197.3 + 53) % WORLD_W,
  y: (i * 91.7 + 21) % WORLD_H,
  size: .7 + (i % 4) * .35,
  phase: i * 1.73
}))
const grasses = Array.from({ length: 155 }, (_, i) => ({
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
    visitor.active = false
    hoveredTreeIndex = -1
    return
  }

  const now = performance.now()
  const movedDistance = lastVisitorWorldX === null
    ? Infinity
    : distance(point.x, point.y, lastVisitorWorldX, lastVisitorWorldY)

  visitor.x = point.x
  visitor.y = point.y
  visitor.active = true

  if (movedDistance > 1.5) {
    lastVisitorMoveAt = now
    lastVisitorWorldX = point.x
    lastVisitorWorldY = point.y
  }

  const d = distance(visitor.x, visitor.y, butterfly.x, butterfly.y)
  if (previousVisitorDistance !== null && previousPointerTime !== null) {
    const dt = (now - previousPointerTime) / 1000
    if (dt > .008 && dt < .25) {
      const raw = Math.max(0, Math.min(700, (previousVisitorDistance - d) / dt))
      smoothedApproachSpeed += (raw - smoothedApproachSpeed) * .16
    }
  }
  previousVisitorDistance = d
  previousPointerTime = now
  visitor.approachSpeed = smoothedApproachSpeed

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
      const hasBirdHere = birds.some((b) => b.treeIndex === actualIndex && !b.flight)
      if (hasBirdHere && now - lastHoverHintAt > 1800) {
        lastHoverHintAt = now
        showToast("Something rustles in the canopy…")
        ui.discoveryCopy.textContent = "Something stirs in these leaves. Stay still and watch—or click the canopy to see what happens."
      }
    }
  }

  forestDisturbance = Math.min(1, forestDisturbance + .035)
  lastDisturbanceTime = now
})
canvas.addEventListener("pointerleave", () => {
  visitor.active = false
  previousVisitorDistance = null
  previousPointerTime = null
  smoothedApproachSpeed = 0
  visitor.approachSpeed = 0
  lastVisitorWorldX = null
  lastVisitorWorldY = null
  lastVisitorMoveAt = 0
  hoveredTreeIndex = -1
})
canvas.addEventListener("pointerdown", (event) => {
  const point = pointerToWorld(event)
  if (point.x < 0 || point.x > WORLD_W || point.y < 0 || point.y > WORLD_H) return

  // Butterfly clicks reveal its live behaviour without making it flee.
  if (distance(point.x, point.y, butterfly.x, butterfly.y) < 30) {
    showToast(`Butterfly: ${butterfly.state} · fear ${Math.round(butterfly.fear * 100)}% · energy ${Math.round(butterfly.energy * 100)}%`)
    return
  }

  // Click the canopy to discover a bird—or startle it into another tree.
  const treeIndex = trees.map((item, index) => ({ item, index }))
    .reverse()
    .find(({ item }) => distance(point.x, point.y, item.x, item.y - 8) < item.r * .9)?.index

  if (treeIndex !== undefined) {
    const now = performance.now()
    const tree = trees[treeIndex]
    clickedTree = tree
    tree.rustle = 1
    forestDisturbance = Math.min(1, forestDisturbance + .35)
    lastDisturbanceTime = now

    const birdHere = birds.find((b) => b.treeIndex === treeIndex && !b.flight && b.mode === "PERCHED")
    if (birdHere) {
      const destinationCandidates = trees
        .map((t, index) => index)
        .filter((index) => index !== treeIndex && !birds.some((b) => b.treeIndex === index && !b.flight))
      const destination = destinationCandidates.length
        ? destinationCandidates[Math.floor(Math.random() * destinationCandidates.length)]
        : (treeIndex + 1) % trees.length
      birdHere.revealed = true
      birdHere.mode = "FLYING"
      birdHere.flight = {
        fromTreeIndex: treeIndex,
        toTreeIndex: destination,
        startTime: now,
        duration: 1050,
        kind: "STARTLED"
      }
      birdDiscovered = true
      ui.birdStatus.textContent = "A bird flew to another tree!"
      ui.birdDot.classList.add("found")
      ui.discoveryCopy.textContent = "You startled a bird. It darted across the clearing and slipped into another tree. Watch the canopy for its new hiding place."
      showToast("A bird flutters out—and hides in another tree!")
      console.log(`[Forest] Bird startled from tree ${treeIndex + 1}; escaping to tree ${destination + 1}.`)
    } else {
      const nearbyBird = birds.find((b) => b.treeIndex === treeIndex && b.flight)
      if (nearbyBird) {
        showToast("The branches shake as something slips deeper into the leaves.")
      } else {
        showToast("The canopy rustles, but nothing comes out.")
        ui.discoveryCopy.textContent = "Not every tree is occupied. Look for a gentle rustle or a bird peeking from the canopy."
      }
    }
  } else {
    forestDisturbance = Math.min(1, forestDisturbance + .12)
    lastDisturbanceTime = performance.now()
    showToast("The grass stirs where you touched the forest.")
  }
})

ui.reset.addEventListener("click", resetEncounter)

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
function showToast(message) {
  toastMessage = message
  toastUntil = performance.now() + 2500
  ui.toast.textContent = message
  ui.toast.classList.add("visible")
}
function chooseFlower(avoidIndex = butterfly.targetFlower) {
  let candidates = flowers.map((_, i) => i).filter((i) => i !== avoidIndex)
  if (!candidates.length) candidates = flowers.map((_, i) => i)
  return candidates[Math.floor(Math.random() * candidates.length)]
}
function chooseEscapeTarget() {
  let dx = butterfly.x - visitor.x
  let dy = butterfly.y - visitor.y
  const length = Math.hypot(dx, dy) || 1
  dx /= length; dy /= length
  const jitter = (Math.random() - .5) * .55
  const cos = Math.cos(jitter), sin = Math.sin(jitter)
  const rx = dx * cos - dy * sin
  const ry = dx * sin + dy * cos
  butterfly.escapeX = clamp(butterfly.x + rx * 155, 38, WORLD_W - 38)
  butterfly.escapeY = clamp(butterfly.y + ry * 135, 65, WORLD_H - 70)
}
function visitorIsCalm(now) {
  return visitor.active &&
    lastVisitorMoveAt > 0 &&
    now - lastVisitorMoveAt > 1150 &&
    visitor.approachSpeed < GENTLE_APPROACH_SPEED * .45
}

function startCuriosity() {
  const angle = Math.atan2(butterfly.y - visitor.y, butterfly.x - visitor.x)
  butterfly.curiosityAngle = angle
  butterfly.curiosityElapsed = 0
  butterfly.vx *= .4
  butterfly.vy *= .4
}

function changeState(next) {
  if (butterfly.state === next) return
  const previous = butterfly.state
  butterfly.state = next
  console.log(`[Butterfly] State: ${previous} → ${next} | Fear: ${Math.round(butterfly.fear * 100)}% | Energy: ${Math.round(butterfly.energy * 100)}%`)
  if (next === "REST") {
    butterfly.restElapsed = 0
    butterfly.vx *= .35
    butterfly.vy *= .35
  }
  if (next === "EXPLORE") {
    butterfly.targetFlower = chooseFlower(butterfly.targetFlower)
    butterfly.targetX = flowers[butterfly.targetFlower].x
    butterfly.targetY = flowers[butterfly.targetFlower].y - 18
  }
  if (next === "FLEE") chooseEscapeTarget()
  if (next === "CURIOUS") {
    startCuriosity()
    if (firstBirdVisitComplete && !secondBirdVisitStarted) butterflyExploreSince = performance.now()
  }
  if (next === "RETURN") {
    const birdIsInvestigating = [
      "BIRD_APPROACHING", "BIRD_EXPLORING", "BIRD_LEAVING"
    ].includes(birdVisitorPhase)
    butterfly.targetFlower = birdIsInvestigating
      ? safestFlowerIndex()
      : nearestFlowerIndex()
    butterfly.targetX = flowers[butterfly.targetFlower].x
    butterfly.targetY = flowers[butterfly.targetFlower].y - 18
  }
}
function nearestFlowerIndex() {
  let best = 0, bestD = Infinity
  flowers.forEach((f, i) => {
    const d = distance(butterfly.x, butterfly.y, f.x, f.y - 18)
    if (d < bestD) { bestD = d; best = i }
  })
  return best
}
function safestFlowerIndex() {
  let best = 0, bestScore = -Infinity
  flowers.forEach((f, i) => {
    const visitorDistance = visitor.active
      ? distance(visitor.x, visitor.y, f.x, f.y - 18)
      : Infinity
    const butterflyDistance = distance(butterfly.x, butterfly.y, f.x, f.y - 18)
    // Strongly prefer flowers outside the visitor's safe-distance radius;
    // if none qualify, select the flower that gives the greatest separation.
    const score = visitorDistance >= SAFE_DISTANCE ? 10000 - butterflyDistance : visitorDistance * 10 - butterflyDistance
    if (score > bestScore) { bestScore = score; best = i }
  })
  return best
}
function updateFear(dt, d, now) {
  const calmVisitor = visitorIsCalm(now)
  const movingTowardButterfly = visitor.active &&
    visitor.approachSpeed > GENTLE_APPROACH_SPEED

  // Proximity alone is not a threat. Fear rises when the visitor is moving
  // toward the butterfly or enters its close personal-space zone while moving.
  if (visitor.active && d < ALERT_DISTANCE &&
      (movingTowardButterfly || (d < CLOSE_DISTANCE && !calmVisitor))) {
    butterfly.fear += .15 * dt
  } else if (!visitor.active || d > SAFE_DISTANCE || calmVisitor) {
    // Stillness is reassuring, even if the visitor remains nearby.
    butterfly.fear -= (calmVisitor ? .075 : .045) * dt
  }
  butterfly.fear = clamp(butterfly.fear, 0, 1)
}
function updateEnergy(dt) {
  // Energy never reaches zero. It recovers during REST only, deliberately slowly.
  if (butterfly.state === "FLEE") butterfly.energy -= .16 * dt
  else if (butterfly.state === "ALERT") butterfly.energy -= .035 * dt
  else if (butterfly.state === "REST") butterfly.energy += .025 * dt
  butterfly.energy = clamp(butterfly.energy, MIN_ENERGY, 1)
}
function updateButterfly(dt) {
  const d = visitor.active ? distance(visitor.x, visitor.y, butterfly.x, butterfly.y) : Infinity
  const approach = visitor.active ? visitor.approachSpeed : 0
  const now = performance.now()
  updateFear(dt, d, now)
  updateEnergy(dt)

  const calmVisitor = visitorIsCalm(now)

  // Let the measured approach speed fade while the pointer is still,
  // otherwise a single earlier movement can keep the butterfly alarmed.
  if (visitor.active && lastVisitorMoveAt > 0 && now - lastVisitorMoveAt > 180) {
    smoothedApproachSpeed *= Math.exp(-dt * 4)
    visitor.approachSpeed = smoothedApproachSpeed
  }

  const birdIsInvestigating = [
    "BIRD_APPROACHING", "BIRD_EXPLORING", "BIRD_LEAVING"
  ].includes(birdVisitorPhase)

  // During either bird's visit, the butterfly yields and stays at a flower.
  // A RESTing butterfly already at its flower is allowed to remain there.
  const restingAtFlower = butterfly.state === "REST" &&
    distance(butterfly.x, butterfly.y, flowers[butterfly.targetFlower].x, flowers[butterfly.targetFlower].y - 18) < 18
  if (birdIsInvestigating && !restingAtFlower) {
    if (butterfly.state !== "RETURN") changeState("RETURN")
  } else if (visitor.active && d <= TOUCH_DISTANCE) {
    changeState("FLEE")
  } else if (butterfly.state === "FLEE" && d < SAFE_DISTANCE &&
             !(calmVisitor && butterfly.fear < .55)) {
    // Keep escaping while the visitor is actively threatening. If the visitor
    // settles and fear has eased, allow the butterfly to recover nearby.
  } else if (visitor.active && approach > RAPID_APPROACH_SPEED && d < ALERT_DISTANCE) {
    changeState("FLEE")
  } else if (
    visitor.active &&
    calmVisitor &&
    d > TOUCH_DISTANCE * 1.8 &&
    d < SAFE_DISTANCE &&
    butterfly.fear < .58
  ) {
    if (butterfly.state !== "CURIOUS") changeState("CURIOUS")
  } else if (butterfly.state === "CURIOUS" && (!visitor.active || d >= SAFE_DISTANCE || !calmVisitor)) {
    if (visitor.active && d < ALERT_DISTANCE) changeState("ALERT")
    else changeState("EXPLORE")
  } else if (visitor.active && d < ALERT_DISTANCE &&
             (approach > GENTLE_APPROACH_SPEED || (d < CLOSE_DISTANCE && !calmVisitor))) {
    changeState("ALERT")
  } else if (butterfly.state === "FLEE" &&
             (!visitor.active || d >= SAFE_DISTANCE || (calmVisitor && butterfly.fear < .55))) {
    changeState("RETURN")
  } else if (butterfly.state === "ALERT" && (!visitor.active || d >= SAFE_DISTANCE)) {
    changeState("RETURN")
  }

  let tx = butterfly.x, ty = butterfly.y, speed = 0
  if (butterfly.state === "REST") {
    butterfly.restElapsed += dt
    if (butterfly.restElapsed >= butterfly.restDuration && butterfly.energy > .22) {
      changeState("EXPLORE")
    }
  } else if (butterfly.state === "EXPLORE") {
    tx = butterfly.targetX; ty = butterfly.targetY
    speed = 77 * (1 - butterfly.fear * .45) * (.72 + butterfly.energy * .28)
    if (distance(butterfly.x, butterfly.y, tx, ty) < 13) {
      butterfly.x = tx; butterfly.y = ty
      changeState("REST")
      speed = 0
    }
    if (visitor.active && d < ALERT_DISTANCE) {
      if (d < CLOSE_DISTANCE) {
        const len = Math.max(d, 1)
        tx = butterfly.x + ((butterfly.x - visitor.x) / len) * 65
        ty = butterfly.y + ((butterfly.y - visitor.y) / len) * 65
        speed = 45
      } else {
        speed *= .52
      }
    }
  } else if (butterfly.state === "ALERT") {
    if (d < CLOSE_DISTANCE && visitor.active) {
      const len = Math.max(d, 1)
      tx = butterfly.x + ((butterfly.x - visitor.x) / len) * 80
      ty = butterfly.y + ((butterfly.y - visitor.y) / len) * 80
      speed = 68
    } else {
      tx = butterfly.targetX; ty = butterfly.targetY
      speed = 42
    }
  } else if (butterfly.state === "CURIOUS") {
    // Approach the visitor's personal space gently, then hover on a small orbit.
    butterfly.curiosityElapsed += dt
    const desiredRadius = 77
    butterfly.curiosityAngle += dt * .48
    tx = visitor.x + Math.cos(butterfly.curiosityAngle) * desiredRadius
    ty = visitor.y + Math.sin(butterfly.curiosityAngle) * desiredRadius * .68
    tx = clamp(tx, 35, WORLD_W - 35)
    ty = clamp(ty, 60, WORLD_H - 60)
    speed = 35 + Math.min(1, butterfly.curiosityElapsed / 1.8) * 10
    if (d < 48) {
      tx = visitor.x + Math.cos(butterfly.curiosityAngle) * 72
      ty = visitor.y + Math.sin(butterfly.curiosityAngle) * 58
      speed = 46
    }
  } else if (butterfly.state === "FLEE") {
    tx = butterfly.escapeX; ty = butterfly.escapeY; speed = 245
    if (distance(butterfly.x, butterfly.y, tx, ty) < 15) {
      // Re-target only if still threatened; otherwise keep this destination.
      if (visitor.active && d < SAFE_DISTANCE) chooseEscapeTarget()
      else speed = 0
    }
  } else if (butterfly.state === "RETURN") {
    tx = butterfly.targetX; ty = butterfly.targetY; speed = 72
    if (distance(butterfly.x, butterfly.y, tx, ty) < 13) {
      butterfly.x = tx; butterfly.y = ty
      changeState("REST")
      speed = 0
    }
  }

  const deltaX = tx - butterfly.x
  const deltaY = ty - butterfly.y
  const len = Math.hypot(deltaX, deltaY)
  let desiredVX = len > 1 ? deltaX / len * speed : 0
  let desiredVY = len > 1 ? deltaY / len * speed : 0
  const response = butterfly.state === "FLEE" ? 12 : 5.5
  const blend = 1 - Math.exp(-response * dt)
  butterfly.vx += (desiredVX - butterfly.vx) * blend
  butterfly.vy += (desiredVY - butterfly.vy) * blend
  butterfly.x = clamp(butterfly.x + butterfly.vx * dt, 26, WORLD_W - 26)
  butterfly.y = clamp(butterfly.y + butterfly.vy * dt, 55, WORLD_H - 55)
  butterfly.flutterPhase += dt * (butterfly.state === "FLEE" ? 22 : 12)
}
function chooseUnoccupiedTree(bird, excludeTree = bird.treeIndex) {
  const candidates = trees
    .map((tree, index) => index)
    .filter((index) =>
      index !== excludeTree &&
      !birds.some((other) => other !== bird &&
        (other.treeIndex === index || other.flight?.toTreeIndex === index))
    )
  return candidates.length ? candidates[Math.floor(Math.random() * candidates.length)] : -1
}

function birdVisitorPosition(bird, now) {
  // Keep this position calculation shared by rendering and flight initiation,
  // so a bird leaves from exactly where it was orbiting instead of teleporting.
  const angle = now * bird.orbitRate + bird.phase
  return {
    x: clamp(visitor.x + Math.cos(angle) * bird.orbitX, 25, WORLD_W - 25),
    y: clamp(visitor.y - 28 + Math.sin(angle) * bird.orbitY, 45, WORLD_H - 45)
  }
}

function randomBetween(min, max) {
  return min + Math.random() * (max - min)
}

function beginBirdFlight(bird, destination, now, kind, duration = 1100) {
  if (destination < 0 || bird.flight) return false
  const fromTree = trees[bird.treeIndex]
  let startX = fromTree.x + fromTree.r * .22
  let startY = fromTree.y + fromTree.r * .15

  if (bird.mode === "EXPLORING_VISITOR" && visitor.active) {
    const current = birdVisitorPosition(bird, now)
    startX = current.x
    startY = current.y
  }

  const flight = {
    fromTreeIndex: bird.treeIndex,
    toTreeIndex: destination,
    startTime: now,
    duration,
    kind,
    startX,
    startY,
    endX: trees[destination].x + trees[destination].r * .22,
    endY: trees[destination].y + trees[destination].r * .15
  }
  bird.flight = flight
  bird.mode = kind === "VISITOR_APPROACH" || kind === "VISITOR_RETURN" ? kind : "FLYING"
  return true
}

function updateBirdVisitorSequence(now) {
  const calm = visitorIsCalm(now)
  const waitingPhases = ["WAITING", "BUTTERFLY_EXPLORING", "WAITING_FOR_NEXT_VISIT", "VISITOR_INTERRUPTED"]

  if (!visitor.active || !calm) {
    visitorStillSince = 0
    // A moving visitor interrupts an active bird visit; the bird returns to a tree.
    for (const bird of birds) {
      if ((bird.mode === "EXPLORING_VISITOR" || bird.mode === "VISITOR_APPROACH") && !bird.flight) {
        const destination = chooseUnoccupiedTree(bird)
        if (destination >= 0) {
          beginBirdFlight(bird, destination, now, "VISITOR_RETURN", randomBetween(1050, 1450))
          birdVisitorPhase = "VISITOR_INTERRUPTED"
        }
      }
    }
    // Don't let an expired timer trigger a bird immediately when the visitor settles again.
    if (waitingPhases.includes(birdVisitorPhase)) nextBirdVisitAt = 0
    return
  }

  if (!visitorStillSince) visitorStillSince = now
  if (!nextBirdVisitAt && waitingPhases.includes(birdVisitorPhase)) {
    nextBirdVisitAt = now + (firstBirdVisitComplete ? randomBetween(10000, 16500) : randomBetween(4200, 7600))
  }

  // Exactly one bird may investigate at a time. Randomly choose among birds that
  // are actually perched; no fixed A/B loop makes their behaviour feel scripted.
  const anotherBirdIsActive = birds.some((bird) =>
    bird.mode === "VISITOR_APPROACH" || bird.mode === "EXPLORING_VISITOR" ||
    (bird.flight && (bird.flight.kind === "VISITOR_APPROACH" || bird.flight.kind === "VISITOR_RETURN"))
  )

  if (waitingPhases.includes(birdVisitorPhase) && now >= nextBirdVisitAt && !anotherBirdIsActive) {
    // Once the butterfly starts exploring, protect at least seven seconds of its turn.
    if (butterfly.state === "CURIOUS" && butterfly.curiosityElapsed < 7) {
      nextBirdVisitAt = now + 500
      return
    }
    const available = birds.filter((bird) => !bird.flight && bird.mode === "PERCHED")
    if (available.length) {
      const bird = available[Math.floor(Math.random() * available.length)]
      const startTree = trees[bird.treeIndex]
      bird.mode = "VISITOR_APPROACH"
      bird.flight = {
        fromTreeIndex: bird.treeIndex,
        toTreeIndex: bird.treeIndex,
        startTime: now,
        duration: randomBetween(950, 1350),
        kind: "VISITOR_APPROACH",
        startX: startTree.x + startTree.r * .22,
        startY: startTree.y + startTree.r * .15,
        endX: visitor.x + (bird.id === 1 ? -35 : 38),
        endY: visitor.y - (bird.id === 1 ? 48 : 42)
      }
      birdVisitorPhase = "BIRD_APPROACHING"
      nextBirdVisitAt = 0
      showToast("A curious bird notices you and comes to investigate.")
    } else {
      nextBirdVisitAt = now + randomBetween(1000, 2200)
    }
  }

  if (birdVisitorPhase === "BIRD_EXPLORING") {
    const bird = birds.find((candidate) => candidate.id === activeCuriousBirdId)
    const visitDuration = bird?.visitDuration || 4000
    if (bird && now - (bird.exploringSince || now) >= visitDuration && !bird.flight) {
      const destination = chooseUnoccupiedTree(bird)
      if (destination >= 0) {
        beginBirdFlight(bird, destination, now, "VISITOR_RETURN", randomBetween(1150, 1550))
        birdVisitorPhase = "BIRD_LEAVING"
      }
    }
  }
}
function updateEnvironment(dt, now) {
  if (now - lastDisturbanceTime > 800) forestDisturbance = Math.max(0, forestDisturbance - dt * .18)
  for (const tree of trees) tree.rustle = Math.max(0, tree.rustle - dt * 1.6)

  updateBirdVisitorSequence(now)

  for (const bird of birds) {
    if (bird.flight) {
      const flight = bird.flight
      if (now - flight.startTime >= flight.duration) {
        const kind = flight.kind
        if (kind === "VISITOR_APPROACH") {
          bird.flight = null
          bird.mode = "EXPLORING_VISITOR"
          bird.exploringSince = now
          bird.visitDuration = randomBetween(3200, 5600)
          bird.nextMoveAt = now + 15000
          activeCuriousBirdId = bird.id
          birdVisitorPhase = "BIRD_EXPLORING"
        } else {
          bird.treeIndex = flight.toTreeIndex
          bird.flight = null
          bird.mode = "PERCHED"
          bird.revealed = false
          bird.exploringSince = 0
          bird.nextMoveAt = now + 12000 + Math.random() * 18000
          if (kind === "VISITOR_RETURN") {
            // The bird is back in the canopy. Let the butterfly have a turn,
            // then alternate to the other bird for the next encounter.
            firstBirdVisitComplete = true
            secondBirdVisitStarted = false
            secondBirdVisitComplete = false
            nextCuriousBirdId = bird.id === 1 ? 2 : 1 // retained for reset/debug UI compatibility
            // A long, variable quiet interval gives the butterfly first claim on the visitor.
            nextBirdVisitAt = now + randomBetween(10000, 16500)
            birdVisitorPhase = "BUTTERFLY_EXPLORING"
            butterflyExploreSince = now
            showToast("The bird has flown back to the canopy. The butterfly can explore again.")
          }
        }
      }
      continue
    }

    if (bird.mode !== "PERCHED") continue
    const tree = trees[bird.treeIndex]
    const visitorDistance = visitor.active ? distance(visitor.x, visitor.y, tree.x, tree.y) : Infinity
    const visitorIsFarFromBird = !visitor.active || visitorDistance > 260

    // Occasional quiet relocation only happens when the visitor is far away and
    // neither bird is in the middle of the staged visitor encounter.
    if (birdVisitorPhase === "WAITING" && now >= bird.nextMoveAt && visitorIsFarFromBird) {
      const destination = chooseUnoccupiedTree(bird)
      if (destination >= 0) beginBirdFlight(bird, destination, now, "RANDOM_RELOCATION", 1100 + Math.random() * 450)
      bird.nextMoveAt = now + 14000 + Math.random() * 22000
    }
  }
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
    if (visitor.active) {
      const d = distance(visitor.x, visitor.y, g.x, g.y)
      const influence = (1 - smoothstep(40, 185, d)) * (0.25 + forestDisturbance)
      lean += clamp((g.x - visitor.x) / 70, -1, 1) * influence * 11
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
  const d = visitor.active ? distance(visitor.x, visitor.y, tree.x, tree.y - 8) : Infinity
  const isHovered = hoveredTreeIndex === index
  const influence = visitor.active ? (1 - smoothstep(35, 190, d)) * (0.35 + forestDisturbance * .65) : 0
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
  // Birds peek from only two occupied trees, and hide when the visitor is close.
  for (const hiddenBird of birds) {
    // Only a genuinely perched bird is drawn in a canopy. An exploring bird
    // must not also be painted at its old tree (the phantom third-bird glitch).
    if (hiddenBird.flight || hiddenBird.mode !== "PERCHED") continue
    if (hiddenBird.treeIndex !== index) continue
    const visitorDistance = visitor.active ? distance(visitor.x, visitor.y, tree.x, tree.y) : Infinity
    const isFar = visitorDistance > 260

    // A nearby visitor never sees the bird—not even when hovering the tree.
    // Birds peek only when the visitor is clearly far from their tree.
    if (!isFar) continue

    const peeking = .76 + Math.sin(now * .0012 + hiddenBird.phase) * .08
    drawBirdAt(tree.x + tree.r * .22, tree.y + tree.r * .22, now, peeking, false, hiddenBird.phase)
  }
}
function drawActiveBirds(now) {
  for (const bird of birds) {
    if (bird.flight) {
      const flight = bird.flight
      const progress = clamp((now - flight.startTime) / flight.duration, 0, 1)
      const from = trees[flight.fromTreeIndex]
      const to = trees[flight.toTreeIndex]
      const startX = flight.startX ?? (from.x + from.r * .22)
      const startY = flight.startY ?? (from.y + from.r * .15)
      const endX = flight.endX ?? (to.x + to.r * .22)
      const endY = flight.endY ?? (to.y + to.r * .15)
      const fx = startX + (endX - startX) * progress
      const fy = startY + (endY - startY) * progress - Math.sin(progress * Math.PI) * 82
      drawBirdAt(fx, fy, now, 1, true, bird.phase)
    } else if (bird.mode === "EXPLORING_VISITOR" && visitor.active) {
      const position = birdVisitorPosition(bird, now)
      drawBirdAt(position.x, position.y, now, .95, false, bird.phase)
    }
  }
}

function drawBirdAt(anchorX, anchorY, now, peek, flying = false, phase = 0) {
  // The bird remains partly behind leaves until it feels safe enough to peek.
  const x = anchorX + 5
  const y = anchorY + 27 - peek * 21 + Math.sin(now * .006 + phase) * 1.8
  const flap = Math.sin(now * .018 + phase) * 5
  ctx.save()
  ctx.globalAlpha = flying ? 1 : .25 + peek * .75
  // Tiny perched bird silhouette.
  ctx.strokeStyle = "#d4d19a"; ctx.lineWidth = 2
  ctx.beginPath(); ctx.moveTo(x - 18, y + 10); ctx.lineTo(x + 17, y + 10); ctx.stroke()
  ctx.fillStyle = "#e0d5a0"
  ctx.beginPath(); ctx.ellipse(x, y, 11, 7, -.15, 0, Math.PI * 2); ctx.fill()
  ctx.beginPath(); ctx.arc(x + 8, y - 7, 5.5, 0, Math.PI * 2); ctx.fill()
  ctx.fillStyle = "#d4a76d"
  ctx.beginPath(); ctx.moveTo(x + 13, y - 7); ctx.lineTo(x + 20, y - 5); ctx.lineTo(x + 13, y - 3); ctx.closePath(); ctx.fill()
  ctx.fillStyle = "#6f9770"
  ctx.beginPath(); ctx.ellipse(x - 2, y - 2, 5, 9, -.6 + flap * .02, 0, Math.PI * 2); ctx.fill()
  ctx.fillStyle = "#172f26"
  ctx.beginPath(); ctx.arc(x + 9, y - 8, 1.2, 0, Math.PI * 2); ctx.fill()
  if (peek > .55 || flying) {
    ctx.strokeStyle = "rgba(240,224,151,.65)"
    ctx.beginPath(); ctx.arc(x, y, 22 + Math.sin(now * .005 + phase) * 2, 0, Math.PI * 2); ctx.stroke()
  }
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
  if (i === butterfly.targetFlower && ["REST", "RETURN"].includes(butterfly.state)) {
    ctx.strokeStyle = "rgba(239,222,153,.35)"
    ctx.beginPath(); ctx.ellipse(f.x, f.y + 4, 22 + Math.sin(now * .004) * 2, 9, 0, 0, Math.PI * 2); ctx.stroke()
  }
}
function drawButterfly(now) {
  const x = butterfly.x, y = butterfly.y
  const flap = Math.sin(butterfly.flutterPhase) * (butterfly.state === "FLEE" ? .65 : .42)
  const wingScale = 1 + flap * .22
  // soft presence shadow
  ctx.fillStyle = "rgba(13,34,27,.24)"
  ctx.beginPath(); ctx.ellipse(x, y + 13, 12, 4, 0, 0, Math.PI * 2); ctx.fill()
  // wings
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(Math.sin(now * .001 + x * .01) * .06)
  ctx.fillStyle = "#e7a9d0"
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
  if (visitor.active && distance(visitor.x, visitor.y, x, y) < ALERT_DISTANCE) {
    ctx.strokeStyle = `rgba(239,221,151,${.22 + Math.sin(now * .006) * .08})`
    ctx.lineWidth = 1.5
    ctx.beginPath(); ctx.arc(x, y, 25 + Math.sin(now * .004) * 3, 0, Math.PI * 2); ctx.stroke()
  }
}
function drawVisitor(now) {
  if (!visitor.active) return
  const d = distance(visitor.x, visitor.y, butterfly.x, butterfly.y)
  const proximity = 1 - smoothstep(45, 240, d)
  // Visible pointer field: the user can always tell where the visitor is.
  const radius = 18 + proximity * 14 + Math.sin(now * .005) * 2
  const halo = ctx.createRadialGradient(visitor.x, visitor.y, 1, visitor.x, visitor.y, 70 + proximity * 20)
  halo.addColorStop(0, `rgba(244,224,156,${.16 + proximity * .12})`)
  halo.addColorStop(1, "rgba(244,224,156,0)")
  ctx.fillStyle = halo; ctx.beginPath(); ctx.arc(visitor.x, visitor.y, 90, 0, Math.PI * 2); ctx.fill()
  ctx.strokeStyle = `rgba(248,229,167,${.65 + proximity * .2})`
  ctx.lineWidth = 1.5
  ctx.beginPath(); ctx.arc(visitor.x, visitor.y, radius, 0, Math.PI * 2); ctx.stroke()
  ctx.strokeStyle = `rgba(248,229,167,${.28 + proximity * .25})`
  ctx.beginPath(); ctx.arc(visitor.x, visitor.y, radius + 8, 0, Math.PI * 2); ctx.stroke()
  ctx.fillStyle = "#f4e4a6"
  ctx.beginPath(); ctx.arc(visitor.x, visitor.y, 2.5, 0, Math.PI * 2); ctx.fill()
  ctx.font = "700 9px DM Sans, sans-serif"
  ctx.textAlign = "center"
  ctx.fillStyle = "rgba(255,243,197,.88)"
  ctx.fillText("YOU", visitor.x, visitor.y + 36)
}
function draw(now) {
  ctx.save()
  ctx.clearRect(-offsetX / viewScale, -offsetY / viewScale, canvas.width / viewScale, canvas.height / viewScale)
  drawBackground(now)
  // Tree order creates a little depth; lower trees overlap more foreground.
  trees
    .map((tree, index) => ({ tree, index }))
    .sort((a, b) => a.tree.y - b.tree.y)
    .forEach(({ tree, index }) => drawTree(tree, index, now))
  flowers.forEach((flower, i) => drawFlower(flower, now, i))
  drawActiveBirds(now)
  // Butterfly is drawn above plants for visibility.
  drawButterfly(now)
  drawVisitor(now)
  ctx.restore()
}
function updateUi(now) {
  if (now - lastUiUpdate < 180) return
  lastUiUpdate = now
  const stateNames = {
    REST: ["RESTING", "Settled among the flowers"],
    EXPLORE: ["EXPLORING", "Moving between flower patches"],
    ALERT: ["CAUTIOUS", "Aware of a nearby visitor"],
    CURIOUS: ["CURIOUS", "Gently investigating a calm visitor"],
    FLEE: ["FLEEING", "Creating space from a disturbance"],
    RETURN: ["RETURNING", "Finding a safe flower again"]
  }
  const [label, desc] = stateNames[butterfly.state]
  ui.state.textContent = label
  ui.stateDescription.textContent = desc
  ui.fearValue.textContent = `${Math.round(butterfly.fear * 100)}%`
  ui.fearBar.style.width = `${butterfly.fear * 100}%`
  ui.energyValue.textContent = `${Math.round(butterfly.energy * 100)}%`
  ui.energyBar.style.width = `${butterfly.energy * 100}%`
  ui.stateDot.style.background = butterfly.state === "FLEE" ? "#eea184" : butterfly.state === "ALERT" ? "#e8d18b" : butterfly.state === "CURIOUS" ? "#d7b8ee" : "#b8df9c"
  ui.presence.textContent = !visitor.active
    ? "WAITING FOR A VISITOR"
    : visitorIsCalm(now)
      ? "VISITOR IS CALM"
      : "VISITOR DETECTED"

  const d = visitor.active ? distance(visitor.x, visitor.y, butterfly.x, butterfly.y) : Infinity
  if (!visitor.active) ui.response.textContent = "Leaves stir softly as the forest waits."
  else if (d < CLOSE_DISTANCE) ui.response.textContent = "The butterfly is making room. Nearby leaves are trembling."
  else if (birdVisitorPhase === "BIRD_APPROACHING" || birdVisitorPhase === "BIRD_EXPLORING") ui.response.textContent = "A curious bird is checking you out. Stay still and give it time."
  else if (birdVisitorPhase === "BIRD_LEAVING") ui.response.textContent = "The bird is returning to the canopy. The butterfly will have the clearing to itself."
  else if (butterfly.state === "CURIOUS") ui.response.textContent = "You have stayed still. The butterfly is curious and is gently coming closer to investigate."
  else if (d < ALERT_DISTANCE) ui.response.textContent = "The forest has noticed you. The butterfly is moving cautiously."
  else if (d < SAFE_DISTANCE) ui.response.textContent = "Your presence is felt nearby. The canopy and grass shift gently."
  else ui.response.textContent = "You are in the clearing. The forest is responding softly to your movement."

  if (now > toastUntil) ui.toast.classList.remove("visible")
  if (now - lastLogTime >= 600) {
    lastLogTime = now
    console.log(`[Butterfly] State: ${butterfly.state} | Fear: ${Math.round(butterfly.fear * 100)}% | Energy: ${Math.round(butterfly.energy * 100)}%`)
  }
}
function resetEncounter() {
  butterfly.x = 490; butterfly.y = 325
  butterfly.vx = 0; butterfly.vy = 0
  butterfly.state = "REST"
  butterfly.fear = 0
  butterfly.energy = 1
  butterfly.restElapsed = 0
  butterfly.targetFlower = 1
  butterfly.targetX = flowers[1].x
  butterfly.targetY = flowers[1].y - 18
  butterfly.escapeX = 650; butterfly.escapeY = 260
  visitor.active = false
  visitor.x = -1000; visitor.y = -1000
  visitor.approachSpeed = 0
  previousVisitorDistance = null
  previousPointerTime = null
  smoothedApproachSpeed = 0
  for (const hiddenBird of birds) {
    hiddenBird.treeIndex = hiddenBird.id === 1 ? 2 : 4
    hiddenBird.revealed = false
    hiddenBird.flight = null
    hiddenBird.mode = "PERCHED"
    hiddenBird.exploringSince = 0
    hiddenBird.visitDuration = 0
    hiddenBird.nextMoveAt = performance.now() + 12000 + Math.random() * 14000
  }
  visitorStillSince = 0
  firstBirdVisitComplete = false
  secondBirdVisitStarted = false
  secondBirdVisitComplete = false
  butterflyExploreSince = 0
  birdVisitorPhase = "WAITING"
  nextBirdVisitAt = 0
  nextCuriousBirdId = 1
  activeCuriousBirdId = 0
  birdDiscovered = false
  trees.forEach((t) => { t.rustle = 0 })
  clickedTree = null
  hoveredTreeIndex = -1
  lastVisitorMoveAt = 0
  lastVisitorWorldX = null
  lastVisitorWorldY = null
  forestDisturbance = 0
  ui.birdStatus.textContent = "Bird not yet discovered"
  ui.birdDot.classList.remove("found")
  ui.discoveryCopy.textContent = "Two birds are hidden among the canopy. Watch for a rustle, then click an occupied tree to see what happens."
  showToast("The forest is ready for a new encounter.")
}
function frame(now) {
  const dt = Math.min(Math.max((now - lastFrame) / 1000, 0), .05)
  lastFrame = now
  elapsed += dt
  updateButterfly(dt)
  updateEnvironment(dt, now)
  draw(now)
  updateUi(now)
  requestAnimationFrame(frame)
}

console.log("[Living World 2D] Demo initialized. Move your pointer into the forest to be noticed.")
requestAnimationFrame(frame)
