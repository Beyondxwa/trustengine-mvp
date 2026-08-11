import { createBottomTabNavigator } from '@react-navigation/bottom-tabs'
import { Ionicons } from '@expo/vector-icons'
import { QRScreen } from '../screens/QRScreen'
import { InboxScreen } from '../screens/InboxScreen'
import { SettingsScreen } from '../screens/SettingsScreen'

export type MainTabParamList = {
  QR: undefined
  Inbox: undefined
  Settings: undefined
}

const Tab = createBottomTabNavigator<MainTabParamList>()

export function MainTabNavigator() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarIcon: ({ focused, color, size }) => {
          let iconName: keyof typeof Ionicons.glyphMap = 'qr-code'
          if (route.name === 'Inbox') iconName = focused ? 'mail' : 'mail-outline'
          if (route.name === 'Settings') iconName = focused ? 'settings' : 'settings-outline'
          if (route.name === 'QR') iconName = focused ? 'qr-code' : 'qr-code-outline'
          return <Ionicons name={iconName} size={size} color={color} />
        },
        tabBarActiveTintColor: '#2563eb',
        tabBarInactiveTintColor: 'gray',
        headerShown: true,
      })}
    >
      <Tab.Screen name="QR" component={QRScreen} options={{ title: 'Generate QR' }} />
      <Tab.Screen name="Inbox" component={InboxScreen} options={{ title: 'Feedback' }} />
      <Tab.Screen name="Settings" component={SettingsScreen} options={{ title: 'Settings' }} />
    </Tab.Navigator>
  )
}
