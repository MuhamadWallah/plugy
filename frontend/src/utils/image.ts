/**
 * Shrinks a photo in the browser before upload (saves mobile data; the server re-encodes anyway).
 * Applies the camera's orientation. Falls back to the original file if the browser can't decode it.
 */
export const shrinkImage = async (file: File, maxSize: number, quality = 0.85): Promise<Blob> => {
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const scale = Math.min(1, maxSize / Math.max(bitmap.width, bitmap.height));
    const width = Math.round(bitmap.width * scale);
    const height = Math.round(bitmap.height * scale);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
    return blob ?? file;
  } catch {
    return file;
  }
};

/** Uploads one or more images as multipart form fields and returns the parsed JSON response */
export const uploadImages = async (
  url: string,
  files: Record<string, Blob>,
  fields: Record<string, string> = {}
): Promise<Record<string, unknown>> => {
  const form = new FormData();
  Object.entries(fields).forEach(([k, v]) => form.append(k, v));
  Object.entries(files).forEach(([k, blob]) => form.append(k, blob, `${k}.jpg`));
  const res = await fetch(url, { method: 'POST', body: form, credentials: 'include' });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error || 'Upload failed');
  return data;
};
