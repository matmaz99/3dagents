'use client';

import { useState, useRef, useEffect, FormEvent } from 'react';
import { AgentPersonality } from '@/agents/personalities';
import { memoryStore, Message } from '@/agents/memory';

interface ChatOverlayProps {
    agent: AgentPersonality;
    onClose: () => void;
}

export function ChatOverlay({ agent, onClose }: ChatOverlayProps) {
    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [hasGreeted, setHasGreeted] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    // Load conversation history and add greeting
    useEffect(() => {
        const history = memoryStore.getConversationHistory(agent.id);
        setMessages(history);

        // Add greeting if this is the first message
        if (history.length === 0 && !hasGreeted) {
            const greetingMessage: Message = {
                role: 'assistant',
                content: agent.greeting,
                timestamp: Date.now(),
            };
            setMessages([greetingMessage]);
            memoryStore.addMessage(agent.id, greetingMessage);
            setHasGreeted(true);
        }

        // Focus input
        setTimeout(() => inputRef.current?.focus(), 100);
    }, [agent, hasGreeted]);

    // Scroll to bottom when messages change
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

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

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        if (!input.trim() || isLoading) return;

        const userMessage: Message = {
            role: 'user',
            content: input.trim(),
            timestamp: Date.now(),
        };

        setMessages(prev => [...prev, userMessage]);
        memoryStore.addMessage(agent.id, userMessage);
        setInput('');
        setIsLoading(true);

        try {
            const response = await fetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    agentId: agent.id,
                    message: userMessage.content,
                    conversationHistory: messages.slice(-10), // Last 10 messages for context
                }),
            });

            const data = await response.json();

            const assistantMessage: Message = {
                role: 'assistant',
                content: data.response || "I'm not sure what to say...",
                timestamp: Date.now(),
            };

            setMessages(prev => [...prev, assistantMessage]);
            memoryStore.addMessage(agent.id, assistantMessage);
        } catch (error) {
            console.error('Chat error:', error);
            const errorMessage: Message = {
                role: 'assistant',
                content: "*scratches head* Something went wrong with my thoughts. Could you try again?",
                timestamp: Date.now(),
            };
            setMessages(prev => [...prev, errorMessage]);
        } finally {
            setIsLoading(false);
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
                                <p className="text-sm leading-relaxed">{message.content}</p>
                            </div>
                        </div>
                    ))}

                    {isLoading && (
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
