-- ============================================================================
-- Vcon — migration 0002: image safety limits
--
-- 1) Storage front door: cap the private `content` bucket at 10 MB per file
--    (matches MAX_IMAGE_BYTES in src/lib/checks/image-limits.ts). Oversized
--    uploads are refused by storage itself, before any app code runs.
-- 2) Idempotent.
-- ============================================================================

update storage.buckets
set file_size_limit = 10485760 -- 10 MB
where id = 'content'
  and (file_size_limit is null or file_size_limit > 10485760);
