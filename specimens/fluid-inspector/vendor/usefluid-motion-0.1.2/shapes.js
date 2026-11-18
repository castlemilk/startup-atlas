const TAU = Math.PI * 2;
const POINTS = 96;
function polar(radius) {
    let d = "";
    for (let i = 0; i < POINTS; i++) {
        const a = (i / POINTS) * TAU;
        const r = radius(a);
        d += `${i ? "L" : "M"}${(60 + r * Math.cos(a)).toFixed(2)} ${(60 + r * Math.sin(a)).toFixed(2)}`;
    }
    return `${d}Z`;
}
const squircle = (w, h, n) => (a) => (Math.abs(Math.cos(a) / w) ** n + Math.abs(Math.sin(a) / h) ** n) ** (-1 / n);
function polygon(sides, radius, rounding) {
    const k = TAU / sides;
    return (a) => {
        const edge = (radius * Math.cos(k / 2)) / Math.cos(((a + Math.PI / 2 + TAU) % k) - k / 2);
        return Math.min(edge, radius * rounding);
    };
}
export const shapes = {
    dot: polar(() => 7),
    circle: polar(() => 50),
    square: polar(squircle(48, 48, 5)),
    capsule: polar(squircle(58, 30, 3.2)),
    triangle: polar(polygon(3, 66, 0.88)),
    flower: polar((a) => 46 * (1 + 0.22 * Math.cos(5 * (a + Math.PI / 2)))),
    drop: polar((a) => 40 + 20 * ((1 + Math.sin(a - Math.PI)) / 2) ** 3),
    pebble: polar((a) => 48 * (1 + 0.1 * Math.sin(3 * a + 0.6) + 0.07 * Math.sin(5 * a + 2))),
};
