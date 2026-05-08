/**
 * 画像を圧縮してBlobを返す
 * @param {File} file - 元の画像ファイル
 * @param {number} maxWidth - 最大幅（デフォルト1280px）
 * @param {number} quality - 圧縮品質 0-1（デフォルト0.8）
 * @returns {Promise<Blob>}
 */
export async function compressImage(file, maxWidth = 1280, quality = 0.8) {
  // 画像以外はそのまま返す
  if (!file.type.startsWith('image/') || file.type === 'image/gif') return file;

  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      // リサイズ計算
      let { width, height } = img;
      if (width > maxWidth) {
        height = Math.round((height * maxWidth) / width);
        width = maxWidth;
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob(
        blob => {
          if (!blob) { resolve(file); return; }
          // 圧縮後の方が大きければ元のファイルを使う
          resolve(blob.size < file.size ? blob : file);
        },
        'image/jpeg',
        quality
      );
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(file); };
    img.src = url;
  });
}

/**
 * ファイルサイズを人間が読みやすい形式に変換
 */
export function formatFileSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}
