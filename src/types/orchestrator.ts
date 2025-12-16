// Core types for the World Event Orchestrator system

// Tool call tracking for the recursive stack
export interface ToolCallFrame {
  id: string;                          // Unique ID for this frame
  callerAgentId: string;               // Agent making the call
  targetAgentId: string;               // Agent being called
  query: string;                       // What the caller is asking
  context?: string;                    // Optional context from conversation
  depth: number;                       // Current recursion depth
  status: 'pending' | 'walking' | 'thinking' | 'returning' | 'complete';
  startTime: number;
  response?: string;                   // Response from target agent
  thoughtBubbleId?: string;            // Reference to visual bubble
}

// The call stack for tracking nested calls
export interface ToolCallStack {
  frames: ToolCallFrame[];
  maxDepth: number;                    // Track deepest recursion
  rootAgentId: string;                 // Original agent user talked to
}

// Status message for UI updates
export interface StatusMessage {
  type: 'consulting' | 'thinking' | 'returning' | 'summary';
  agentId: string;
  targetAgentId?: string;
  message: string;
  depth: number;
  timestamp: number;
}

// Thought bubble configuration
export interface ThoughtBubbleConfig {
  id: string;
  agentId: string;
  content: string;                     // Summary text
  position: { x: number; y: number };
  chainedTo?: string;                  // ID of parent bubble (for chaining)
  depth: number;
  isActive: boolean;
}

// Agent availability state
export interface AgentBusyState {
  agentId: string;
  busyUntil: number | null;            // null means indefinitely busy
  currentTask: string;
  inCallChain: string | null;          // ID of the call chain they're in
}

// Extended agent state for consulting
export type AgentState = 'idle' | 'walking' | 'talking' | 'working' | 'consulting';

// Tool definition for consulting other agents
export interface ConsultAgentToolArgs {
  targetAgentId: string;
  query: string;
  context?: string;                    // Optional context from conversation
}

// Streaming response format with tool call support
export interface StreamChunk {
  type: 'text' | 'tool_call_start' | 'tool_call_result' | 'status' | 'error';
  content?: string;
  toolCall?: {
    id: string;
    name: string;
    args: Record<string, unknown>;
  };
  toolResult?: {
    id: string;
    result: string;
  };
  status?: StatusMessage;
}

// Orchestrator callbacks interface
export interface OrchestratorCallbacks {
  // Phaser commands
  walkAgentToAgent: (walkerId: string, targetId: string) => Promise<void>;
  setAgentState: (agentId: string, state: AgentState) => void;
  getAgentPosition: (agentId: string) => { x: number; y: number } | null;
  showThoughtBubble: (config: ThoughtBubbleConfig) => void;
  updateThoughtBubble: (id: string, content: string) => void;
  hideThoughtBubble: (id: string) => void;
  returnAgentToDesk: (agentId: string) => Promise<void>;

  // React UI updates
  onStatusMessage: (message: StatusMessage) => void;
  onToolCallStart: (frame: ToolCallFrame) => void;
  onToolCallComplete: (frame: ToolCallFrame) => void;
}
