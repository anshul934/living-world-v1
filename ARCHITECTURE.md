# LIVING WORLD — V1

## Architecture Specification

---

# 1. Purpose

This document defines the technical architecture of the LIVING WORLD V1 browser prototype.

The architecture is designed around a simple principle:

> Input, interaction, behavior, movement, and rendering should remain separate systems.

The current prototype uses mouse input, but the architecture is designed so that mouse input can later be replaced with camera/body-tracking input without requiring a rewrite of the creature behavior system.

---

# 2. High-Level Architecture

The current architecture is:

```text
┌─────────────────────┐
│   Visitor Input     │
│   Mouse             │
└──────────┬──────────┘
           │
           │ Visitor State
           ↓
┌─────────────────────┐
│ Interaction Engine  │
└──────────┬──────────┘
           │
           │ Interaction Data
           ↓
┌─────────────────────┐
│  Behavior Engine    │
│  State Machine      │
└──────────┬──────────┘
           │
           │ Behavior Decision
           ↓
┌─────────────────────┐
│ Butterfly Movement  │
└──────────┬──────────┘
           │
           ↓
┌─────────────────────┐
│ Three.js Rendering  │
└─────────────────────┘
```

The intended future architecture is:

```text
                 ┌──────────────────┐
                 │ Visitor Input    │
                 │ Mouse / Camera   │
                 └────────┬─────────┘
                          ↓
                 ┌──────────────────┐
                 │ Interaction     │
                 │ Engine          │
                 └────────┬─────────┘
                          ↓
                 ┌──────────────────┐
                 │ Feature          │
                 │ Extraction      │
                 └────────┬─────────┘
                          ↓
                 ┌──────────────────┐
                 │ Behavior Brain   │
                 │ Rules / ML       │
                 └────────┬─────────┘
                          ↓
                 ┌──────────────────┐
                 │ Movement         │
                 │ Controller       │
                 └────────┬─────────┘
                          ↓
                 ┌──────────────────┐
                 │ Three.js         │
                 │ Rendering        │
                 └──────────────────┘
```

---

# 3. Design Principles

## 3.1 Separation of Responsibilities

Each system should have one primary responsibility.

```text
VisitorInput
    ↓
"Where is the visitor?"

InteractionEngine
    ↓
"How is the visitor affecting the butterfly?"

BehaviorEngine
    ↓
"What should the butterfly do?"

Movement
    ↓
"How should the butterfly physically move?"

Three.js
    ↓
"How should the world be rendered?"
```

---

## 3.2 Rendering Must Not Determine Behavior

Three.js is responsible for visualization.

The behavior system should not depend on:

```text
Mesh
Material
Geometry
Camera
Renderer
```

unless absolutely necessary.

The behavior engine should work primarily with numerical world-state information.

---

## 3.3 Input Must Be Replaceable

The butterfly should not know whether the visitor came from:

```text
Mouse
```

or:

```text
Webcam
```

or:

```text
MediaPipe
```

The input layer must normalize all sources into the same visitor-state representation.

---

# 4. Runtime Data Flow

The current frame-by-frame pipeline is:

```text
requestAnimationFrame()
        ↓
VisitorInput state
        ↓
InteractionEngine
        ↓
BehaviorEngine
        ↓
Butterfly.update()
        ↓
renderer.render()
```

The important rule is:

> The animation loop coordinates systems; individual systems should remain responsible for their own domain.

---

# 5. Main Application

File:

```text
src/main.js
```

Responsibilities:

* create the Three.js scene
* create the camera
* create the renderer
* create lights
* create world objects
* create visitor input
* create interaction engine
* create behavior engine
* run the animation loop
* coordinate system updates
* render the scene

`main.js` should not contain complex butterfly behavior rules.

---

# 6. VisitorInput

File:

```text
src/interaction/VisitorInput.js
```

Responsibility:

> Convert physical user input into normalized visitor state.

The current physical input source is the mouse.

---

# 7. Visitor Input Contract

The visitor state exposed to the rest of the system is conceptually:

