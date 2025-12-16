// External tools for GitHub and ClickUp integration
import { z } from 'zod';
import { Project } from '@/types/project';

// GitHub Tool Types
export interface GitHubIssue {
    number: number;
    title: string;
    state: string;
    body: string | null;
    created_at: string;
    user: { login: string } | null;
    labels: Array<{ name: string }>;
}

export interface GitHubPR {
    number: number;
    title: string;
    state: string;
    body: string | null;
    created_at: string;
    user: { login: string } | null;
    head: { ref: string };
    base: { ref: string };
}

export interface GitHubCommit {
    sha: string;
    commit: {
        message: string;
        author: { name: string; date: string } | null;
    };
}

// ClickUp Tool Types
export interface ClickUpTask {
    id: string;
    name: string;
    status: { status: string };
    description: string;
    date_created: string;
    assignees: Array<{ username: string }>;
    priority: { priority: string } | null;
}

// GitHub API helpers
async function fetchGitHub(
    endpoint: string,
    token?: string
): Promise<Response> {
    const headers: HeadersInit = {
        'Accept': 'application/vnd.github.v3+json',
    };
    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }

    return fetch(`https://api.github.com${endpoint}`, { headers });
}

// ClickUp API helpers
async function fetchClickUp(
    endpoint: string,
    token: string
): Promise<Response> {
    return fetch(`https://api.clickup.com/api/v2${endpoint}`, {
        headers: {
            'Authorization': token,
            'Content-Type': 'application/json',
        },
    });
}

// GitHub Tool Schema
export const githubToolSchema = z.object({
    action: z.enum(['issues', 'prs', 'commits', 'file']).describe(
        'What to fetch: issues, prs (pull requests), commits, or a specific file'
    ),
    query: z.string().optional().describe(
        'Optional search query or file path (for file action)'
    ),
    state: z.enum(['open', 'closed', 'all']).optional().describe(
        'Filter by state (for issues/prs). Default: open'
    ),
    limit: z.number().optional().describe(
        'Max number of results to return. Default: 10'
    ),
});

export type GitHubToolArgs = z.infer<typeof githubToolSchema>;

// GitHub Tool Execute
export async function executeGitHubTool(
    args: GitHubToolArgs,
    project: Project
): Promise<{ success: boolean; data?: unknown; error?: string; summary: string }> {
    if (!project.github) {
        return {
            success: false,
            error: 'No GitHub repository configured for this project',
            summary: 'GitHub not configured',
        };
    }

    const { owner, repo } = project.github;
    const token = process.env.GITHUB_TOKEN;
    const limit = args.limit || 10;
    const state = args.state || 'open';

    try {
        switch (args.action) {
            case 'issues': {
                const response = await fetchGitHub(
                    `/repos/${owner}/${repo}/issues?state=${state}&per_page=${limit}`,
                    token
                );
                if (!response.ok) {
                    throw new Error(`GitHub API error: ${response.status}`);
                }
                const issues: GitHubIssue[] = await response.json();
                const filtered = issues.filter(i => !('pull_request' in i)); // Exclude PRs

                return {
                    success: true,
                    data: filtered.map(i => ({
                        number: i.number,
                        title: i.title,
                        state: i.state,
                        labels: i.labels.map(l => l.name),
                        author: i.user?.login,
                    })),
                    summary: `Found ${filtered.length} ${state} issues in ${owner}/${repo}`,
                };
            }

            case 'prs': {
                const response = await fetchGitHub(
                    `/repos/${owner}/${repo}/pulls?state=${state}&per_page=${limit}`,
                    token
                );
                if (!response.ok) {
                    throw new Error(`GitHub API error: ${response.status}`);
                }
                const prs: GitHubPR[] = await response.json();

                return {
                    success: true,
                    data: prs.map(pr => ({
                        number: pr.number,
                        title: pr.title,
                        state: pr.state,
                        author: pr.user?.login,
                        branch: pr.head.ref,
                        base: pr.base.ref,
                    })),
                    summary: `Found ${prs.length} ${state} pull requests in ${owner}/${repo}`,
                };
            }

            case 'commits': {
                const response = await fetchGitHub(
                    `/repos/${owner}/${repo}/commits?per_page=${limit}`,
                    token
                );
                if (!response.ok) {
                    throw new Error(`GitHub API error: ${response.status}`);
                }
                const commits: GitHubCommit[] = await response.json();

                return {
                    success: true,
                    data: commits.map(c => ({
                        sha: c.sha.substring(0, 7),
                        message: c.commit.message.split('\n')[0], // First line only
                        author: c.commit.author?.name,
                        date: c.commit.author?.date,
                    })),
                    summary: `Found ${commits.length} recent commits in ${owner}/${repo}`,
                };
            }

            case 'file': {
                if (!args.query) {
                    return {
                        success: false,
                        error: 'File path required for file action',
                        summary: 'Missing file path',
                    };
                }
                const response = await fetchGitHub(
                    `/repos/${owner}/${repo}/contents/${args.query}`,
                    token
                );
                if (!response.ok) {
                    throw new Error(`File not found: ${args.query}`);
                }
                const file = await response.json();

                if (file.type !== 'file') {
                    return {
                        success: true,
                        data: { type: 'directory', files: file.map((f: { name: string }) => f.name) },
                        summary: `Directory listing for ${args.query}`,
                    };
                }

                const content = Buffer.from(file.content, 'base64').toString('utf-8');
                const truncated = content.length > 2000 ? content.substring(0, 2000) + '...' : content;

                return {
                    success: true,
                    data: { path: args.query, content: truncated },
                    summary: `Retrieved file ${args.query} (${content.length} chars)`,
                };
            }

            default:
                return {
                    success: false,
                    error: `Unknown action: ${args.action}`,
                    summary: 'Invalid action',
                };
        }
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return {
            success: false,
            error: message,
            summary: `GitHub error: ${message}`,
        };
    }
}

