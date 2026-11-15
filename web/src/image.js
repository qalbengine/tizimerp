import { post } from './api.js';

const READ_ERR = "Rasmni o'qib bo'lmadi. Rasmni JPEG formatda oling (kamera sozlamalarida \"Eng mos\" format)";

// Rasmni siqish: uzun tomoni 1280 px, JPEG (telefon rasmlari 5 MB dan oshib ketmasligi uchun)
export function compressImage(file, max = 1280, quality = 0.82) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      try {
        const scale = Math.min(1, max / Math.max(img.width, img.height));
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', quality));
      } catch (e) {
        reject(new Error(READ_ERR));
      } finally { URL.revokeObjectURL(url); }
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error(READ_ERR)); };
    img.src = url;
  });
}

// Siqib serverga yuboradi; server Telegram'ga saqlab, file_id qaytaradi
export async function uploadPhoto(kind, file) {
  const data = await compressImage(file);
  const r = await post('/uploads/photo', { kind, data });
  return { fileId: r.fileId, preview: data };
}