```js
{
  x: Number,
  y: Number,
  speed: Number,
  isMoving: Boolean
}
```

Internally, `VisitorInput` also maintains:

```js
hasInput
```

`hasInput` is not part of the external behavioral contract.

It is an initialization guard.

---

# 8. Visitor Position Coordinate System

Visitor position is stored in Three.js world coordinates.

The mouse starts in browser/screen coordinates:

```text
(clientX, clientY)
```

The conversion process is:

```text
Screen coordinates
       ↓
Canvas-relative coordinates
       ↓
Normalized Device Coordinates
       ↓
Camera ray
       ↓
Ground-plane intersection
       ↓
World coordinates
```

---

# 9. Canvas Coordinate Conversion

The rendering canvas is obtained from:

```js
renderer.domElement
```

The canvas bounds are obtained with:

```js
domElement.getBoundingClientRect()
```

The relative mouse coordinates are:

```js
const mouseX =
  event.clientX - rect.left

const mouseY =
  event.clientY - rect.top
```

Normalized device coordinates are then calculated as:

```js
mouse.x =
  (mouseX / rect.width) * 2 - 1

mouse.y =
  -(mouseY / rect.height) * 2 + 1
```

The resulting range is:

```text
x = -1 → +1
y = -1 → +1
```

---

# 10. Raycasting

The raycaster is:

```js
THREE.Raycaster
```

It is configured using:

```js
raycaster.setFromCamera(
  mouse,
  camera
)
```

The ray is then intersected with:

```js
new THREE.Plane(
  new THREE.Vector3(0, 1, 0),
  0
)
```

This represents the horizontal plane:

```text
Y = 0
```

The resulting intersection point becomes:

```text
visitor.position
```

---

# 11. Visitor Speed

Visitor speed is currently calculated using world-space distance between:

```text
current position
```

and:

```text
previous position
```

Conceptually:

```js
speed =
  current.distanceTo(
    previous
  )
```

This is currently a per-frame displacement value.

It is not yet normalized to physical units per second.

This can be improved later if needed.

---

# 12. Movement Threshold

Tiny mouse movements should not necessarily count as intentional visitor movement.

The current threshold is approximately:

```text
0.001
```

Therefore:

```js
isMoving =
  speed > 0.001
```

This prevents insignificant numerical changes from constantly triggering movement behavior.

---

# 13. InteractionEngine

File:

```text
src/interaction/InteractionEngine.js
```

Responsibility:

> Translate visitor state and butterfly position into environmental interaction information.

It does not decide the butterfly's final behavior state.

---

# 14. Interaction Engine Contract

The interaction engine returns:

```js
{
  distance: Number,
  isDanger: Boolean,
  escapeDirection: THREE.Vector3
}
```

---

# 15. Distance Calculation

Distance is currently calculated horizontally using X and Z.

Given:

```text
Butterfly = (bx, bz)
Visitor   = (vx, vz)
```

the differences are:

```text
dx = bx - vx
dz = bz - vz
```

Distance is:

```text
sqrt(
  dx² + dz²
)
```

This intentionally ignores Y.

The current interaction model is primarily horizontal.

---

# 16. Escape Direction

Escape direction is:

```text
Butterfly position
-
Visitor position
```

Conceptually:

```js
new THREE.Vector3(
  butterfly.x - visitor.x,
  0,
  butterfly.z - visitor.z
)
```

The vector is normalized when the distance is non-zero.

The result points away from the visitor.

---

# 17. Initial Input Guard

If the visitor has not interacted with the scene yet:

```js
hasInput === false
```

the interaction engine returns:

```js
{
  distance: Infinity,
  isDanger: false,
  escapeDirection:
    new THREE.Vector3()
}
```

This prevents false initial interaction.

---

# 18. Interaction Distances

Current behavior thresholds are approximately:

```text
ALERT distance = 7
FLEE distance  = 5
SAFE distance  = 8
```

These represent behavioral thresholds rather than physical real-world measurements.

