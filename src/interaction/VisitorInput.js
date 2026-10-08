import * as THREE from "three"

export class VisitorInput {
  constructor(camera) {
    this.camera = camera

    // Mouse position in normalized device coordinates
    this.mouse = new THREE.Vector2()

    // Visitor position in world coordinates
    this.position = new THREE.Vector3()

    // Previous visitor position
    this.lastPosition = new THREE.Vector3()

    // Visitor movement information
    this.speed = 0
    this.isMoving = false
    this.hasInput = false

    // Raycaster converts mouse screen coordinates
    // into a point in the 3D world
    this.raycaster = new THREE.Raycaster()

    // The forest ground is at Y = 0
    this.groundPlane = new THREE.Plane(
      new THREE.Vector3(0, 1, 0),
      0
    )

    window.addEventListener(
      "mousemove",
      (event) => {
        this.updateMousePosition(event)
      }
    )
  }

  updateMousePosition(event) {
    // Convert mouse position to
    // normalized device coordinates.
    //
    // X: -1 = left, +1 = right
    // Y: +1 = top, -1 = bottom

    this.mouse.x =
      (event.clientX / window.innerWidth) * 2 - 1

    this.mouse.y =
      -(event.clientY / window.innerHeight) * 2 + 1

    // Create a ray from the camera
    // through the mouse position.
    this.raycaster.setFromCamera(
      this.mouse,
      this.camera
    )

    // Find where that ray intersects
    // the forest ground.
    const intersectionPoint =
      new THREE.Vector3()

    const hit =
      this.raycaster.ray.intersectPlane(
        this.groundPlane,
        intersectionPoint
      )

    // If the ray successfully hit the ground,
    // update the visitor position.
    if (hit) {
      this.lastPosition.copy(this.position)

      this.position.copy(
        intersectionPoint
      )

      // Calculate movement distance.
      this.speed =
        this.position.distanceTo(
          this.lastPosition
        )

      this.isMoving =
        this.speed > 0.001

      this.hasInput = true
    }
  }

  getState() {
    return {
      x: this.position.x,
      y: this.position.y,
      speed: this.speed,
      isMoving: this.isMoving
    }
  }
}