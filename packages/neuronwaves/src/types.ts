/**
 * NeuronWaves - Types and Interfaces
 *
 * PR#2: Planning, Memory Adaptation, and Policy Gate Integration
 *
 * Architecture Overview:
 * - Planner: Generates execution plans from observations and context
 * - MemoryAdapter: Retrieves relevant memories (flash and warm hits)
 * - PolicyGate: Controls execution autonomy based on safety decisions
 * - Orchestrator: Coordinates all components with approval semantics
 */

/**
 * Autonomy level for planning and execution
 * 0.0 = Fully manual (human approval for every step)
 * 0.5 = Semi-autonomous (approve for significant actions)
 * 1.0 = Fully autonomous (execute without approval)
 */
export type AutonomyLevel = 0.0 | 0.5 | 1.0;

/**
 * Policy decision from the safety gate
 */
export type PolicyDecisionKind = "allow" | "allow_with_prompt" | "block";

export interface PolicyDecision {
  /**
   * The decision to allow, allow with human prompt, or block the action
   */
  kind: PolicyDecisionKind;

  /**
   * Human-readable explanation for the decision
   */
  reason: string;

  /**
   * The specific action being evaluated
   */
  action: string;

  /**
   * Risk score from 0 (no risk) to 1 (high risk)
   */
  riskScore: number;

  /**
   * Any conditions that must be met for the decision to hold
   */
  conditions?: string[];

  /**
   * Timestamp of the decision
   */
  timestamp: string;
}

/**
 * Context bundle provided to the planner
 */
export interface ContextBundle {
  /**
   * Current session identifier
   */
  sessionKey: string;

  /**
   * User or system requesting the action
   */
  requester: string;

  /**
   * Current environment or platform
   */
  environment: "browser" | "cli" | "node" | "canvas" | "unknown";

  /**
   * Relevant configuration settings
   */
  config: Record<string, unknown>;

  /**
   * Available tools and their capabilities
   */
  availableTools: ToolCapability[];

  /**
   * Global state information
   */
  globalState?: Record<string, unknown>;
}

/**
 * Tool capability descriptor
 */
export interface ToolCapability {
  /**
   * Tool name
   */
  name: string;

  /**
   * Brief description of the tool
   */
  description: string;

  /**
   * Categories this tool belongs to (for policy evaluation)
   */
  categories: string[];

  /**
   * Whether the tool requires elevated permissions
   */
  requiresElevation: boolean;

  /**
   * Risk level (0-1) for this tool
   */
  riskLevel: number;
}

/**
 * Observation - input to the planner
 */
export interface Observation {
  /**
   * Natural language description of the observation
   */
  description: string;

  /**
   * Type of observation
   */
  type: "user_request" | "system_event" | "error" | "external_trigger" | "scheduled" | "heartbeat" | "unknown";

  /**
   * Observation timestamp
   */
  timestamp: string;

  /**
   * Source of the observation
   */
  source: string;

  /**
   * Raw data associated with the observation
   */
  data?: Record<string, unknown>;

  /**
   * Priority (0-1, higher = urgent)
   */
  priority: number;

  /**
   * Related observations (session, message IDs, etc.)
   */
  related?: string[];
}

/**
 * Single step in a plan graph
 */
export interface PlanStep {
  /**
   * Unique identifier for this step
   */
  id: string;

  /**
   * Tool or action to execute
   */
  action: string;

  /**
   * Parameters for the action
   */
  params: Record<string, unknown>;

  /**
   * Natural language description of what this step accomplishes
   */
  description: string;

  /**
   * Steps that must complete before this step
   */
  dependencies: string[];

  /**
   * Whether this step requires human approval
   */
  requiresApproval: boolean;

  /**
   * Estimated time to complete (seconds, null if unknown)
   */
  estimatedDuration: number | null;

  /**
   * Failure handling strategy
   */
  onFailure: "abort" | "retry" | "skip" | "fallback";

  /**
   * Maximum retry attempts if retry is specified
   */
  maxRetries?: number;

  /**
   * Fallback action if this step fails
   */
  fallbackAction?: PlanStep;

  /**
   * Output variable name (for step chaining)
   */
  outputVar?: string;
}

/**
 * Execution plan graph
 */
export interface PlanGraph {
  /**
   * Unique plan identifier
   */
  id: string;

  /**
   * Human-readable plan name
   */
  name: string;

  /**
   * Plan description
   */
  description: string;

  /**
   * Steps in the plan (order-independent, dependencies define topology)
   */
  steps: PlanStep[];

  /**
   * Autonomy level required for this plan
   */
  requiredAutonomy: AutonomyLevel;

  /**
   * Risk score for the entire plan (0-1)
   */
  riskScore: number;

  /**
   * Estimated total duration (seconds, null if unknown)
   */
  estimatedDuration: number | null;

  /**
   * Plan creation timestamp
   */
  createdAt: string;

  /**
   * Plan expiration timestamp (null = no expiration)
   */
  expiresAt: string | null;

  /**
   * Tags for categorization
   */
  tags: string[];

