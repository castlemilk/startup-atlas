export type MotionRole = 'feedback' | 'context';
export type MotionResult = { animated: boolean; reason: string | null };
export type MotionProfile = Readonly<{
  duration: number;
  easing: string;
  fallbackEasing: string | null;
  curve: 'fluid-firm' | 'signal-fallback';
  reason: string | null;
}>;
export type FluidSignalController = Readonly<{
  transition(layer: HTMLElement, options?: { from?: { x: number; y: number }; role?: MotionRole }): MotionResult;
  cancel(layer: HTMLElement): void;
  settle(): void;
  destroy(): void;
  inspect(): Readonly<{ disposed: boolean; reducedMotion: boolean | null; preferenceObservable: boolean; hidden: boolean; activeAnimations: number }>;
}>;
export declare const fluidSignalVersion: Readonly<{ adapter: '0.1.0'; fluid: '0.1.2' }>;
export declare function getSignalMotionProfile(root: HTMLElement, role?: MotionRole): MotionProfile;
export declare function mountFluidSignal(root: HTMLElement): FluidSignalController;
