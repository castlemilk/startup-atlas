export type Command = {
    c: "M";
    x: number;
    y: number;
} | {
    c: "C";
    x1: number;
    y1: number;
    x2: number;
    y2: number;
    x: number;
    y: number;
} | {
    c: "Z";
};
export declare class PathError extends Error {
}
export declare function parsePath(d: string): Command[];
export declare function serializePath(commands: Command[]): string;
export declare function fitPath(d: string, size?: number, padding?: number): string;
export type Contour = {
    x: Float64Array;
    y: Float64Array;
    area: number;
    cx: number;
    cy: number;
};
export declare function sampleContours(d: string, count?: number): Contour[];
