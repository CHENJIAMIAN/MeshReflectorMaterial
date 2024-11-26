import {
    UniformsUtils,
    Vector2,
    Matrix4
} from 'three'

const MyReflectorShader = {

    name: 'MyReflectorShader',

    uniforms: {

        'color': {
            value: null
        },
        'tDiffuse': {
            value: null
        },
        'tDepth': {
            value: null
        },
        'tDiffuseBlur': {
            value: null
        },
        'textureMatrix': {
            value: null
        },
        'distortionMap': {
            value: null
        },
        'mixBlur': {
            value: 0.0
        },
        'mixStrength': {
            value: 0.5
        },
        'minDepthThreshold': {
            value: 0.9
        },
        'maxDepthThreshold': {
            value: 1.0
        },
        'depthScale': {
            value: 0.0
        },
        'depthToBlurRatioBias': {
            value: 0.25
        },
        'distortion': {
            value: 1.0
        },
        'mixContrast': {
            value: 1.0
        },
        'blurSize': {
            value: new Vector2(1, 1)
        },
        'debug': {
            value: 0
        },
        'resolution': {
            value: new Vector2()
        }
    },

    vertexShader: /* glsl */`
		uniform mat4 textureMatrix;
		varying vec4 vUv;
		varying vec4 vWorldPosition;

		#include <common>
		#include <logdepthbuf_pars_vertex>

		void main() {

			vUv = textureMatrix * vec4( position, 1.0 );
			vWorldPosition = modelMatrix * vec4( position, 1.0 );
			gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );

			#include <logdepthbuf_vertex>

		}`,

    fragmentShader: /* glsl */`
        uniform vec3 color;
        uniform sampler2D tDiffuse;
        uniform sampler2D tDepth;
        uniform sampler2D tDiffuseBlur;
        uniform sampler2D distortionMap;
        uniform float mixBlur;
        uniform float mixStrength;
        uniform float minDepthThreshold;
        uniform float maxDepthThreshold;
        uniform float depthScale;
        uniform float depthToBlurRatioBias;
        uniform float distortion;
        uniform float mixContrast;
        uniform vec2 blurSize;
        uniform int debug;
        uniform vec2 resolution;

        varying vec4 vUv;
        varying vec4 vWorldPosition;

        #include <common>
        #include <packing>
        #include <logdepthbuf_pars_fragment>

        float getDepth( sampler2D depthSampler, vec2 uv ) {
            #if DEPTH_PACKING == 3200
                return unpackRGBAToDepth( texture2D( depthSampler, uv ) );
            #else
                return texture2D( depthSampler, uv ).x;
            #endif
        }

        float calculateBlur(float depth, float minDepth, float maxDepth, float scale, float bias) {
            float depthRange = maxDepth - minDepth;
            float depthRatio = (depth - minDepth) / depthRange;
            float blurRatio = clamp(depthRatio, 0.0, 1.0);

            return saturate(blurRatio * scale + bias);
        }

        vec2 distortUv(vec2 uv, float distortionAmount, sampler2D distortionMap) {
            if(distortionMap == null){
                return uv;
            }

            vec4 distortionSample = texture2D(distortionMap, uv);
            vec2 distortionOffset = (distortionSample.rg * 2.0 - 1.0) * distortionAmount;

            return uv + distortionOffset;
        }

        vec3 applyContrast (vec3 rgb, float contrast){
            vec3 avg = vec3(0.5);
            return avg + (rgb - avg) * contrast;
        }

        void main() {
            #include <logdepthbuf_fragment>

            vec4 base = texture2DProj( tDiffuse, vUv );
            vec4 blur = texture2DProj( tDiffuseBlur, vUv );
            float depth = 1.0;
            #ifdef USE_DEPTH
                depth = getDepth( tDepth, vUv.xy / vUv.w );
            #endif

            float blurRatio = 0.0;

            #ifdef USE_DEPTH
                blurRatio = calculateBlur(depth, minDepthThreshold, maxDepthThreshold, depthScale, depthToBlurRatioBias);
            #endif

            #ifdef USE_BLUR
                vec2 uv = distortUv(vUv.xy/ vUv.w, distortion, distortionMap);
                base = texture2D( tDiffuse, uv );
                blur = texture2D( tDiffuseBlur, uv );
                vec3 finalColor = mix(base, blur, blurRatio).rgb;
            #else
                vec3 finalColor = base.rgb;
            #endif

            finalColor = applyContrast(finalColor, mixContrast);

            if(debug == 1){
                gl_FragColor = vec4(vec3(depth), 1.0);
            } else if (debug == 2){
                 gl_FragColor = vec4(vec3(blurRatio), 1.0);
            }else if (debug == 3){
                gl_FragColor = vec4(blur.rgb, 1.0);
             }else if (debug == 4){
                gl_FragColor = vec4(base.rgb, 1.0);
            }else {
               gl_FragColor = vec4( mix( finalColor, color, mixStrength ), 1.0 );
            }

            #include <tonemapping_fragment>
            #include <colorspace_fragment>
        }`
}

export { MyReflectorShader }