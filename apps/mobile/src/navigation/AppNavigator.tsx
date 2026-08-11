import { createStackNavigator } from '@react-navigation/stack'
import { useAuth } from '../context/AuthContext'
import { AuthNavigator } from './AuthNavigator'
import { MainTabNavigator } from './MainTabNavigator'

export type RootStackParamList = {
  Auth: undefined
  Main: undefined
}

const Stack = createStackNavigator<RootStackParamList>()

export function AppNavigator() {
  const { user, loading } = useAuth()

  if (loading) return null // Splash screen handled by Expo

  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      {user ? (
        <Stack.Screen name="Main" component={MainTabNavigator} />
      ) : (
        <Stack.Screen name="Auth" component={AuthNavigator} />
      )}
    </Stack.Navigator>
  )
}
