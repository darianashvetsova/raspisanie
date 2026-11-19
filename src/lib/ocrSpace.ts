// OCR.space API client — sends image to https://api.ocr.space/parse/image
// and returns extracted text. Uses free 'helloworld' key by default,
// or a user-provided key from localStorage.

const OCR_SPACE_URL = 'https://api.ocr.space/parse/image';
const DEFAULT_API_KEY = 'helloworld';
const STORAGE_KEY = 'ocr-space-api-key';

export function getOcrApiKey(): string {
  try {
    return localStorage.getItem(STORAGE_KEY) || DEFAULT_API_KEY;
  } catch {
    return DEFAULT_API_KEY;
  }
}

export function setOcrApiKey(key: string): void {
  try {
    if (key.trim()) {
      localStorage.setItem(STORAGE_KEY, key.trim());
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  } catch {
    /* ignore */
  }
}

export interface OcrResult {
  text: string;
  exitCode: number;
  error: string | null;
}

export async function recognizeImage(blob: Blob): Promise<OcrResult> {
  const apiKey = getOcrApiKey();
  const formData = new FormData();
  formData.append('apikey', apiKey);
  formData.append('language', 'rus');
  formData.append('isOverlayRequired', 'false');
  formData.append('OCREngine', '2');
  formData.append('file', blob, 'screenshot.jpg');

  const resp = await fetch(OCR_SPACE_URL, {
    method: 'POST',
    body: formData,
  });

  if (!resp.ok) {
    return {
      text: '',
      exitCode: -1,
      error: `HTTP ${resp.status}: ${resp.statusText}`,
    };
  }

  const data = await resp.json();

  // OCR.space returns ParsedResults array or an error
  const exitCode: number = data.ExitCode ?? -1;
  if (exitCode !== 1) {
    const raw =
      data.ErrorMessage?.[0] ??
      (Array.isArray(data.ErrorMessage) && data.ErrorMessage.length > 0
        ? data.ErrorMessage.join('; ')
        : null) ??
      data.ErrorDetails ??
      `OCR.space вернул ошибку (ExitCode ${exitCode})`;
    const errMsg = String(raw).trim() || `OCR.space вернул ошибку (ExitCode ${exitCode})`;
    console.error('OCR.space error:', errMsg, data);
    return { text: '', exitCode, error: errMsg };
  }

  const results: Array<{ ParsedText?: string }> = data.ParsedResults ?? [];
  const text = results.map((r) => r.ParsedText ?? '').join('\n');

  return { text, exitCode, error: text.trim() ? null : 'Текст не распознан' };
}
