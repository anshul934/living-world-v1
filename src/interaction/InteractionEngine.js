
import * as THREE from "three"

export class InteractionEngine {
  constructor() {
    this.previousDistance = null
    this.previousTime = null
    this.smoothedApproachSpeed = 0
  }

  getButterflyInteraction(visitor, butterflyPosition) {
    const now = performance.now()

    // No mouse position has been recorded yet.
    if (!visitor.hasInput) {
      this.previousDistance = null
      this.previousTime = null
      this.smoothedApproachSpeed = 0

      return {
        distance: Infinity,
        isDanger: false,
        approachSpeed: 0,
        escapeDirection: new THREE.Vector3()
      }
    }

    // Measure horizontal distance, since the visitor is represented
    // by a point on the forest ground.
    const dx = butterflyPosition.x - visitor.position.x
    const dz = butterflyPosition.z - visitor.position.z
    const distance = Math.hypot(dx, dz)

    let rawApproachSpeed = 0

    if (
      this.previousDistance !== null &&
      this.previousTime !== null
    ) {
      const elapsedSeconds = (now - this.previousTime) / 1000

      if (elapsedSeconds > 0.001) {
        rawApproachSpeed =
          (this.previousDistance - distance) / elapsedSeconds

        // Negative values mean the visitor is moving away.
        rawApproachSpeed = Math.max(0, rawApproachSpeed)

        // Limit isolated spikes caused by a sudden mouse event.
        rawApproachSpeed = Math.min(rawApproachSpeed, 6)
      }
    }

    // Smooth the reading so one abrupt sample does not dominate.
    const smoothing = 0.15

    this.smoothedApproachSpeed +=
      (rawApproachSpeed - this.smoothedApproachSpeed) * smoothing

    this.previousDistance = distance
    this.previousTime = now

    // Direction from the visitor towards the butterfly.
    const escapeDirection = new THREE.Vector3(dx, 0, dz)

    if (escapeDirection.lengthSq() > 0.0001) {
      escapeDirection.normalize()
    } else {
      escapeDirection.set(1, 0, 0)
    }

    return {
      distance,
      isDanger: distance < 1.25,
      approachSpeed: this.smoothedApproachSpeed,
      escapeDirection
    }
  }
}