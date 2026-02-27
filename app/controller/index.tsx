import { useEffect, useCallback, useState } from 'react'
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Alert,
} from 'react-native'
import { router } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { mdnsService } from '../../src/services/MdnsService'
import { tcpClient } from '../../src/services/TcpClientService'
import {
  useControllerStore,
  DiscoveredDevice,
} from '../../src/stores/controllerStore'
import { AppMessage } from '../../src/protocol/messages'
import { generateId } from '../../src/utils/uuid'
import { CONTROL_PORT } from '../../src/services/TcpServerService'

export default function ControllerDiscoveryScreen() {
  const [manualIp, setManualIp] = useState('')
  const [isConnecting, setIsConnecting] = useState(false)
  const [mdnsUnavailable, setMdnsUnavailable] = useState(false)

  const discoveredDevices = useControllerStore((s) => s.discoveredDevices)
  const isScanning = useControllerStore((s) => s.isScanning)
  const {
    addDiscoveredDevice,
    removeDiscoveredDevice,
    clearDiscoveredDevices,
    setIsScanning,
    setSelectedDevice,
    setConnectionStatus,
    setServerFiles,
    setServerPlaybackState,
    reset: resetStore,
  } = useControllerStore()

  // ---- mDNS 스캔 시작 ----

  useEffect(() => {
    startScanning()
    return () => {
      mdnsService.stopScan()
      setIsScanning(false)
      clearDiscoveredDevices()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const startScanning = () => {
    clearDiscoveredDevices()
    setIsScanning(true)
    setMdnsUnavailable(false)

    try {
      const success = mdnsService.startScan(
        (device) => addDiscoveredDevice(device),
        (name) => removeDiscoveredDevice(name)
      )

      if (!success) {
        // mDNS를 사용할 수 없음 — 수동 IP 입력으로 폴백
        setIsScanning(false)
        setMdnsUnavailable(true)
        return
      }

      // 30초 후 스캔 자동 중지
      setTimeout(() => setIsScanning(false), 30000)
    } catch (e) {
      console.error('startScanning failed:', e)
      setIsScanning(false)
      setMdnsUnavailable(true)
    }
  }

  const handleRefresh = () => {
    try {
      mdnsService.stopScan()
    } catch (e) {
      console.error('stopScan failed:', e)
    }
    startScanning()
  }

  // ---- 기기 연결 ----

  const connectToDevice = useCallback(
    (device: DiscoveredDevice) => {
      if (isConnecting) return
      setIsConnecting(true)
      setConnectionStatus('connecting')

      const handleMessage = (msg: AppMessage) => {
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
      }

      const handleStatus = (
        status: 'connected' | 'disconnected' | 'error',
        error?: string
      ) => {
        if (status === 'connected') {
          setConnectionStatus('connected')
          setSelectedDevice(device)
          setIsConnecting(false)
          mdnsService.stopScan()

          // 파일 목록 요청
          tcpClient.send({
            type: 'GET_FILE_LIST',
            id: generateId(),
            timestamp: Date.now(),
          })

          router.push('/controller/player')
        } else if (status === 'error') {
          setConnectionStatus('error', error)
          setIsConnecting(false)
          Alert.alert('연결 실패', error ?? '알 수 없는 오류가 발생했습니다')
        } else if (status === 'disconnected') {
          setConnectionStatus('idle')
          setIsConnecting(false)
        }
      }

      tcpClient.connect(device.address, device.port, handleMessage, handleStatus)
    },
    [isConnecting]
  )

  const connectManual = () => {
    const ip = manualIp.trim()
    if (!ip) {
      Alert.alert('오류', 'IP 주소를 입력하세요')
      return
    }
    const device: DiscoveredDevice = {
      name: ip,
      host: ip,
      address: ip,
      port: CONTROL_PORT,
    }
    connectToDevice(device)
  }

  // ---- 렌더링 ----

  return (
    <SafeAreaView className="flex-1 bg-gray-900" edges={['bottom']}>
      <View className="flex-1 px-4 pt-4">
        {/* 스캔 상태 */}
        <View className="flex-row items-center justify-between mb-4">
          <View className="flex-row items-center gap-2">
            {isScanning && <ActivityIndicator color="#6366f1" size="small" />}
            <Text className="text-gray-300 text-sm">
              {isScanning ? 'WiFi에서 기기 탐색 중...' : '탐색 완료'}
            </Text>
          </View>
          <TouchableOpacity
            onPress={handleRefresh}
            className="bg-gray-700 rounded-lg px-3 py-1.5 active:bg-gray-600"
          >
            <Text className="text-white text-sm">🔄 다시 탐색</Text>
          </TouchableOpacity>
        </View>

        {/* mDNS 사용 불가 안내 */}
        {mdnsUnavailable && (
          <View className="bg-yellow-900 border border-yellow-700 rounded-xl px-4 py-3 mb-3">
            <Text className="text-yellow-200 text-sm font-medium">
              ⚠️ 자동 탐색을 사용할 수 없습니다
            </Text>
            <Text className="text-yellow-400 text-xs mt-1">
              아래 IP 주소 입력으로 직접 연결하세요
            </Text>
          </View>
        )}

        {/* 발견된 기기 목록 */}
        {discoveredDevices.length === 0 ? (
          <View className="items-center py-10">
            {isScanning ? (
              <Text className="text-gray-500 text-base">
                서버 모드로 실행 중인 기기를 찾고 있습니다...
              </Text>
            ) : (
              <Text className="text-gray-500 text-base text-center">
                같은 WiFi에서 기기를 찾을 수 없습니다{'\n'}아래에서 IP 주소로
                직접 연결하세요
              </Text>
            )}
          </View>
        ) : (
          <FlatList
            data={discoveredDevices}
            keyExtractor={(item) => item.name}
            renderItem={({ item }) => (
              <TouchableOpacity
                onPress={() => connectToDevice(item)}
                disabled={isConnecting}
                className="bg-gray-800 rounded-xl p-4 mb-2 active:bg-gray-700"
              >
                <View className="flex-row items-center">
                  <Text className="text-3xl mr-3">📱</Text>
                  <View className="flex-1">
                    <Text className="text-white font-semibold">{item.name}</Text>
                    <Text className="text-gray-400 text-sm mt-0.5">
                      {item.address}:{item.port}
                    </Text>
                  </View>
                  {isConnecting ? (
                    <ActivityIndicator color="#6366f1" size="small" />
                  ) : (
                    <Text className="text-indigo-400 text-lg">›</Text>
                  )}
                </View>
              </TouchableOpacity>
            )}
          />
        )}

        {/* 수동 IP 입력 */}
        <View className="mt-auto pb-4">
          <Text className="text-gray-400 text-sm font-medium mb-2">
            IP 주소로 직접 연결
          </Text>
          <View className="flex-row gap-2">
            <TextInput
              className="flex-1 bg-gray-800 rounded-xl px-4 py-3 text-white"
              placeholder="예: 192.168.0.10"
              placeholderTextColor="#4b5563"
              value={manualIp}
              onChangeText={setManualIp}
              keyboardType="numeric"
              returnKeyType="done"
              onSubmitEditing={connectManual}
            />
            <TouchableOpacity
              onPress={connectManual}
              disabled={isConnecting || !manualIp.trim()}
              className="bg-indigo-600 rounded-xl px-4 py-3 items-center justify-center active:bg-indigo-700 disabled:opacity-50"
            >
              <Text className="text-white font-semibold">연결</Text>
            </TouchableOpacity>
          </View>
          <Text className="text-gray-600 text-xs mt-2">
            서버 기기 화면에서 IP 주소를 확인하세요
          </Text>
        </View>
      </View>
    </SafeAreaView>
  )
}
