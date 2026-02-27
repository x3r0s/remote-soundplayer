import { View, Text, TouchableOpacity } from 'react-native'
import { router } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'

export default function ModeSelectScreen() {
  return (
    <SafeAreaView className="flex-1 bg-gray-900">
      <View className="flex-1 items-center justify-center px-8">
        {/* 앱 아이콘 / 타이틀 */}
        <View className="items-center mb-16">
          <Text className="text-6xl mb-4">🎵</Text>
          <Text className="text-3xl font-bold text-white text-center">
            Remote Sound Player
          </Text>
          <Text className="text-gray-400 text-base mt-2 text-center">
            같은 WiFi에서 원격으로 소리를 재생하세요
          </Text>
        </View>

        {/* 모드 선택 버튼 */}
        <View className="w-full gap-4">
          {/* 서버 모드 */}
          <TouchableOpacity
            className="bg-indigo-600 rounded-2xl p-6 active:bg-indigo-700"
            onPress={() => router.push('/server')}
          >
            <View className="flex-row items-center">
              <Text className="text-4xl mr-4">📱</Text>
              <View className="flex-1">
                <Text className="text-white text-xl font-bold">서버 모드</Text>
                <Text className="text-indigo-200 text-sm mt-1">
                  이 기기에서 소리를 재생합니다{'\n'}(아이 방 폰)
                </Text>
              </View>
              <Text className="text-indigo-300 text-2xl">›</Text>
            </View>
          </TouchableOpacity>

          {/* 컨트롤러 모드 */}
          <TouchableOpacity
            className="bg-emerald-700 rounded-2xl p-6 active:bg-emerald-800"
            onPress={() => router.push('/controller')}
          >
            <View className="flex-row items-center">
              <Text className="text-4xl mr-4">🎮</Text>
              <View className="flex-1">
                <Text className="text-white text-xl font-bold">컨트롤러 모드</Text>
                <Text className="text-emerald-200 text-sm mt-1">
                  다른 기기의 소리를 제어합니다{'\n'}(부모 폰)
                </Text>
              </View>
              <Text className="text-emerald-300 text-2xl">›</Text>
            </View>
          </TouchableOpacity>
        </View>

        <Text className="text-gray-600 text-xs mt-12 text-center">
          두 기기가 같은 WiFi에 연결되어야 합니다
        </Text>
      </View>
    </SafeAreaView>
  )
}
