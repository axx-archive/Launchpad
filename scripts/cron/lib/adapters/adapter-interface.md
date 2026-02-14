# Platform Adapter Interface

All signal adapters must export a single async function:

```javascript
/**
 * Fetch signals from the platform.
 *
 * @param {Object} config - Adapter-specific configuration
 * @param {Object} dependencies - Shared dependencies
 * @param {Function} dependencies.checkQuota - Check available quota
 * @param {Function} dependencies.consumeQuota - Record quota usage
 * @param {Function} dependencies.generateContentHash - Generate dedup hash
 * @returns {Promise<AdapterResult>}
 */
export async function fetchSignals(config, dependencies) {
  return {
    signals: [],        // Array of signal objects (see shape below)
    quota_used: 0,      // API units consumed
    errors: [],         // Array of error strings
  };
}
```

## Signal Object Shape

```javascript
{
  source: "reddit" | "youtube" | "x" | "rss",
  source_id: "platform_unique_id",
  title: "Signal title",
  content_snippet: "First ~500 chars of content",
  author: "username or channel name",
  subreddit: "subreddit_name",        // Reddit only
  channel_id: "youtube_channel_id",   // YouTube only
  upvotes: 100,                       // Reddit
  comments: 25,                       // Reddit/YouTube
  views: 5000,                        // YouTube
  likes: 200,                         // YouTube
  content_hash: "sha256_hex_string",  // For cross-source dedup
}
```

## Adapter Responsibilities

1. Fetch data from the platform API
2. Transform into the signal shape above
3. Generate content_hash for each signal
4. Track quota usage via dependencies
5. Handle rate limiting gracefully (backoff, not crash)
6. Return partial results if quota runs out mid-cycle
