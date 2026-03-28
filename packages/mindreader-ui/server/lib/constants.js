/**
 * Shared constants for MindReader server.
 */

// Entity field limits
export const MAX_SUMMARY_LENGTH = 200;
export const MAX_DETAILS_LENGTH = 10000;

// Batch sizes
export const MAX_DIRECT_ENTITY_BATCH = 100;
export const MAX_RELATIONSHIP_LIMIT = 50;
export const MAX_ENTITY_LIST_LIMIT = 200;

// LLM defaults
export const DEFAULT_LLM_TIMEOUT = 15000;
export const DEFAULT_LLM_TEMPERATURE = 0.1;

// Background job intervals
export const AUTO_CATEGORIZE_INTERVAL_MS = 60000;
export const AUTO_CATEGORIZE_INITIAL_DELAY_MS = 5000;
export const DECAY_INITIAL_DELAY_MS = 30000;

// Category cache TTL
export const CATEGORY_CACHE_TTL_MS = 60000;