  /**
   * Metadata about the planning process
   */
  metadata: {
    /**
     * Which planner generated this plan
     */
    planner: string;

    /**
     * Memory entries used during planning
     */
    memoryEntriesReferenced: string[];

    /**
     * Confidence score (0-1)
     */
    confidence: number;
  };
}

/**
 * Memory entry (flash or warm)
 */
export interface MemoryEntry {
  /**
   * Unique entry ID
   */
  id: string;

  /**
   * Entry type
   */
  type: "flash" | "warm";

  /**
   * Timestamp of creation
   */
  timestamp: string;

  /**
   * Session key this memory belongs to
   */
  sessionKey: string;

  /**
   * Content or description
   */
  content: string;

  /**
   * Keywords for searching
   */
  keywords: string[];

  /**
   * Emotional salience (0-1)
   */
  emotionalSalience: number;

  /**
   * Privacy level (public, private, secret)
   */
  privacyLevel: "public" | "private" | "secret";

  /**
   * Whether user flagged this entry
   */
  userFlagged: boolean;

  /**
   * Other entries this references
   */
  linkedTo: string[];

  /**
   * Additional fields for warm entries
   */
  warmEntryFields?: {
    /**
     * Compressed summary
     */
    summary?: string;

    /**
     * Hook phrase for quick retrieval
     */
    hook?: string;

    /**
     * Key points
     */
    keyPoints?: string[];

    /**
     * Emotional tone
     */
    emotionalTone?: string;

    /**
     * Compression method used
     */
    compressionMethod?: string;
  };
}

/**
 * Memory adapter for retrieving relevant memories
 */
export interface MemoryAdapter {
  /**
   * Retrieve recent flash memories for a session
   *
   * @param sessionKey - Session identifier
   * @param limit - Maximum number of entries to return
   * @returns Array of flash memory entries (chronologically ordered, newest first)
   */
  recallFlash(sessionKey: string, limit: number): Promise<MemoryEntry[]>;

  /**
   * Retrieve warm entries matching keywords
   *
   * @param sessionKey - Session identifier
   * @param keywords - Keywords to search for
   * @param limit - Maximum number of entries to return
   * @returns Array of relevant warm memory entries (sorted by relevance)
   */
  recallWarmHits(sessionKey: string, keywords: string[], limit: number): Promise<MemoryEntry[]>;

  /**
   * Optional: Add a memory entry
   */
  addEntry?(entry: MemoryEntry): Promise<void>;

  /**
   * Optional: Get entry by ID
   */
  getEntry?(id: string): Promise<MemoryEntry | null>;
}

/**
 * Planner for generating execution plans
 */
export interface Planner {
  /**
   * Generate a plan graph from an observation and context
   *
   * @param observation - The current observation or request
   * @param context - Execution context and state
   * @param autonomy - Autonomy level for the plan
   * @returns Generated plan graph
   */
  generate(
    observation: Observation,
    context: ContextBundle,
    autonomy: AutonomyLevel
  ): Promise<PlanGraph>;

  /**
   * Optional: Validate an existing plan
   */
  validatePlan?(plan: PlanGraph): Promise<boolean>;

  /**
   * Optional: Update a plan based on execution feedback
   */
  updatePlan?(plan: PlanGraph, feedback: PlanFeedback): Promise<PlanGraph>;
}

/**
 * Execution feedback for plan updates
 */
export interface PlanFeedback {
  /**
   * Plan being executed
   */
  planId: string;

  /**
   * Step that produced feedback
   */
  stepId?: string;

  /**
   * Type of feedback
   */
  type: "success" | "failure" | "partial" | "timeout" | "cancelled";

  /**
   * Natural language description of what happened
   */
  description: string;

  /**
   * Output from the step (if any)
   */
  output?: Record<string, unknown>;

  /**
   * Error details (if applicable)
   */
  error?: ErrorInfo;

  /**
   * Feedback timestamp
   */
  timestamp: string;
}

/**
 * Error information
 */
export interface ErrorInfo {
  /**
   * Error code or identifier
   */
  code: string;

  /**
   * Human-readable error message
   */
  message: string;

  /**
   * Stack trace (optional)
   */
  stack?: string;

  /**
   * Additional context
   */
  context?: Record<string, unknown>;
}

/**
 * Approval request from orchestrator
 */
export interface ApprovalRequest {
  /**
   * Request ID
   */
  id: string;

  /**
   * Plan being executed
   */
  planId: string;

  /**
   * Step requiring approval
   */
  stepId: string;

  /**
   * Natural language description of what will happen
   */
  description: string;

  /**
   * Action to be performed
   */
  action: string;

  /**
   * Parameters for the action
   */
  params: Record<string, unknown>;

  /**
   * Risk score for this action
   */
  riskScore: number;

  /**
   * Policy decision for this step
   */
  policyDecision: PolicyDecision;

  /**
   * Timeout for approval (ISO timestamp, null = no timeout)
   */
  expiresAt: string | null;

  /**
   * Request timestamp
   */
  createdAt: string;
}

/**
 * Approval response from human
 */
