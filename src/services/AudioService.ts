import { Audio, AVPlaybackStatus } from 'expo-av'
import { useServerStore } from '../stores/serverStore'

// =============================================
// expo-av 기반 오디오 서비스
// 서버 모드에서 사용 (아이 방 기기)
// =============================================

class AudioService {
  private sound: Audio.Sound | null = null
  private currentUri: string | null = null
  private statusUpdateInterval: ReturnType<typeof setInterval> | null = null

  /** 오디오 모드 초기화 (앱 시작 시 1회 호출) */
  async init(): Promise<void> {
    await Audio.setAudioModeAsync({
      staysActiveInBackground: true,
      shouldDuckAndroid: true,
      playThroughEarpieceAndroid: false,
      allowsRecordingIOS: false,
      playsInSilentModeIOS: true,
    })
  }

  /** 파일 로드 및 재생 */
  async play(fileUri: string, volume: number, loop: boolean): Promise<void> {
    try {
      // 기존 사운드 해제
      if (this.sound) {
        await this.unload()
      }

      this.currentUri = fileUri
      const { sound } = await Audio.Sound.createAsync(
        { uri: fileUri },
        {
          shouldPlay: true,
          volume,
          isLooping: loop,
        }
      )
      this.sound = sound

      // 재생 상태 변경 리스너 등록
      sound.setOnPlaybackStatusUpdate(this.handleStatusUpdate)

      // 스토어 업데이트
      useServerStore.getState().setPlaybackState({
        status: 'playing',
        volume,
        loop,
        positionMs: 0,
      })

      // 주기적으로 position 업데이트 (2초마다)
      this.startPositionUpdater()
    } catch (error) {
      console.error('AudioService.play error:', error)
      useServerStore.getState().setPlaybackState({ status: 'stopped' })
      throw error
    }
  }

  /** 일시정지 */
  async pause(): Promise<void> {
    if (!this.sound) return
    try {
      await this.sound.pauseAsync()
      useServerStore.getState().setPlaybackState({ status: 'paused' })
    } catch (error) {
      console.error('AudioService.pause error:', error)
    }
  }

  /** 재개 */
  async resume(): Promise<void> {
    if (!this.sound) return
    try {
      await this.sound.playAsync()
      useServerStore.getState().setPlaybackState({ status: 'playing' })
    } catch (error) {
      console.error('AudioService.resume error:', error)
    }
  }

  /** 정지 및 언로드 */
  async stop(): Promise<void> {
    this.stopPositionUpdater()
    await this.unload()
    useServerStore.getState().setPlaybackState({
      status: 'stopped',
      currentFileId: null,
      positionMs: 0,
    })
  }

  /** 볼륨 설정 (0.0 ~ 1.0) */
  async setVolume(volume: number): Promise<void> {
    if (!this.sound) {
      useServerStore.getState().setVolume(volume)
      return
    }
    try {
      await this.sound.setVolumeAsync(Math.max(0, Math.min(1, volume)))
      useServerStore.getState().setVolume(volume)
    } catch (error) {
      console.error('AudioService.setVolume error:', error)
    }
  }

  /** 반복 재생 설정 */
  async setLoop(loop: boolean): Promise<void> {
    if (!this.sound) {
      useServerStore.getState().setLoop(loop)
      return
    }
    try {
      await this.sound.setIsLoopingAsync(loop)
      useServerStore.getState().setLoop(loop)
    } catch (error) {
      console.error('AudioService.setLoop error:', error)
    }
  }

  /** 특정 위치로 이동 (밀리초) */
  async seekTo(positionMs: number): Promise<void> {
    if (!this.sound) return
    try {
      await this.sound.setPositionAsync(positionMs)
    } catch (error) {
      console.error('AudioService.seekTo error:', error)
    }
  }

  /** 현재 재생 중인지 여부 */
  get isPlaying(): boolean {
    return useServerStore.getState().playbackState.status === 'playing'
  }

  private handleStatusUpdate = (status: AVPlaybackStatus) => {
    if (!status.isLoaded) return

    const store = useServerStore.getState()

    if (status.didJustFinish && !status.isLooping) {
      // 재생 완료 (비반복 모드)
      store.setPlaybackState({
        status: 'stopped',
        positionMs: 0,
      })
    } else {
      store.setPlaybackState({
        durationMs: status.durationMillis ?? 0,
      })
    }
  }

  private startPositionUpdater(): void {
    this.stopPositionUpdater()
    this.statusUpdateInterval = setInterval(async () => {
      if (!this.sound) return
      try {
        const status = await this.sound.getStatusAsync()
        if (status.isLoaded) {
          useServerStore.getState().setPlaybackState({
            positionMs: status.positionMillis ?? 0,
            durationMs: status.durationMillis ?? 0,
          })
        }
      } catch {
        // 무시 (사운드가 언로드된 경우)
      }
    }, 2000)
  }

  private stopPositionUpdater(): void {
    if (this.statusUpdateInterval) {
      clearInterval(this.statusUpdateInterval)
      this.statusUpdateInterval = null
    }
  }

  private async unload(): Promise<void> {
    this.stopPositionUpdater()
    if (this.sound) {
      try {
        await this.sound.unloadAsync()
      } catch {
        // 무시
      }
      this.sound = null
    }
    this.currentUri = null
  }

  /** 완전 정리 */
  async destroy(): Promise<void> {
    await this.unload()
  }
}

// 싱글턴 인스턴스
export const audioService = new AudioService()
