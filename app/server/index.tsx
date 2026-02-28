import { useEffect, useCallback, useState } from 'react'
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  Pressable,
  Alert,
  ActivityIndicator,
  StyleSheet,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import * as Network from 'expo-network'
import * as Device from 'expo-device'
import * as KeepAwake from 'expo-keep-awake'
import * as DocumentPicker from 'expo-document-picker'
import { generateId } from '../../src/utils/uuid'
import {
  deleteAudioFile,
  ensureAudioDir,
  fileExists,
  getAudioFilePath,
  copyToAudioDir,
} from '../../src/utils/fileStorage'
import { audioService } from '../../src/services/AudioService'
import { mdnsService } from '../../src/services/MdnsService'
import { tcpServer } from '../../src/services/TcpServerService'
import { useServerStore } from '../../src/stores/serverStore'
import { AppMessage, FileInfo } from '../../src/protocol/messages'

export default function ServerScreen() {
  const [localIp, setLocalIp] = useState<string>('')
  const [isAddingFile, setIsAddingFile] = useState(false)
  const [isPowerSaving, setIsPowerSaving] = useState(false)
  const files = useServerStore((s) => s.files)
  const playbackState = useServerStore((s) => s.playbackState)
  const isServerRunning = useServerStore((s) => s.isServerRunning)
  const connectedControllers = useServerStore((s) => s.connectedControllers)
  const {
    setServerRunning,
    setConnectedControllers,
    setPlaybackState,
    addFile,
    removeFile,
    reset: resetStore,
  } = useServerStore()

  // ---- 서버 시작/중지 ----

  useEffect(() => {
    let localIp = ''

    const startServer = async () => {
      // 화면 꺼짐 방지
      KeepAwake.activateKeepAwakeAsync()

      // 오디오 초기화
      await audioService.init()

      // 로컬 IP 주소 가져오기
      const ip = await Network.getIpAddressAsync()
      localIp = ip
      setLocalIp(ip)
      console.log('Server IP:', ip)

      // TCP 서버 시작
      tcpServer.start(
        handleMessage,
        handleClientConnect,
        handleClientDisconnect
      )
      setServerRunning(true)

      // mDNS 서비스 광고
      const deviceName =
        Device.deviceName ?? Device.modelName ?? `Android-${localIp}`
      mdnsService.publishService(deviceName)

      // 이전에 재생 중이던 파일이 있으면 파일 존재 여부 확인
      const store = useServerStore.getState()
      if (store.lastPlayedFileId) {
        const file = store.files.find((f) => f.id === store.lastPlayedFileId)
        if (file) {
          const exists = fileExists(getAudioFilePath(file.id, file.name))
          if (!exists) {
            removeFile(file.id)
          }
        }
      }
    }

    startServer().catch(console.error)

    return () => {
      KeepAwake.deactivateKeepAwake()
      audioService.stop().catch(console.error)
      tcpServer.stop()
      mdnsService.unpublishService()
      resetStore()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ---- 파일 추가 (서버에서 직접) ----

  const handleAddFile = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: 'audio/*',
        copyToCacheDirectory: true,
      })

      if (result.canceled || !result.assets?.[0]) return

      const asset = result.assets[0]
      setIsAddingFile(true)

      const fileId = generateId()
      const fileName = asset.name
      const fileSize = asset.size ?? 0

      // 파일을 오디오 디렉토리로 복사
      const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_')
      const destFileName = `${fileId}_${safeName}`
      copyToAudioDir(asset.uri, destFileName)

      const fileInfo: FileInfo = {
        id: fileId,
        name: fileName,
        size: fileSize,
        addedAt: Date.now(),
      }
      addFile(fileInfo)
      broadcastFileList()
    } catch (e) {
      console.error('Add file error:', e)
      Alert.alert('오류', `파일 추가 실패: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setIsAddingFile(false)
    }
  }

  // ---- 메시지 핸들러 ----

  const handleMessage = useCallback(async (clientId: string, msg: AppMessage) => {
    const store = useServerStore.getState()

    switch (msg.type) {
      case 'PING':
        tcpServer.sendTo(clientId, {
          type: 'PONG',
          id: msg.id,
          timestamp: Date.now(),
        })
        break

      case 'GET_FILE_LIST':
        tcpServer.sendTo(clientId, {
          type: 'FILE_LIST',
          id: generateId(),
          timestamp: Date.now(),
          files: store.files,
        })
        break

      case 'PLAY': {
        const file = store.files.find((f) => f.id === msg.fileId)
        if (!file) {
          tcpServer.sendTo(clientId, {
            type: 'ERROR',
            id: generateId(),
            timestamp: Date.now(),
            code: 'FILE_NOT_FOUND',
            message: '파일을 찾을 수 없습니다',
          })
          return
        }
        try {
          const filePath = getAudioFilePath(file.id, file.name)
          store.setLastPlayedFileId(file.id)
          setPlaybackState({ currentFileId: file.id })
          await audioService.play(filePath, store.volume, store.loop)
          broadcastPlaybackState()
        } catch (e) {
          console.error('Play error:', e)
        }
        break
      }

      case 'PAUSE':
        await audioService.pause()
        broadcastPlaybackState()
        break

      case 'STOP':
        await audioService.stop()
        broadcastPlaybackState()
        break

      case 'SET_VOLUME':
        await audioService.setVolume(msg.volume)
        broadcastPlaybackState()
        break

      case 'SET_LOOP':
        await audioService.setLoop(msg.loop)
        broadcastPlaybackState()
        break

      case 'SEEK':
        await audioService.seekTo(msg.positionMs)
        break



      default:
        break
    }
  }, [])

  const handleClientConnect = useCallback((clientId: string) => {
    const count = tcpServer.connectedCount
    setConnectedControllers(count)
    console.log('Client connected:', clientId, '(total:', count, ')')
  }, [])

  const handleClientDisconnect = useCallback((clientId: string) => {
    const count = tcpServer.connectedCount
    setConnectedControllers(count)
    console.log('Client disconnected:', clientId, '(total:', count, ')')
  }, [])

  // ---- 헬퍼 ----

  const broadcastPlaybackState = () => {
    const state = useServerStore.getState().playbackState
    tcpServer.broadcast({
      type: 'PLAYBACK_STATE',
      id: generateId(),
      timestamp: Date.now(),
      state,
    })
  }

  const broadcastFileList = () => {
    const files = useServerStore.getState().files
    tcpServer.broadcast({
      type: 'FILE_LIST',
      id: generateId(),
      timestamp: Date.now(),
      files,
    })
  }

  const handleDeleteFile = (file: FileInfo) => {
    Alert.alert('파일 삭제', `"${file.name}"을 삭제할까요?`, [
      { text: '취소', style: 'cancel' },
      {
        text: '삭제',
        style: 'destructive',
        onPress: async () => {
          if (playbackState.currentFileId === file.id) {
            await audioService.stop()
            broadcastPlaybackState()
          }
          deleteAudioFile(getAudioFilePath(file.id, file.name))
          removeFile(file.id)
          broadcastFileList()
        },
      },
    ])
  }

  // ---- 렌더링 ----

  const statusColor =
    connectedControllers > 0 ? 'bg-green-500' : 'bg-yellow-500'
  const statusText =
    connectedControllers > 0
      ? `컨트롤러 ${connectedControllers}개 연결됨`
      : '연결 대기 중...'

  const currentFile = files.find((f) => f.id === playbackState.currentFileId)

  return (
    <SafeAreaView className="flex-1 bg-gray-900" edges={['bottom']}>
      {/* 절약 모드 오버레이 */}
      {isPowerSaving && (
        <Pressable
          onPress={() => setIsPowerSaving(false)}
          style={StyleSheet.absoluteFill}
          className="bg-black z-50 items-center justify-center"
        >
          <Text className="text-gray-700 text-sm">화면을 터치하면 돌아갑니다</Text>
        </Pressable>
      )}

      {/* 상태 바 */}
      <View className="mx-4 mt-4 rounded-xl bg-gray-800 p-4">
        <View className="flex-row items-center justify-between">
          <View className="flex-row items-center gap-2">
            <View className={`w-3 h-3 rounded-full ${statusColor}`} />
            <Text className="text-white font-medium">{statusText}</Text>
          </View>
          <View className="flex-row items-center gap-2">
            {!isServerRunning && (
              <ActivityIndicator color="#6366f1" size="small" />
            )}
            <TouchableOpacity
              onPress={() => setIsPowerSaving(true)}
              className="bg-gray-700 rounded-lg px-2.5 py-1 active:bg-gray-600"
            >
              <Text className="text-gray-300 text-xs">🌙 절약</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* IP 주소 표시 */}
        {localIp ? (
          <Text className="text-gray-500 text-xs mt-2">
            이 기기 IP: <Text className="text-gray-300">{localIp}</Text> · 포트 9876
          </Text>
        ) : null}

        {/* 현재 재생 중인 곡 */}
        {currentFile && (
          <View className="mt-3 pt-3 border-t border-gray-700">
            <Text className="text-gray-400 text-xs">현재 재생</Text>
            <Text className="text-white font-medium mt-1" numberOfLines={1}>
              {currentFile.name}
            </Text>
            <View className="flex-row items-center mt-1 gap-2">
              <View
                className={`px-2 py-0.5 rounded-full ${playbackState.status === 'playing'
                  ? 'bg-green-600'
                  : 'bg-gray-600'
                  }`}
              >
                <Text className="text-white text-xs">
                  {playbackState.status === 'playing'
                    ? '▶ 재생 중'
                    : playbackState.status === 'paused'
                      ? '⏸ 일시정지'
                      : '■ 정지'}
                </Text>
              </View>
              {playbackState.loop && (
                <Text className="text-blue-400 text-xs">🔁 반복</Text>
              )}
              <Text className="text-gray-400 text-xs">
                볼륨 {Math.round(playbackState.volume * 100)}%
              </Text>
            </View>
          </View>
        )}
      </View>

      {/* 파일 목록 */}
      <View className="flex-1 mx-4 mt-4">
        <View className="flex-row items-center justify-between mb-2">
          <Text className="text-gray-400 text-sm font-medium">
            저장된 파일 ({files.length}개)
          </Text>
          <TouchableOpacity
            onPress={handleAddFile}
            disabled={isAddingFile}
            className="bg-emerald-700 rounded-lg px-3 py-1.5 active:bg-emerald-600 disabled:opacity-50"
          >
            {isAddingFile ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text className="text-white text-sm font-medium">+ 파일 추가</Text>
            )}
          </TouchableOpacity>
        </View>

        {files.length === 0 ? (
          <View className="flex-1 items-center justify-center">
            <Text className="text-gray-600 text-4xl mb-3">📂</Text>
            <Text className="text-gray-500 text-base text-center">
              저장된 파일이 없습니다{'\n'}+ 파일 추가를 눌러 MP3를 추가하세요
            </Text>
          </View>
        ) : (
          <FlatList
            data={files}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <FileListItem
                file={item}
                isPlaying={playbackState.currentFileId === item.id}
                playbackStatus={
                  playbackState.currentFileId === item.id
                    ? playbackState.status
                    : 'stopped'
                }
                onDelete={() => handleDeleteFile(item)}
              />
            )}
            ItemSeparatorComponent={() => <View className="h-2" />}
            contentContainerStyle={{ paddingBottom: 16 }}
          />
        )}
      </View>
    </SafeAreaView>
  )
}

// ---- 파일 항목 컴포넌트 ----

interface FileListItemProps {
  file: FileInfo
  isPlaying: boolean
  playbackStatus: string
  onDelete: () => void
}

function FileListItem({ file, isPlaying, playbackStatus, onDelete }: FileListItemProps) {
  const isActive = isPlaying && playbackStatus === 'playing'

  return (
    <View
      className={`rounded-xl p-4 flex-row items-center ${isActive ? 'bg-indigo-900 border border-indigo-600' : 'bg-gray-800'
        }`}
    >
      <Text className="text-2xl mr-3">{isActive ? '🎵' : '🎶'}</Text>
      <View className="flex-1">
        <Text
          className={`font-medium ${isActive ? 'text-indigo-200' : 'text-white'}`}
          numberOfLines={1}
        >
          {file.name}
        </Text>
        <Text className="text-gray-500 text-xs mt-0.5">
          {formatFileSize(file.size)}
        </Text>
      </View>
      <TouchableOpacity
        onPress={onDelete}
        className="ml-2 p-2 rounded-lg active:bg-gray-700"
      >
        <Text className="text-red-400 text-lg">🗑</Text>
      </TouchableOpacity>
    </View>
  )
}

function formatFileSize(bytes: number): string {
  if (bytes === 0) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}
