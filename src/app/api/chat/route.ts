import { NextRequest } from 'next/server';
import { streamText, generateText, stepCountIs } from 'ai';
import { gateway } from '@ai-sdk/gateway';
import { z } from 'zod';
import { getAgentById, getConsultableAgents } from '@/agents/personalities';
import {
    githubToolSchema,
    clickupToolSchema,
    browserToolSchema,
    executeGitHubTool,
    executeClickUpTool,
    executeBrowserTool,
    GITHUB_TOOL_DESCRIPTION,
    CLICKUP_TOOL_DESCRIPTION,
    BROWSER_TOOL_DESCRIPTION,
} from '@/agents/externalTools';
import { Project } from '@/types/project';

interface ChatRequest {
    agentId: string;
    message: string;
    conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }>;
    projectId?: string;
    project?: Project; // Project config passed from client
}

// Maximum recursion depth for tool calls
const MAX_CALL_DEPTH = 5;

// Mock responses for when no API key is configured
function generateMockResponse(agentId: string, userMessage: string): string {
    const agent = getAgentById(agentId);
    if (!agent) {
        return "I'm not sure who I am right now...";
    }

    const userLower = userMessage.toLowerCase();

    switch (agent.id) {
        case 'product-owner':
            if (userLower.includes('hello') || userLower.includes('hi')) {
                return "Hey! I'm Alex, the Product Owner. I manage the backlog, break down features into stories, and keep sprints on track. What do you need scoped or prioritized?";
            }
            return "Let me think about how we can break this down into actionable stories. I might consult with Sam on technical feasibility.";

        case 'qa-engineer':
            if (userLower.includes('hello') || userLower.includes('hi')) {
                return "Hi! I'm Jordan, the QA Engineer. I track bugs, validate acceptance criteria, and make sure we ship quality code. What do you need tested?";
            }
            return "That's something I'll need to verify. Let me check the acceptance criteria and any related bug reports.";

        case 'tech-lead':
            if (userLower.includes('hello') || userLower.includes('hi')) {
                return "Hey! Sam here, the Tech Lead. I handle architecture, code reviews, and technical decisions. What implementation challenge are we tackling?";
            }
            return "Interesting technical challenge. Let me check the codebase and think through the implementation approach.";

        case 'release-manager':
            if (userLower.includes('hello') || userLower.includes('hi')) {
                return "Hello! I'm Morgan, the Release Manager. I handle deployments, release notes, and making sure everything gets to production smoothly. What release info do you need?";
            }
            return "Let me check the deployment status and recent commits to give you an update.";

        default:
            return "Hmm, let me think about that...";
    }
}

// Tool call event types
interface ToolCallEvent {
    type: 'tool_call_start' | 'tool_call_end';
    callerAgentId: string;
    targetAgentId: string;
    query?: string;
    response?: string;
    depth: number;
}

