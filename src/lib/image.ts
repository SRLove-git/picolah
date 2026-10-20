const MAX_INPUT_BYTES = 12 * 1024 * 1024;
const MAX_EDGE = 1280;
const MAX_DATA_URL_LENGTH = 2_400_000;

async function loadBitmap(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(file);
    } catch {
      // Fall through to the <img> decoder for formats createImageBitmap rejects.
    }
  }
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('浏览器无法读取这张图片，请换成 JPG、PNG 或 WebP。'));
    };
    image.src = url;
  });
}

function dimensions(source: ImageBitmap | HTMLImageElement): { width: number; height: number } {
  return source instanceof HTMLImageElement
    ? { width: source.naturalWidth, height: source.naturalHeight }
    : { width: source.width, height: source.height };
}

export async function prepareImage(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('请选择图片文件。');
  if (file.size > MAX_INPUT_BYTES) throw new Error('图片不能超过 12MB。');

  const source = await loadBitmap(file);
  const original = dimensions(source);
  if (!original.width || !original.height) throw new Error('图片尺寸无效。');

  try {
    let maxEdge = MAX_EDGE;
    let quality = 0.84;
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const scale = Math.min(1, maxEdge / Math.max(original.width, original.height));
      const width = Math.max(1, Math.round(original.width * scale));
      const height = Math.max(1, Math.round(original.height * scale));
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('当前浏览器无法处理图片。');
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, width, height);
      context.drawImage(source, 0, 0, width, height);
      const dataUrl = canvas.toDataURL('image/jpeg', quality);
      if (dataUrl.length <= MAX_DATA_URL_LENGTH) return dataUrl;
      maxEdge = Math.max(640, Math.round(maxEdge * 0.8));
      quality = Math.max(0.55, quality - 0.12);
    }
    throw new Error('图片压缩后仍然过大，请换一张小一点的图片。');
  } finally {
    if (typeof ImageBitmap !== 'undefined' && source instanceof ImageBitmap) source.close();
  }
}
