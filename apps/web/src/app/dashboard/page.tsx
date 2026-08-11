export default function DashboardPage() {
  const stats = [
    { label: 'Total Reviews', value: '—', change: 'Connect inbox to see data' },
    { label: 'Avg Rating', value: '—', change: 'Connect inbox to see data' },
    { label: 'QR Scans', value: '—', change: 'Connect inbox to see data' },
    { label: 'Response Rate', value: '—', change: 'Connect inbox to see data' },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Overview</h1>
        <p className="text-gray-600 mt-1">Welcome back to your TrustEngine dashboard.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat) => (
          <div key={stat.label} className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm">
            <p className="text-sm font-medium text-gray-600">{stat.label}</p>
            <p className="text-3xl font-bold text-gray-900 mt-2">{stat.value}</p>
            <p className="text-sm text-gray-500 mt-1">{stat.change}</p>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Quick Actions</h3>
        <div className="flex flex-wrap gap-3">
          <a href="/dashboard/qr" className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-500 transition-colors">
            Generate QR Code
          </a>
          <a href="/dashboard/inbox" className="inline-flex items-center px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors">
            View Feedback
          </a>
        </div>
      </div>
    </div>
  )
}
