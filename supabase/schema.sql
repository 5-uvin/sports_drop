-- =====================================================
-- Sports Drop Meow Merger — Supabase Database Setup
-- HOW TO RUN:
--   1. Go to supabase.com → your project
--   2. Click "SQL Editor" in left sidebar
--   3. Click "New Query"
--   4. Paste this ENTIRE file
--   5. Click the green "Run" button
--   6. You should see "Success. No rows returned."
-- =====================================================


-- 1. CREATE THE LEADERBOARD TABLE
-- ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.leaderboard (
  id          BIGSERIAL PRIMARY KEY,
  name        TEXT NOT NULL
              CHECK (char_length(name) BETWEEN 1 AND 20),
  score       INTEGER NOT NULL
              CHECK (score >= 0 AND score <= 999999),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Fast index for leaderboard queries (top scores first)
CREATE INDEX IF NOT EXISTS leaderboard_score_desc
  ON public.leaderboard (score DESC);


-- 2. ROW LEVEL SECURITY (prevents unauthorized changes)
-- ─────────────────────────────────────────────────────
ALTER TABLE public.leaderboard ENABLE ROW LEVEL SECURITY;

-- Anyone can READ the leaderboard (it's public)
CREATE POLICY "public_read_leaderboard"
  ON public.leaderboard
  FOR SELECT
  TO anon, authenticated
  USING (true);

-- Anyone can INSERT a score (to submit to leaderboard)
CREATE POLICY "public_insert_score"
  ON public.leaderboard
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    char_length(name) BETWEEN 1 AND 20
    AND score >= 0
    AND score <= 999999
  );

-- NOBODY can UPDATE or DELETE rows from the browser
-- (only your server's service_role key can do that)


-- 3. AUTO-KEEP BEST SCORE PER NAME
-- (optional but recommended — stops score spamming)
-- ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.keep_best_score()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  -- Delete any older, lower scores for the same name
  DELETE FROM public.leaderboard
  WHERE name = NEW.name
    AND score < NEW.score
    AND id != NEW.id;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER after_score_insert
  AFTER INSERT ON public.leaderboard
  FOR EACH ROW
  EXECUTE FUNCTION public.keep_best_score();


-- 4. VERIFY IT WORKED (run this after the above)
-- ─────────────────────────────────────────────────────
-- INSERT INTO public.leaderboard (name, score) VALUES ('TestPlayer', 999);
-- SELECT * FROM public.leaderboard ORDER BY score DESC;
-- You should see your test row. Delete it after:
-- DELETE FROM public.leaderboard WHERE name = 'TestPlayer';
