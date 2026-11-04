declare module 'zitejs-real-caller' {
  export function createCaller<I = unknown, O = unknown>(...args: unknown[]): (input: I) => Promise<O>;
  export function createStreamingCaller(name: string): (input: unknown) => unknown;
}
