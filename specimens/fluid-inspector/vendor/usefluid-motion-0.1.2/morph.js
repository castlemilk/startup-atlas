import { sampleContours } from "./path.js";
import { springs, stepSpring } from "./spring.js";
const REST = 0.02;
export function createMorpher(initial, config = springs.soft) {
    const n = config.points ?? 160;
    const spread = config.spread ?? 0.22;
    let slots = [];
    let exact = initial;
    let resting = true;
    const makeSlot = (x0, y0, index) => {
        const w = new Float64Array(n);
        const phase = index * 1.7;
        for (let i = 0; i < n; i++) {
            const a = (i / n) * Math.PI * 2;
            w[i] = config.w * (1 + spread * (0.6 * Math.sin(a * 2 + phase) + 0.4 * Math.sin(a * 5 + phase * 2)));
        }
        return {
            x: Float64Array.from(x0),
            y: Float64Array.from(y0),
            vx: new Float64Array(n),
            vy: new Float64Array(n),
            tx: Float64Array.from(x0),
            ty: Float64Array.from(y0),
            w,
        };
    };
    const align = (slot, c) => {
        let best = 0;
        let bestCost = Infinity;
        for (let off = 0; off < n; off += 2) {
            let cost = 0;
            for (let i = 0; i < n; i += 4) {
                const j = (i + off) % n;
                const dx = slot.x[i] - c.x[j];
                const dy = slot.y[i] - c.y[j];
                cost += dx * dx + dy * dy;
            }
            if (cost < bestCost) {
                bestCost = cost;
                best = off;
            }
        }
        for (let i = 0; i < n; i++) {
            const j = (i + best) % n;
            slot.tx[i] = c.x[j];
            slot.ty[i] = c.y[j];
        }
    };
    const api = {
        jump(d) {
            exact = d;
            resting = true;
            slots = sampleContours(d, n).map((c, i) => makeSlot(c.x, c.y, i));
        },
        to(d) {
            if (d === exact)
                return;
            exact = d;
            resting = false;
            const target = sampleContours(d, n);
            while (slots.length < target.length) {
                const c = target[slots.length];
                slots.push(makeSlot(new Float64Array(n).fill(c.cx), new Float64Array(n).fill(c.cy), slots.length));
            }
            slots.forEach((slot, i) => {
                const c = target[i];
                if (c) {
                    align(slot, c);
                    return;
                }
                let cx = 0, cy = 0;
                for (let p = 0; p < n; p++) {
                    cx += slot.x[p] / n;
                    cy += slot.y[p] / n;
                }
                slot.tx.fill(cx);
                slot.ty.fill(cy);
            });
        },
        step(dt) {
            if (resting)
                return false;
            let moving = false;
            for (const s of slots) {
                for (let i = 0; i < n; i++) {
                    let r = stepSpring(s.x[i], s.vx[i], s.tx[i], s.w[i], config.z, dt);
                    s.x[i] = r.x;
                    s.vx[i] = r.v;
                    if (Math.abs(r.x - s.tx[i]) > REST || Math.abs(r.v) > REST)
                        moving = true;
                    r = stepSpring(s.y[i], s.vy[i], s.ty[i], s.w[i], config.z, dt);
                    s.y[i] = r.x;
                    s.vy[i] = r.v;
                    if (Math.abs(r.x - s.ty[i]) > REST || Math.abs(r.v) > REST)
                        moving = true;
                }
            }
            if (!moving)
                api.jump(exact);
            return moving;
        },
        path() {
            if (resting)
                return exact;
            let d = "";
            for (const s of slots) {
                d += `M${s.x[0].toFixed(2)} ${s.y[0].toFixed(2)}`;
                for (let i = 1; i < n; i++)
                    d += `L${s.x[i].toFixed(2)} ${s.y[i].toFixed(2)}`;
                d += "Z";
            }
            return d;
        },
    };
    api.jump(initial);
    return api;
}
