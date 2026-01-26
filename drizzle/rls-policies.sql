-- Enable Row Level Security on marketplace tables
-- This file is idempotent and can be re-run after schema changes

-- Publishers
ALTER TABLE publishers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Publishers are publicly readable" ON publishers;
DROP POLICY IF EXISTS "Users can create their own publisher profile" ON publishers;
DROP POLICY IF EXISTS "Users can update their own publisher profile" ON publishers;

CREATE POLICY "Publishers are publicly readable"
  ON publishers FOR SELECT
  USING (true);

CREATE POLICY "Users can create their own publisher profile"
  ON publishers FOR INSERT
  WITH CHECK ((select auth.uid()) = user_id);

CREATE POLICY "Users can update their own publisher profile"
  ON publishers FOR UPDATE
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

-- Categories (read-only for users, managed by admin)
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Categories are publicly readable" ON categories;

CREATE POLICY "Categories are publicly readable"
  ON categories FOR SELECT
  USING (true);

-- Extensions
ALTER TABLE extensions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Published extensions are publicly readable" ON extensions;
DROP POLICY IF EXISTS "Publishers can read their own extensions" ON extensions;
DROP POLICY IF EXISTS "Extensions are readable" ON extensions;
DROP POLICY IF EXISTS "Publishers can insert their own extensions" ON extensions;
DROP POLICY IF EXISTS "Publishers can update their own extensions" ON extensions;

CREATE POLICY "Extensions are readable"
  ON extensions FOR SELECT
  USING (true);

CREATE POLICY "Publishers can insert their own extensions"
  ON extensions FOR INSERT
  WITH CHECK (
    publisher_id IN (
      SELECT id FROM publishers WHERE user_id = (select auth.uid())
    )
  );

CREATE POLICY "Publishers can update their own extensions"
  ON extensions FOR UPDATE
  USING (
    publisher_id IN (
      SELECT id FROM publishers WHERE user_id = (select auth.uid())
    )
  )
  WITH CHECK (
    publisher_id IN (
      SELECT id FROM publishers WHERE user_id = (select auth.uid())
    )
  );

-- Extension Versions
ALTER TABLE extension_versions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Published versions are publicly readable" ON extension_versions;
DROP POLICY IF EXISTS "Publishers can read their own versions" ON extension_versions;
DROP POLICY IF EXISTS "Extension versions are readable" ON extension_versions;
DROP POLICY IF EXISTS "Publishers can insert versions for their extensions" ON extension_versions;
DROP POLICY IF EXISTS "Publishers can update their own versions" ON extension_versions;

CREATE POLICY "Extension versions are readable"
  ON extension_versions FOR SELECT
  USING (true);

CREATE POLICY "Publishers can insert versions for their extensions"
  ON extension_versions FOR INSERT
  WITH CHECK (
    extension_id IN (
      SELECT e.id FROM extensions e
      JOIN publishers p ON e.publisher_id = p.id
      WHERE p.user_id = (select auth.uid())
    )
  );

CREATE POLICY "Publishers can update their own versions"
  ON extension_versions FOR UPDATE
  USING (
    extension_id IN (
      SELECT e.id FROM extensions e
      JOIN publishers p ON e.publisher_id = p.id
      WHERE p.user_id = (select auth.uid())
    )
  );

-- Extension Screenshots
ALTER TABLE extension_screenshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Screenshots are publicly readable" ON extension_screenshots;
DROP POLICY IF EXISTS "Publishers can manage screenshots for their extensions" ON extension_screenshots;
DROP POLICY IF EXISTS "Publishers can insert screenshots" ON extension_screenshots;
DROP POLICY IF EXISTS "Publishers can update screenshots" ON extension_screenshots;
DROP POLICY IF EXISTS "Publishers can delete screenshots" ON extension_screenshots;

CREATE POLICY "Screenshots are publicly readable"
  ON extension_screenshots FOR SELECT
  USING (true);

CREATE POLICY "Publishers can insert screenshots"
  ON extension_screenshots FOR INSERT
  WITH CHECK (
    extension_id IN (
      SELECT e.id FROM extensions e
      JOIN publishers p ON e.publisher_id = p.id
      WHERE p.user_id = (select auth.uid())
    )
  );

CREATE POLICY "Publishers can update screenshots"
  ON extension_screenshots FOR UPDATE
  USING (
    extension_id IN (
      SELECT e.id FROM extensions e
      JOIN publishers p ON e.publisher_id = p.id
      WHERE p.user_id = (select auth.uid())
    )
  );

CREATE POLICY "Publishers can delete screenshots"
  ON extension_screenshots FOR DELETE
  USING (
    extension_id IN (
      SELECT e.id FROM extensions e
      JOIN publishers p ON e.publisher_id = p.id
      WHERE p.user_id = (select auth.uid())
    )
  );

-- Extension Reviews
ALTER TABLE extension_reviews ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Reviews are publicly readable" ON extension_reviews;
DROP POLICY IF EXISTS "Users can create their own reviews" ON extension_reviews;
DROP POLICY IF EXISTS "Users can update their own reviews" ON extension_reviews;
DROP POLICY IF EXISTS "Users can delete their own reviews" ON extension_reviews;

CREATE POLICY "Reviews are publicly readable"
  ON extension_reviews FOR SELECT
  USING (true);

CREATE POLICY "Users can create their own reviews"
  ON extension_reviews FOR INSERT
  WITH CHECK ((select auth.uid()) = user_id);

CREATE POLICY "Users can update their own reviews"
  ON extension_reviews FOR UPDATE
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

CREATE POLICY "Users can delete their own reviews"
  ON extension_reviews FOR DELETE
  USING ((select auth.uid()) = user_id);

-- Extension Downloads (insert only, no read for privacy)
ALTER TABLE extension_downloads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can record downloads" ON extension_downloads;

CREATE POLICY "Anyone can record downloads"
  ON extension_downloads FOR INSERT
  WITH CHECK (true);

-- Publisher API Keys (sensitive - only owner can access)
ALTER TABLE publisher_api_keys ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Publishers can read their own API keys" ON publisher_api_keys;
DROP POLICY IF EXISTS "Publishers can create their own API keys" ON publisher_api_keys;
DROP POLICY IF EXISTS "Publishers can delete their own API keys" ON publisher_api_keys;

CREATE POLICY "Publishers can read their own API keys"
  ON publisher_api_keys FOR SELECT
  USING (
    publisher_id IN (
      SELECT id FROM publishers WHERE user_id = (select auth.uid())
    )
  );

CREATE POLICY "Publishers can create their own API keys"
  ON publisher_api_keys FOR INSERT
  WITH CHECK (
    publisher_id IN (
      SELECT id FROM publishers WHERE user_id = (select auth.uid())
    )
  );

CREATE POLICY "Publishers can delete their own API keys"
  ON publisher_api_keys FOR DELETE
  USING (
    publisher_id IN (
      SELECT id FROM publishers WHERE user_id = (select auth.uid())
    )
  );
