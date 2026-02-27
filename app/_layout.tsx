import '../global.css'
import { Stack } from 'expo-router'
import { StatusBar } from 'expo-status-bar'

export default function RootLayout() {
  return (
    <>
      <StatusBar style="light" backgroundColor="#111827" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: '#111827' },
          headerTintColor: '#f9fafb',
          headerTitleStyle: { fontWeight: 'bold' },
          contentStyle: { backgroundColor: '#111827' },
          animation: 'slide_from_right',
        }}
      >
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen
          name="server/index"
          options={{ title: '서버 모드', headerBackTitle: '모드 선택' }}
        />
        <Stack.Screen
          name="controller/index"
          options={{ title: '기기 탐색', headerBackTitle: '모드 선택' }}
        />
        <Stack.Screen
          name="controller/player"
          options={{ title: '원격 제어', headerBackTitle: '기기 목록' }}
        />
      </Stack>
    </>
  )
}
