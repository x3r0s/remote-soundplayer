import { useEffect, useCallback, useState, useRef } from 'react'
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
import { Ionicons } from '@expo/vector-icons'
import * as Network from 'expo-network'
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

  const localIpRef = useRef<string | undefined>(undefined)

  // ---- mDNS 스캔 시작 ----

  useEffect(() => {
    Network.getIpAddressAsync()
      .then((ip) => {
        localIpRef.current = ip
        startScanning(ip)
      })
      .catch(() => startScanning())

    return () => {
      mdnsService.stopScan()
      setIsScanning(false)
      clearDiscoveredDevices()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const startScanning = (localIp?: string) => {
    clearDiscoveredDevices()
    setIsScanning(true)
    setMdnsUnavailable(false)

    try {
      const success = mdnsService.startScan(
        (device) => addDiscoveredDevice(device),
        (name) => removeDiscoveredDevice(name),
        localIp
      )

      if (!success) {
        setIsScanning(false)
        setMdnsUnavailable(true)
        return
      }

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
    startScanning(localIpRef.current)
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
    <SafeAreaView className="flex-1 bg-black" edges={['bottom']}>
      <View className="flex-1 px-4 pt-4">
        {/* 스캔 상태 */}
        <View className="flex-row items-center justify-between mb-4">
          <View className="flex-row items-center gap-2">
            {isScanning && <ActivityIndicator color="#fff" size="small" />}
            <Text className="text-neutral-400 text-sm">
              {isScanning ? '기기 탐색 중...' : '탐색 완료'}
            </Text>
          </View>
          <TouchableOpacity
            onPress={handleRefresh}
            className="flex-row items-center gap-1.5 bg-neutral-900 border border-neutral-800 rounded-lg px-3 py-1.5 active:opacity-70"
          >
            <Ionicons name="refresh" size={14} color="#a3a3a3" />
            <Text className="text-neutral-400 text-sm">다시 탐색</Text>
          </TouchableOpacity>
        </View>

        {/* mDNS 사용 불가 안내 */}
        {mdnsUnavailable && (
          <View className="bg-neutral-900 border border-neutral-700 rounded-xl px-4 py-3 mb-3">
            <View className="flex-row items-center gap-2">
              <Ionicons name="warning-outline" size={16} color="#a3a3a3" />
              <Text className="text-neutral-300 text-sm font-medium">
                자동 탐색을 사용할 수 없습니다
              </Text>
            </View>
            <Text className="text-neutral-500 text-xs mt-1 ml-6">
              아래 IP 주소 입력으로 직접 연결하세요
            </Text>
          </View>
        )}

        {/* 발견된 기기 목록 */}
        {discoveredDevices.length === 0 ? (
          <View className="items-center py-16">
            {isScanning ? (
              <>
                <Ionicons name="wifi-outline" size={40} color="#404040" />
                <Text className="text-neutral-600 text-sm mt-3 text-center">
                  서버 모드로 실행 중인 기기를 찾고 있습니다...
                </Text>
              </>
            ) : (
              <>
                <Ionicons name="search-outline" size={40} color="#404040" />
                <Text className="text-neutral-600 text-sm mt-3 text-center leading-5">
                  같은 WiFi에서 기기를 찾을 수 없습니다{'\n'}아래에서 IP 주소로
                  직접 연결하세요
                </Text>
              </>
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
                className="bg-neutral-900 border border-neutral-800 rounded-xl p-4 mb-2 active:opacity-70"
              >
                <View className="flex-row items-center">
                  <View className="w-10 h-10 rounded-lg bg-white/5 items-center justify-center mr-3">
                    <Ionicons name="radio-outline" size={20} color="#a3a3a3" />
                  </View>
                  <View className="flex-1">
                    <Text className="text-white font-semibold">{item.name}</Text>
                    <Text className="text-neutral-600 text-xs mt-0.5">
                      {item.address}:{item.port}
                    </Text>
                  </View>
                  {isConnecting ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <Ionicons name="chevron-forward" size={18} color="#525252" />
                  )}
                </View>
              </TouchableOpacity>
            )}
          />
        )}

        {/* 수동 IP 입력 */}
        <View className="mt-auto pb-4">
          <Text className="text-neutral-500 text-xs font-medium mb-2 tracking-wide uppercase">
            IP 주소로 직접 연결
          </Text>
          <View className="flex-row gap-2">
            <TextInput
              className="flex-1 bg-neutral-900 border border-neutral-800 rounded-xl px-4 py-3 text-white"
              placeholder="예: 192.168.0.10"
              placeholderTextColor="#404040"
              value={manualIp}
              onChangeText={setManualIp}
              keyboardType="numeric"
              returnKeyType="done"
              onSubmitEditing={connectManual}
            />
            <TouchableOpacity
              onPress={connectManual}
              disabled={isConnecting || !manualIp.trim()}
              className="bg-white rounded-xl px-5 py-3 items-center justify-center active:opacity-80 disabled:opacity-30"
            >
              <Text className="text-black font-semibold">연결</Text>
            </TouchableOpacity>
          </View>
          <Text className="text-neutral-700 text-xs mt-2">
            서버 기기 화면에서 IP 주소를 확인하세요
          </Text>
        </View>
      </View>
    </SafeAreaView>
  )
}
