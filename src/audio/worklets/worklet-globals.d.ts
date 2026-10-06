// Minimal typings for the AudioWorkletGlobalScope (not part of lib.dom).
declare abstract class AudioWorkletProcessor {
  readonly port: MessagePort;
  constructor(options?: { processorOptions?: unknown; numberOfInputs?: number; numberOfOutputs?: number });
  abstract process(inputs: Float32Array[][], outputs: Float32Array[][], parameters: Record<string, Float32Array>): boolean;
}
declare function registerProcessor(name: string, ctor: new (options: { processorOptions?: unknown }) => AudioWorkletProcessor): void;
declare const sampleRate: number;
declare const currentFrame: number;
declare const currentTime: number;
