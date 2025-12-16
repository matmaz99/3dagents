'use client';

import { AgentPersonality, AGENT_PERSONALITIES } from '@/agents/personalities';

interface CallPanelProps {
    onCallAgent: (agent: AgentPersonality) => void;
    onClose: () => void;
}

export function CallPanel({ onCallAgent, onClose }: CallPanelProps) {
    return (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-40">
            <div className="bg-gray-900/95 backdrop-blur-sm rounded-2xl border border-gray-700 shadow-2xl p-4 min-w-[300px]">
                {/* Header */}
                <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                        <span className="text-lg">📞</span>
                        <h3 className="text-white font-semibold">Call a Coworker</h3>
                    </div>
                    <button
                        onClick={onClose}
                        className="text-gray-400 hover:text-white transition-colors p-1"
                        aria-label="Close"
                    >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                {/* Agent list */}
                <div className="space-y-2">
                    {AGENT_PERSONALITIES.map((agent) => (
                        <button
                            key={agent.id}
                            onClick={() => onCallAgent(agent)}
                            className="w-full flex items-center gap-3 p-3 rounded-xl bg-gray-800 hover:bg-gray-700 transition-colors group"
                        >
                            <div
                                className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold"
                                style={{ backgroundColor: agent.colorHex }}
                            >
                                {agent.name[0]}
                            </div>
                            <div className="flex-1 text-left">
                                <div className="text-white font-medium">{agent.name}</div>
                                <div className="text-gray-400 text-sm">{agent.role}</div>
                            </div>
                            <div className="text-gray-500 group-hover:text-white transition-colors">
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                                </svg>
                            </div>
                        </button>
                    ))}
                </div>

                <p className="text-gray-500 text-xs text-center mt-3">
                    Click to summon a coworker to your location
                </p>
            </div>
        </div>
    );
}
