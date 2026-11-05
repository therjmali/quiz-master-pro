/** Saving a file the user asked for: a normal download on the web, the system share sheet in the app. */
import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { isNative } from './native';

async function blobToBase64(blob: Blob): Promise<string> {
  const buf = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  for (let i = 0; i < buf.length; i += 0x8000) binary += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return btoa(binary);
}

export async function saveBlobFile(filename: string, blob: Blob): Promise<'downloaded' | 'shared'> {
  if (isNative() && Capacitor.isPluginAvailable('Filesystem')) {
    const written = await Filesystem.writeFile({ path: filename, data: await blobToBase64(blob), directory: Directory.Cache });
    await Share.share({ title: filename, files: [written.uri], dialogTitle: 'Save or share your backup' });
    return 'shared';
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return 'downloaded';
}

/** Read a user-picked file as bytes. */
export async function readFileBytes(file: File): Promise<Uint8Array> {
  return new Uint8Array(await file.arrayBuffer());
}
