export class PathError extends Error {
}
const NUMBER = /[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/y;
const KNOWN = "MLHVCSQTAZ";
function arcToCubics(x0, y0, rx, ry, deg, large, sweep, x, y) {
    const result = [];
    if (x0 === x && y0 === y)
        return result;
    rx = Math.abs(rx);
    ry = Math.abs(ry);
    if (!rx || !ry)
        return [{ c: "C", x1: x0, y1: y0, x2: x, y2: y, x, y }];
    const phi = (deg * Math.PI) / 180;
    const cos = Math.cos(phi);
    const sin = Math.sin(phi);
    const dx = (x0 - x) / 2;
    const dy = (y0 - y) / 2;
    const xp = cos * dx + sin * dy;
    const yp = -sin * dx + cos * dy;
    const scale = (xp * xp) / (rx * rx) + (yp * yp) / (ry * ry);
    if (scale > 1) {
        rx *= Math.sqrt(scale);
        ry *= Math.sqrt(scale);
    }
    const den = rx * rx * yp * yp + ry * ry * xp * xp;
    const k = (large === sweep ? -1 : 1) * Math.sqrt(Math.max(0, (rx * rx * ry * ry - den) / den));
    const cxp = (k * rx * yp) / ry;
    const cyp = (-k * ry * xp) / rx;
    const cx = cos * cxp - sin * cyp + (x0 + x) / 2;
    const cy = sin * cxp + cos * cyp + (y0 + y) / 2;
    const start = Math.atan2((yp - cyp) / ry, (xp - cxp) / rx);
    let delta = Math.atan2((-yp - cyp) / ry, (-xp - cxp) / rx) - start;
    if (sweep && delta < 0)
        delta += Math.PI * 2;
    if (!sweep && delta > 0)
        delta -= Math.PI * 2;
    const n = Math.ceil(Math.abs(delta) / (Math.PI / 2) - 1e-9);
    const step = delta / n;
    const t = (4 / 3) * Math.tan(step / 4);
    const point = (ex, ey) => ({
        x: cos * rx * ex - sin * ry * ey + cx,
        y: sin * rx * ex + cos * ry * ey + cy,
    });
    for (let i = 0; i < n; i++) {
        const a = start + i * step;
        const b = a + step;
        const p1 = point(Math.cos(a) - t * Math.sin(a), Math.sin(a) + t * Math.cos(a));
        const p2 = point(Math.cos(b) + t * Math.sin(b), Math.sin(b) - t * Math.cos(b));
        const p = i === n - 1 ? { x, y } : point(Math.cos(b), Math.sin(b));
        result.push({ c: "C", x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y, x: p.x, y: p.y });
    }
    return result;
}
export function parsePath(d) {
    const out = [];
    let i = 0;
    const skip = () => {
        while (i < d.length && /[\s,]/.test(d[i]))
            i++;
    };
    const number = () => {
        skip();
        NUMBER.lastIndex = i;
        const m = NUMBER.exec(d);
        if (!m)
            throw new PathError(`Expected a number at position ${i}`);
        i = NUMBER.lastIndex;
        return Number(m[0]);
    };
    const flag = () => {
        skip();
        const f = d[i];
        if (f !== "0" && f !== "1")
            throw new PathError(`Expected an arc flag at position ${i}`);
        i++;
        return Number(f);
    };
    let x = 0, y = 0, sx = 0, sy = 0;
    let cx = 0, cy = 0;
    let prev = "";
    let cmd = "";
    const line = (nx, ny) => {
        out.push({ c: "C", x1: x, y1: y, x2: nx, y2: ny, x: nx, y: ny });
        x = nx;
        y = ny;
    };
    const cubic = (x1, y1, x2, y2, nx, ny) => {
        out.push({ c: "C", x1, y1, x2, y2, x: nx, y: ny });
        cx = x2;
        cy = y2;
        x = nx;
        y = ny;
    };
    const quad = (qx, qy, nx, ny) => {
        out.push({
            c: "C",
            x1: x + (2 / 3) * (qx - x), y1: y + (2 / 3) * (qy - y),
            x2: nx + (2 / 3) * (qx - nx), y2: ny + (2 / 3) * (qy - ny),
            x: nx, y: ny,
        });
        cx = qx;
        cy = qy;
        x = nx;
        y = ny;
    };
    skip();
    while (i < d.length) {
        if (/[a-zA-Z]/.test(d[i])) {
            cmd = d[i++];
            if (!KNOWN.includes(cmd.toUpperCase()))
                throw new PathError(`Unknown command ${cmd}`);
        }
        else if (!cmd || cmd === "z" || cmd === "Z") {
            throw new PathError(`Unexpected character at position ${i}`);
        }
        const up = cmd.toUpperCase();
        const rel = cmd !== up;
        const ox = rel ? x : 0;
        const oy = rel ? y : 0;
        if (!out.length && up !== "M")
            throw new PathError("A path must start with M");
        switch (up) {
            case "M": {
                x = sx = number() + ox;
                y = sy = number() + oy;
                out.push({ c: "M", x, y });
                cmd = rel ? "l" : "L";
                break;
            }
            case "L": {
                const nx = number() + ox;
                line(nx, number() + oy);
                break;
            }
            case "H":
                line(number() + ox, y);
                break;
            case "V":
                line(x, number() + oy);
                break;
            case "C": {
                const x1 = number() + ox, y1 = number() + oy, x2 = number() + ox, y2 = number() + oy;
                const nx = number() + ox;
                cubic(x1, y1, x2, y2, nx, number() + oy);
                break;
            }
            case "S": {
                const smooth = prev === "C" || prev === "S";
                const x1 = smooth ? 2 * x - cx : x, y1 = smooth ? 2 * y - cy : y;
                const x2 = number() + ox, y2 = number() + oy, nx = number() + ox;
                cubic(x1, y1, x2, y2, nx, number() + oy);
                break;
            }
            case "Q": {
                const qx = number() + ox, qy = number() + oy, nx = number() + ox;
                quad(qx, qy, nx, number() + oy);
                break;
            }
            case "T": {
                const smooth = prev === "Q" || prev === "T";
                const qx = smooth ? 2 * x - cx : x, qy = smooth ? 2 * y - cy : y;
                const nx = number() + ox;
                quad(qx, qy, nx, number() + oy);
                break;
            }
            case "A": {
                const rx = number(), ry = number(), deg = number(), large = flag(), sweep = flag();
                const nx = number() + ox, ny = number() + oy;
                out.push(...arcToCubics(x, y, rx, ry, deg, large, sweep, nx, ny));
                x = nx;
                y = ny;
                break;
            }
            case "Z": {
                out.push({ c: "Z" });
                x = sx;
                y = sy;
                break;
            }
        }
        prev = up;
        skip();
    }
    if (!out.some((c) => c.c === "C"))
        throw new PathError("This path draws nothing");
    return out;
}
const round = (n) => +n.toFixed(2);
export function serializePath(commands) {
    return commands
        .map((c) => c.c === "M" ? `M${round(c.x)} ${round(c.y)}`
        : c.c === "Z" ? "Z"
            : `C${round(c.x1)} ${round(c.y1)} ${round(c.x2)} ${round(c.y2)} ${round(c.x)} ${round(c.y)}`)
        .join("");
}
function bezier(p0, p1, p2, p3, t) {
    const u = 1 - t;
    return u * u * u * p0 + 3 * u * u * t * p1 + 3 * u * t * t * p2 + t * t * t * p3;
}
function flatten(commands, steps = 28) {
    const polys = [];
    let cur = null;
    let x = 0, y = 0, sx = 0, sy = 0;
    for (const c of commands) {
        if (c.c === "M") {
            cur = { x: [c.x], y: [c.y] };
            polys.push(cur);
            x = sx = c.x;
            y = sy = c.y;
        }
        else if (c.c === "Z") {
            x = sx;
            y = sy;
            cur = null;
        }
        else {
            if (!cur) {
                cur = { x: [x], y: [y] };
                polys.push(cur);
            }
            const straight = c.x1 === x && c.y1 === y && c.x2 === c.x && c.y2 === c.y;
            const n = straight ? 1 : steps;
            for (let i = 1; i <= n; i++) {
                const t = i / n;
                cur.x.push(bezier(x, c.x1, c.x2, c.x, t));
                cur.y.push(bezier(y, c.y1, c.y2, c.y, t));
            }
            x = c.x;
            y = c.y;
        }
    }
    return polys.filter((p) => p.x.length > 2);
}
export function fitPath(d, size = 120, padding = 0) {
    const commands = parsePath(d);
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const p of flatten(commands)) {
        for (let i = 0; i < p.x.length; i++) {
            minX = Math.min(minX, p.x[i]);
            maxX = Math.max(maxX, p.x[i]);
            minY = Math.min(minY, p.y[i]);
            maxY = Math.max(maxY, p.y[i]);
        }
    }
    const span = Math.max(maxX - minX, maxY - minY);
    if (!(span > 0) || !isFinite(span))
        throw new PathError("This path has no size");
    const k = (size - padding * 2) / span;
    const X = (v) => (v - (minX + maxX) / 2) * k + size / 2;
    const Y = (v) => (v - (minY + maxY) / 2) * k + size / 2;
    return serializePath(commands.map((c) => c.c === "M" ? { c: "M", x: X(c.x), y: Y(c.y) }
        : c.c === "Z" ? c
            : { c: "C", x1: X(c.x1), y1: Y(c.y1), x2: X(c.x2), y2: Y(c.y2), x: X(c.x), y: Y(c.y) }));
}
export function sampleContours(d, count = 160) {
    const contours = flatten(parsePath(d)).map((p) => {
        const n = p.x.length;
        const lengths = new Float64Array(n + 1);
        for (let i = 0; i < n; i++) {
            const j = (i + 1) % n;
            lengths[i + 1] = lengths[i] + Math.hypot(p.x[j] - p.x[i], p.y[j] - p.y[i]);
        }
        const total = lengths[n];
        const x = new Float64Array(count);
        const y = new Float64Array(count);
        let seg = 0;
        for (let i = 0; i < count; i++) {
            const at = (i / count) * total;
            while (seg < n - 1 && lengths[seg + 1] < at)
                seg++;
            const len = lengths[seg + 1] - lengths[seg] || 1;
            const t = (at - lengths[seg]) / len;
            const j = (seg + 1) % n;
            x[i] = p.x[seg] + (p.x[j] - p.x[seg]) * t;
            y[i] = p.y[seg] + (p.y[j] - p.y[seg]) * t;
        }
        let signed = 0, cx = 0, cy = 0;
        for (let i = 0; i < count; i++) {
            const j = (i + 1) % count;
            signed += x[i] * y[j] - x[j] * y[i];
            cx += x[i];
            cy += y[i];
        }
        if (signed < 0) {
            x.reverse();
            y.reverse();
        }
        return { x, y, area: Math.abs(signed) / 2, cx: cx / count, cy: cy / count };
    });
    return contours.sort((a, b) => b.area - a.area);
}
