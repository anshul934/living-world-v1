import * as THREE from 'three'
import './style.css'
import { Butterfly } from './creatures/Butterfly.js'
import { VisitorInput } from './interaction/VisitorInput.js'
import { InteractionEngine} from './interaction/InteractionEngine.js'

// --------------------
// 1. Create the scene
// --------------------
const scene = new THREE.Scene()
scene.background = new THREE.Color(0x87ceeb)

// 2. Create the camera
const camera = new THREE.PerspectiveCamera(
  60,
  window.innerWidth / window.innerHeight,
  0.1,
  1000
)

camera.position.set(1, 4, 12)

// 3. Create the renderer
const renderer = new THREE.WebGLRenderer({
  antialias: true
})

renderer.setSize(window.innerWidth, window.innerHeight)

document.querySelector('#app').innerHTML = ''
document.querySelector('#app').appendChild(renderer.domElement)

// --------------------
// 4. Add lighting
// --------------------
const ambientLight = new THREE.AmbientLight(0xffffff, 0.6)
scene.add(ambientLight)

const sun = new THREE.DirectionalLight(0xfff4cc, 1.5)
sun.position.set(-8, 10, -15)
scene.add(sun)

// --------------------
// 4b. Add visible sun
// --------------------

const sunGeometry = new THREE.SphereGeometry(
  2,
  32,
  32
)

const sunMaterial = new THREE.MeshBasicMaterial({
  color: 0xffdd55
})

const sunMesh = new THREE.Mesh(
  sunGeometry,
  sunMaterial
)

sunMesh.position.set(-8, 10, -15)

scene.add(sunMesh)

// --------------------
// 5. Create the ground
// --------------------
const groundGeometry = new THREE.PlaneGeometry(30, 30)

const groundMaterial = new THREE.MeshStandardMaterial({
  color: 0x3b7a3b
})

const ground = new THREE.Mesh(
  groundGeometry,
  groundMaterial
)

ground.rotation.x = -Math.PI / 2
scene.add(ground)

// --------------------
// 6. Create a random-looking tree
// --------------------
function createTree(x, z) {

  // Random tree height
  const height = 1.5 + Math.random() * 1.5

  // Random trunk thickness
  const trunkRadius = 0.25 + Math.random() * 0.2

  // Random leaf size
  const leafSize = 1.0 + Math.random() * 0.7

  // Random leaf height
  const leafHeight = height + 0.3 + Math.random() * 0.5

  // --------------------
  // Tree trunk
  // --------------------
  const trunkGeometry = new THREE.CylinderGeometry(
    trunkRadius * 0.8,
    trunkRadius,
    height,
    8
  )

  const trunkMaterial = new THREE.MeshStandardMaterial({
    color: 0x6b4226
  })

  const trunk = new THREE.Mesh(
    trunkGeometry,
    trunkMaterial
  )

  trunk.position.set(
    x,
    height / 2,
    z
  )

  // Slight random rotation
  trunk.rotation.y = Math.random() * Math.PI

  // --------------------
  // Tree leaves
  // --------------------
  const leavesGeometry = new THREE.SphereGeometry(
    leafSize,
    12,
    12
  )

  const leavesMaterial = new THREE.MeshStandardMaterial({
    color: 0x228b22
  })

  const leaves = new THREE.Mesh(
    leavesGeometry,
    leavesMaterial
  )

  // Random horizontal offset
  const leafOffsetX = (Math.random() - 0.5) * 0.5
  const leafOffsetZ = (Math.random() - 0.5) * 0.5

  leaves.position.set(
    x + leafOffsetX,
    leafHeight,
    z + leafOffsetZ
  )

  // Slightly squash/stretch the leaves
  leaves.scale.y = 0.8 + Math.random() * 0.4

  scene.add(trunk)
  scene.add(leaves)
}

// --------------------
// Create a patch of grass
// --------------------
function createGrassPatch(x, z) {
  const grassMaterial = new THREE.MeshStandardMaterial({
    color: 0x2f8f2f,
    side: THREE.DoubleSide
  })

  // Number of blades in this patch
  const bladeCount = 12 + Math.floor(Math.random() * 10)

  for (let i = 0; i < bladeCount; i++) {
    // Random position inside the patch
    const offsetX = (Math.random() - 0.5) * 2
    const offsetZ = (Math.random() - 0.5) * 2

    // Random blade height
    const height = 0.3 + Math.random() * 0.5

    // A thin triangular blade
    const bladeGeometry = new THREE.BufferGeometry()

    const vertices = new Float32Array([
      -0.03, 0, 0,
       0.03, 0, 0,
       0,    height, 0
    ])

    bladeGeometry.setAttribute(
      'position',
      new THREE.BufferAttribute(vertices, 3)
    )

    const blade = new THREE.Mesh(
      bladeGeometry,
      grassMaterial
    )

    blade.position.set(
      x + offsetX,
      0.02,
      z + offsetZ
    )

    // Random direction
    blade.rotation.y = Math.random() * Math.PI

    scene.add(blade)
  }
}

// --------------------
// 7. Create the forest
// --------------------

createTree(-4, -3)
createTree(4, -2)
createTree(-5, 3)
createTree(5, 4)
createTree(1, -5)

createTree(-7, -6)
createTree(-3, -7)
createTree(2, -7)
createTree(6, -6)

createTree(-8, -2)
createTree(8, -1)

createTree(-7, 2)
createTree(7, 2)

createTree(-6, 6)
createTree(-2, 5)
createTree(3, 5)
createTree(7, 6)

createTree(-9, 5)
createTree(9, 5)

createTree(-10, -5)
createTree(10, -4)

// --------------------
// Grass patches
// --------------------

createGrassPatch(-2, -2)
createGrassPatch(3, -3)
createGrassPatch(-6, -1)
createGrassPatch(6, 1)

createGrassPatch(-4, 4)
createGrassPatch(2, 4)
createGrassPatch(5, 5)

createGrassPatch(-8, -4)
createGrassPatch(8, -5)

createGrassPatch(-1, -6)
createGrassPatch(4, -7)

const butterfly = new Butterfly(scene)
const visitor = new VisitorInput(camera)
const interactionEngine = new InteractionEngine()

// --------------------
// 8. Animation loop
// --------------------
function animate() {
  requestAnimationFrame(animate)


  const interaction = 
    interactionEngine.getButterflyInteraction(
      visitor,
      butterfly.position
    )
  butterfly.update(interaction)

  renderer.render(scene, camera)
}

animate()

// --------------------
// 9. Handle window resize
// --------------------
window.addEventListener('resize', () => {

  camera.aspect =
    window.innerWidth / window.innerHeight

  camera.updateProjectionMatrix()

  renderer.setSize(
    window.innerWidth,
    window.innerHeight
  )
})