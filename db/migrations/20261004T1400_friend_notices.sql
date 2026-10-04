-- #79: when the requester was told their friend request was accepted (the pop-up). NULL = not yet.
-- Requests accepted before this column existed count as told, so nobody gets a flood of old notices.
ALTER TABLE friendships ADD COLUMN requester_notified_at timestamptz;
UPDATE friendships SET requester_notified_at = coalesce(responded_at, now()) WHERE status = 'accepted';