export interface ApprovalResponse {
  /**
   * Request ID being responded to
   */
  requestId: string;

  /**
   * Whether approved or denied
   */
  approved: boolean;

  /**
   * Optional comment from approver
   */
  comment?: string;

  /**
   * Modified parameters (if approver wants to tweak)
   */
  modifiedParams?: Record<string, unknown>;

  /**
   * Response timestamp
   */
  timestamp: string;
}

/**
 * Execution status for a plan step
 */
export type StepStatus = "pending" | "awaiting_approval" | "approved" | "executing" | "success" | "failed" | "skipped" | "cancelled";

/**
 * Execution state for a plan step
 */
export interface StepExecutionState {
  /**
   * Step ID
   */
  id: string;

  /**
   * Current status
   */
  status: StepStatus;

  /**
   * Number of attempts made
   */
  attempts: number;

  /**
   * Last attempt timestamp
   */
  lastAttemptAt: string | null;

  /**
   * Completed timestamp (if applicable)
   */
  completedAt: string | null;

  /**
   * Output from execution (if any)
   */
  output?: Record<string, unknown>;

  /**
   * Error from execution (if failed)
   */
  error?: ErrorInfo;
}

/**
 * Execution state for a plan
 */
export interface PlanExecutionState {
  /**
   * Plan ID
   */
  planId: string;

  /**
   * Execution ID (unique per run)
   */
  executionId: string;

  /**
   * Overall status
   */
  status: "pending" | "running" | "completed" | "failed" | "cancelled";

  /**
   * Start timestamp
   */
  startedAt: string;

  /**
   * End timestamp (if completed)
   */
  completedAt: string | null;

  /**
   * Current step being executed
   */
  currentStepId: string | null;

  /**
   * States for all steps
   */
  stepStates: Record<string, StepExecutionState>;

  /**
   * Execution logs
   */
  logs: ExecutionLog[];
}

/**
 * Execution log entry
 */
export interface ExecutionLog {
  /**
   * Log level
   */
  level: "debug" | "info" | "warn" | "error";

  /**
   * Log message
   */
  message: string;

  /**
   * Relevant data
   */
  data?: Record<string, unknown>;

  /**
   * Timestamp
   */
  timestamp: string;
}

/**
 * Orchestrator configuration
 */
export interface OrchestratorConfig {
  /**
   * Default autonomy level
   */
  defaultAutonomy: AutonomyLevel;

  /**
   * Timeout for approval requests (milliseconds, null = no timeout)
   */
  approvalTimeout: number | null;

  /**
   * Maximum concurrent plan executions
   */
  maxConcurrentExecutions: number;

  /**
   * Whether to auto-retry failed steps (up to maxRetries)
   */
  autoRetry: boolean;

  /**
   * Maximum default retry attempts
   */
  defaultMaxRetries: number;

  /**
   * Execution poll interval (milliseconds)
   */
  pollInterval: number;

  /**
   * Log level
   */
  logLevel: "debug" | "info" | "warn" | "error";
}

/**
 * Policy gate evaluation request
 */
export interface PolicyEvaluationRequest {
  /**
   * Action or tool being evaluated
   */
  action: string;

  /**
   * Parameters for the action
   */
  params: Record<string, unknown>;

  /**
   * Context for evaluation
   */
  context: {
    requester: string;
    environment: string;
    sessionKey: string;
    autonomyLevel: AutonomyLevel;
  };

  /**
   * Available tool categories for reference
   */
  toolCategories: string[];

  /**
   * Risk factors to consider
   */
  riskFactors: string[];
}

/**
 * Policy gate interface
 */
export interface PolicyGate {
  /**
   * Evaluate an action and return a policy decision
   *
   * @param request - Policy evaluation request
   * @returns Policy decision
   */
  evaluate(request: PolicyEvaluationRequest): Promise<PolicyDecision>;

  /**
   * Optional: Update policy rules
   */
  updatePolicy?(rules: PolicyRules): Promise<void>;

  /**
   * Optional: Get current policy configuration
   */
  getPolicy?(): Promise<PolicyRules>;
}

/**
 * Policy rules definition
 */
export interface PolicyRules {
  /**
   * Allowed actions (wildcards supported)
   */
  allowedActions: string[];

  /**
   * Blocked actions (wildcards supported)
   */
  blockedActions: string[];

  /**
   * Actions requiring approval
   */
  requiresApproval: string[];

  /**
   * Risk thresholds per category
   */
  riskThresholds: Record<string, number>;

  /**
   * Custom rules
   */
  customRules: CustomPolicyRule[];
}

/**
 * Custom policy rule
 */
export interface CustomPolicyRule {
  /**
   * Rule ID
   */
  id: string;

  /**
   * Rule description
   */
  description: string;

  /**
   * Condition (string to evaluate or function reference)
   */
  condition: string;

  /**
   * Action to take if condition matches
   */
  action: "allow" | "block" | "allow_with_prompt";

  /**
   * Priority (higher = checked first)
   */
  priority: number;

  /**
   * Whether rule is enabled
   */
  enabled: boolean;
}
