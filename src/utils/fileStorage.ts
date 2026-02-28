import { File, Directory, Paths } from 'expo-file-system'

/** 앱 오디오 파일 저장 디렉토리 */
const AUDIO_DIR = new Directory(Paths.document, 'audio')

/** 오디오 디렉토리가 없으면 생성 */
export function ensureAudioDir(): void {
  if (!AUDIO_DIR.exists) {
    AUDIO_DIR.create()
  }
}

/** 파일 ID + 이름으로 전체 경로 반환 */
export function getAudioFilePath(fileId: string, fileName: string): string {
  const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_')
  return new File(AUDIO_DIR, `${fileId}_${safeName}`).uri
}

/** 파일 존재 여부 확인 */
export function fileExists(uri: string): boolean {
  try {
    const file = new File(uri)
    return file.exists
  } catch {
    return false
  }
}

/** 파일 크기(bytes) 반환, 없으면 0 */
export function getFileSize(uri: string): number {
  try {
    const file = new File(uri)
    return file.size ?? 0
  } catch {
    return 0
  }
}

/** 파일 삭제 */
export function deleteAudioFile(uri: string): void {
  try {
    const file = new File(uri)
    if (file.exists) {
      file.delete()
    }
  } catch (e) {
    console.error('deleteAudioFile error:', e)
  }
}

/**
 * content:// URI를 앱 오디오 디렉토리로 복사 후 URI 반환
 * (expo-document-picker 반환값은 content:// URI라 직접 읽기 어려움)
 */
export function copyToAudioDir(contentUri: string, destFileName: string): string {
  ensureAudioDir()
  const src = new File(contentUri)
  const dest = new File(AUDIO_DIR, destFileName)
  src.copy(dest)
  return dest.uri
}
