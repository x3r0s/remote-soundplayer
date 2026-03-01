import { useEffect, useState } from 'react'
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native'
import Slider from '@react-native-community/slider'
import { router } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { tcpClient } from '../../src/services/TcpClientService'
import { useControllerStore } from '../../src/stores/controllerStore'
import { AppMessage, FileInfo } from '../../src/protocol/messages'
import { generateId } from '../../src/utils/uuid'

export default function PlayerScreen() {
  const selectedDevice = useControllerStore((s) => s.selectedDevice)
  const connectionStatus = useControllerStore((s) => s.connectionStatus)
  const serverFiles = useControllerStore((s) => s.serverFiles)
  const playbackState = useControllerStore((s) => s.serverPlaybackState)
  const {
    setConnectionStatus,
    setServerFiles,
    setServerPlaybackState,
    reset: resetStore,
  } = useControllerStore()

  // 슬라이더 조작 중 실시간 표시를 위한 로컬 상태
  const [localVolume, setLocalVolume] = useState<number | null>(null)

  const isConnected = connectionStatus === 'connected'

  // ---- 메시지 핸들러 등록 ----

  useEffect(() => {
    if (!selectedDevice) {
      router.replace('/controller')
      return
    }

    tcpClient.setMessageHandler((msg: AppMessage) => {
      switch (msg.type) {
        case 'FILE_LIST':
          setServerFiles(msg.files)
          break
        case 'PLAYBACK_STATE':
          setServerPlaybackState(msg.state)
          break
        default:
          break
      }
    })

    return () => {
      tcpClient.disconnect()
      resetStore()
    }
  }, [selectedDevice])

  // ---- 제어 명령 ----

  const sendPlay = (fileId: string) => {
    tcpClient.send({ type: 'PLAY', id: generateId(), timestamp: Date.now(), fileId })
  }

  const sendPause = () => {
    tcpClient.send({ type: 'PAUSE', id: generateId(), timestamp: Date.now() })
  }

  const sendStop = () => {
    tcpClient.send({ type: 'STOP', id: generateId(), timestamp: Date.now() })
  }

  const sendVolume = (volume: number) => {
    tcpClient.send({
      type: 'SET_VOLUME',
      id: generateId(),
      timestamp: Date.now(),
      volume,
    })
    setLocalVolume(null) // 전송 후 로컬 상태 초기화
  }

  const sendLoop = (loop: boolean) => {
    tcpClient.send({
      type: 'SET_LOOP',
      id: generateId(),
      timestamp: Date.now(),
      loop,
    })
  }

  // ---- 렌더링 ----

  const isPlaying = playbackState?.status === 'playing'
  const isPaused = playbackState?.status === 'paused'
  const currentFileId = playbackState?.currentFileId
  const volume = playbackState?.volume ?? 0.8
  const loop = playbackState?.loop ?? true
  const currentFile = serverFiles.find((f) => f.id === currentFileId)

  // 슬라이더 조작 중이면 로컬 값, 아니면 서버 값 표시
  const displayVolume = localVolume !== null ? localVolume : volume

  if (!isConnected) {
    return (
      <SafeAreaView className="flex-1 bg-black items-center justify-center">
        <ActivityIndicator color="#fff" size="large" />
        <Text className="text-neutral-500 mt-4">연결 중...</Text>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView className="flex-1 bg-black" edges={['bottom']}>
      <View className="flex-1 px-4 pt-4">
        {/* 연결 정보 */}
        <View className="flex-row items-center mb-5 gap-2">
          <View className="w-2 h-2 rounded-full bg-white" />
          <Text className="text-neutral-300 text-sm font-medium">
            {selectedDevice?.name ?? '연결됨'}
          </Text>
          <Text className="text-neutral-700 text-xs">({selectedDevice?.address})</Text>
        </View>

        {/* 현재 재생 / 컨트롤 */}
        <View className="bg-neutral-900 border border-neutral-800 rounded-2xl p-5 mb-5">
          {/* 파일명 */}
          <Text className="text-neutral-500 text-xs tracking-wide uppercase mb-1">
            현재 선택
          </Text>
          <Text className="text-white font-semibold text-base mb-5" numberOfLines={1}>
            {currentFile ? currentFile.name : '선택된 파일 없음'}
          </Text>

          {/* 재생 컨트롤 버튼 */}
          <View className="flex-row items-center justify-center gap-5 mb-5">
            {/* 정지 */}
            <TouchableOpacity
              onPress={sendStop}
              disabled={!currentFileId}
              className="w-12 h-12 rounded-full bg-neutral-800 border border-neutral-700 items-center justify-center active:opacity-70 disabled:opacity-30"
            >
              <Ionicons name="stop" size={18} color="#fff" />
            </TouchableOpacity>

            {/* 재생/일시정지 */}
            <TouchableOpacity
              onPress={isPlaying ? sendPause : () => currentFileId && sendPlay(currentFileId)}
              disabled={!currentFileId}
              className="w-16 h-16 rounded-full bg-white items-center justify-center active:opacity-80 disabled:opacity-30"
            >
              <Ionicons
                name={isPlaying ? 'pause' : 'play'}
                size={28}
                color="#000"
                style={isPlaying ? undefined : { marginLeft: 3 }}
              />
            </TouchableOpacity>

            {/* 반복 */}
            <TouchableOpacity
              onPress={() => sendLoop(!loop)}
              className={`w-12 h-12 rounded-full items-center justify-center border ${loop
                  ? 'bg-white border-white'
                  : 'bg-neutral-800 border-neutral-700'
                } active:opacity-70`}
            >
              <Ionicons
                name="repeat"
                size={18}
                color={loop ? '#000' : '#a3a3a3'}
              />
            </TouchableOpacity>
          </View>

          {/* 볼륨 슬라이더 */}
          <View className="flex-row items-center gap-3">
            <Ionicons name="volume-low" size={18} color="#525252" />
            <Slider
              style={{ flex: 1, height: 40 }}
              minimumValue={0}
              maximumValue={1}
              step={0.01}
              value={volume}
              onValueChange={setLocalVolume}
              onSlidingComplete={sendVolume}
              minimumTrackTintColor="#ffffff"
              maximumTrackTintColor="#262626"
              thumbTintColor="#ffffff"
            />
            <Ionicons name="volume-high" size={18} color="#525252" />
            <Text className="text-neutral-400 text-xs w-10 text-right font-mono">
              {Math.round(displayVolume * 100)}%
            </Text>
          </View>
        </View>

        {/* 파일 목록 헤더 */}
        <View className="flex-row items-center justify-between mb-2">
          <Text className="text-neutral-500 text-xs font-medium tracking-wide uppercase">
            파일 목록 ({serverFiles.length})
          </Text>
        </View>

        {/* 파일 목록 */}
        {serverFiles.length === 0 ? (
          <View className="flex-1 items-center justify-center">
            <Ionicons name="folder-open-outline" size={40} color="#262626" />
            <Text className="text-neutral-600 text-sm mt-3 text-center leading-5">
              파일이 없습니다{'\n'}서버 기기에서 MP3 파일을 추가하세요
            </Text>
          </View>
        ) : (
          <FlatList
            data={serverFiles}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => {
              const isCurrent = item.id === currentFileId
              const isActive = isCurrent && isPlaying
              return (
                <TouchableOpacity
                  onPress={() => sendPlay(item.id)}
                  className={`rounded-xl p-3.5 flex-row items-center ${isCurrent
                      ? 'bg-white/5 border border-neutral-700'
                      : 'active:opacity-70'
                    }`}
                >
                  <View className={`w-8 h-8 rounded-lg items-center justify-center mr-3 ${isActive ? 'bg-white' : 'bg-neutral-800'
                    }`}>
                    <Ionicons
                      name={isActive ? 'musical-notes' : 'musical-note'}
                      size={16}
                      color={isActive ? '#000' : '#525252'}
                    />
                  </View>
                  <View className="flex-1">
                    <Text
                      className={`font-medium text-sm ${isCurrent ? 'text-white' : 'text-neutral-300'
                        }`}
                      numberOfLines={1}
                    >
                      {item.name}
                    </Text>
                    {isCurrent && (
                      <Text className="text-neutral-500 text-xs mt-0.5">
                        {isPlaying ? '재생 중' : isPaused ? '일시정지' : '선택됨'}
                      </Text>
                    )}
                  </View>
                </TouchableOpacity>
              )
            }}
            ItemSeparatorComponent={() => <View className="h-1" />}
            contentContainerStyle={{ paddingBottom: 16 }}
          />
        )}
      </View>
    </SafeAreaView>
  )
}
