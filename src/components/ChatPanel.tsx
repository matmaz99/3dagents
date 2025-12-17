'use client';

import { useState, useRef, useEffect, FormEvent } from 'react';
import { AgentPersonality, getAgentById, AGENT_PERSONALITIES } from '@/agents/personalities';
import { memoryStore, Message } from '@/agents/memory';
import type { GameCanvasHandle } from './GameCanvas';
import { Project } from '@/types/project';

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

interface ChatPanelProps {
    gameRef?: React.RefObject<GameCanvasHandle | null>;
    project?: Project;
}

// Quick action button component
interface QuickActionButtonProps {
    label: string;
    agentId: string;
    message: string;
    selectedAgent: AgentPersonality | null;
    isLoading: boolean;
    onAction: (agentId: string, message: string) => void;
}

function QuickActionButton({ label, agentId, message, selectedAgent, isLoading, onAction }: QuickActionButtonProps) {
    const targetAgent = AGENT_PERSONALITIES.find(a => a.id === agentId);
    const isActive = selectedAgent?.id === agentId;

    return (
        <button
            onClick={() => onAction(agentId, message)}
            disabled={isLoading}
            className={`text-xs px-2 py-1 rounded-md transition-all disabled:opacity-50 disabled:cursor-not-allowed ${
                isActive
                    ? 'bg-gray-700 text-white'
                    : 'bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-gray-200'
            }`}
            style={isActive && targetAgent ? { borderLeft: `2px solid ${targetAgent.colorHex}` } : {}}
            title={`Ask ${targetAgent?.name || 'agent'}: ${message}`}
        >
            {label}
        </button>
    );
}

