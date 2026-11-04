/** gzip helpers built on the platform CompressionStream (all current browsers and Android WebView). */
export function gzipSupported(): boolean {
  return typeof CompressionStream !== 'undefined' && typeof DecompressionStream !== 'undefined';
}

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const out = await new Response(new Blob([bytes as BlobPart]).stream().pipeThrough(stream as unknown as TransformStream<Uint8Array, Uint8Array>)).arrayBuffer();
  return new Uint8Array(out);
}

export async function gzipString(text: string): Promise<Uint8Array> {
  return pipe(new TextEncoder().encode(text), new CompressionStream('gzip'));
}

export async function gunzipToString(bytes: Uint8Array): Promise<string> {
  return new TextDecoder().decode(await pipe(bytes, new DecompressionStream('gzip')));
}

export function looksGzipped(bytes: Uint8Array): boolean {
  return bytes.length > 2 && bytes[0] === 0x1f && bytes[1] === 0x8b;
}
