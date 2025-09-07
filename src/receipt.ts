// src/receipt.js
// 하이브리드에서 영수증 파일 저장/공유 유틸 (Capacitor 기준)
// 필요한 플러그인: @capacitor/filesystem, @capacitor/share
// 설치 후 npx cap sync 필수

import { Capacitor } from "@capacitor/core";
import { Filesystem, Directory } from "@capacitor/filesystem";
import { Share } from "@capacitor/share";

// dataURL → base64 데이터만 추출
const dataURLToBase64 = (dataUrl) => {
  if (!dataUrl) return "";
  const parts = String(dataUrl).split(",");
  return parts.length > 1 ? parts[1] : parts[0];
};

/**
 * dataUrl(JPEG) → 파일 저장
 * @param {string} dataUrl - html-to-image로 만든 dataURL (image/jpeg)
 * @param {string} baseName - 파일명 베이스 (확장자 제외)
 * @returns {Promise<string>} 파일 URI (네이티브 경로 또는 webview 변환 경로)
 */
export async function saveReceiptFile(dataUrl, baseName = "receipt") {
  const b64 = dataURLToBase64(dataUrl);
  if (!b64) throw new Error("Invalid dataUrl");

  // 파일명/경로 (문자 제한 제거)
  const safeBase = String(baseName).replace(/[\\/:*?"<>|]/g, "") || "receipt";
  const fileName = `${safeBase}.jpg`;
  const path = `receipts/${fileName}`;

  // 문서 폴더에 저장 (권한 리스크 적음). 갤러리에 두고 싶으면 ExternalStorage + Pictures/…로 바꿀 수 있음.
  await Filesystem.writeFile({
    path,
    data: b64,
    directory: Directory.Documents,
    recursive: true,
  });

  // 네이티브 파일 URI 얻기
  const { uri } = await Filesystem.getUri({
    path,
    directory: Directory.Documents,
  });

  // WebView에서 접근 가능한 경로 변환 (Android에서 content:// → file:// 변환 등)
  const viewUri = Capacitor.convertFileSrc ? Capacitor.convertFileSrc(uri) : uri;
  return viewUri;
}

/**
 * 네이티브 공유 시트 열기
 * @param {string} fileUri - saveReceiptFile에서 반환한 경로
 */
export async function shareReceiptFile(fileUri) {
  if (!fileUri) throw new Error("fileUri is required for share");
  // iOS/Android 모두 url 필드로 파일 공유 가능
  await Share.share({
    title: "이사정산 영수증",
    text: "영수증 파일을 공유합니다.",
    url: fileUri,
    dialogTitle: "공유",
  });
}
