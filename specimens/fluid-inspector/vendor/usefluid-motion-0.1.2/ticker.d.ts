export type Tick = (dt: number) => boolean | void;
export declare function play(tick: Tick): () => void;
