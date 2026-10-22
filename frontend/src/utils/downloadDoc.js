/**
 * downloadDoc — works in both the browser and Capacitor WebView.
 *
 * Capacitor approach chosen: fetch blob → base64 → Filesystem.writeFile →
 * Share.share (native share sheet). This works on both Android and iOS
 * without needing any extra Capacitor plugin beyond @capacitor/core.
 *
 * On plain web it falls back to a standard <a> blob URL download.
 */
import { downloadDocument } from '../services/api';

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      // result is "data:<mime>;base64,<data>" — extract just the base64 part
      resolve(reader.result.split(',')[1]);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function isCapacitor() {
  return !!(window.Capacitor && window.Capacitor.isNative);
}

export async function downloadDoc(docId, fileName, mimeType) {
  const res = await downloadDocument(docId);
  const blob = new Blob([res.data], { type: mimeType });

  if (isCapacitor()) {
    try {
      // Dynamic import so web builds don't fail if Capacitor plugins aren't available
      const { Filesystem, Directory } = await import('@capacitor/filesystem');
      const { Share } = await import('@capacitor/share');

      const base64 = await blobToBase64(blob);
      const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
      const path = `erp_docs/${safeName}`;

      await Filesystem.writeFile({
        path,
        data: base64,
        directory: Directory.Cache,
        recursive: true,
      });

      const { uri } = await Filesystem.getUri({ path, directory: Directory.Cache });

      await Share.share({
        title: fileName,
        url: uri,
        dialogTitle: 'Open or save document',
      });
    } catch (err) {
      console.error('Capacitor download failed, trying web fallback:', err);
      _webDownload(blob, fileName);
    }
  } else {
    _webDownload(blob, fileName);
  }
}

function _webDownload(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const a   = document.createElement('a');
  a.href     = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
