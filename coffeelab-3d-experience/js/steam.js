// Steam particle shader for the brewing animation

import * as THREE from 'three';

export function createSteamParticles({ count = 200, baseY = 1.6 } = {}) {
    const geometry = new THREE.BufferGeometry();

    const positions = new Float32Array(count * 3);
    const offsets   = new Float32Array(count);
    const speeds    = new Float32Array(count);

    for (let i = 0; i < count; i++) {
        const angle = Math.random() * Math.PI * 2;
        const r = Math.random() * 0.15;
        positions[i * 3 + 0] = Math.cos(angle) * r;
        positions[i * 3 + 1] = baseY + Math.random() * 0.1;
        positions[i * 3 + 2] = Math.sin(angle) * r;
        offsets[i] = Math.random() * Math.PI * 2;
        speeds[i]  = 0.3 + Math.random() * 0.5;
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('aOffset',  new THREE.BufferAttribute(offsets, 1));
    geometry.setAttribute('aSpeed',   new THREE.BufferAttribute(speeds, 1));

    const material = new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        uniforms: {
            time:     { value: 0.0 },
            opacity:  { value: 0.0 },
            baseY:    { value: baseY },
            color:    { value: new THREE.Color(0xffffff) }
        },
        vertexShader:  `
            attribute float aOffset;
            attribute float aSpeed;
            uniform float time;
            uniform float baseY;
            varying float vAge;

            void main() {
                vec3 pos = position;            
                float life = mod(time * aSpeed * 0.5 + aOffset * 0.1, 1.0);
                vAge = life;

                pos.y = baseY + life * 1.2;
                pos.x += sin(time * aSpeed + aOffset) * 0.15 * life;
                pos.z += cos(time * aSpeed * 0.7 + aOffset) * 0.15 * life;

                vec4 mv = modelViewMatrix * vec4(pos, 1.0);
                gl_Position = projectionMatrix * mv;
                gl_PointSize = (40.0 + life * 30.0) * (1.0 / -mv.z);
            }
        `,
        fragmentShader: `
            uniform float opacity;
            uniform vec3 color;
            varying float vAge;

            void main() {
                vec2 c = gl_PointCoord - vec2(0.5);
                float d = length(c);
                if (d > 0.5) discard;
                float soft = smoothstep(0.5, 0.0, d);
                float fade = smoothstep(0.0, 0.15, vAge) * smoothstep(1.0, 0.6, vAge);
                gl_FragColor = vec4(color, soft * fade * opacity);
            }
        `
    });

    const points = new THREE.Points(geometry, material);
    points.frustumCulled = false;
    points.userData.shaderMaterial = material;
    return points;
}
