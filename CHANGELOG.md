# LIVING WORLD — V1

## Changelog

All significant development work, bug fixes, refactors, and feature additions are recorded here in chronological order.

---

# 2026-10-07 — Day 1: Project Foundation

## Added

* Created the initial Vite project.
* Configured the project to run locally in the browser.
* Installed Three.js.
* Created the initial Three.js scene.
* Added a perspective camera.
* Added the WebGL renderer.
* Added ambient lighting.
* Added directional sunlight.
* Added a visible sun object.
* Added a large green forest ground plane.
* Added procedural/simple trees.
* Added simple grass patches.
* Added basic fullscreen CSS.

## Initial Camera

The camera was positioned approximately at:

```text
x = 0
y = 5
z = 10
```

## Lighting

Added a directional light representing the sun:

```js
const sun =
  new THREE.DirectionalLight(
    0xfff4cc,
    1.5
  )

sun.position.set(
  -8,
  10,
  -15
)
```

## Result

The project successfully rendered a basic 3D forest environment locally in Chrome.

---

# 2026-10-07 — Day 2: Butterfly and Visitor Input

## Added

* Created `Butterfly.js`.
* Added the butterfly mesh.
* Added butterfly world position.
* Added butterfly velocity.
* Added continuous butterfly movement.
* Added world-boundary protection.
* Created `VisitorInput.js`.
* Added mouse tracking.
* Added Three.js raycasting.
* Added a horizontal ground plane for ray intersection.
* Converted mouse input into a world-space visitor position.
* Created `InteractionEngine.js`.
* Added visitor/butterfly distance calculation.
* Added danger-distance detection.
* Added butterfly escape-direction calculation.

## Architecture Refactor

Visitor input was separated from butterfly behavior.

The initial interaction pipeline became:

```text
Mouse
  ↓
VisitorInput
  ↓
InteractionEngine
  ↓
Butterfly
```

This prevents `Butterfly.js` from needing to know how the visitor is detected.

---

# 2026-10-07 — Day 2: Initial Mouse Coordinate Bug

## Problem

The initial mouse-to-world implementation used an approximate screen-to-world calculation.

The detected visitor position did not accurately correspond to the actual mouse location.

## Cause

Screen coordinates and Three.js world coordinates are different coordinate systems.

An approximate conversion was insufficient for reliable interaction.

## Fix

Moved to a proper Three.js raycasting approach.

The mouse position is converted into normalized device coordinates and then projected from the camera into the 3D scene.

The ray is intersected with the forest ground plane.

The resulting intersection point becomes the visitor's world position.

## Result

Visitor input became based on an actual 3D ray/ground intersection rather than a screen-coordinate approximation.

---

# 2026-10-07 — Day 2: Initial False Visitor Detection

## Problem

The butterfly could sometimes detect the visitor before the mouse had actually been used.

The interaction system could interpret the default visitor position as a real visitor position.

## Fix

Added:

```js
hasInput
```

to `VisitorInput`.

The interaction engine now ignores visitor interaction until valid mouse input has been received.

## Result

The butterfly no longer starts in a false disturbance state simply because the visitor position initially exists at a default coordinate.

---

# 2026-10-07 — Day 3: Behavior Engine

## Added

Created:

```text
src/ai/BehaviorEngine.js
```

The first behavioral state machine was introduced.

States:

```text
REST
EXPLORE
ALERT
FLEE
RETURN
```

## Initial State Transitions

The behavior system was designed around:

```text
REST
 ↓
EXPLORE
 ↓
ALERT
 ↓
FLEE
 ↓
RETURN
 ↓
REST
```

with disturbance-dependent transitions.

---

# 2026-10-07 — Day 3: Behavior Engine Runtime Error

## Problem

The butterfly stopped moving completely.

The browser console reported:

```text
Uncaught TypeError:
this.handleStateChange is not a function
```

The error originated from `BehaviorEngine.update()`.

## Cause

The behavior engine referenced a `handleStateChange()` method that was not actually defined in the current implementation.

Because the exception occurred inside the animation loop, the behavior engine failed before returning a movement decision.

Therefore:

```text
BehaviorEngine
      ↓
ERROR
      ↓
no behavior returned
      ↓
Butterfly.update() not supplied valid behavior
      ↓
butterfly stops
```

## Fix

Replaced the incomplete behavior implementation with an explicit state-machine implementation.

