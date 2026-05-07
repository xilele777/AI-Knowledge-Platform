import type { AnalyticsEventName } from '../constants/analyticsEvents'
import { isSupabaseConfigured, supabase } from './supabase'

type TrackPayload = Record<string, unknown>

function toTrackPayload(payload: TrackPayload): TrackPayload {
  return {
    ...payload,
    page_path: window.location.pathname,
    page_query: window.location.search,
    client_time: new Date().toISOString(),
  }
}

export async function track(eventName: AnalyticsEventName, payload: TrackPayload = {}): Promise<void> {
  if (!isSupabaseConfigured) {
    return
  }

  try {
    const userResult = await supabase.auth.getUser()
    const user = userResult.data.user

    if (!user) {
      return
    }

    const { error } = await supabase.from('analytics_events').insert({
      owner_id: user.id,
      event_name: eventName,
      payload: toTrackPayload(payload),
    })

    if (error) {
      console.warn('[tracker.track] insert analytics event failed:', error.message)
    }
  } catch (error) {
    console.warn('[tracker.track] unexpected error:', error)
  }
}
