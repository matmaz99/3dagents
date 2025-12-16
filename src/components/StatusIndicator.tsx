'use client';

import { StatusMessage } from '@/types/orchestrator';
import { getAgentById } from '@/agents/personalities';

interface StatusIndicatorProps {
    status: StatusMessage;
}

export function StatusIndicator({ status }: StatusIndicatorProps) {
    const targetAgent = status.targetAgentId ? getAgentById(status.targetAgentId) : null;
    const agent = getAgentById(status.agentId);

    // Indent based on depth (nested consultations)
    const indent = status.depth * 16;

    return (
        <div
            className="flex items-center gap-2 text-sm text-gray-400 py-1"
            style={{ marginLeft: indent }}
        >
            {status.type === 'consulting' && (
                <>
                    <div className="w-3 h-3 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
                    <span>Consulting </span>
                    {targetAgent && (
                        <span
                            className="font-medium"
                            style={{ color: targetAgent.colorHex }}
                        >
                            {targetAgent.name}
                        </span>
                    )}
                    <span>...</span>
                </>
            )}

            {status.type === 'thinking' && (
                <>
                    <div className="flex gap-0.5">
                        <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-pulse" />
                        <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-pulse" style={{ animationDelay: '150ms' }} />
                        <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-pulse" style={{ animationDelay: '300ms' }} />
                    </div>
                    {agent && (
                        <span style={{ color: agent.colorHex }}>{agent.name}</span>
                    )}
                    <span> is thinking...</span>
                </>
            )}

            {status.type === 'returning' && (
                <>
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                    </svg>
                    {agent && (
                        <span style={{ color: agent.colorHex }}>{agent.name}</span>
                    )}
                    <span> returning...</span>
                </>
            )}

            {status.type === 'summary' && (
                <span className="text-gray-300 italic">
                    {status.message}
                </span>
            )}
        </div>
    );
}

// Container for multiple status indicators
interface StatusContainerProps {
    statuses: StatusMessage[];
}

export function StatusContainer({ statuses }: StatusContainerProps) {
    // Only show active statuses (not summary)
    const activeStatuses = statuses.filter(s => s.type !== 'summary');

    if (activeStatuses.length === 0) return null;

    return (
        <div className="py-2 px-4 bg-gray-800/50 rounded-lg border border-gray-700/50">
            {activeStatuses.map((status, i) => (
                <StatusIndicator key={`${status.agentId}-${status.timestamp}-${i}`} status={status} />
            ))}
        </div>
    );
}
