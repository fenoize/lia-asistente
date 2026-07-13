DELETE FROM public.meetings
WHERE user_id = 'e3a48b61-c509-45d5-a569-b3d8e078de7a'
  AND google_event_id LIKE '6ad8c35a798442419f37d0561362055b%';

-- Reset the Google Calendar sync token so the next pull performs a full resync
-- and any lingering stale events are refreshed cleanly.
UPDATE public.user_integrations
SET sync_token = NULL
WHERE user_id = 'e3a48b61-c509-45d5-a569-b3d8e078de7a'
  AND provider = 'google_calendar';