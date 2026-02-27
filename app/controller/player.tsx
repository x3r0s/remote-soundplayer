import { useEffect, useCallback, useRef } from 'react'
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from 'react-native'
import Slider from '@react-native-community/slider'
import { router } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import * as DocumentPicker from 'expo-document-picker'
import * as FileSystem from 'expo-file-system'
import { tcpClient } from '../../src/services/TcpClientService'
import { useControllerStore } from '../../src/stores/controllerStore'
import { AppMessage, FileInfo } from '../../src/protocol/messages'
import { generateId } from '../../src/utils/uuid'
import { copyToCache } from '../../src/utils/fileStorage'

export default function PlayerScreen() {
  const selectedDevice = useControllerStore((s) => s.selectedDevice)
  const connectionStatus = useControllerStore((s) => s.connectionStatus)
  const serverFiles = useControllerStore((s) => s.serverFiles)
  const playbackState = useControllerStore((s) => s.serverPlaybackState)
  const transferProgress = useControllerStore((s) => s.transferProgress)
  const transferFileName = useControllerStore((s) => s.transferFileName)
  const {
    setConnectionStatus,
    setServerFiles,
    setServerPlaybackState,
    setTransferProgress,
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
        case 'FILE_TRANSFER_DONE':
          setTransferProgress(null)
          if (msg.success) {
            tcpClient.send({
              type: 'GET_FILE_LIST',
              id: generateId(),
              timestamp: Date.now(),
            })
          } else {
            Alert.alert('오류', '파일 전송에 실패했습니다')
          }
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

  const sendDelete = (fileId: string) => {
    tcpClient.send({
      type: 'DELETE_FILE',
      id: generateId(),
      timestamp: Date.now(),
      fileId,
    })
  }

  // ---- 파일 선택 및 전송 ----

  const handleAddFile = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: 'audio/*',
        copyToCacheDirectory: false,
      })

      if (result.canceled || !result.assets?.[0]) return

      const asset = result.assets[0]
      const fileName = asset.name

      Alert.alert(
        '파일 전송',
        `"${fileName}"을 서버로 전송할까요?`,
        [
          { text: '취소', style: 'cancel' },
          {
            text: '전송',
            onPress: () => startFileTransfer(asset.uri, fileName),
          },
        ]
      )
    } catch (e) {
      console.error('Document picker error:', e)
    }
  }

  const startFileTransfer = async (contentUri: string, fileName: string) => {
    const fileId = generateId()

    try {
      // content:// → file:// 복사
      const localUri = await copyToCache(contentUri, `${fileId}_${fileName}`)
      const info = await FileSystem.getInfoAsync(localUri, { size: true })
      const fileSize = (info as FileSystem.FileInfo & { size: number }).size ?? 0

      // 전송 시작 알림
      tcpClient.send({
        type: 'FILE_TRANSFER_START',
        id: generateId(),
        timestamp: Date.now(),
        fileId,
        fileName,
        fileSize,
      })

      setTransferProgress(0, fileName)

      // 파일 전송
      await tcpClient.sendFile(localUri, fileId, fileName, (progress) => {
        setTransferProgress(progress, fileName)
      })

      // 캐시 파일 삭제
      await FileSystem.deleteAsync(localUri, { idempotent: true })
    } catch (e) {
      setTransferProgress(null)
      Alert.alert('오류', `파일 전송 실패: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  const handleDeleteFile = (file: FileInfo) => {
    Alert.alert('파일 삭제', `"${file.name}"을 서버에서 삭제할까요?`, [
      { text: '취소', style: 'cancel' },
      {
        text: '삭제',
        style: 'destructive',
        onPress: () => sendDelete(file.id),
      },
    ])
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

        {/* 파일 전송 진행 중 표시 */}
        {transferProgress !== null && (
          <View className="bg-indigo-900 border border-indigo-600 rounded-xl p-3 mb-4">
            <Text className="text-indigo-200 text-sm mb-1">
              📤 전송 중: {transferFileName}
            </Text>
            <View className="h-2 bg-indigo-800 rounded-full overflow-hidden">
              <View
                className="h-full bg-indigo-400 rounded-full"
                style={{ width: `${Math.round(transferProgress * 100)}%` }}
              />
            </View>
            <Text className="text-indigo-400 text-xs mt-1 text-right">
              {Math.round(transferProgress * 100)}%
            </Text>
          </View>
        )}

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
              className={`w-12 h-12 rounded-full items-center justify-center ${
                loop ? 'bg-blue-600 active:bg-blue-700' : 'bg-gray-700 active:bg-gray-600'
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
          <TouchableOpacity
            onPress={handleAddFile}
            disabled={transferProgress !== null}
            className="bg-emerald-700 rounded-lg px-3 py-1.5 active:bg-emerald-600 disabled:opacity-50"
          >
            <Text className="text-white text-sm font-medium">+ 파일 추가</Text>
          </TouchableOpacity>
        </View>

        {serverFiles.length === 0 ? (
          <View className="flex-1 items-center justify-center">
            <Text className="text-gray-600 text-4xl mb-3">📂</Text>
            <Text className="text-gray-500 text-base text-center">
              파일이 없습니다{'\n'}+ 파일 추가를 눌러 MP3를 전송하세요
            </Text>
          </View>
        ) : (
          <FlatList
            data={serverFiles}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <TouchableOpacity
                onPress={() => sendPlay(item.id)}
                className={`rounded-xl p-3 flex-row items-center ${
                  item.id === currentFileId
                    ? 'bg-indigo-900 border border-indigo-600'
                    : 'bg-gray-800 active:bg-gray-700'
                }`}
              >
                <Text className="text-xl mr-3">
                  {item.id === currentFileId && isPlaying ? '🎵' : '🎶'}
                </Text>
                <View className="flex-1">
                  <Text
                    className={`font-medium text-sm ${
                      item.id === currentFileId ? 'text-indigo-200' : 'text-white'
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
                <TouchableOpacity
                  onPress={() => handleDeleteFile(item)}
                  className="p-2 rounded-lg active:bg-gray-700 ml-1"
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Text className="text-gray-500 text-base">🗑</Text>
                </TouchableOpacity>
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