They can later be tuned through configuration.

---

# 19. BehaviorEngine

File:

```text
src/ai/BehaviorEngine.js
```

Responsibility:

> Decide the butterfly's high-level behavioral state and movement intent.

It does not directly manipulate the Three.js mesh.

---

# 20. Butterfly State Machine

Current states:

```text
REST
EXPLORE
ALERT
FLEE
RETURN
```

---

# 21. State Definitions

## REST

Meaning:

```text
Butterfly is calm and stationary.
```

Behavior:

* no movement
* waits for visitor disturbance
* starts an exploration timer

Transitions:

```text
REST → ALERT
```

when:

```text
distance < alertDistance
```

and:

```text
REST → EXPLORE
```

after the rest timer expires.

---

# 22. EXPLORE

Meaning:

```text
Butterfly is calmly wandering.
```

Behavior:

* move toward an exploration target
* periodically select a new target
* remain inside the safe exploration area

Transitions:

```text
EXPLORE → ALERT
```

when:

```text
distance < alertDistance
```

---

# 23. ALERT

Meaning:

```text
Butterfly has noticed the visitor.
```

Behavior:

* remain cautious
* prepare to flee if the visitor gets closer
* may continue limited movement

Transitions:

```text
ALERT → FLEE
```

when:

```text
distance < fleeDistance
```

and:

```text
ALERT → RETURN
```

when:

```text
distance >= safeDistance
```

---

# 24. FLEE

Meaning:

```text
Butterfly is actively escaping the visitor.
```

Behavior:

* move rapidly away from visitor
* use interaction engine's escape direction

Transition:

```text
FLEE → RETURN
```

when:

```text
distance >= safeDistance
```

---

# 25. RETURN

Current Day 3 meaning:

```text
The disturbance has ended.
The butterfly is calming down.
```

The current implementation does not yet physically navigate to a flower.

This is intentional.

Actual return-to-flower behavior is a Day 4 feature.

Transitions:

```text
RETURN → ALERT
```

if the visitor approaches again.

Otherwise:

```text
RETURN → REST
```

---

# 26. State Transition Diagram

```text
                         visitor approaches
                              │
                              ▼
                         ┌─────────┐
                    ┌───→│  ALERT  │
                    │    └────┬────┘
                    │         │
                    │         │ visitor very close
                    │         ▼
┌────────┐          │    ┌─────────┐
│  REST  │──────────┘    │  FLEE   │
└───┬────┘               └────┬────┘
    │                         │
    │ timer                   │ safe distance
    │ expires                 │
    ▼                         ▼
┌─────────┐              ┌─────────┐
│ EXPLORE │              │ RETURN  │
└────┬────┘              └────┬────┘
     │                        │
     │ visitor approaches    │ disturbance ended
     └──────────→ ALERT      │
                             ▼
                          ┌──────┐
                          │ REST │
                          └──────┘
```

---

# 27. REST Timer

The current rest duration is:

```text
5000 ms
```

or:

```text
5 seconds
```

The timer begins whenever the butterfly enters REST.

The state transition is:

```text
REST
 ↓
wait 5 seconds
 ↓
EXPLORE
```

This ensures that the butterfly does not remain permanently stationary.

---

# 28. Exploration System

The exploration system uses target-based wandering.

Instead of:

```text
move continuously in one fixed direction
```

the system does:

```text
Choose target
      ↓
Move toward target
      ↓
Target reached or expires
      ↓
Choose another target
```

---

# 29. Exploration Bounds

Current exploration target bounds are approximately:

```text
X = -8 to +8
Z = -8 to +8
```

The butterfly's physical boundary is approximately:

```text
X = -10 to +10
Z = -10 to +10
```

Therefore:

```text
2-unit safety margin
```

exists between the exploration target area and the physical world boundary.

---

# 30. Exploration Target Lifetime

The current exploration target has a maximum lifetime of approximately:

```text
2500 ms
```

or:

```text
2.5 seconds
```

A new target is selected when either:

```text
distance to target < 0.5
```

