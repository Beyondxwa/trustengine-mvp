'use client'

type FeedbackDetailProps = {
  feedback: {
    id: string
    rating: number
    comment: string | null
    selected_tags: string[] | null
    is_resolved: boolean
    created_at: string
    customer_email: string | null
    customer_phone: string | null
    ai_analysis: {
      sentiment: 'positive' | 'neutral' | 'negative'
      coaching_advice: string
      suggested_response: string
      tags: string[]
    } | null
  }
  onClose: () => void
}

export function FeedbackDetail({ feedback, onClose }: FeedbackDetailProps) {
  const renderStars = (rating: number) => (
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5].map((star) => (
        <svg
          key={star}
          className={`w-5 h-5 ${star <= rating ? 'text-yellow-400 fill-yellow-400' : 'text-gray-300'}`}
          viewBox="0 0 20 20"
        >
          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
        </svg>
      ))}
    </div>
  )

  const sentimentStyle = (sentiment?: string) => {
    switch (sentiment) {
      case 'positive': return 'bg-green-100 text-green-800'
      case 'negative': return 'bg-red-100 text-red-800'
      case 'neutral': return 'bg-yellow-100 text-yellow-800'
      default: return 'bg-gray-100 text-gray-600'
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative w-full max-w-lg bg-white h-full overflow-auto shadow-2xl animate-in slide-in-from-right duration-200">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between z-10">
          <h2 className="text-lg font-semibold text-gray-900">Feedback Details</h2>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
            <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Rating & Date */}
          <div className="flex items-center justify-between">
            {renderStars(feedback.rating)}
            <span className="text-sm text-gray-500">
              {new Date(feedback.created_at).toLocaleString()}
            </span>
          </div>

          {/* Status Badge */}
          <div className="flex items-center gap-3">
            <span className={`inline-flex px-3 py-1 rounded-full text-sm font-medium ${feedback.is_resolved ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-700'}`}>
              {feedback.is_resolved ? 'Resolved' : 'Open'}
            </span>
            {feedback.ai_analysis && (
              <span className={`inline-flex px-3 py-1 rounded-full text-sm font-medium ${sentimentStyle(feedback.ai_analysis.sentiment)}`}>
                {feedback.ai_analysis.sentiment}
              </span>
            )}
          </div>

          {/* Comment */}
          {feedback.comment ? (
            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-2">Customer Comment</h3>
              <p className="text-gray-900 bg-gray-50 rounded-lg p-4 leading-relaxed">{feedback.comment}</p>
            </div>
          ) : (
            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-2">Customer Comment</h3>
              <p className="text-gray-400 italic bg-gray-50 rounded-lg p-4">No comment provided</p>
            </div>
          )}

          {/* Tags */}
          {feedback.selected_tags && feedback.selected_tags.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-2">Selected Tags</h3>
              <div className="flex flex-wrap gap-2">
                {feedback.selected_tags.map((tag) => (
                  <span key={tag} className="px-3 py-1 bg-blue-50 text-blue-700 rounded-full text-sm font-medium">
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Contact Info */}
          <div>
            <h3 className="text-sm font-semibold text-gray-700 mb-2">Contact Information</h3>
            <div className="space-y-2 text-sm">
              {feedback.customer_email && (
                <div className="flex items-center gap-2 text-gray-600">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                  {feedback.customer_email}
                </div>
              )}
              {feedback.customer_phone && (
                <div className="flex items-center gap-2 text-gray-600">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                  </svg>
                  {feedback.customer_phone}
                </div>
              )}
              {!feedback.customer_email && !feedback.customer_phone && (
                <p className="text-gray-400 italic">No contact information provided</p>
              )}
            </div>
          </div>

          {/* AI Analysis */}
          {feedback.ai_analysis ? (
            <div className="border-t border-gray-200 pt-6 space-y-5">
              <div className="flex items-center gap-2">
                <svg className="w-5 h-5 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                <h3 className="text-sm font-semibold text-gray-900">AI Analysis</h3>
              </div>

              <div>
                <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Coaching Advice</h4>
                <div className="bg-amber-50 border border-amber-100 rounded-lg p-4">
                  <p className="text-gray-900 text-sm leading-relaxed">{feedback.ai_analysis.coaching_advice}</p>
                </div>
              </div>

              <div>
                <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Suggested Response</h4>
                <div className="bg-blue-50 border border-blue-100 rounded-lg p-4">
                  <p className="text-gray-900 text-sm leading-relaxed">{feedback.ai_analysis.suggested_response}</p>
                </div>
              </div>

              {feedback.ai_analysis.tags && feedback.ai_analysis.tags.length > 0 && (
                <div>
                  <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">AI Tags</h4>
                  <div className="flex flex-wrap gap-2">
                    {feedback.ai_analysis.tags.map((tag) => (
                      <span key={tag} className="px-2 py-1 bg-purple-50 text-purple-700 rounded text-xs font-medium">
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="border-t border-gray-200 pt-6">
              <div className="flex items-center gap-2 text-gray-500">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                <p className="text-sm">No AI analysis available for this feedback.</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
