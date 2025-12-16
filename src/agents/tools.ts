// Tool helper definitions for agent collaboration
// Note: Actual tool definitions are created inline in the chat API route

import { getAgentById, getConsultableAgents } from './personalities';

// Get valid target agent IDs for a given agent
export function getValidTargetIds(callerAgentId: string): string[] {
  const agent = getAgentById(callerAgentId);
  if (!agent) return [];
  return agent.canConsult;
}

// Get a description of consultable agents for a given agent
export function getConsultableAgentsDescription(callerAgentId: string): string {
  const consultableAgents = getConsultableAgents(callerAgentId);

  if (consultableAgents.length === 0) {
    return '';
  }

  return consultableAgents
    .map(a => `- ${a.id} (${a.name}): ${a.role}`)
    .join('\n');
}

// Helper to get a human-readable description of a tool call
export function describeToolCall(toolName: string, args: Record<string, unknown>): string {
  if (toolName === 'consultAgent') {
    const targetId = args.targetAgentId as string;
    const targetAgent = getAgentById(targetId);
    if (targetAgent) {
      return `Consulting ${targetAgent.name} (${targetAgent.role})`;
    }
    return `Consulting ${targetId}`;
  }
  return `Using ${toolName}`;
}
