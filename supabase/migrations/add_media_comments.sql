-- Add media support to review_comments table
-- This allows coaches to attach audio/video comments to timestamps

ALTER TABLE review_comments
ADD COLUMN IF NOT EXISTS media_type TEXT CHECK (media_type IN ('text', 'audio', 'video')),
ADD COLUMN IF NOT EXISTS media_playback_id TEXT;

-- Set default media_type for existing records
UPDATE review_comments SET media_type = 'text' WHERE media_type IS NULL;

-- Add comment
COMMENT ON COLUMN review_comments.media_type IS 'Type of comment: text, audio, or video';
COMMENT ON COLUMN review_comments.media_playback_id IS 'Mux playback ID for audio/video comments';
