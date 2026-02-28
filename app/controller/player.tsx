import { useEffect } from 'react'
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

  const isConnected = connectionStatus === 'connected'

  // ---- 메시지 핸들러 등록 ----

  useEffect(() => {
    if (!selectedDevice) {
      router.replace('/controller')
      return
    }

    // 이 화면에서 수신할 메시지 핸들러 등록
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
  const loop = playbackState?.loop ?? false
  const currentFile = serverFiles.find((f) => f.id === currentFileId)

  if (!isConnected) {
    return (
      <SafeAreaView className="flex-1 bg-gray-900 items-center justify-center">
        <ActivityIndicator color="#6366f1" size="large" />
        <Text className="text-gray-400 mt-4">연결 중...</Text>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView className="flex-1 bg-gray-900" edges={['bottom']}>
      <View className="flex-1 px-4 pt-4">
        {/* 연결 정보 */}
        <View className="flex-row items-center mb-4 gap-2">
          <View className="w-2 h-2 rounded-full bg-green-500" />
          <Text className="text-green-400 text-sm font-medium">
            {selectedDevice?.name ?? '연결됨'}
          </Text>
          <Text className="text-gray-600 text-sm">({selectedDevice?.address})</Text>
        </View>

        {/* 현재 재생 중 / 재생 컨트롤 */}
        <View className="bg-gray-800 rounded-xl p-4 mb-4">
          <Text className="text-gray-400 text-xs mb-1">현재 선택</Text>
          <Text className="text-white font-semibold text-base mb-4" numberOfLines={1}>
            {currentFile ? currentFile.name : '선택된 파일 없음'}
          </Text>

          {/* 재생/일시정지 버튼 */}
          <View className="flex-row items-center justify-center gap-4 mb-4">
            <TouchableOpacity
              onPress={sendStop}
              disabled={!currentFileId}
              className="w-12 h-12 rounded-full bg-gray-700 items-center justify-center active:bg-gray-600 disabled:opacity-40"
            >
              <Text className="text-white text-lg">⏹</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={isPlaying ? sendPause : () => currentFileId && sendPlay(currentFileId)}
              disabled={!currentFileId}
              className="w-16 h-16 rounded-full bg-indigo-600 items-center justify-center active:bg-indigo-700 disabled:opacity-40"
            >
              <Text className="text-white text-2xl">
                {isPlaying ? '⏸' : '▶'}
              </Text>
            </TouchableOpacity>

            {/* 반복 토글 */}
            <TouchableOpacity
              onPress={() => sendLoop(!loop)}
              className={`w-12 h-12 rounded-full items-center justify-center ${loop ? 'bg-blue-600 active:bg-blue-700' : 'bg-gray-700 active:bg-gray-600'
                }`}
            >
              <Text className="text-white text-lg">🔁</Text>
            </TouchableOpacity>
          </View>

          {/* 볼륨 슬라이더 */}
          <View className="flex-row items-center gap-2">
            <Text className="text-gray-400 text-sm w-6">🔈</Text>
            <Slider
              style={{ flex: 1 }}
              minimumValue={0}
              maximumValue={1}
              step={0.01}
              value={volume}
              onSlidingComplete={sendVolume}
              minimumTrackTintColor="#6366f1"
              maximumTrackTintColor="#374151"
              thumbTintColor="#818cf8"
            />
            <Text className="text-gray-400 text-sm w-6">🔊</Text>
            <Text className="text-gray-300 text-xs w-10 text-right">
              {Math.round(volume * 100)}%
            </Text>
          </View>
        </View>

        {/* 파일 목록 */}
        <View className="flex-row items-center justify-between mb-2">
          <Text className="text-gray-400 text-sm font-medium">
            파일 목록 ({serverFiles.length}개)
          </Text>
        </View>

        {serverFiles.length === 0 ? (
          <View className="flex-1 items-center justify-center">
            <Text className="text-gray-600 text-4xl mb-3">📂</Text>
            <Text className="text-gray-500 text-base text-center">
              파일이 없습니다{'\n'}서버 기기에서 MP3 파일을 추가하세요
            </Text>
          </View>
        ) : (
          <FlatList
            data={serverFiles}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <TouchableOpacity
                onPress={() => sendPlay(item.id)}
                className={`rounded-xl p-3 flex-row items-center ${item.id === currentFileId
                    ? 'bg-indigo-900 border border-indigo-600'
                    : 'bg-gray-800 active:bg-gray-700'
                  }`}
              >
                <Text className="text-xl mr-3">
                  {item.id === currentFileId && isPlaying ? '🎵' : '🎶'}
                </Text>
                <View className="flex-1">
                  <Text
                    className={`font-medium text-sm ${item.id === currentFileId ? 'text-indigo-200' : 'text-white'
                      }`}
                    numberOfLines={1}
                  >
                    {item.name}
                  </Text>
                  {item.id === currentFileId && (
                    <Text className="text-indigo-400 text-xs mt-0.5">
                      {isPlaying ? '재생 중' : isPaused ? '일시정지' : '선택됨'}
                    </Text>
                  )}
                </View>
              </TouchableOpacity>
            )}
            ItemSeparatorComponent={() => <View className="h-1.5" />}
            contentContainerStyle={{ paddingBottom: 16 }}
          />
        )}
      </View>
    </SafeAreaView>
  )
}
