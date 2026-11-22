-- Migration 003: Add search run detailed stats JSONB column
-- Stores { llmCalls, llmErrors, llmSkippedStale, shortlistCount, hiddenCount, languageHidden }

ALTER TABLE search_runs ADD COLUMN IF NOT EXISTS stats JSONB;