export function ChatPanel({ gameRef, project }: ChatPanelProps) {
    const [selectedAgent, setSelectedAgent] = useState<AgentPersonality | null>(null);
    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [streamingText, setStreamingText] = useState('');
    const [statusMessage, setStatusMessage] = useState<string | null>(null);
    const [activeConsultations, setActiveConsultations] = useState<ActiveConsultation[]>([]);
    const activeConsultationsRef = useRef<ActiveConsultation[]>([]);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    // Get project ID for memory scoping (fallback to 'default' for backward compatibility)
    const projectId = project?.id || 'default';

    // Reset selected agent when project changes
    const prevProjectIdRef = useRef(projectId);
    useEffect(() => {
        if (prevProjectIdRef.current !== projectId) {
            // Project changed - reset agent selection and reload
            setSelectedAgent(null);
            setMessages([]);
            setStreamingText('');
            setStatusMessage(null);
            prevProjectIdRef.current = projectId;
        }
    }, [projectId]);

    // Load conversation history when agent or project changes
    useEffect(() => {
        if (selectedAgent) {
            const history = memoryStore.getConversationHistory(projectId, selectedAgent.id);

            if (history.length === 0) {
                // Add greeting (customize with project name if available)
                const greeting = project
                    ? selectedAgent.greeting.replace(
                          /\?$/,
                          ` on ${project.name}?`
                      )
                    : selectedAgent.greeting;
                const greetingMessage: Message = {
                    role: 'assistant',
                    content: greeting,
                    timestamp: Date.now(),
                };
                setMessages([greetingMessage]);
                memoryStore.addMessage(projectId, selectedAgent.id, greetingMessage);
            } else {
                setMessages(history);
            }
            setTimeout(() => inputRef.current?.focus(), 100);
        } else {
            setMessages([]);
        }
    }, [selectedAgent, projectId, project]);

    // Scroll to bottom when messages change
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages, streamingText]);

    // Cleanup on agent change - return all agents to desks
    useEffect(() => {
        return () => {
            if (gameRef?.current) {
                gameRef.current.returnAllAgentsToDesks();
            }
        };
    }, [gameRef, selectedAgent]);

    // Handle tool call events from the API stream
    const handleToolCallEvent = async (event: ToolCallEvent) => {
        const targetAgent = getAgentById(event.targetAgentId);
        const callerAgent = getAgentById(event.callerAgentId);

        if (event.type === 'tool_call_start') {
            const consultationId = `${event.callerAgentId}-${event.targetAgentId}-${Date.now()}`;
            const bubbleId = `bubble-${consultationId}`;

            // Update status message
            setStatusMessage(`${callerAgent?.name || event.callerAgentId} is consulting ${targetAgent?.name || event.targetAgentId}...`);

            // Add to active consultations (both state and ref for sync access)
            const newConsultation: ActiveConsultation = {
                id: consultationId,
                callerAgentId: event.callerAgentId,
                targetAgentId: event.targetAgentId,
                bubbleId,
                depth: event.depth,
            };
            activeConsultationsRef.current = [...activeConsultationsRef.current, newConsultation];
            setActiveConsultations(activeConsultationsRef.current);

            // Teleport caller to target and show thought bubble
            if (gameRef?.current) {
                // Teleport caller next to target instantly
                gameRef.current.teleportAgentToAgent(event.callerAgentId, event.targetAgentId);
                gameRef.current.setAgentState(event.callerAgentId, 'consulting');
                gameRef.current.showThoughtBubble(bubbleId, event.callerAgentId, 'Thinking...', event.depth);
            }
        } else if (event.type === 'tool_call_end') {
            // Find the active consultation using ref for sync access
            const consultation = activeConsultationsRef.current.find(
                c => c.callerAgentId === event.callerAgentId && c.targetAgentId === event.targetAgentId
            );

            // Add consultation summary to messages
            if (targetAgent && event.response) {
                const summaryLength = 150;
                const summary = event.response.length > summaryLength
                    ? event.response.substring(0, summaryLength) + '...'
                    : event.response;

                // Add as a special consultation message
                setMessages(prev => [...prev, {
                    role: 'assistant' as const,
                    content: `💬 **${targetAgent.name}** (consulted): "${summary}"`,
                    timestamp: Date.now(),
                    isConsultation: true,
                } as Message & { isConsultation?: boolean }]);
            }

            if (gameRef?.current) {
                if (consultation) {
                    // Hide thought bubble
                    gameRef.current.hideThoughtBubble(consultation.bubbleId);
                }

                // Return the caller agent to their desk
                gameRef.current.returnAgentToDesk(event.callerAgentId);
            }

            // Remove from active consultations (both ref and state)
            activeConsultationsRef.current = activeConsultationsRef.current.filter(
                c => !(c.callerAgentId === event.callerAgentId && c.targetAgentId === event.targetAgentId)
            );
            setActiveConsultations(activeConsultationsRef.current);

            // Clear status if no more consultations
            if (activeConsultationsRef.current.length === 0) {
                setStatusMessage(null);
            }
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
        if (!input.trim() || isLoading || !selectedAgent) return;

        const userMessage: Message = {
            role: 'user',
            content: input.trim(),
            timestamp: Date.now(),
        };

        setMessages(prev => [...prev, userMessage]);
        memoryStore.addMessage(projectId, selectedAgent.id, userMessage);
        setInput('');
        setIsLoading(true);
        setStreamingText('');
        setStatusMessage(null);

        try {
            const response = await fetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    agentId: selectedAgent.id,
                    message: userMessage.content,
                    conversationHistory: messages.slice(-10),
                    projectId: projectId,
                    project: project, // Pass full project config for tools
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
                        memoryStore.addMessage(projectId, selectedAgent.id, assistantMessage);
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
                memoryStore.addMessage(projectId, selectedAgent.id, assistantMessage);
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
        <div className="w-96 h-full bg-gray-900 border-l border-gray-700 flex flex-col">
            {/* Agent selector */}
            <div className="p-3 border-b border-gray-700">
                <div className="text-gray-400 text-xs mb-2 uppercase tracking-wide">Talk to</div>
                <div className="flex gap-2">
                    {AGENT_PERSONALITIES.map(agent => (
                        <button
                            key={agent.id}
                            onClick={() => setSelectedAgent(agent)}
                            className={`flex-1 p-2 rounded-lg transition-all ${
                                selectedAgent?.id === agent.id
                                    ? 'ring-2 ring-white/50'
                                    : 'hover:bg-gray-800'
                            }`}
                            style={{
                                backgroundColor: selectedAgent?.id === agent.id
                                    ? agent.colorHex + '30'
                                    : 'transparent',
                            }}
                            title={`${agent.name} - ${agent.role}`}
                        >
                            <div
                                className="w-8 h-8 mx-auto rounded-full flex items-center justify-center text-white font-bold text-sm"
                                style={{ backgroundColor: agent.colorHex }}
                            >
                                {agent.name[0]}
                            </div>
                            <div className="text-xs text-gray-300 mt-1 truncate">{agent.name}</div>
                        </button>
                    ))}
                </div>
            </div>

            {selectedAgent ? (
                <>
                    {/* Chat header */}
                    <div
                        className="flex items-center gap-3 p-3 border-b border-gray-700"
                        style={{ backgroundColor: selectedAgent.colorHex + '15' }}
                    >
                        <div
                            className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold"
                            style={{ backgroundColor: selectedAgent.colorHex }}
                        >
                            {selectedAgent.name[0]}
                        </div>
                        <div className="flex-1 min-w-0">
                            <h2 className="text-white font-semibold">{selectedAgent.name}</h2>
                            <p className="text-gray-400 text-xs truncate">{selectedAgent.role}</p>
                            {project && (
                                <div className="flex items-center gap-2 mt-1">
                                    <span className="text-xs text-gray-500">
                                        {project.name}
                                    </span>
                                    {project.github && (
                                        <span className="text-xs px-1.5 py-0.5 bg-gray-800 rounded text-gray-400" title={`${project.github.owner}/${project.github.repo}`}>
                                            GH
                                        </span>
                                    )}
                                    {project.clickup && (
                                        <span className="text-xs px-1.5 py-0.5 bg-gray-800 rounded text-gray-400" title="ClickUp connected">
                                            CU
                                        </span>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Status indicator for consultations */}
                    {statusMessage && (
                        <div className="px-3 py-2 bg-gray-800/80 border-b border-gray-700 flex items-center gap-2">
                            <div className="w-3 h-3 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
                            <span className="text-sm text-gray-300">{statusMessage}</span>
                        </div>
                    )}

                    {/* Messages */}
                    <div className="flex-1 overflow-y-auto p-3 space-y-3">
                        {messages.map((message, index) => {
                            const isConsultation = (message as Message & { isConsultation?: boolean }).isConsultation;

                            if (isConsultation) {
                                // Consultation message - styled as a quote/note
                                return (
                                    <div key={index} className="flex justify-start">
                                        <div className="max-w-[90%] rounded-lg px-3 py-2 bg-gray-800/50 border border-gray-600 text-gray-300 text-xs italic">
                                            {message.content}
                                        </div>
                                    </div>
                                );
                            }

                            return (
                                <div
                                    key={index}
                                    className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                                >
                                    <div
                                        className={`max-w-[85%] rounded-2xl px-3 py-2 ${message.role === 'user'
                                            ? 'bg-blue-600 text-white rounded-br-sm'
                                            : 'bg-gray-700 text-gray-100 rounded-bl-sm'
                                            }`}
                                        style={message.role === 'assistant' ? { borderLeft: `2px solid ${selectedAgent.colorHex}` } : {}}
                                    >
                                        <p className="text-sm leading-relaxed whitespace-pre-wrap">{message.content}</p>
                                    </div>
                                </div>
                            );
                        })}

                        {/* Streaming text */}
                        {streamingText && (
                            <div className="flex justify-start">
                                <div
                                    className="max-w-[85%] rounded-2xl rounded-bl-sm px-3 py-2 bg-gray-700 text-gray-100"
                                    style={{ borderLeft: `2px solid ${selectedAgent.colorHex}` }}
                                >
                                    <p className="text-sm leading-relaxed whitespace-pre-wrap">{streamingText}</p>
                                </div>
                            </div>
                        )}

                        {/* Loading indicator */}
                        {isLoading && !streamingText && (
                            <div className="flex justify-start">
                                <div
                                    className="bg-gray-700 rounded-2xl rounded-bl-sm px-3 py-2"
                                    style={{ borderLeft: `2px solid ${selectedAgent.colorHex}` }}
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

                    {/* Quick Actions */}
                    <div className="px-3 py-2 border-t border-gray-700/50">
                        <div className="flex gap-1.5 flex-wrap">
                            <QuickActionButton
                                label="Sprint Status"
                                agentId="product-owner"
                                message="What's the current sprint status? Give me an overview of tasks, progress, and any blockers."
                                selectedAgent={selectedAgent}
                                isLoading={isLoading}
                                onAction={(agentId, message) => {
                                    const agent = AGENT_PERSONALITIES.find(a => a.id === agentId);
                                    if (agent) {
                                        setSelectedAgent(agent);
                                        setTimeout(() => {
                                            setInput(message);
                                            inputRef.current?.focus();
                                        }, 100);
                                    }
                                }}
                            />
                            <QuickActionButton
                                label="Open Bugs"
                                agentId="qa-engineer"
                                message="What bugs are currently open? List them by severity and status."
                                selectedAgent={selectedAgent}
                                isLoading={isLoading}
                                onAction={(agentId, message) => {
                                    const agent = AGENT_PERSONALITIES.find(a => a.id === agentId);
                                    if (agent) {
                                        setSelectedAgent(agent);
                                        setTimeout(() => {
                                            setInput(message);
                                            inputRef.current?.focus();
                                        }, 100);
                                    }
                                }}
                            />
                            <QuickActionButton
                                label="Recent Activity"
                                agentId="tech-lead"
                                message="What's the recent development activity? Show me the latest commits and PRs."
                                selectedAgent={selectedAgent}
                                isLoading={isLoading}
                                onAction={(agentId, message) => {
                                    const agent = AGENT_PERSONALITIES.find(a => a.id === agentId);
                                    if (agent) {
                                        setSelectedAgent(agent);
                                        setTimeout(() => {
                                            setInput(message);
                                            inputRef.current?.focus();
                                        }, 100);
                                    }
                                }}
                            />
                            <QuickActionButton
                                label="Release Status"
                                agentId="release-manager"
                                message="What's the release status? Are we ready to deploy? Any pending items?"
                                selectedAgent={selectedAgent}
                                isLoading={isLoading}
                                onAction={(agentId, message) => {
                                    const agent = AGENT_PERSONALITIES.find(a => a.id === agentId);
                                    if (agent) {
                                        setSelectedAgent(agent);
                                        setTimeout(() => {
                                            setInput(message);
                                            inputRef.current?.focus();
                                        }, 100);
                                    }
                                }}
                            />
                        </div>
                    </div>

                    {/* Input */}
                    <form onSubmit={handleSubmit} className="p-3 border-t border-gray-700">
                        <div className="flex gap-2">
                            <input
                                ref={inputRef}
                                type="text"
                                value={input}
                                onChange={(e) => setInput(e.target.value)}
                                placeholder={`Message ${selectedAgent.name}...`}
                                className="flex-1 bg-gray-800 text-white rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500 placeholder-gray-500"
                                disabled={isLoading}
                            />
                            <button
                                type="submit"
                                disabled={isLoading || !input.trim()}
                                className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded-xl px-3 py-2 transition-colors"
                            >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                                </svg>
                            </button>
                        </div>
                    </form>
                </>
            ) : (
                <div className="flex-1 flex items-center justify-center text-gray-500 text-sm p-4 text-center">
                    Select a team member above to start chatting
                </div>
            )}
        </div>
    );
}
