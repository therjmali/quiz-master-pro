declare module 'zitejs-real-caller' {
  export type StreamingResponse<T> = {
    [Symbol.asyncIterator](): AsyncIterator<string>;
    result: Promise<T>;
  };
  export function createCaller<I = unknown, O = unknown>(...args: unknown[]): (input: I) => Promise<O>;
  export function createStreamingCaller<I = unknown, O = unknown>(name: string): (input: I) => StreamingResponse<O>;
}
