
import * as THREE from "three"

export class Butterfly {
  constructor(scene) {
    this.scene = scene
    this.position = new THREE.Vector3(0, 2, 0)
    this.velocity = new THREE.Vector3()

    this.mesh = new THREE.Group()

    const body = new THREE.Mesh(
      new THREE.SphereGeometry(0.12, 12, 12),
      new THREE.MeshStandardMaterial({ color: 0x222222 })
    )

    body.scale.set(0.5, 1.5, 0.5)
    this.mesh.add(body)

    const wingGeometry = new THREE.CircleGeometry(0.35, 16)
    const wingMaterial = new THREE.MeshStandardMaterial({
      color: 0xff66cc,
      side: THREE.DoubleSide
    })

    const leftWing = new THREE.Mesh(wingGeometry, wingMaterial)
    leftWing.position.x = -0.25
    leftWing.rotation.y = Math.PI / 2

    const rightWing = new THREE.Mesh(wingGeometry, wingMaterial)
    rightWing.position.x = 0.25
    rightWing.rotation.y = Math.PI / 2

    this.mesh.add(leftWing, rightWing)
    this.mesh.scale.setScalar(0.8)
    this.mesh.position.copy(this.position)
    scene.add(this.mesh)
  }

  update(behavior, deltaSeconds = 1 / 60) {
    const dt = THREE.MathUtils.clamp(deltaSeconds, 0, 0.05)

    // Smooth direction and speed changes to reduce visible jitter.
    // FLEE remains more responsive than normal movement.
    const responsiveness = behavior.state === "FLEE" ? 18 : 7

    const blend = 1 - Math.exp(-responsiveness * deltaSeconds)

    this.velocity.lerp(behavior.velocity, blend)

    // Move using elapsed time rather than frame count.
    this.position.addScaledVector(this.velocity, dt)

    // Keep the butterfly inside the forest's movement area.
    this.position.x = THREE.MathUtils.clamp(this.position.x, -9, 9)
    this.position.z = THREE.MathUtils.clamp(this.position.z, -9, 9)

    // Vertical movement is intentionally disabled for now.
    this.position.y = 2

    this.mesh.position.copy(this.position)
  }
}