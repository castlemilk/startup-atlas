export type SpringConfig = {
    w: number;
    z: number;
};
export declare const springs: {
    snappy: {
        w: number;
        z: number;
    };
    soft: {
        w: number;
        z: number;
    };
    bouncy: {
        w: number;
        z: number;
    };
    firm: {
        w: number;
        z: number;
    };
};
export declare function stepSpring(x: number, v: number, target: number, w: number, z: number, dt: number): {
    x: number;
    v: number;
};
export type Spring = {
    value: number;
    velocity: number;
    target: number;
    step(dt: number): boolean;
    jump(value: number): void;
};
export declare function createSpring(initial: number, config?: SpringConfig): Spring;
export declare function springCss(config?: SpringConfig, samples?: number): {
    easing: string;
    duration: number;
    transition(property: string, delay?: number): {
        transitionProperty: string;
        transitionDuration: string;
        transitionDelay: string;
        transitionTimingFunction: string;
    };
};