or:

```text
target age >= 2.5 seconds
```

This prevents the butterfly from remaining committed to one target indefinitely.

---

# 31. Behavior Output Contract

`BehaviorEngine.update()` returns:

```js
{
  state: String,
  velocity: THREE.Vector3
}
```

Example:

```js
{
  state: "FLEE",
  velocity: new THREE.Vector3(...)
}
```

---

# 32. Vector Type Contract

The behavior engine and butterfly both use:

```text
THREE.Vector3
```

for velocity.

The butterfly therefore uses:

```js
this.velocity.copy(
  behavior.velocity
)
```

This avoids unnecessary conversion between plain objects and Three.js vectors.

---

# 33. Butterfly Class

File:

```text
src/creatures/Butterfly.js
```

Responsibility:

* maintain butterfly state data
* maintain velocity
* update world position
* synchronize mesh position
* enforce physical boundaries
* render butterfly geometry

The butterfly should not determine visitor distance itself.

That calculation belongs to `InteractionEngine`.

---

# 34. Butterfly Position

The logical position is:

```js
THREE.Vector3
```

The current starting position is approximately:

```text
x = 0
y = 2
z = 0
```

The butterfly therefore flies approximately two world units above the ground.

---

# 35. Butterfly Velocity

Velocity is represented as:

```js
THREE.Vector3
```

The behavior engine produces a desired velocity.

The butterfly receives that velocity and applies it to its position.

Conceptually:

```text
BehaviorEngine
      ↓
desired velocity
      ↓
Butterfly
      ↓
position += velocity
```

---

# 36. Boundary System

Current world boundaries are approximately:

```text
X = -10 to +10
Z = -10 to +10
```

When a boundary is reached:

```text
position is clamped
velocity component is reversed
```

Example:

```js
if (this.position.x > 10) {
  this.position.x = 10
  this.velocity.x *= -1
}
```

This is a simple safety mechanism.

It is not intended to represent realistic environmental navigation yet.

---

# 37. Current Movement Limitation

The current butterfly changes movement direction relatively abruptly.

The current architecture does not yet contain a dedicated steering/movement controller.

Future refinement should introduce:

```text
desired direction
       ↓
steering
       ↓
smooth turn
       ↓
velocity
       ↓
position
```

This will prevent abrupt direction changes.

---

# 38. Future Butterfly Data Model

The architecture specification calls for a richer butterfly state model.

The planned data includes:

```js
{
  position,
  velocity,
  state,
  fear,
  energy,
  curiosity,
  preferredFlower,
  lastDisturbance,
  targetPosition
}
```

---

# 39. Fear

`fear` represents accumulated disturbance.

Conceptually:

```text
visitor approaches
      ↓
fear increases

visitor remains away
      ↓
fear decreases
```

Fear should be clamped:

```text
0 ≤ fear ≤ 1
```

Fear should influence behavior rather than directly control rendering.

---

# 40. Energy

`energy` represents the butterfly's available movement capacity.

Future behavior may use:

```text
high energy
    ↓
longer exploration

low energy
    ↓
rest / return
```

Energy should also remain within:

```text
0 ≤ energy ≤ 1
```

---

# 41. Disturbance Memory

The butterfly should eventually store:

```text
lastDisturbance
```

This allows behavior to depend not only on the current visitor distance but also on recent history.

This is necessary for the project requirement that repeated chasing increases caution.

---

# 42. Preferred Flower

The butterfly should eventually have:

```text
preferredFlower
```

This represents a safe or preferred resting location.

The future RETURN behavior will use this target.

---

# 43. Target Position

The butterfly should eventually use:

```text
targetPosition
```

for goals such as:

```text
exploration target
escape point
preferred flower
```

This allows the same movement system to support different behavioral goals.

---

# 44. Future Day 4 Behavior

The intended Day 4 flow is:

