import * as FileSystem from 'expo-file-system'

/** 앱 오디오 파일 저장 디렉토리 */
export const AUDIO_DIR = `${FileSystem.documentDirectory}audio/`

/** 오디오 디렉토리가 없으면 생성 */
export async function ensureAudioDir(): Promise<void> {
  const info = await FileSystem.getInfoAsync(AUDIO_DIR)
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(AUDIO_DIR, { intermediates: true })
  }
}

/** 파일 ID + 이름으로 전체 경로 반환 */
export function getAudioFilePath(fileId: string, fileName: string): string {
  // fileId를 prefix로 붙여 충돌 방지
  const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_')
  return `${AUDIO_DIR}${fileId}_${safeName}`
}

/** 파일 존재 여부 확인 */
export async function fileExists(uri: string): Promise<boolean> {
  try {
    const info = await FileSystem.getInfoAsync(uri)
    return info.exists
  } catch {
    return false
  }
}

/** 파일 크기(bytes) 반환, 없으면 0 */
export async function getFileSize(uri: string): Promise<number> {
  try {
    const info = await FileSystem.getInfoAsync(uri, { size: true })
    if (info.exists) {
      return (info as FileSystem.FileInfo & { size: number }).size ?? 0
    }
    return 0
  } catch {
    return 0
  }
}

/** 파일 삭제 */
export async function deleteAudioFile(uri: string): Promise<void> {
  try {
    await FileSystem.deleteAsync(uri, { idempotent: true })
  } catch (e) {
    console.error('deleteAudioFile error:', e)
  }
}

/**
 * content:// URI를 앱 캐시 디렉토리로 복사 후 반환
 * (expo-document-picker 반환값은 content:// URI라 직접 읽기 어려움)
 */
export async function copyToCache(contentUri: string, fileName: string): Promise<string> {
  await ensureAudioDir()
  const dest = `${FileSystem.cacheDirectory}${fileName}`
  await FileSystem.copyAsync({ from: contentUri, to: dest })
  return dest
}
