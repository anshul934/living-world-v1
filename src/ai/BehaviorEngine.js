
import * as THREE from "three"

export class BehaviorEngine {
  constructor() {
    this.state = "REST"

    // Fear and energy range: 0 to 1.
    this.fear = 0
    this.energy = 1

    // Rates are per second, not per frame.
    this.fearIncreaseRate = 0.12
    this.fearDecreaseRate = 0.025
    this.energyDrainRate = 0.16
    this.energyRecoveryRate = 0.5

    // Interaction distances.
    this.alertDistance = 7
    this.fleeDistance = 5
    this.safeDistance = 8

    // Safety and approach response.
    this.touchDistance = 1.25
    this.gentleApproachSpeed = 2.8
    this.rapidApproachSpeed = 5.0
    this.maintainDistance = 2.0

    // Speeds are world units per second.
    this.exploreSpeed = 1.2
    this.alertSpeed = 0.65
    this.cautiousSpeed = 0.65
    this.tiredSpeed = 0.35
    this.fleeSpeed = 4.0
    this.returnSpeed = 0.9
    this.avoidSpeed = 1.8

    // State timers.
    this.restDuration = 3.75
    this.restElapsed = 0
    this.lastStatusLogTime = 0

    // Exploration region.
    this.exploreBoundary = 8
    this.exploreTarget = new THREE.Vector3()
    this.hasExploreTarget = false
    this.exploreTargetDuration = 8
    this.exploreElapsed = 0

    // Escape target.
    this.escapeTarget = new THREE.Vector3()
    this.hasEscapeTarget = false
    this.escapeDistance = 4

    // Actual flower positions are supplied by main.js.
    this.flowerTargets = []
    this.currentFlower = null

    this.exploreDirection = new THREE.Vector3()
  }

  setFlowerTargets(flowers) {
    this.flowerTargets = flowers
      .map((flower) => flower.position ?? flower)
      .filter((position) => position?.isVector3)

    this.currentFlower = null
    this.hasExploreTarget = false
  }

  update(butterflyPosition, interaction, deltaSeconds = 1 / 60) {
    const dt = THREE.MathUtils.clamp(deltaSeconds, 0, 0.05)

    const distance = interaction.distance ?? Infinity
    const approachSpeed = Math.max(0, interaction.approachSpeed ?? 0)

    this.updateFear(distance, dt)
    this.updateEnergy(distance, dt)
    this.logStatus(performance.now())

    this.restElapsed += dt
    this.exploreElapsed += dt

    // Close proximity takes priority over all normal activity.
    if (distance <= this.touchDistance) {
      this.changeState("FLEE")
    } else if (
      this.state === "FLEE" &&
      distance < this.safeDistance
    ) {
      // Keep fleeing until there is enough room.
    } else if (
      approachSpeed >= this.rapidApproachSpeed &&
      distance < this.alertDistance
    ) {
      this.changeState("FLEE")
    } else if (
      distance < this.alertDistance &&
      (
        approachSpeed >= this.gentleApproachSpeed ||
        distance < this.maintainDistance
      )
    ) {
      this.changeState("ALERT")
    } else if (
      this.state === "FLEE" &&
      distance >= this.safeDistance
    ) {
      this.changeState("RETURN")
    } else if (
      this.state === "ALERT" &&
      distance >= this.safeDistance
    ) {
      this.changeState("RETURN")
    }

    // Resolve state transitions and create movement.
    const behavior = {
      state: this.state,
      fear: this.fear,
      energy: this.energy,
      velocity: new THREE.Vector3()
    }

    switch (this.state) {
      case "REST": {
        if (this.restElapsed >= this.restDuration) {
          if (this.energy > 0.2) {
            this.changeState("EXPLORE")
          } else {
            // Stay resting until energy has recovered.
            this.restElapsed = 0
          }
        }
        break
      }

      case "EXPLORE": {
        // A nearby stationary visitor means cautious exploration,
        // not a full-speed flee.
        if (distance < this.alertDistance) {
          const away = this.getEscapeDirection(interaction)

          if (distance < this.maintainDistance) {
            behavior.velocity.copy(away).multiplyScalar(this.avoidSpeed)
          } else {
            this.moveTowardFlower(butterflyPosition, behavior.velocity)
            behavior.velocity.multiplyScalar(this.getExploreSpeed() * 0.45)
          }
        } else {
          this.moveTowardFlower(butterflyPosition, behavior.velocity)
          behavior.velocity.multiplyScalar(this.getExploreSpeed())
        }
        break
      }

      case "ALERT": {
        const away = this.getEscapeDirection(interaction)

        if (distance < this.maintainDistance) {
          behavior.velocity.copy(away).multiplyScalar(this.avoidSpeed)
        } else {
          this.moveTowardFlower(butterflyPosition, behavior.velocity)
          behavior.velocity.multiplyScalar(this.alertSpeed)
        }
        break
      }

      case "FLEE": {
        if (!this.hasEscapeTarget) {
          this.chooseEscapeTarget(
            butterflyPosition,
            this.getEscapeDirection(interaction)
          )
        }

        behavior.velocity
          .subVectors(this.escapeTarget, butterflyPosition)

        behavior.velocity.y = 0

        if (behavior.velocity.lengthSq() > 0.001) {
          behavior.velocity.normalize()
          behavior.velocity.multiplyScalar(this.fleeSpeed)
        }

        if (butterflyPosition.distanceTo(this.escapeTarget) < 0.5) {
          this.hasEscapeTarget = false
        }
        break
      }

      case "RETURN": {
        // Return to the nearest flower when safe.
        const flower = this.findNearestFlower(butterflyPosition)

        if (flower) {
          behavior.velocity.subVectors(flower, butterflyPosition)
          behavior.velocity.y = 0

          const d = behavior.velocity.length()

          if (d < 0.3) {
            this.currentFlower = flower
            this.changeState("REST")
            behavior.velocity.set(0, 0, 0)
          } else {
            behavior.velocity.normalize()
            behavior.velocity.multiplyScalar(this.returnSpeed)
          }
        } else {
          this.changeState("REST")
        }
        break
      }
    }

    // Preserve fixed flying height in all decisions.
    behavior.velocity.y = 0
    behavior.state = this.state
    behavior.fear = this.fear
    behavior.energy = this.energy

    return behavior
  }

