import { useState } from 'react'
import { View, Text, TextInput, TouchableOpacity, Alert, ActivityIndicator } from 'react-native'
import { useAuth } from '../context/AuthContext'

export function SignupScreen({ navigation }: any) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [businessName, setBusinessName] = useState('')
  const [loading, setLoading] = useState(false)
  const { signUp } = useAuth()

  async function handleSignup() {
    if (!email || !password || !businessName) {
      Alert.alert('Error', 'Please fill in all fields')
      return
    }
    if (password.length < 8) {
      Alert.alert('Error', 'Password must be at least 8 characters')
      return
    }
    setLoading(true)
    const { error } = await signUp(email, password, { business_name: businessName })
    setLoading(false)
    if (error) {
      Alert.alert('Signup Failed', error)
    } else {
      Alert.alert('Success', 'Check your email for a confirmation link!')
    }
  }

  return (
    <View className="flex-1 bg-white justify-center px-8">
      <Text className="text-3xl font-bold text-gray-900 text-center mb-2">TrustEngine</Text>
      <Text className="text-gray-600 text-center mb-8">Create your account</Text>

      <TextInput
        className="w-full border border-gray-300 rounded-lg px-4 py-3 mb-4 text-gray-900"
        placeholder="Business name"
        value={businessName}
        onChangeText={setBusinessName}
      />

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
        placeholder="Password (min 8 chars)"
        secureTextEntry
        value={password}
        onChangeText={setPassword}
      />

      <TouchableOpacity
        onPress={handleSignup}
        disabled={loading}
        className="w-full bg-blue-600 rounded-lg py-3 items-center"
      >
        {loading ? (
          <ActivityIndicator color="white" />
        ) : (
          <Text className="text-white font-semibold text-base">Create Account</Text>
        )}
      </TouchableOpacity>

      <TouchableOpacity onPress={() => navigation.navigate('Login')} className="mt-6">
        <Text className="text-center text-blue-600 font-medium">Already have an account? Sign in</Text>
      </TouchableOpacity>
    </View>
  )
}
