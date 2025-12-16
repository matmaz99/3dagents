// World Event Orchestrator - coordinates tool calls with 2D world visuals

import { getAgentById } from '@/agents/personalities';
import {
    ToolCallFrame,
    StatusMessage,
    ThoughtBubbleConfig,
    AgentState,
} from '@/types/orchestrator';

// Callbacks for interacting with Phaser and React
export interface OrchestratorCallbacks {
    // Phaser world commands
    walkAgentToAgent: (walkerId: string, targetId: string) => Promise<void>;
    setAgentState: (agentId: string, state: AgentState) => void;
    getAgentPosition: (agentId: string) => { x: number; y: number } | null;
    showThoughtBubble: (bubbleId: string, agentId: string, content?: string, depth?: number) => void;
    updateThoughtBubble: (bubbleId: string, content: string) => void;
    hideThoughtBubble: (bubbleId: string) => void;
    returnAgentToDesk: (agentId: string) => Promise<void>;
    returnAllAgentsToDesks: () => void;

    // React UI updates
    onStatusMessage: (message: StatusMessage) => void;
}

// Call stack for tracking nested tool calls
class CallStack {
    private frames: ToolCallFrame[] = [];
    private maxDepth: number = 0;

    push(frame: Omit<ToolCallFrame, 'depth'>): ToolCallFrame {
        const depth = this.frames.length;
        const fullFrame: ToolCallFrame = { ...frame, depth };
        this.frames.push(fullFrame);
        this.maxDepth = Math.max(this.maxDepth, depth);
        return fullFrame;
    }

    pop(): ToolCallFrame | undefined {
        return this.frames.pop();
    }

    peek(): ToolCallFrame | undefined {
        return this.frames[this.frames.length - 1];
    }

    updateFrame(id: string, updates: Partial<ToolCallFrame>): void {
        const frame = this.frames.find(f => f.id === id);
        if (frame) {
            Object.assign(frame, updates);
        }
    }

    getDepth(): number {
        return this.frames.length;
    }

    isAgentInChain(agentId: string): boolean {
        return this.frames.some(
            f => f.callerAgentId === agentId || f.targetAgentId === agentId
        );
    }

    getChain(): string[] {
        return this.frames.map(f => f.targetAgentId);
    }

    clear(): void {
        this.frames = [];
    }
}

export class WorldEventOrchestrator {
    private callStack: CallStack;
    private callbacks: OrchestratorCallbacks | null = null;
    private agentBusyStates: Map<string, boolean> = new Map();
    private rootAgentId: string;
    private isCancelled: boolean = false;

    constructor(rootAgentId: string) {
        this.callStack = new CallStack();
        this.rootAgentId = rootAgentId;
    }

    // Set callbacks (called when Phaser scene is ready)
    setCallbacks(callbacks: OrchestratorCallbacks): void {
        this.callbacks = callbacks;
    }

    // Check if orchestrator has callbacks set
    isReady(): boolean {
        return this.callbacks !== null;
    }

    // Handle a tool call - returns a promise that resolves when the visual workflow completes
    async handleToolCall(
        callerAgentId: string,
        targetAgentId: string,
        query: string,
        context?: string
    ): Promise<{ visualsComplete: boolean }> {
        if (!this.callbacks) {
            console.warn('Orchestrator callbacks not set');
            return { visualsComplete: false };
        }

        if (this.isCancelled) {
            return { visualsComplete: false };
        }

        // Check if target agent is available
        if (this.agentBusyStates.get(targetAgentId)) {
            this.emitStatus('consulting', callerAgentId, targetAgentId,
                `${this.getAgentName(targetAgentId)} is busy...`);
            return { visualsComplete: false };
        }

        // Check for cycles
        if (this.callStack.isAgentInChain(targetAgentId)) {
            return { visualsComplete: false };
        }

        // Create frame
        const frame = this.callStack.push({
            id: crypto.randomUUID(),
            callerAgentId,
            targetAgentId,
            query,
            context,
            status: 'pending',
            startTime: Date.now(),
        });

        // Mark agent as busy
        this.agentBusyStates.set(targetAgentId, true);

        try {
            // Phase 1: Walking
            await this.handleWalkingPhase(frame);

            if (this.isCancelled) return { visualsComplete: false };

            // Phase 2: Thinking (visual only - actual API call happens separately)
            await this.handleThinkingPhase(frame);

            return { visualsComplete: true };
        } catch (error) {
            console.error('Tool call orchestration error:', error);
            return { visualsComplete: false };
        }
    }