```text
Visitor approaches
        ↓
Fear increases
        ↓
Butterfly becomes ALERT
        ↓
Visitor gets too close
        ↓
FLEE
        ↓
Escape target selected
        ↓
Visitor moves away
        ↓
Fear begins decreasing
        ↓
Butterfly selects preferred flower
        ↓
RETURN
        ↓
Flower reached
        ↓
REST
```

This creates a more persistent behavioral loop.

---

# 45. Future Repeated Disturbance Behavior

Repeated chasing should produce increasingly cautious behavior.

Conceptually:

```text
First disturbance
    ↓
small fear increase

Second disturbance
    ↓
larger fear increase

Repeated disturbances
    ↓
higher caution
    ↓
longer recovery
    ↓
less exploration
```

This creates the beginning of behavioral memory.

---

# 46. Future ML Architecture

The current rule-based system should be treated as the baseline behavior policy.

A future ML model can replace or augment the decision layer.

The intended architecture is:

```text
World State
     ↓
Feature Extraction
     ↓
ML Behavior Model
     ↓
High-Level Action
     ↓
Movement Controller
     ↓
Butterfly
```

---

# 47. ML Input Features

Potential features:

```text
visitorDistance
visitorSpeed
visitorDirectionX
visitorDirectionZ
butterflySpeed
butterflyFear
butterflyEnergy
currentState
timeSinceDisturbance
distanceFromFlower
distanceFromBoundary
```

These are compact numerical features.

Raw camera frames should not initially be fed directly into the butterfly behavior model.

---

# 48. ML Output

A first model can classify the desired high-level behavior:

```text
REST
EXPLORE
ALERT
FLEE
RETURN
```

Possible architecture:

```text
10–15 inputs
      ↓
32 hidden neurons
      ↓
16 hidden neurons
      ↓
5 outputs
```

The output with the highest probability represents the selected state.

---

# 49. ML Dataset

The first dataset can be generated synthetically.

The process is:

```text
Generate world state
       ↓
Run rule-based behavior
       ↓
Record state + decision
       ↓
Save training example
```

Example:

```text
distance speed fear energy state action

10.2     .02   .10  .95   REST    REST
7.1      .03   .15  .95   REST    ALERT
4.8      .20   .30  .92   ALERT   FLEE
2.2      .80   .70  .88   ALERT   FLEE
8.5      .01   .55  .85   FLEE    RETURN
```

This is effectively imitation learning from the deterministic behavior policy.

---

# 50. Why Not Use an LLM Every Frame?

An LLM should not control butterfly movement frame-by-frame.

Animation may run at approximately:

```text
30–60+ frames per second
```

Calling a remote model every frame would introduce:

* network latency
* cost
* unstable timing
* dependency on internet connectivity
* unpredictable responses
* poor performance

Therefore AI should operate at a higher level.

---

# 51. Future AI Director

A future AI director may receive a compact world summary:

```text
visitor activity
butterfly fear
bird activity
recent disturbance
environment state
```

It can then produce high-level events such as:

```text
large disturbance
```

or:

```text
environment becomes calm
```

The creature systems then respond locally.

This preserves the separation between:

```text
high-level AI decisions
```

and:

```text
real-time simulation
```

---

# 52. Frame Loop Contract

The main animation loop conceptually performs:

```js
function animate() {
  requestAnimationFrame(
    animate
  )

  const interaction =
    interactionEngine
      .getButterflyInteraction(
        visitor,
        butterfly.position
      )

  const behavior =
    behaviorEngine.update(
      butterfly.position,
      interaction
    )

  butterfly.update(
    behavior
  )

  renderer.render(
    scene,
    camera
  )
}
```

The exact implementation may evolve as more systems are introduced.

---

# 53. Error Handling Principle

Errors inside the animation loop are particularly serious.

For example:

```text
BehaviorEngine exception
        ↓
animation update interrupted
        ↓
butterfly stops updating
```

Therefore normal runtime paths should avoid undefined method calls and invalid data.

The browser console should contain no normal-flow errors during the demonstration.

---

# 54. Testing Strategy

Testing should be performed at several levels.

## Input

Check:

