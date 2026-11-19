import { type SpringConfig } from "./spring.js";
export type MorpherConfig = SpringConfig & {
    points?: number;
    spread?: number;
};
export type Morpher = {
    to(d: string): void;
    jump(d: string): void;
    step(dt: number): boolean;
    path(): string;
};
export declare function createMorpher(initial: string, config?: MorpherConfig): Morpher;
