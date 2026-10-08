import * as THREE from "three"

export class InteractionEngine {
  constructor() {
    this.dangerDistance = 5
  }

  getButterflyInteraction(
    visitor,
    butterflyPosition
  ) {
    // No visitor input yet.
    // Therefore there is no interaction.
    if (!visitor.hasInput) {
      return {
        distance: Infinity,
        isDanger: false,
        escapeDirection: new THREE.Vector3()
      }
    }

    const dx =
      butterflyPosition.x -
      visitor.position.x

    const dz =
      butterflyPosition.z -
      visitor.position.z

    const distance = Math.sqrt(
      dx * dx +
      dz * dz
    )

    const isDanger =
      distance < this.dangerDistance

    const escapeDirection =
      new THREE.Vector3(
        dx,
        0,
        dz
      )

    if (distance > 0) {
      escapeDirection.normalize()
    }

    return {
      distance,
      isDanger,
      escapeDirection
    }
  }
}