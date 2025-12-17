// Project-scoped conversation storage
export interface Message {
    role: 'user' | 'assistant';
    content: string;
    timestamp: number;
}

export interface AgentMemory {
    projectId: string;
    agentId: string;
    conversationHistory: Message[];
    lastInteraction: number;
}

const MEMORY_KEY = 'ai-town-memories';
const MEMORY_VERSION_KEY = 'ai-town-memory-version';
const CURRENT_VERSION = 2; // Increment this when agent IDs change
const MAX_MESSAGES_PER_AGENT = 20;

// Create a composite key for project+agent
function createKey(projectId: string, agentId: string): string {
    return `${projectId}:${agentId}`;
}

class MemoryStore {
    private memories: Map<string, AgentMemory> = new Map();

    constructor() {
        this.checkVersionAndLoad();
    }

    private checkVersionAndLoad(): void {
        if (typeof window === 'undefined') return;

        try {
            // Check if memory version matches current version
            const storedVersion = localStorage.getItem(MEMORY_VERSION_KEY);
            const version = storedVersion ? parseInt(storedVersion, 10) : 0;

            if (version < CURRENT_VERSION) {
                // Version mismatch - clear old data (agent IDs changed)
                console.log('Memory version mismatch, clearing old conversation data');
                localStorage.removeItem(MEMORY_KEY);
                localStorage.setItem(MEMORY_VERSION_KEY, CURRENT_VERSION.toString());
                return;
            }

            // Load existing data
            this.loadFromStorage();
        } catch (e) {
            console.warn('Failed to check memory version:', e);
        }
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

    // Get or create memory for a project+agent combination
    getMemory(projectId: string, agentId: string): AgentMemory {
        const key = createKey(projectId, agentId);
        if (!this.memories.has(key)) {
            this.memories.set(key, {
                projectId,
                agentId,
                conversationHistory: [],
                lastInteraction: Date.now(),
            });
        }
        return this.memories.get(key)!;
    }

    // Add a message to the conversation
    addMessage(projectId: string, agentId: string, message: Message): void {
        const memory = this.getMemory(projectId, agentId);
        memory.conversationHistory.push(message);
        memory.lastInteraction = Date.now();

        // Keep only the last N messages
        if (memory.conversationHistory.length > MAX_MESSAGES_PER_AGENT) {
            memory.conversationHistory = memory.conversationHistory.slice(-MAX_MESSAGES_PER_AGENT);
        }

        this.saveToStorage();
    }

    // Get conversation history for a project+agent
    getConversationHistory(projectId: string, agentId: string): Message[] {
        return this.getMemory(projectId, agentId).conversationHistory;
    }

    // Clear memory for a specific project+agent
    clearMemory(projectId: string, agentId: string): void {
        const key = createKey(projectId, agentId);
        this.memories.delete(key);
        this.saveToStorage();
    }

    // Clear all memories for a project
    clearProjectMemories(projectId: string): void {
        const keysToDelete: string[] = [];
        this.memories.forEach((_, key) => {
            if (key.startsWith(`${projectId}:`)) {
                keysToDelete.push(key);
            }
        });
        keysToDelete.forEach(key => this.memories.delete(key));
        this.saveToStorage();
    }

    // Clear all memories
    clearAll(): void {
        this.memories.clear();
        this.saveToStorage();
    }

    // Legacy support: Get memory with just agentId (uses 'default' project)
    // This maintains backward compatibility
    getLegacyMemory(agentId: string): AgentMemory {
        return this.getMemory('default', agentId);
    }

    addLegacyMessage(agentId: string, message: Message): void {
        this.addMessage('default', agentId, message);
    }

    getLegacyConversationHistory(agentId: string): Message[] {
        return this.getConversationHistory('default', agentId);
    }
}

// Singleton instance
export const memoryStore = new MemoryStore();
