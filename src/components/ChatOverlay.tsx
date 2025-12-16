'use client';

import { useState, useRef, useEffect, FormEvent } from 'react';
import { AgentPersonality, getAgentById } from '@/agents/personalities';
import { memoryStore, Message } from '@/agents/memory';
import type { GameCanvasHandle } from './GameCanvas';

// Tool call event from the API
interface ToolCallEvent {
    type: 'tool_call_start' | 'tool_call_end';
    callerAgentId: string;
    targetAgentId: string;
    query?: string;
    response?: string;
    depth: number;
}

// Active consultation for visual tracking
interface ActiveConsultation {
    id: string;
    callerAgentId: string;
    targetAgentId: string;
    bubbleId: string;
    depth: number;
}

interface ChatOverlayProps {
    agent: AgentPersonality;
    onClose: () => void;
    gameRef?: React.RefObject<GameCanvasHandle | null>;
}

export function ChatOverlay({ agent, onClose, gameRef }: ChatOverlayProps) {
    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [streamingText, setStreamingText] = useState('');
    const [hasGreeted, setHasGreeted] = useState(false);
    const [statusMessage, setStatusMessage] = useState<string | null>(null);
    const [activeConsultations, setActiveConsultations] = useState<ActiveConsultation[]>([]);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    // Load conversation history and add greeting
    useEffect(() => {
        const history = memoryStore.getLegacyConversationHistory(agent.id);
        setMessages(history);

        // Add greeting if this is the first message
        if (history.length === 0 && !hasGreeted) {
            const greetingMessage: Message = {
                role: 'assistant',
                content: agent.greeting,
                timestamp: Date.now(),
            };
            setMessages([greetingMessage]);
            memoryStore.addLegacyMessage(agent.id, greetingMessage);
            setHasGreeted(true);
        }

        // Focus input
        setTimeout(() => inputRef.current?.focus(), 100);
    }, [agent, hasGreeted]);

    // Scroll to bottom when messages change
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages, streamingText]);

    // Handle escape key to close
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                onClose();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [onClose]);

    // Cleanup on unmount - return all agents to desks
    useEffect(() => {
        return () => {
            if (gameRef?.current) {
                gameRef.current.returnAllAgentsToDesks();
            }
        };
    }, [gameRef]);

    // Handle tool call events from the API stream
    const handleToolCallEvent = async (event: ToolCallEvent) => {
        const targetAgent = getAgentById(event.targetAgentId);
        const callerAgent = getAgentById(event.callerAgentId);

        if (event.type === 'tool_call_start') {
            const consultationId = `${event.callerAgentId}-${event.targetAgentId}-${Date.now()}`;
            const bubbleId = `bubble-${consultationId}`;

            // Update status message
            setStatusMessage(`${callerAgent?.name || event.callerAgentId} is consulting ${targetAgent?.name || event.targetAgentId}...`);

            // Add to active consultations
            setActiveConsultations(prev => [...prev, {
                id: consultationId,
                callerAgentId: event.callerAgentId,
                targetAgentId: event.targetAgentId,
                bubbleId,
                depth: event.depth,
            }]);

            // Trigger visual animation if game ref is available
            if (gameRef?.current) {
                // Walk target agent to caller
                await gameRef.current.walkAgentToAgent(event.targetAgentId, event.callerAgentId);

                // Set agent state and show thought bubble
                gameRef.current.setAgentState(event.targetAgentId, 'consulting');
                gameRef.current.showThoughtBubble(bubbleId, event.targetAgentId, 'Thinking...', event.depth);
            }
        } else if (event.type === 'tool_call_end') {
            // Find the active consultation
            const consultation = activeConsultations.find(
                c => c.callerAgentId === event.callerAgentId && c.targetAgentId === event.targetAgentId
            );

            if (consultation && gameRef?.current) {
                // Update thought bubble with response summary
                const summary = event.response?.substring(0, 50) + (event.response && event.response.length > 50 ? '...' : '') || '';
                gameRef.current.updateThoughtBubble(consultation.bubbleId, summary);

                // Wait a moment for user to see the response
                await new Promise(resolve => setTimeout(resolve, 1500));

                // Hide thought bubble and return agent
                gameRef.current.hideThoughtBubble(consultation.bubbleId);
                await gameRef.current.returnAgentToDesk(event.targetAgentId);
            }

            // Remove from active consultations
            setActiveConsultations(prev => prev.filter(
                c => !(c.callerAgentId === event.callerAgentId && c.targetAgentId === event.targetAgentId)
            ));

            // Clear status if no more consultations
            setActiveConsultations(prev => {
                if (prev.length === 0) {
                    setStatusMessage(null);
                }
                return prev;
            });
        }
    };

    // Parse stream chunk for tool events
    const parseStreamChunk = (chunk: string): { text: string; toolEvents: ToolCallEvent[] } => {
        const toolEvents: ToolCallEvent[] = [];
        let text = chunk;

        // Extract tool events from the chunk
        const toolEventRegex = /__TOOL_EVENT__(.+?)__END_TOOL_EVENT__/g;
        let match;

        while ((match = toolEventRegex.exec(chunk)) !== null) {
            try {
                const eventData = JSON.parse(match[1]);
                if (eventData.toolEvent) {
                    toolEvents.push(eventData.toolEvent);
                }
            } catch (e) {
                console.error('Failed to parse tool event:', e);
            }
        }

        // Remove tool events from text
        text = chunk.replace(toolEventRegex, '');

        return { text, toolEvents };
    };

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        if (!input.trim() || isLoading) return;

        const userMessage: Message = {
            role: 'user',
            content: input.trim(),
            timestamp: Date.now(),
        };

        setMessages(prev => [...prev, userMessage]);
        memoryStore.addLegacyMessage(agent.id, userMessage);
        setInput('');
        setIsLoading(true);
        setStreamingText('');
        setStatusMessage(null);

        try {
            const response = await fetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    agentId: agent.id,
                    message: userMessage.content,
                    conversationHistory: messages.slice(-10),
                }),
            });

            if (!response.ok) {
                throw new Error('Failed to get response');
            }

            // Check if it's a streaming response or JSON
            const contentType = response.headers.get('content-type');

            if (contentType?.includes('text/plain') || contentType?.includes('text/event-stream')) {
                // Handle streaming response
                const reader = response.body?.getReader();
                const decoder = new TextDecoder();

                if (reader) {
                    let fullText = '';
                    let buffer = '';

                    while (true) {
                        const { done, value } = await reader.read();
                        if (done) break;

                        const chunk = decoder.decode(value, { stream: true });
                        buffer += chunk;

                        // Parse chunk for tool events and text
                        const { text, toolEvents } = parseStreamChunk(buffer);
                        buffer = ''; // Clear buffer after parsing

                        // Handle tool events
                        for (const event of toolEvents) {
                            await handleToolCallEvent(event);
                        }

                        // Append text (skip newlines that were part of tool event markers)
                        const cleanText = text.replace(/^\n+|\n+$/g, '');
                        if (cleanText) {
                            fullText += cleanText;
                            setStreamingText(fullText);
                        }
                    }

                    // Add completed message (only if not empty)
                    if (fullText.trim()) {
                        const assistantMessage: Message = {
                            role: 'assistant',
                            content: fullText,
                            timestamp: Date.now(),
                        };
                        setMessages(prev => [...prev, assistantMessage]);
                        memoryStore.addLegacyMessage(agent.id, assistantMessage);
                    }
                    setStreamingText('');
                }
            } else {
                // Handle JSON response (mock mode)
                const data = await response.json();
                const assistantMessage: Message = {
                    role: 'assistant',
                    content: data.response || "I'm not sure what to say...",
                    timestamp: Date.now(),
                };
                setMessages(prev => [...prev, assistantMessage]);
                memoryStore.addLegacyMessage(agent.id, assistantMessage);
            }
        } catch (error) {
            console.error('Chat error:', error);
            const errorMessage: Message = {
                role: 'assistant',
                content: "*scratches head* Something went wrong. Could you try again?",
                timestamp: Date.now(),
            };
            setMessages(prev => [...prev, errorMessage]);
        } finally {
            setIsLoading(false);
            setStatusMessage(null);
            inputRef.current?.focus();
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
            <div
                className="w-full max-w-md mx-4 bg-gray-900 rounded-2xl shadow-2xl border border-gray-700 overflow-hidden"
                style={{ maxHeight: '80vh' }}
            >
                {/* Header */}
                <div
                    className="flex items-center gap-3 p-4 border-b border-gray-700"
                    style={{ backgroundColor: agent.colorHex + '20' }}
                >
                    <div
                        className="w-12 h-12 rounded-full flex items-center justify-center text-white font-bold text-lg"
                        style={{ backgroundColor: agent.colorHex }}
                    >
                        {agent.name[0]}
                    </div>
                    <div className="flex-1">
                        <h2 className="text-white font-semibold text-lg">{agent.name}</h2>
                        <p className="text-gray-400 text-sm">{agent.role}</p>
                    </div>
                    <button
                        onClick={onClose}
                        className="text-gray-400 hover:text-white transition-colors p-2"
                        aria-label="Close chat"
                    >
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                {/* Status indicator for consultations */}
                {statusMessage && (
                    <div className="px-4 py-2 bg-gray-800/80 border-b border-gray-700 flex items-center gap-2">
                        <div className="w-3 h-3 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
                        <span className="text-sm text-gray-300">{statusMessage}</span>
                    </div>
                )}

                {/* Messages */}
                <div className="h-80 overflow-y-auto p-4 space-y-4">
                    {messages.map((message, index) => (
                        <div
                            key={index}
                            className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                        >
                            <div
                                className={`max-w-[80%] rounded-2xl px-4 py-2 ${message.role === 'user'
                                    ? 'bg-blue-600 text-white rounded-br-md'
                                    : 'bg-gray-700 text-gray-100 rounded-bl-md'
                                    }`}
                                style={message.role === 'assistant' ? { borderLeft: `3px solid ${agent.colorHex}` } : {}}
                            >
                                <p className="text-sm leading-relaxed whitespace-pre-wrap">{message.content}</p>
                            </div>
                        </div>
                    ))}

                    {/* Streaming text */}
                    {streamingText && (
                        <div className="flex justify-start">
                            <div
                                className="max-w-[80%] rounded-2xl rounded-bl-md px-4 py-2 bg-gray-700 text-gray-100"
                                style={{ borderLeft: `3px solid ${agent.colorHex}` }}
                            >
                                <p className="text-sm leading-relaxed whitespace-pre-wrap">{streamingText}</p>
                            </div>
                        </div>
                    )}

                    {/* Loading indicator */}
                    {isLoading && !streamingText && (
                        <div className="flex justify-start">
                            <div
                                className="bg-gray-700 rounded-2xl rounded-bl-md px-4 py-3"
                                style={{ borderLeft: `3px solid ${agent.colorHex}` }}
                            >
                                <div className="flex gap-1">
                                    <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                                    <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                                    <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                                </div>
                            </div>
                        </div>
                    )}

                    <div ref={messagesEndRef} />
                </div>

                {/* Input */}
                <form onSubmit={handleSubmit} className="p-4 border-t border-gray-700">
                    <div className="flex gap-2">
                        <input
                            ref={inputRef}
                            type="text"
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            placeholder={`Message ${agent.name}...`}
                            className="flex-1 bg-gray-800 text-white rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500 placeholder-gray-500"
                            disabled={isLoading}
                        />
                        <button
                            type="submit"
                            disabled={isLoading || !input.trim()}
                            className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded-xl px-4 py-3 transition-colors"
                        >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                            </svg>
                        </button>
                    </div>
                    <p className="text-gray-500 text-xs mt-2 text-center">Press Escape to close</p>
                </form>
            </div>
        </div>
    );
}