    // Complete the tool call (called after API response received)
    async completeToolCall(frameId: string, response: string): Promise<void> {
        if (!this.callbacks) return;

        const frame = this.findFrame(frameId);
        if (!frame) return;

        // Update thought bubble with summary
        if (frame.thoughtBubbleId) {
            const summary = this.summarizeResponse(response);
            this.callbacks.updateThoughtBubble(frame.thoughtBubbleId, summary);

            // Wait a moment for user to see the summary
            await this.delay(1500);
        }

        // Phase 3: Returning
        await this.handleReturningPhase(frame);

        // Cleanup
        this.agentBusyStates.set(frame.targetAgentId, false);
        this.callStack.pop();

        // Hide thought bubble after a delay
        if (frame.thoughtBubbleId) {
            await this.delay(500);
            this.callbacks.hideThoughtBubble(frame.thoughtBubbleId);
        }
    }

    private async handleWalkingPhase(frame: ToolCallFrame): Promise<void> {
        if (!this.callbacks) return;

        this.callStack.updateFrame(frame.id, { status: 'walking' });

        // Emit status message
        this.emitStatus('consulting', frame.callerAgentId, frame.targetAgentId,
            `Consulting ${this.getAgentName(frame.targetAgentId)}...`);

        // Walk target agent to caller
        await this.callbacks.walkAgentToAgent(frame.targetAgentId, frame.callerAgentId);
    }

    private async handleThinkingPhase(frame: ToolCallFrame): Promise<void> {
        if (!this.callbacks) return;

        this.callStack.updateFrame(frame.id, { status: 'thinking' });

        // Set agent to consulting state
        this.callbacks.setAgentState(frame.targetAgentId, 'consulting');

        // Show thought bubble
        const bubbleId = `bubble-${frame.id}`;
        this.callbacks.showThoughtBubble(bubbleId, frame.targetAgentId, undefined, frame.depth);

        this.callStack.updateFrame(frame.id, { thoughtBubbleId: bubbleId });

        // Emit thinking status
        this.emitStatus('thinking', frame.targetAgentId, undefined,
            `${this.getAgentName(frame.targetAgentId)} is thinking...`);
    }

    private async handleReturningPhase(frame: ToolCallFrame): Promise<void> {
        if (!this.callbacks) return;

        this.callStack.updateFrame(frame.id, { status: 'returning' });

        // Emit returning status
        this.emitStatus('returning', frame.targetAgentId, undefined,
            `${this.getAgentName(frame.targetAgentId)} returning...`);

        // Return agent to desk
        await this.callbacks.returnAgentToDesk(frame.targetAgentId);
    }

    private emitStatus(
        type: StatusMessage['type'],
        agentId: string,
        targetAgentId: string | undefined,
        message: string
    ): void {
        if (!this.callbacks) return;

        this.callbacks.onStatusMessage({
            type,
            agentId,
            targetAgentId,
            message,
            depth: this.callStack.getDepth(),
            timestamp: Date.now(),
        });
    }

    private getAgentName(agentId: string): string {
        const agent = getAgentById(agentId);
        return agent?.name || agentId;
    }

    private summarizeResponse(response: string): string {
        const maxLength = 50;
        if (response.length <= maxLength) return response;
        return response.substring(0, maxLength - 3) + '...';
    }

    private findFrame(frameId: string): ToolCallFrame | undefined {
        // Simple linear search since stack is usually small
        return undefined; // Frame is managed internally via stack
    }

    private delay(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // Cancel all pending operations
    cancel(): void {
        this.isCancelled = true;
        this.callStack.clear();
        this.agentBusyStates.clear();
        this.callbacks?.returnAllAgentsToDesks();
    }

    // Reset for new conversation
    reset(): void {
        this.isCancelled = false;
        this.callStack.clear();
        this.agentBusyStates.clear();
    }

    // Get current call depth
    getCallDepth(): number {
        return this.callStack.getDepth();
    }

    // Check if any tool calls are in progress
    isProcessing(): boolean {
        return this.callStack.getDepth() > 0;
    }
}

// Factory function
export function createOrchestrator(rootAgentId: string): WorldEventOrchestrator {
    return new WorldEventOrchestrator(rootAgentId);
}
