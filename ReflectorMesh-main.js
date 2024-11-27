import { ReflectorMesh } from './ReflectorMesh.js' // 导入修改后的 Reflector
import {
    PlaneGeometry,
    SphereGeometry,
    CylinderGeometry,
    Scene,
    PerspectiveCamera,
    WebGLRenderer,
    AmbientLight,
    DirectionalLight,
    BoxGeometry,
    Mesh,
    MeshBasicMaterial,
    TextureLoader,
    Vector3,
    Euler,
    Color,
} from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'

// Initialize Three.js components
const scene = new Scene()
const camera = new PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000)
const renderer = new WebGLRenderer({ antialias: true })
renderer.setClearColor('#d3d3d3') // 设置为浅灰色
renderer.setSize(window.innerWidth, window.innerHeight)
document.body.appendChild(renderer.domElement)


// 添加轨道控制器
const controls = new OrbitControls(camera, renderer.domElement)
controls.target.set(0, 0, 0)
controls.update()

// Add some lights
const ambientLight = new AmbientLight(0xffffff, 0.5)
scene.add(ambientLight)
const directionalLight = new DirectionalLight(0xffffff, 0.8)
directionalLight.position.set(1, 1, 1)
scene.add(directionalLight)

{
    // 用于存储物体的位置
    const positions = []

    // 函数，用于添加物体
    const addObject = (geometry, material) => {
        const mesh = new Mesh(geometry, material)

        // 随机生成高度
        const height = Math.random() * 2.5 + 0.5 // 随机高度在 0.5 到 3 之间
        mesh.scale.y = height // 调整物体的 Y 轴比例

        let posX, posZ, overlap
        do {
            posX = (Math.random() - 0.5) * 20 // 随机 x 坐标
            posZ = (Math.random() - 0.5) * 20 // 随机 z 坐标
            overlap = positions.some(pos => {
                // 检查当前物体与存储的物体是否重叠
                return Math.abs(pos.x - posX) < 1 && Math.abs(pos.z - posZ) < 1
            })
        } while (overlap)

        mesh.position.set(posX, height / 2, posZ) // 适当设置 y 坐标为物体高度的一半
        scene.add(mesh)
        positions.push({ x: posX, z: posZ }) // 保存物体的位置
    }

    // 添加不同类型的物体
    const material = new MeshBasicMaterial({ color: 0x00ff00 })
    addObject(new BoxGeometry(1, 1, 1), material) // 添加一个立方体

    const sphereMaterial = new MeshBasicMaterial({ color: 0xff0000 })
    addObject(new SphereGeometry(0.5, 32, 32), sphereMaterial) // 添加一个球体

    const cylinderMaterial = new MeshBasicMaterial({ color: 0x0000ff })
    addObject(new CylinderGeometry(0.5, 0.5, 1, 32), cylinderMaterial) // 添加一个圆柱体

    camera.position.z = 15
}

const textureLoader = new TextureLoader()
const distortionMap = textureLoader.load('./dist_map.jpeg') // Replace with your texture path
const normalMap = textureLoader.load('./NORM.jpg') // Load the normal map

const geometry = new PlaneGeometry(20, 20)
// const geometry = new SphereGeometry(5, 32, 32);
// const geometry = new BoxGeometry(5, 5, 5);
const reflector = new ReflectorMesh(geometry, {
    resolution: 1024, // Render target resolution
    mixBlur: 1, // Amount of blur
    blur: 500, // Blur kernel size
    mixStrength: 2, // Reflection strength
    mirror: 1,
    // opacity: 0.3,
    minDepthThreshold: 0.8,
    maxDepthThreshold: 1.2,
    depthToBlurRatioBias: 0.25,
    // mixContrast: 1,
    // depthScale: 1,
    // distortion: 0.2,
    // distortionMap: distortionMap,
    color: new Color('lightslategrey'),
})
reflector.rotation.set(-Math.PI / 2, 0, 0)
scene.add(reflector)

window.scene = scene

// Position the camera
camera.position.set(2, 2, 3)
camera.lookAt(0, 0, 0)

// Render loop
function animate () {
    requestAnimationFrame(animate)

    renderer.render(scene, camera)
}

animate()

