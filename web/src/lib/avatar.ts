const ACCEPTED_AVATAR_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_SOURCE_BYTES = 10 * 1024 * 1024;
const MAX_OUTPUT_BYTES = 480 * 1024;

export const AVATAR_ACCEPT = 'image/jpeg,image/png,image/webp';

function fileToDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('图片读取失败，请重新选择。'));
    reader.readAsDataURL(file);
  });
}

function loadImage(source: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('图片无法解析，请选择其他图片。'));
    image.src = source;
  });
}

function canvasBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

export async function prepareAvatar(file: File): Promise<string> {
  if (!ACCEPTED_AVATAR_TYPES.has(file.type)) {
    throw new Error('仅支持 JPEG、PNG 或 WebP 图片。');
  }
  if (file.size > MAX_SOURCE_BYTES) {
    throw new Error('原图不得超过 10MB。');
  }

  const source = await fileToDataUrl(file);
  const image = await loadImage(source);
  if (!image.naturalWidth || !image.naturalHeight) throw new Error('图片尺寸无效。');

  const cropSize = Math.min(image.naturalWidth, image.naturalHeight);
  const sourceX = Math.round((image.naturalWidth - cropSize) / 2);
  const sourceY = Math.round((image.naturalHeight - cropSize) / 2);
  const attempts = [
    { size: 512, quality: 0.84 },
    { size: 448, quality: 0.74 },
    { size: 384, quality: 0.64 },
  ];

  for (const attempt of attempts) {
    const canvas = document.createElement('canvas');
    canvas.width = attempt.size;
    canvas.height = attempt.size;
    const context = canvas.getContext('2d', { alpha: true });
    if (!context) throw new Error('当前浏览器无法处理头像图片。');
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    context.drawImage(
      image,
      sourceX,
      sourceY,
      cropSize,
      cropSize,
      0,
      0,
      attempt.size,
      attempt.size,
    );
    const blob = await canvasBlob(canvas, 'image/webp', attempt.quality)
      ?? await canvasBlob(canvas, 'image/jpeg', attempt.quality);
    if (blob && blob.size <= MAX_OUTPUT_BYTES) return fileToDataUrl(blob);
  }

  throw new Error('图片压缩后仍然过大，请选择更小的图片。');
}
