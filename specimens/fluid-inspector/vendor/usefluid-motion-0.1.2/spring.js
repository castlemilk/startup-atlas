export const springs = {
    snappy: { w: 22, z: 0.8 },
    soft: { w: 13, z: 0.86 },
    bouncy: { w: 17, z: 0.58 },
    firm: { w: 32, z: 1 },
};
const out = { x: 0, v: 0 };
export function stepSpring(x, v, target, w, z, dt) {
    const d = x - target;
    if (z < 1) {
        const wd = w * Math.sqrt(1 - z * z);
        const e = Math.exp(-z * w * dt);
        const c = Math.cos(wd * dt);
        const s = Math.sin(wd * dt);
        const b = (v + z * w * d) / wd;
        out.x = target + e * (d * c + b * s);
        out.v = e * (v * c - ((z * w * v + w * w * d) / wd) * s);
    }
    else if (z === 1) {
        const e = Math.exp(-w * dt);
        const b = v + w * d;
        out.x = target + e * (d + b * dt);
        out.v = e * (v - w * b * dt);
    }
    else {
        const k = w * Math.sqrt(z * z - 1);
        const r1 = -z * w + k;
        const r2 = -z * w - k;
        const a = (v - r2 * d) / (r1 - r2);
        const b = d - a;
        const e1 = Math.exp(r1 * dt);
        const e2 = Math.exp(r2 * dt);
        out.x = target + a * e1 + b * e2;
        out.v = a * r1 * e1 + b * r2 * e2;
    }
    return out;
}
const REST_X = 0.001;
const REST_V = 0.01;
export function createSpring(initial, config = springs.snappy) {
    const spring = {
        value: initial,
        velocity: 0,
        target: initial,
        step(dt) {
            const r = stepSpring(spring.value, spring.velocity, spring.target, config.w, config.z, dt);
            spring.value = r.x;
            spring.velocity = r.v;
            if (Math.abs(r.x - spring.target) < REST_X && Math.abs(r.v) < REST_V) {
                spring.value = spring.target;
                spring.velocity = 0;
                return false;
            }
            return true;
        },
        jump(value) {
            spring.value = spring.target = value;
            spring.velocity = 0;
        },
    };
    return spring;
}
export function springCss(config = springs.snappy, samples = 40) {
    let t = 0;
    const dt = 1 / 120;
    const probe = createSpring(0, config);
    probe.target = 1;
    while (probe.step(dt) && t < 6)
        t += dt;
    const replay = createSpring(0, config);
    replay.target = 1;
    const stops = ["0"];
    for (let i = 1; i < samples; i++) {
        replay.step(t / samples);
        stops.push(replay.value.toFixed(4));
    }
    stops.push("1");
    const easing = `linear(${stops.join(", ")})`;
    const duration = Math.round(t * 1000);
    return {
        easing,
        duration,
        transition(property, delay = 0) {
            return {
                transitionProperty: property,
                transitionDuration: `${duration}ms`,
                transitionDelay: `${delay}ms`,
                transitionTimingFunction: easing,
            };
        },
    };
}
