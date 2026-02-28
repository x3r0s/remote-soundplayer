import { create } from 'zustand'
import { FileInfo, PlaybackState } from '../protocol/messages'

export interface DiscoveredDevice {
  name: string       // mDNS 서비스 이름
  host: string       // 호스트명 또는 IP
  address: string    // IP 주소
  port: number       // 제어 포트 (9876)
}

interface ControllerState {
  // ---- 기기 탐색 ----
  discoveredDevices: DiscoveredDevice[]
  isScanning: boolean

  // ---- 연결 상태 ----
  selectedDevice: DiscoveredDevice | null
  connectionStatus: 'idle' | 'connecting' | 'connected' | 'error'
  connectionError: string | null

  // ---- 서버에서 받은 정보 ----
  serverFiles: FileInfo[]
  serverPlaybackState: PlaybackState | null

  // ---- 액션 ----
  addDiscoveredDevice: (device: DiscoveredDevice) => void
  removeDiscoveredDevice: (name: string) => void
  clearDiscoveredDevices: () => void
  setIsScanning: (scanning: boolean) => void
  setSelectedDevice: (device: DiscoveredDevice | null) => void
  setConnectionStatus: (status: ControllerState['connectionStatus'], error?: string) => void
  setServerFiles: (files: FileInfo[]) => void
  setServerPlaybackState: (state: PlaybackState) => void
  reset: () => void
}

export const useControllerStore = create<ControllerState>()((set) => ({
  discoveredDevices: [],
  isScanning: false,
  selectedDevice: null,
  connectionStatus: 'idle',
  connectionError: null,
  serverFiles: [],
  serverPlaybackState: null,

  addDiscoveredDevice: (device) =>
    set((s) => ({
      discoveredDevices: [
        ...s.discoveredDevices.filter((d) => d.name !== device.name),
        device,
      ],
    })),

  removeDiscoveredDevice: (name) =>
    set((s) => ({
      discoveredDevices: s.discoveredDevices.filter((d) => d.name !== name),
    })),

  clearDiscoveredDevices: () => set({ discoveredDevices: [] }),

  setIsScanning: (scanning) => set({ isScanning: scanning }),

  setSelectedDevice: (device) => set({ selectedDevice: device }),

  setConnectionStatus: (status, error) =>
    set({
      connectionStatus: status,
      connectionError: error ?? null,
    }),

  setServerFiles: (files) => set({ serverFiles: files }),

  setServerPlaybackState: (state) => set({ serverPlaybackState: state }),

  reset: () =>
    set({
      selectedDevice: null,
      connectionStatus: 'idle',
      connectionError: null,
      serverFiles: [],
      serverPlaybackState: null,
    }),
}))
