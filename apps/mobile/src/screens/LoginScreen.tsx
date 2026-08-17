import { useState } from 'react'
import { View, Text, TextInput, TouchableOpacity, Alert, ActivityIndicator } from 'react-native'
import type { StackScreenProps } from '@react-navigation/stack'
import { useAuth } from '../context/AuthContext'
import type { AuthStackParamList } from '../navigation/AuthNavigator'

type Props = StackScreenProps<AuthStackParamList, 'Login'>

export function LoginScreen({ navigation }: Props) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const { signIn } = useAuth()

  async function handleLogin() {
    if (!email || !password) {
      Alert.alert('Error', 'Please enter email and password')
      return
    }
    setLoading(true)
    const { error } = await signIn(email, password)
    setLoading(false)
    if (error) Alert.alert('Login Failed', error)
  }

  return (
    <View className="flex-1 bg-white justify-center px-8">
      <Text className="text-3xl font-bold text-gray-900 text-center mb-2">TrustEngine</Text>
      <Text className="text-gray-600 text-center mb-8">Sign in to your business</Text>

      <TextInput
        className="w-full border border-gray-300 rounded-lg px-4 py-3 mb-4 text-gray-900"
        placeholder="Email"
        autoCapitalize="none"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
      />

      <TextInput
        className="w-full border border-gray-300 rounded-lg px-4 py-3 mb-6 text-gray-900"
        placeholder="Password"
        secureTextEntry
        value={password}
        onChangeText={setPassword}
      />

      <TouchableOpacity
        onPress={handleLogin}
        disabled={loading}
        className="w-full bg-blue-600 rounded-lg py-3 items-center"
      >
        {loading ? (
          <ActivityIndicator color="white" />
        ) : (
          <Text className="text-white font-semibold text-base">Sign In</Text>
        )}
      </TouchableOpacity>

      <TouchableOpacity onPress={() => navigation.navigate('Signup')} className="mt-6">
        <Text className="text-center text-blue-600 font-medium">Don't have an account? Sign up</Text>
      </TouchableOpacity>
    </View>
  )
}
