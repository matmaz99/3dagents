// Simple in-memory conversation storage
export interface Message {
    role: 'user' | 'assistant';
    content: string;
    timestamp: number;
}

export interface AgentMemory {
    agentId: string;
    conversationHistory: Message[];
    lastInteraction: number;
}

const MEMORY_KEY = 'ai-town-memories';
const MAX_MESSAGES_PER_AGENT = 20;

class MemoryStore {
    private memories: Map<string, AgentMemory> = new Map();

    constructor() {
        this.loadFromStorage();
    }

    private loadFromStorage(): void {
        if (typeof window === 'undefined') return;

        try {
            const stored = localStorage.getItem(MEMORY_KEY);
            if (stored) {
                const parsed = JSON.parse(stored) as Record<string, AgentMemory>;
                Object.entries(parsed).forEach(([key, value]) => {
                    this.memories.set(key, value);
                });
            }
        } catch (e) {
            console.warn('Failed to load memories from storage:', e);
        }
    }

    private saveToStorage(): void {
        if (typeof window === 'undefined') return;

        try {
            const obj: Record<string, AgentMemory> = {};
            this.memories.forEach((value, key) => {
                obj[key] = value;
            });
            localStorage.setItem(MEMORY_KEY, JSON.stringify(obj));
        } catch (e) {
            console.warn('Failed to save memories to storage:', e);
        }
    }

    getMemory(agentId: string): AgentMemory {
        if (!this.memories.has(agentId)) {
            this.memories.set(agentId, {
                agentId,
                conversationHistory: [],
                lastInteraction: Date.now(),
            });
        }
        return this.memories.get(agentId)!;
    }

    addMessage(agentId: string, message: Message): void {
        const memory = this.getMemory(agentId);
        memory.conversationHistory.push(message);
        memory.lastInteraction = Date.now();

        // Keep only the last N messages
        if (memory.conversationHistory.length > MAX_MESSAGES_PER_AGENT) {
            memory.conversationHistory = memory.conversationHistory.slice(-MAX_MESSAGES_PER_AGENT);
        }

        this.saveToStorage();
    }

    getConversationHistory(agentId: string): Message[] {
        return this.getMemory(agentId).conversationHistory;
    }

    clearMemory(agentId: string): void {
        this.memories.delete(agentId);
        this.saveToStorage();
    }

    clearAll(): void {
        this.memories.clear();
        this.saveToStorage();
    }
}

// Singleton instance
export const memoryStore = new MemoryStore();
