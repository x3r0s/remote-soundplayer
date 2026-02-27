// =============================================
// 제어 명령 메시지 타입 (컨트롤러 ↔ 서버)
// TCP length-prefix 프레임으로 전송됨
// 포맷: [4 bytes: uint32 BE payload length][N bytes: JSON payload]
// =============================================

export interface FileInfo {
  id: string
  name: string
  size: number       // bytes
  duration?: number  // seconds (재생 후 알 수 있음)
  addedAt: number    // unix timestamp
}

export interface PlaybackState {
  status: 'playing' | 'paused' | 'stopped'
  currentFileId: string | null
  positionMs: number   // 밀리초
  durationMs: number   // 밀리초
  volume: number       // 0.0 ~ 1.0
  loop: boolean
}

// ---- 컨트롤러 → 서버 ----

export interface PingMessage {
  type: 'PING'
  id: string
  timestamp: number
}

export interface GetFileListMessage {
  type: 'GET_FILE_LIST'
  id: string
  timestamp: number
}

export interface PlayMessage {
  type: 'PLAY'
  id: string
  timestamp: number
  fileId: string
}

export interface PauseMessage {
  type: 'PAUSE'
  id: string
  timestamp: number
}

export interface StopMessage {
  type: 'STOP'
  id: string
  timestamp: number
}

export interface SetVolumeMessage {
  type: 'SET_VOLUME'
  id: string
  timestamp: number
  volume: number  // 0.0 ~ 1.0
}

export interface SetLoopMessage {
  type: 'SET_LOOP'
  id: string
  timestamp: number
  loop: boolean
}

export interface SeekMessage {
  type: 'SEEK'
  id: string
  timestamp: number
  positionMs: number
}

export interface FileTransferStartMessage {
  type: 'FILE_TRANSFER_START'
  id: string
  timestamp: number
  fileId: string
  fileName: string
  fileSize: number
}

export interface DeleteFileMessage {
  type: 'DELETE_FILE'
  id: string
  timestamp: number
  fileId: string
}

// ---- 서버 → 컨트롤러 ----

export interface PongMessage {
  type: 'PONG'
  id: string
  timestamp: number
}

export interface FileListMessage {
  type: 'FILE_LIST'
  id: string
  timestamp: number
  files: FileInfo[]
}

export interface PlaybackStateMessage {
  type: 'PLAYBACK_STATE'
  id: string
  timestamp: number
  state: PlaybackState
}

export interface FileTransferAckMessage {
  type: 'FILE_TRANSFER_ACK'
  id: string
  timestamp: number
  fileId: string
  accepted: boolean
  reason?: string
}

export interface FileTransferDoneMessage {
  type: 'FILE_TRANSFER_DONE'
  id: string
  timestamp: number
  fileId: string
  success: boolean
}

export interface ErrorMessage {
  type: 'ERROR'
  id: string
  timestamp: number
  code: string
  message: string
}

// ---- 파일 전송 포트(9877)에서 사용하는 헤더 ----
// length-prefix JSON 프레임으로 먼저 전송 후 raw binary 데이터 전송
export interface TransferHeaderMessage {
  fileId: string
  fileName: string
  fileSize: number
}

// ---- Union 타입 ----

export type ControllerToServerMessage =
  | PingMessage
  | GetFileListMessage
  | PlayMessage
  | PauseMessage
  | StopMessage
  | SetVolumeMessage
  | SetLoopMessage
  | SeekMessage
  | FileTransferStartMessage
  | DeleteFileMessage

export type ServerToControllerMessage =
  | PongMessage
  | FileListMessage
  | PlaybackStateMessage
  | FileTransferAckMessage
  | FileTransferDoneMessage
  | ErrorMessage

export type AppMessage = ControllerToServerMessage | ServerToControllerMessage