// Execute consultation with another agent (nested call)
async function executeConsultation(
    targetAgentId: string,
    query: string,
    context: string | undefined,
    callChain: string[],
    depth: number,
    onToolCall?: (event: ToolCallEvent) => void
): Promise<{ agentName: string; response: string }> {
    // Safety checks
    if (depth >= MAX_CALL_DEPTH) {
        return {
            agentName: targetAgentId,
            response: 'Maximum consultation depth reached. Cannot consult further.',
        };
    }

    if (callChain.includes(targetAgentId)) {
        return {
            agentName: targetAgentId,
            response: 'This agent is already in the consultation chain. Cannot create circular consultation.',
        };
    }

    const targetAgent = getAgentById(targetAgentId);
    if (!targetAgent) {
        return {
            agentName: targetAgentId,
            response: `Agent ${targetAgentId} not found.`,
        };
    }

    // Get available agents for this target (excluding those in chain)
    const newChain = [...callChain, targetAgentId];
    const availableAgents = getConsultableAgents(targetAgentId).filter(
        a => !newChain.includes(a.id)
    );

    const nestedPrompt = context
        ? `A colleague needs your help.\n\nContext: ${context}\n\nQuestion: ${query}`
        : `A colleague needs your help.\n\nQuestion: ${query}`;

    try {
        // Build tools for nested call if there are available agents
        const nestedAvailableIds = availableAgents.map(a => a.id);
        const nestedTools = availableAgents.length > 0 ? {
            consultAgent: {
                description: `Consult another team member. Available: ${availableAgents.map(a => `${a.id} (${a.name})`).join(', ')}`,
                inputSchema: z.object({
                    targetAgentId: z.string().describe(`The ID of the agent to consult. Must be one of: ${nestedAvailableIds.join(', ')}`),
                    query: z.string().describe('Your specific question'),
                    context: z.string().optional().describe('Relevant context'),
                }),
                execute: async (args: { targetAgentId: string; query: string; context?: string }) => {
                    if (!nestedAvailableIds.includes(args.targetAgentId)) {
                        return {
                            agentName: args.targetAgentId,
                            response: `Invalid agent ID. Available agents: ${nestedAvailableIds.join(', ')}`,
                        };
                    }
                    // Emit tool call event for nested consultation
                    onToolCall?.({
                        type: 'tool_call_start',
                        callerAgentId: targetAgentId,
                        targetAgentId: args.targetAgentId,
                        query: args.query,
                        depth: depth + 1,
                    });

                    const result = await executeConsultation(
                        args.targetAgentId,
                        args.query,
                        args.context,
                        newChain,
                        depth + 1,
                        onToolCall
                    );

                    onToolCall?.({
                        type: 'tool_call_end',
                        callerAgentId: targetAgentId,
                        targetAgentId: args.targetAgentId,
                        response: result.response,
                        depth: depth + 1,
                    });

                    return result;
                },
            },
        } : undefined;

        const result = await generateText({
            model: gateway('anthropic/claude-3-5-sonnet-20241022'),
            system: `${targetAgent.systemPrompt}\n\nYou are being consulted by a colleague. Provide a helpful, focused response. Be concise.`,
            messages: [{ role: 'user', content: nestedPrompt }],
            tools: nestedTools,
            stopWhen: stepCountIs(MAX_CALL_DEPTH - depth),
        });

        return {
            agentName: targetAgent.name,
            response: result.text || 'No response generated.',
        };
    } catch (error) {
        console.error(`Error consulting ${targetAgentId}:`, error);
        return {
            agentName: targetAgent.name,
            response: `Sorry, I couldn't reach ${targetAgent.name} right now.`,
        };
    }
}

