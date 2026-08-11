import { useState } from 'react'
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Alert,
  Modal,
  ScrollView,
} from 'react-native'
import { useAuth } from '../context/AuthContext'

function logSettings(
  component: string,
  level: 'INFO' | 'WARN' | 'ERROR',
  message: string,
  context?: Record<string, unknown>
) {
  const ts = new Date().toISOString()
  const ctx = context ? ` | Context: ${JSON.stringify(context)}` : ''
  const line = `[TRUSTENGINE] [${component}] [${level}] ${message}${ctx} | Timestamp: ${ts}`
  if (level === 'ERROR') console.error(line)
  else if (level === 'WARN') console.warn(line)
  else console.log(line)
}

function maskEmail(email: string): string {
  const [local, domain] = email.split('@')
  if (!local || !domain) return '***'
  return `${local.slice(0, 2)}***@${domain}`
}

export function SettingsScreen() {
  const { user, signOut, session } = useAuth()
  const [passwordModal, setPasswordModal] = useState(false)
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [updating, setUpdating] = useState(false)

  const handleSignOut = () => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out',
        style: 'destructive',
        onPress: async () => {
          logSettings('SettingsScreen', 'INFO', 'User initiated sign out')
          await signOut()
        },
      },
    ])
  }

  const handleChangePassword = async () => {
    if (newPassword.length < 8) {
      Alert.alert('Invalid Password', 'New password must be at least 8 characters.')
      return
    }
    if (newPassword !== confirmPassword) {
      Alert.alert('Mismatch', 'New password and confirmation do not match.')
      return
    }
    setUpdating(true)
    try {
      const { error } = await fetch(`${process.env.EXPO_PUBLIC_SUPABASE_URL}/auth/v1/user`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${session?.access_token}`,
          apikey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ password: newPassword }),
      }).then(r => r.json()).then(r => ({ error: r.error }))
      
      if (error) throw new Error(error.message)
      
      logSettings('SettingsScreen', 'INFO', 'Password updated')
      Alert.alert('Success', 'Your password has been updated.')
      setPasswordModal(false)
      setNewPassword('')
      setConfirmPassword('')
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      logSettings('SettingsScreen', 'ERROR', 'Password update failed', { message: msg })
      Alert.alert('Error', 'Could not update password. Please try again.')
    } finally {
      setUpdating(false)
    }
  }

  return (
    <ScrollView className="flex-1 bg-gray-50">
      <View className="p-6 space-y-6">
        <View>
          <Text className="text-2xl font-bold text-gray-900">Settings</Text>
          <Text className="text-gray-600 text-sm mt-1">Manage your account and preferences.</Text>
        </View>

        <View className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
          <Text className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">
            Account
          </Text>
          <View className="flex-row items-center gap-3 mb-4">
            <View className="w-12 h-12 rounded-full bg-blue-600 items-center justify-center">
              <Text className="text-white text-lg font-bold">
                {user?.email?.charAt(0).toUpperCase() || 'U'}
              </Text>
            </View>
            <View>
              <Text className="text-gray-900 font-semibold">
                {user?.email ? maskEmail(user.email) : 'Unknown User'}
              </Text>
              <Text className="text-gray-500 text-xs">Business Owner</Text>
            </View>
          </View>

          <TouchableOpacity
            onPress={() => setPasswordModal(true)}
            className="bg-gray-100 rounded-lg py-3 items-center"
          >
            <Text className="text-gray-900 font-semibold text-sm">Change Password</Text>
          </TouchableOpacity>
        </View>

        <View className="bg-white rounded-xl border border-red-200 p-5 shadow-sm">
          <Text className="text-sm font-semibold text-red-500 uppercase tracking-wider mb-3">
            Danger Zone
          </Text>
          <TouchableOpacity
            onPress={handleSignOut}
            className="bg-red-600 rounded-lg py-3 items-center"
          >
            <Text className="text-white font-semibold">Sign Out</Text>
          </TouchableOpacity>
        </View>
      </View>

      <Modal
        animationType="slide"
        transparent={false}
        visible={passwordModal}
        onRequestClose={() => setPasswordModal(false)}
      >
        <View className="flex-1 bg-white pt-14 px-6">
          <View className="flex-row items-center justify-between mb-6">
            <Text className="text-xl font-bold text-gray-900">Change Password</Text>
            <TouchableOpacity onPress={() => setPasswordModal(false)}>
              <Text className="text-gray-500 text-2xl">✕</Text>
            </TouchableOpacity>
          </View>

          <View className="space-y-4">
            <View>
              <Text className="text-sm font-medium text-gray-700 mb-1">New Password</Text>
              <TextInput
                className="w-full border border-gray-300 rounded-lg px-4 py-3 text-gray-900"
                secureTextEntry
                value={newPassword}
                onChangeText={setNewPassword}
                placeholder="Min 8 characters"
              />
            </View>
            <View>
              <Text className="text-sm font-medium text-gray-700 mb-1">Confirm Password</Text>
              <TextInput
                className="w-full border border-gray-300 rounded-lg px-4 py-3 text-gray-900"
                secureTextEntry
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                placeholder="Re-enter new password"
              />
            </View>

            <TouchableOpacity
              onPress={handleChangePassword}
              disabled={updating}
              className={`w-full rounded-lg py-3 items-center ${updating ? 'bg-blue-400' : 'bg-blue-600'}`}
            >
              {updating ? (
                <ActivityIndicator color="white" />
              ) : (
                <Text className="text-white font-semibold">Update Password</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </ScrollView>
  )
}
