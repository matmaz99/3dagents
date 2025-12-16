'use client';

import { AgentPersonality } from '@/agents/personalities';

interface AgentIndicatorProps {
    agent: AgentPersonality;
    distance: number;
}

export function AgentIndicator({ agent, distance }: AgentIndicatorProps) {
    // Calculate opacity based on distance (closer = more visible)
    const opacity = Math.max(0.5, 1 - (distance / 60) * 0.5);

    return (
        <div
            className="fixed bottom-24 left-1/2 -translate-x-1/2 z-40 transition-all duration-200"
            style={{ opacity }}
        >
            <div
                className="bg-gray-900/90 backdrop-blur-sm rounded-2xl px-6 py-4 border shadow-xl"
                style={{ borderColor: agent.colorHex }}
            >
                <div className="flex items-center gap-4">
                    {/* Agent avatar */}
                    <div
                        className="w-12 h-12 rounded-full flex items-center justify-center text-white font-bold text-lg shadow-lg"
                        style={{ backgroundColor: agent.colorHex }}
                    >
                        {agent.name[0]}
                    </div>

                    {/* Agent info */}
                    <div className="flex flex-col">
                        <span className="text-white font-semibold text-lg">{agent.name}</span>
                        <span className="text-gray-400 text-sm">{agent.role}</span>
                    </div>

                    {/* Interact prompt */}
                    <div className="ml-4 flex items-center gap-2">
                        <kbd className="bg-gray-700 text-white px-3 py-1 rounded-lg font-mono text-sm border border-gray-600">
                            E
                        </kbd>
                        <span className="text-gray-300 text-sm">to talk</span>
                    </div>
                </div>

                {/* Topic hints */}
                <div className="mt-3 flex flex-wrap gap-2">
                    {agent.topics.slice(0, 3).map((topic, index) => (
                        <span
                            key={index}
                            className="text-xs px-2 py-1 rounded-full bg-gray-700/50 text-gray-300"
                        >
                            #{topic}
                        </span>
                    ))}
                </div>
            </div>
        </div>
    );
}