export async function POST(request: NextRequest) {
    try {
        const body: ChatRequest = await request.json();
        const { agentId, message, conversationHistory, project } = body;

        const agent = getAgentById(agentId);
        if (!agent) {
            return new Response(
                JSON.stringify({ error: 'Agent not found' }),
                { status: 404, headers: { 'Content-Type': 'application/json' } }
            );
        }

        // Build tool descriptions for system prompt
        const toolDescriptions: string[] = [];
        if (project?.github) {
            toolDescriptions.push(GITHUB_TOOL_DESCRIPTION);
        }
        if (project?.clickup) {
            toolDescriptions.push(CLICKUP_TOOL_DESCRIPTION);
        }
        // Browser tool is always available
        toolDescriptions.push(BROWSER_TOOL_DESCRIPTION);

        // Enhance system prompt with project context and tool descriptions
        let systemPrompt = agent.systemPrompt;
        if (project) {
            systemPrompt += `\n\nYou are working on the project "${project.name}".`;
            if (project.description) {
                systemPrompt += ` Project description: ${project.description}`;
            }
            if (toolDescriptions.length > 0) {
                systemPrompt += '\n\n' + toolDescriptions.join('\n');
            }
        }

        // Check for API key (Vercel AI Gateway)
        const apiKey = process.env.AI_GATEWAY_API_KEY;

        if (!apiKey) {
            // Use mock responses
            await new Promise(resolve => setTimeout(resolve, 500 + Math.random() * 500));
            const response = generateMockResponse(agentId, message);
            return new Response(
                JSON.stringify({ response }),
                { headers: { 'Content-Type': 'application/json' } }
            );
        }

        // Get consultable agents for this agent
        const consultableAgents = getConsultableAgents(agentId);

        // Create encoder for streaming
        const encoder = new TextEncoder();

        // Create a readable stream that we control
        const stream = new ReadableStream({
            async start(controller) {
                // Helper to send a tool event
                const sendToolEvent = (event: ToolCallEvent) => {
                    const data = JSON.stringify({ toolEvent: event });
                    controller.enqueue(encoder.encode(`\n__TOOL_EVENT__${data}__END_TOOL_EVENT__\n`));
                };

                // Build tools - combine consultation with external tools
                const availableIds = consultableAgents.map(a => a.id);

                // Start with an empty tools object
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const tools: Record<string, any> = {};

                // Add consultation tool if there are consultable agents
                if (consultableAgents.length > 0) {
                    tools.consultAgent = {
                        description: `Consult a team member for their expertise. Available colleagues: ${consultableAgents.map(a => `${a.id} (${a.name} - ${a.role})`).join(', ')}. Use this when you need specialized input.`,
                        inputSchema: z.object({
                            targetAgentId: z.string().describe(`The ID of the agent to consult. Must be one of: ${availableIds.join(', ')}`),
                            query: z.string().describe('Your specific question for them'),
                            context: z.string().optional().describe('Relevant context from the conversation'),
                        }),
                        execute: async (args: { targetAgentId: string; query: string; context?: string }) => {
                            // Validate the agent ID
                            if (!availableIds.includes(args.targetAgentId)) {
                                return {
                                    agentName: args.targetAgentId,
                                    response: `Invalid agent ID. Available agents: ${availableIds.join(', ')}`,
                                };
                            }

                            // Send tool call start event
                            sendToolEvent({
                                type: 'tool_call_start',
                                callerAgentId: agentId,
                                targetAgentId: args.targetAgentId,
                                query: args.query,
                                depth: 1,
                            });

                            const result = await executeConsultation(
                                args.targetAgentId,
                                args.query,
                                args.context,
                                [agentId],
                                1,
                                sendToolEvent
                            );

                            // Send tool call end event
                            sendToolEvent({
                                type: 'tool_call_end',
                                callerAgentId: agentId,
                                targetAgentId: args.targetAgentId,
                                response: result.response,
                                depth: 1,
                            });

                            return result;
                        },
                    };
                }

                // Add GitHub tool if project has GitHub configured
                if (project?.github) {
                    tools.github = {
                        description: `Interact with the project's GitHub repository (${project.github.owner}/${project.github.repo}). Use to get issues, PRs, commits, read files, or create new issues.`,
                        inputSchema: githubToolSchema,
                        execute: async (args: {
                            action: 'issues' | 'prs' | 'commits' | 'file' | 'create_issue';
                            query?: string;
                            state?: 'open' | 'closed' | 'all';
                            limit?: number;
                            title?: string;
                            body?: string;
                            labels?: string[];
                        }) => {
                            return executeGitHubTool(args, project);
                        },
                    };
                }

                // Add ClickUp tool if project has ClickUp configured
                if (project?.clickup) {
                    tools.clickup = {
                        description: `Manage tasks in the project's ClickUp list. Use to see tasks, get details, create new tasks, or update existing ones.`,
                        inputSchema: clickupToolSchema,
                        execute: async (args: {
                            action: 'tasks' | 'task_details' | 'create_task' | 'update_task';
                            taskId?: string;
                            status?: string;
                            limit?: number;
                            name?: string;
                            description?: string;
                            priority?: number;
                            dueDate?: string;
                        }) => {
                            return executeClickUpTool(args, project);
                        },
                    };
                }

                // Add browser tool (always available for web research)
                tools.browser = {
                    description: `Browse the web to research documentation, search for solutions, or extract information from websites. Use when you need to look up technical info, find solutions, or gather data from the web.`,
                    inputSchema: browserToolSchema,
                    execute: async (args: {
                        action: 'browse' | 'extract' | 'search';
                        url?: string;
                        query?: string;
                        instruction?: string;
                    }) => {
                        // Get the base URL from the request
                        const baseUrl = request.headers.get('origin') || 'http://localhost:3000';
                        return executeBrowserTool(args, baseUrl);
                    },
                };

                // Only pass tools if we have any
                const toolsToUse = Object.keys(tools).length > 0 ? tools : undefined;

                // Filter out any messages with empty content
                const filteredHistory = conversationHistory.filter(
                    msg => msg.content && msg.content.trim() !== ''
                );

                try {
                    // Use streaming for the main conversation
                    const result = streamText({
                        model: gateway('anthropic/claude-3-5-sonnet-20241022'),
                        system: systemPrompt,
                        messages: [
                            ...filteredHistory.map(msg => ({
                                role: msg.role as 'user' | 'assistant',
                                content: msg.content,
                            })),
                            { role: 'user' as const, content: message },
                        ],
                        tools: toolsToUse,
                        stopWhen: stepCountIs(MAX_CALL_DEPTH),
                    });

                    // Stream the text response
                    for await (const textPart of result.textStream) {
                        controller.enqueue(encoder.encode(textPart));
                    }

                    controller.close();
                } catch (error) {
                    console.error('Stream error:', error);
                    controller.error(error);
                }
            },
        });

        return new Response(stream, {
            headers: {
                'Content-Type': 'text/plain; charset=utf-8',
                'Transfer-Encoding': 'chunked',
            },
        });
    } catch (error) {
        console.error('Chat API error:', error);
        return new Response(
            JSON.stringify({ error: 'Internal server error' }),
            { status: 500, headers: { 'Content-Type': 'application/json' } }
        );
    }
}
