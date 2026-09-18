// imageToWebp.ts — 브라우저에서 아무 이미지(PNG/JPEG/GIF/BMP/AVIF/SVG…)를 WebP로 변환 + 리사이즈.
// 서버 없이 <canvas>.toBlob('image/webp')만 쓴다. 카드 배경 업로드(카드 컬렉션 어드민)에서
// 사용자가 원본 형식/크기를 신경 쓰지 않아도 되게 하기 위함.
//
// - 긴 변이 maxWidth/maxHeight를 넘으면 비율 유지하며 축소(확대는 안 함).
// - 브라우저가 WebP 인코딩을 지원하지 않으면(toBlob이 null 또는 다른 MIME 반환) null을 돌려주고
//   호출부가 원본을 그대로 올리도록 한다.
// - HEIC 등 브라우저가 디코드 못 하는 형식은 이미지 로드 자체가 실패 → 에러 throw.

export interface ToWebpOptions {
    /** 결과 최대 폭(px). 기본 1200 — 카드 권장 600×1000의 2배(레티나). */
    maxWidth?: number;
    /** 결과 최대 높이(px). 기본 2000. */
    maxHeight?: number;
    /** 0~1. 기본 0.85. */
    quality?: number;
}

export interface WebpResult {
    blob: Blob;
    width: number;
    height: number;
}

function loadImage(file: Blob): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
        const url = URL.createObjectURL(file);
        const img = new Image();
        img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
        img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('이미지를 읽을 수 없습니다(지원하지 않는 형식일 수 있습니다).')); };
        img.src = url;
    });
}

export async function convertImageToWebp(file: Blob, opts: ToWebpOptions = {}): Promise<WebpResult | null> {
    const maxWidth = opts.maxWidth ?? 1200;
    const maxHeight = opts.maxHeight ?? 2000;
    const quality = opts.quality ?? 0.85;

    const img = await loadImage(file);
    const srcW = img.naturalWidth || img.width;
    const srcH = img.naturalHeight || img.height;
    if (!srcW || !srcH) throw new Error('이미지 크기를 알 수 없습니다.');

    const scale = Math.min(1, maxWidth / srcW, maxHeight / srcH);
    const width = Math.max(1, Math.round(srcW * scale));
    const height = Math.max(1, Math.round(srcH * scale));

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, width, height);

    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/webp', quality));
    // 미지원 브라우저는 null이거나 PNG로 폴백해서 돌려준다 — 둘 다 "변환 실패"로 취급.
    if (!blob || blob.type !== 'image/webp') return null;
    return { blob, width, height };
}
