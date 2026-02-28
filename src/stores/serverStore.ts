import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { FileInfo, PlaybackState } from '../protocol/messages'

interface ServerState {
  // ---- 영속 저장 (앱 재시작 후 복원) ----
  files: FileInfo[]
  lastPlayedFileId: string | null
  volume: number    // 0.0 ~ 1.0
  loop: boolean

  // ---- 런타임 상태 (저장 안 함) ----
  playbackState: PlaybackState
  isServerRunning: boolean
  connectedControllers: number  // 현재 연결된 컨트롤러 수

  // ---- 액션 ----
  addFile: (file: FileInfo) => void
  removeFile: (fileId: string) => void
  updateFileInfo: (fileId: string, updates: Partial<FileInfo>) => void
  setLastPlayedFileId: (fileId: string | null) => void
  setVolume: (volume: number) => void
  setLoop: (loop: boolean) => void
  setPlaybackState: (state: Partial<PlaybackState>) => void
  setServerRunning: (running: boolean) => void
  setConnectedControllers: (count: number) => void
  reset: () => void
}

const defaultPlaybackState: PlaybackState = {
  status: 'stopped',
  currentFileId: null,
  positionMs: 0,
  durationMs: 0,
  volume: 0.8,
  loop: true,
}

export const useServerStore = create<ServerState>()(
  persist(
    (set) => ({
      // 초기값
      files: [],
      lastPlayedFileId: null,
      volume: 0.8,
      loop: true,
      playbackState: defaultPlaybackState,
      isServerRunning: false,
      connectedControllers: 0,

      // 액션
      addFile: (file) =>
        set((s) => ({
          files: [...s.files.filter((f) => f.id !== file.id), file],
        })),

      removeFile: (fileId) =>
        set((s) => ({
          files: s.files.filter((f) => f.id !== fileId),
          lastPlayedFileId:
            s.lastPlayedFileId === fileId ? null : s.lastPlayedFileId,
        })),

      updateFileInfo: (fileId, updates) =>
        set((s) => ({
          files: s.files.map((f) => (f.id === fileId ? { ...f, ...updates } : f)),
        })),

      setLastPlayedFileId: (fileId) => set({ lastPlayedFileId: fileId }),

      setVolume: (volume) =>
        set((s) => ({
          volume,
          playbackState: { ...s.playbackState, volume },
        })),

      setLoop: (loop) =>
        set((s) => ({
          loop,
          playbackState: { ...s.playbackState, loop },
        })),

      setPlaybackState: (partial) =>
        set((s) => ({
          playbackState: { ...s.playbackState, ...partial },
        })),

      setServerRunning: (running) => set({ isServerRunning: running }),

      setConnectedControllers: (count) => set({ connectedControllers: count }),

      reset: () =>
        set({
          playbackState: defaultPlaybackState,
          isServerRunning: false,
          connectedControllers: 0,
        }),
    }),
    {
      name: 'server-store',
      storage: createJSONStorage(() => AsyncStorage),
      // 런타임 상태는 persist 제외
      partialize: (state) => ({
        files: state.files,
        lastPlayedFileId: state.lastPlayedFileId,
        volume: state.volume,
        loop: state.loop,
      }),
    }
  )
)
