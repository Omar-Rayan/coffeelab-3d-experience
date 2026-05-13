// Cinematic shader pass: vignette + film grain + chromatic aberration

export const CinematicShader = {
    uniforms: {
        tDiffuse:         { value: null },
        time:             { value: 0.0 },
        vignetteStrength: { value: 0.85 },
        grainStrength:    { value: 0.06 },
        aberrationAmount: { value: 0.004 }
    },

    vertexShader: `
        varying vec2 vUv;
        void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
    `,

    fragmentShader: `
        uniform sampler2D tDiffuse;
        uniform float time;
        uniform float vignetteStrength;
        uniform float grainStrength;
        uniform float aberrationAmount;
        varying vec2 vUv;

        float rand(vec2 co) {
            return fract(sin(dot(co, vec2(12.9898, 78.233))) * 43758.5453);
        }

        void main() {
            vec2 uv = vUv;
            float dist = distance(uv, vec2(0.5));

            vec2 dir = normalize(uv - vec2(0.5)) * dist * aberrationAmount;
            float r = texture2D(tDiffuse, uv + dir).r;
            float g = texture2D(tDiffuse, uv).g;
            float b = texture2D(tDiffuse, uv - dir).b;
            vec3 col = vec3(r, g, b);

            float vig = smoothstep(0.8, 0.2, dist);
            col *= mix(1.0, vig, vignetteStrength);

            float grain = rand(uv * (time + 1.0)) - 0.5;
            col += grain * grainStrength;

            gl_FragColor = vec4(col, 1.0);
        }
    `
};