// ClickUp Tool Schema
export const clickupToolSchema = z.object({
    action: z.enum(['tasks', 'task_details']).describe(
        'What to fetch: tasks (list all) or task_details (specific task)'
    ),
    taskId: z.string().optional().describe(
        'Task ID (required for task_details action)'
    ),
    status: z.string().optional().describe(
        'Filter by status name (for tasks action)'
    ),
    limit: z.number().optional().describe(
        'Max number of results. Default: 20'
    ),
});

export type ClickUpToolArgs = z.infer<typeof clickupToolSchema>;

// ClickUp Tool Execute
export async function executeClickUpTool(
    args: ClickUpToolArgs,
    project: Project
): Promise<{ success: boolean; data?: unknown; error?: string; summary: string }> {
    if (!project.clickup) {
        return {
            success: false,
            error: 'No ClickUp list configured for this project',
            summary: 'ClickUp not configured',
        };
    }

    const token = process.env.CLICKUP_TOKEN;
    if (!token) {
        return {
            success: false,
            error: 'ClickUp API token not configured',
            summary: 'ClickUp token missing',
        };
    }

    const { listId } = project.clickup;

    try {
        switch (args.action) {
            case 'tasks': {
                let url = `/list/${listId}/task?subtasks=true`;
                if (args.status) {
                    url += `&statuses[]=${encodeURIComponent(args.status)}`;
                }

                const response = await fetchClickUp(url, token);
                if (!response.ok) {
                    throw new Error(`ClickUp API error: ${response.status}`);
                }
                const data = await response.json();
                const tasks: ClickUpTask[] = data.tasks || [];
                const limited = tasks.slice(0, args.limit || 20);

                return {
                    success: true,
                    data: limited.map(t => ({
                        id: t.id,
                        name: t.name,
                        status: t.status.status,
                        priority: t.priority?.priority || 'none',
                        assignees: t.assignees.map(a => a.username),
                    })),
                    summary: `Found ${limited.length} tasks in ClickUp list`,
                };
            }

            case 'task_details': {
                if (!args.taskId) {
                    return {
                        success: false,
                        error: 'Task ID required for task_details action',
                        summary: 'Missing task ID',
                    };
                }

                const response = await fetchClickUp(`/task/${args.taskId}`, token);
                if (!response.ok) {
                    throw new Error(`Task not found: ${args.taskId}`);
                }
                const task: ClickUpTask = await response.json();

                return {
                    success: true,
                    data: {
                        id: task.id,
                        name: task.name,
                        status: task.status.status,
                        description: task.description?.substring(0, 500) || 'No description',
                        priority: task.priority?.priority || 'none',
                        assignees: task.assignees.map(a => a.username),
                        created: task.date_created,
                    },
                    summary: `Retrieved task: ${task.name}`,
                };
            }

            default:
                return {
                    success: false,
                    error: `Unknown action: ${args.action}`,
                    summary: 'Invalid action',
                };
        }
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return {
            success: false,
            error: message,
            summary: `ClickUp error: ${message}`,
        };
    }
}

// Tool descriptions for agent system prompts
export const GITHUB_TOOL_DESCRIPTION = `
You have access to a GitHub tool to fetch information from the project's repository.
Use it when you need to:
- Check open issues or PRs
- Look at recent commits
- Read a specific file from the repo

Actions available: issues, prs, commits, file
`;

export const CLICKUP_TOOL_DESCRIPTION = `
You have access to a ClickUp tool to fetch tasks from the project's task list.
Use it when you need to:
- See current tasks and their status
- Get details about a specific task

Actions available: tasks, task_details
`;