* mouse position
* visitor world position
* visitor movement
* initial input guard

## Interaction

Check:

* distance calculation
* danger threshold
* escape direction

## Behavior

Check:

* REST timer
* REST → EXPLORE
* EXPLORE → ALERT
* ALERT → FLEE
* FLEE → RETURN
* RETURN → REST

## Movement

Check:

* velocity
* world position
* boundaries
* target movement

## Rendering

Check:

* butterfly remains visible
* world remains visible
* no rendering errors

---

# 55. Current Testing Procedure

A basic manual test is:

### Test 1 — Startup

Expected:

```text
forest loads
butterfly visible
no console errors
```

### Test 2 — Rest

Expected:

```text
butterfly remains still initially
```

### Test 3 — Exploration

Wait approximately five seconds.

Expected:

```text
REST → EXPLORE
```

The butterfly should begin moving.

### Test 4 — Visitor Approach

Move the mouse toward the butterfly.

Expected:

```text
EXPLORE → ALERT
```

### Test 5 — Close Approach

Continue approaching.

Expected:

```text
ALERT → FLEE
```

### Test 6 — Retreat

Move the mouse away.

Expected:

```text
FLEE → RETURN
```

followed by:

```text
RETURN → REST
```

### Test 7 — Exploration Again

After approximately five seconds:

```text
REST → EXPLORE
```

The butterfly should choose a different exploration direction.

---

# 56. Current Known Limitations

The current architecture intentionally does not yet include:

* realistic butterfly steering
* wing animation
* butterfly fear
* butterfly energy
* disturbance memory
* flower preference
* actual return-to-flower navigation
* bird behavior
* environmental audio
* MediaPipe
* ML inference
* AI director
* persistent world state

These are future stages.

---

# 57. Architectural Evolution Plan

## Stage 1

```text
Three.js forest
```

## Stage 2

```text
Butterfly + mouse
```

## Stage 3

```text
State machine
```

## Stage 4

```text
Fear + memory + flower
```

## Stage 5

```text
Bird + audio + environment
```

## Stage 6

```text
MediaPipe visitor input
```

## Stage 7

```text
Testing + performance + documentation
```

## Future

```text
ML behavior model
```

and potentially:

```text
AI Director
```

---

# 58. Architectural Rule for Future Development

Before adding a new feature, determine which layer owns it.

```text
Input problem
    → VisitorInput

Interaction calculation
    → InteractionEngine

Behavior decision
    → BehaviorEngine

Physical movement
    → Movement / Creature system

Visual appearance
    → Three.js / Creature rendering

World-level state
    → WorldState

High-level AI
    → AI Director
```

Avoid putting unrelated responsibilities into `main.js` or `Butterfly.js`.

---

# 59. Definition of Done

The V1 prototype is considered successful when:

* the forest runs locally in Chrome
* the butterfly remains visible
* the butterfly moves continuously
* mouse movement represents the visitor
* the butterfly detects visitor proximity
* the butterfly becomes alert
* the butterfly flees
* the butterfly can recover after disturbance
* repeated disturbance affects behavior
* the butterfly can return to a preferred location
* bird behavior responds to sufficiently large disturbances
* the project produces no normal-flow console errors
* the complete interaction can be demonstrated within approximately 30–60 seconds

---

# 60. Current Architecture Status

```text
VisitorInput       COMPLETE / REFINEMENT
InteractionEngine  COMPLETE
Butterfly          COMPLETE / REFINEMENT
BehaviorEngine     IN PROGRESS / REFINEMENT
World              FOUNDATION COMPLETE
Fear System        NOT YET IMPLEMENTED
Memory System      NOT YET IMPLEMENTED
Flower System      NOT YET IMPLEMENTED
Bird System        NOT YET IMPLEMENTED
Audio              NOT YET IMPLEMENTED
MediaPipe          NOT YET IMPLEMENTED
ML Brain           FUTURE
AI Director        FUTURE
```

The current priority is to make the deterministic butterfly behavior stable before introducing additional complexity.
