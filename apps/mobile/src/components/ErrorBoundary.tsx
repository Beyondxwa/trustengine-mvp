import React, { Component, ErrorInfo, ReactNode } from 'react'
import { View, Text, TouchableOpacity, ScrollView } from 'react-native'

type Props = { children: ReactNode }

type State = {
  hasError: boolean
  error: Error | null
  errorInfo: ErrorInfo | null
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null, errorInfo: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    this.setState({ errorInfo })
    const ts = new Date().toISOString()
    console.error(
      `[TRUSTENGINE] [ErrorBoundary] [ERROR] Unhandled rendering error: ${error.message} | Context: ${JSON.stringify({
        name: error.name,
        componentStack: errorInfo.componentStack?.slice(0, 200),
      })} | Timestamp: ${ts}`
    )
  }

  reset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null })
  }

  render() {
    if (this.state.hasError) {
      return (
        <View className="flex-1 bg-gray-50 justify-center items-center px-6">
          <View className="bg-white rounded-xl border border-red-200 p-6 shadow-sm w-full">
            <Text className="text-3xl text-center mb-3">⚠️</Text>
            <Text className="text-red-800 font-bold text-lg text-center">
              Something went wrong
            </Text>
            <Text className="text-red-700 text-sm text-center mt-2 leading-5">
              The app encountered an unexpected error. Please try again.
            </Text>
            <TouchableOpacity
              onPress={this.reset}
              className="mt-5 bg-red-600 rounded-lg py-3 items-center"
            >
              <Text className="text-white font-semibold">Try Again</Text>
            </TouchableOpacity>
            <Text className="text-gray-400 text-xs text-center mt-4 font-mono">
              ERR_RENDER_CRASH
            </Text>
            {__DEV__ && this.state.error && (
              <ScrollView className="mt-4 p-3 bg-gray-100 rounded-lg max-h-48">
                <Text className="text-xs text-gray-700 font-mono">
                  {this.state.error.toString()}
                  {'\n'}
                  {this.state.errorInfo?.componentStack?.slice(0, 400)}
                </Text>
              </ScrollView>
            )}
          </View>
        </View>
      )
    }
    return this.props.children
  }
}
