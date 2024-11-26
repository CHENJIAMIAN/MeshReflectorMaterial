import { Reflector } from './Reflector2.js' // 导入修改后的 Reflector
import { MyReflectorShader } from './MyReflectorShader.js'
import { PlaneGeometry } from 'three'

const geometry = new PlaneGeometry(1, 1)
const reflector = new Reflector(geometry, {
    shader: MyReflectorShader, // 使用自定义 shader
    mixBlur: 0.5,
    mixStrength: 0.2,
    resolution: 512,
    blur: [10, 5], // 模糊程度
    minDepthThreshold: 0.95,
    maxDepthThreshold: 1,
    depthScale: 1,
    depthToBlurRatioBias: 0.1,
    mirror: 1,
    distortion: 0.1,
    distortionMap: distortionTexture, // 如果有扭曲贴图
    mixContrast: 1.5,
    debug: 0, // 可用于调试 shader，显示深度、模糊比例等
})

scene.add(reflector)

// ...其余代码