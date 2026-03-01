import { View, Text, TouchableOpacity } from 'react-native'
import { router } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'

export default function ModeSelectScreen() {
  return (
    <SafeAreaView className="flex-1 bg-black">
      <View className="flex-1 items-center justify-center px-8">
        {/* 앱 타이틀 */}
        <View className="items-center mb-20">
          <View className="w-16 h-16 rounded-2xl bg-white/10 items-center justify-center mb-5">
            <Ionicons name="volume-high" size={32} color="#fff" />
          </View>
          <Text className="text-3xl font-bold text-white tracking-tight">
            Remote Sound Player
          </Text>
          <Text className="text-neutral-500 text-sm mt-2 text-center tracking-wide">
            같은 WiFi에서 원격으로 소리를 재생하세요
          </Text>
        </View>

        {/* 모드 선택 버튼 */}
        <View className="w-full gap-3">
          {/* 서버 모드 */}
          <TouchableOpacity
            className="bg-white rounded-2xl p-5 active:opacity-80"
            onPress={() => router.push('/server')}
          >
            <View className="flex-row items-center">
              <View className="w-11 h-11 rounded-xl bg-black items-center justify-center mr-4">
                <Ionicons name="radio-outline" size={22} color="#fff" />
              </View>
              <View className="flex-1">
                <Text className="text-black text-lg font-bold tracking-tight">
                  서버 모드
                </Text>
                <Text className="text-neutral-500 text-xs mt-0.5">
                  이 기기에서 소리를 재생합니다
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color="#a3a3a3" />
            </View>
          </TouchableOpacity>

          {/* 컨트롤러 모드 */}
          <TouchableOpacity
            className="bg-neutral-900 rounded-2xl p-5 border border-neutral-800 active:opacity-80"
            onPress={() => router.push('/controller')}
          >
            <View className="flex-row items-center">
              <View className="w-11 h-11 rounded-xl bg-white/10 items-center justify-center mr-4">
                <Ionicons name="game-controller-outline" size={22} color="#fff" />
              </View>
              <View className="flex-1">
                <Text className="text-white text-lg font-bold tracking-tight">
                  컨트롤러 모드
                </Text>
                <Text className="text-neutral-500 text-xs mt-0.5">
                  다른 기기의 소리를 제어합니다
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color="#525252" />
            </View>
          </TouchableOpacity>
        </View>

        <Text className="text-neutral-700 text-xs mt-16 text-center">
          두 기기가 같은 WiFi에 연결되어야 합니다
        </Text>
      </View>
    </SafeAreaView>
  )
}