  updateFear(distance, dt) {
    if (distance < this.alertDistance) {
      this.fear += this.fearIncreaseRate * dt
    } else if (distance >= this.safeDistance) {
      this.fear -= this.fearDecreaseRate * dt
    }

    this.fear = THREE.MathUtils.clamp(this.fear, 0, 1)
  }

  updateEnergy(distance, dt) {
    // Slightly gentler energy drain during disturbance.
    if (distance < this.alertDistance) {
      this.energy -= this.energyDrainRate * dt
    } else if (distance >= this.safeDistance) {
      this.energy += this.energyRecoveryRate * dt
    }

    this.energy = THREE.MathUtils.clamp(this.energy, 0, 1)
  }

  getExploreSpeed() {
    // Fear and low energy both slow ordinary exploration.
    const fearFactor = 1 - this.fear * 0.55
    const energyFactor = this.energy < 0.35
      ? this.tiredSpeed / this.exploreSpeed
      : 0.65 + this.energy * 0.35

    return this.exploreSpeed * fearFactor * energyFactor
  }

  getEscapeDirection(interaction) {
    const direction = interaction.escapeDirection
      ? interaction.escapeDirection.clone()
      : new THREE.Vector3(1, 0, 0)

    direction.y = 0

    if (direction.lengthSq() < 0.0001) {
      direction.set(1, 0, 0)
    }

    return direction.normalize()
  }

  chooseEscapeTarget(butterflyPosition, escapeDirection) {
    const direction = escapeDirection.clone()

    direction.x += (Math.random() - 0.5) * 0.5
    direction.z += (Math.random() - 0.5) * 0.5
    direction.y = 0

    if (direction.lengthSq() < 0.0001) {
      direction.set(1, 0, 0)
    }

    direction.normalize()

    this.escapeTarget.copy(butterflyPosition)
    this.escapeTarget.addScaledVector(direction, this.escapeDistance)

    this.escapeTarget.x = THREE.MathUtils.clamp(this.escapeTarget.x, -8, 8)
    this.escapeTarget.z = THREE.MathUtils.clamp(this.escapeTarget.z, -8, 8)
    this.escapeTarget.y = butterflyPosition.y

    this.hasEscapeTarget = true
  }

  moveTowardFlower(butterflyPosition, output) {
    if (
      !this.hasExploreTarget ||
      this.exploreElapsed >= this.exploreTargetDuration ||
      butterflyPosition.distanceTo(this.exploreTarget) < 0.5
    ) {
      this.chooseNewExploreTarget(butterflyPosition)
    }

    output.subVectors(this.exploreTarget, butterflyPosition)
    output.y = 0

    if (output.lengthSq() > 0.0001) {
      output.normalize()
    }
  }

  chooseNewExploreTarget(butterflyPosition = null) {
    if (this.flowerTargets.length > 0) {
      // Prefer a different flower when possible.
      const choices = this.flowerTargets.filter(
        (flower) => flower !== this.currentFlower
      )

      const pool = choices.length > 0
        ? choices
        : this.flowerTargets

      this.currentFlower = pool[
        Math.floor(Math.random() * pool.length)
      ]

      this.exploreTarget.copy(this.currentFlower)
      this.exploreTarget.y = 2
    } else {
      // Safe fallback until flower targets are registered.
      this.exploreTarget.set(
        THREE.MathUtils.randFloat(-this.exploreBoundary, this.exploreBoundary),
        2,
        THREE.MathUtils.randFloat(-this.exploreBoundary, this.exploreBoundary)
      )
    }

    this.exploreElapsed = 0
    this.hasExploreTarget = true

    if (butterflyPosition) {
      this.exploreDirection.subVectors(
        this.exploreTarget,
        butterflyPosition
      )
      this.exploreDirection.y = 0

      if (this.exploreDirection.lengthSq() > 0.0001) {
        this.exploreDirection.normalize()
      }
    }
  }

  findNearestFlower(position) {
    if (this.flowerTargets.length === 0) {
      return null
    }

    let nearest = this.flowerTargets[0]
    let nearestDistance = Infinity

    for (const flower of this.flowerTargets) {
      const distance = Math.hypot(
        flower.x - position.x,
        flower.z - position.z
      )

      if (distance < nearestDistance) {
        nearest = flower
        nearestDistance = distance
      }
    }

    return nearest
  }

  changeState(newState) {
    if (this.state === newState) return

    console.log(`Butterfly state: ${this.state} → ${newState}`)
    this.state = newState

    if (newState === "REST") {
      this.restElapsed = 0
      this.hasEscapeTarget = false
    }

    if (newState === "EXPLORE") {
      this.chooseNewExploreTarget()
    }

    if (newState === "FLEE") {
      this.hasEscapeTarget = false
    }
  }
  logStatus(now) {
    // Log status at most once every 500 milliseconds.
    if (now - this.lastStatusLogTime < 500) return

    this.lastStatusLogTime = now

    const fearPercent = Math.round(this.fear * 100)
    const energyPercent = Math.round(this.energy * 100)

    console.log(
      `[Butterfly] State: ${this.state} | ` +
      `Fear: ${fearPercent}% | ` +
      `Energy: ${energyPercent}%`
    )
  }
}