/**
 * Capability Inference Service
 * 
 * Analyzes task prompts to infer required capabilities.
 * Falls back to 'general-purpose' if inference fails or ambiguous.
 */
import type { StandardCapability } from '@opensourcewtf/waaah-types';

/**
 * Keyword patterns for each capability
 */
const CAPABILITY_PATTERNS: Record<StandardCapability, RegExp[]> = {
  'code-writing': [
    /\b(implement|code|build|create|develop|fix|bug|feature|function|class|method|refactor)\b/i,
    /\b(typescript|javascript|python|component|api|endpoint|logic)\b/i,
    /\b(add|modify|update|change|edit)\s+(the\s+)?(code|implementation|file|module)\b/i
  ],
  'test-writing': [
    /\b(test|tests|testing|unit\s*test|e2e|integration\s*test|coverage)\b/i,
    /\bwrite\s+(unit\s+)?tests?\b/i,
    /\b(vitest|jest|mocha|playwright|spec\.ts|test\.ts)\b/i
  ],
  'spec-writing': [
    /\b(spec|specification|design|architect|plan|blueprint|proposal)\b/i,
    /\b(requirements?|rfc|technical design|system design)\b/i
  ],
  'doc-writing': [
    /\b(document|documentation|readme|docs|write-up|explain)\b/i,
    /\b(jsdoc|typedoc|markdown|comment|annotate)\b/i
  ],
  'code-doctor': [
    /\b(review|audit|analyze|inspect|check|lint|static analysis)\b/i,
    /\b(code quality|complexity|security scan|vulnerability)\b/i
  ],
  'general-purpose': [] // Never matched directly, used as fallback
};

/**
 * Minimum confidence threshold for inference
 * If no capability scores above this, fallback to general-purpose
 */
const CONFIDENCE_THRESHOLD = 0.3;

/**
 * Result of capability inference
 */
export interface InferenceResult {
  capabilities: StandardCapability[];
  confidence: number;
  fallback: boolean;
}

/**
 * Infer required capabilities from a task prompt
 * 
 * @param prompt - The task prompt text to analyze
 * @param context - Optional additional context (spec, tasks, etc.)
 * @returns Inferred capabilities with confidence score
 */
export function inferCapabilities(
  prompt: string,
  context?: { spec?: string; tasks?: string }
): InferenceResult {
  // Combine prompt with any additional context
  const fullText = [prompt, context?.spec, context?.tasks]
    .filter(Boolean)
    .join(' ');

  if (!fullText.trim()) {
    return {
      capabilities: ['general-purpose'],
      confidence: 0,
      fallback: true
    };
  }

  // Score each capability
  const scores: Record<string, number> = {};
  const capabilities = Object.keys(CAPABILITY_PATTERNS) as StandardCapability[];

  for (const cap of capabilities) {
    if (cap === 'general-purpose') continue;

    const patterns = CAPABILITY_PATTERNS[cap];
    let matchCount = 0;

    for (const pattern of patterns) {
      const matches = fullText.match(pattern);
      if (matches) {
        matchCount += matches.length;
      }
    }

    // Normalize by number of patterns
    scores[cap] = matchCount / patterns.length;
  }

  // Get capabilities with scores above threshold
  const matched = Object.entries(scores)
    .filter(([_, score]) => score >= CONFIDENCE_THRESHOLD)
    .sort((a, b) => b[1] - a[1]);

  if (matched.length === 0) {
    return {
      capabilities: ['general-purpose'],
      confidence: 0,
      fallback: true
    };
  }

  // Take the top capability (or top 2 if scores are close)
  const topScore = matched[0][1];
  const inferredCaps = matched
    .filter(([_, score]) => score >= topScore * 0.5) // Within 50% of top
    .map(([cap]) => cap as StandardCapability);

  return {
    capabilities: inferredCaps,
    confidence: topScore,
    fallback: false
  };
}

/**
 * Check if a capability is the general-purpose fallback
 */
export function isGeneralPurpose(capabilities: StandardCapability[]): boolean {
  return capabilities.length === 1 && capabilities[0] === 'general-purpose';
}