State transitions are now handled by a dedicated:

```js
changeState()
```

method.

## Result

The behavior engine can successfully return a behavior decision every animation frame.

---

# 2026-10-07 — Day 3: Velocity Type Consistency

## Problem

`Butterfly.js` stores velocity as:

```js
THREE.Vector3
```

The behavior engine initially returned a plain JavaScript object:

```js
{
  x: ...,
  y: ...,
  z: ...
}
```

This created an inconsistent data contract.

## Fix

The behavior engine now creates:

```js
velocity:
  new THREE.Vector3()
```

and modifies it using Three.js vector methods.

The butterfly continues to use:

```js
this.velocity.copy(
  behavior.velocity
)
```

## Result

Both systems now use the same vector representation.

---

# 2026-10-07 — Day 3: REST Timer

## Problem

The butterfly could remain in REST indefinitely.

This prevented normal exploration from beginning.

## Fix

Added a REST timer.

Current configuration:

```text
REST duration = 5 seconds
```

After approximately five seconds without disturbance:

```text
REST → EXPLORE
```

## Result

The butterfly now periodically begins exploring without requiring visitor interaction.

---

# 2026-10-07 — Day 3: Fixed Exploration Direction Bug

## Problem

The butterfly initially explored using a fixed direction approximately equivalent to:

```js
new THREE.Vector3(
  1,
  0,
  1
)
```

This caused it to continuously move toward the same region of the forest.

Eventually it reached the front-right boundary and became visually stuck there.

## Cause

The exploration system had no concept of:

* exploration targets
* random direction changes
* exploration bounds
* target completion

## Fix

Replaced the fixed exploration direction with randomly selected exploration targets.

Targets are selected within approximately:

```text
X = -8 to +8
Z = -8 to +8
```

The butterfly chooses a new target when:

* it gets sufficiently close to the target, or
* the target has existed for too long.

## Result

The butterfly now explores different regions of the forest instead of continuously travelling in one direction.

---

# 2026-10-08 — Day 3: Mouse Coordinate Refinement

## Problem

Although raycasting was functioning, the world-space position did not always correspond precisely to the visible mouse-pointer position.

## Cause

The mouse coordinates were normalized against:

```js
window.innerWidth
window.innerHeight
```

This assumes the Three.js canvas exactly matches the browser viewport.

That assumption can become incorrect when the canvas is resized, embedded, or affected by layout/UI elements.

## Fix

`VisitorInput` now receives:

```js
renderer.domElement
```

and calculates the mouse position relative to:

```js
domElement.getBoundingClientRect()
```

The new pipeline is:

```text
Browser mouse position
        ↓
Canvas-relative coordinates
        ↓
Normalized Device Coordinates
        ↓
Three.js Raycaster
        ↓
Ground intersection
        ↓
Visitor world position
```

## Result

Mouse-to-world conversion is now based on the actual rendering canvas rather than the browser viewport.

---

# 2026-10-08 — Day 3: Documentation System

## Added

Created project documentation structure:

```text
CHANGELOG.md
ARCHITECTURE.md
DEVELOPMENT_LOG.md
```

## Purpose

Each document has a separate responsibility.

### CHANGELOG.md

Records:

* daily changes
* bug fixes
* refactors
* feature additions

### ARCHITECTURE.md

Records:

* system architecture
* data models
* contracts
* state machines
* technical decisions

### DEVELOPMENT_LOG.md

Records:

* detailed development history
* implementation reasoning
* problems encountered
* debugging explanations
* development-stage objectives

---

# Current Status

## Day 1

```text
COMPLETE
```

Completed:

* Vite
* Three.js
* Scene
* Camera
* Renderer
* Lighting
* Sun
* Ground
* Trees
* Grass

## Day 2

```text
COMPLETE / REFINED
```

Completed:

* Butterfly
* Butterfly movement
* Mouse input
* Raycasting
* Visitor world position
* Interaction Engine
* Distance calculation
* Escape direction
* Behavior Engine
* REST
* EXPLORE
* ALERT
* FLEE
* RETURN
* REST timer
* Random exploration targets
* Exploration boundaries
* Mouse/canvas coordinate refinement

Next:

* Fear
* Energy
* Disturbance memory
* Preferred flower
* Proper return-to-flower behavior
* More natural movement
* Gradual turning

---

