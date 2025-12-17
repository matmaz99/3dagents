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
    action: z.enum(['issues', 'prs', 'commits', 'file', 'create_issue']).describe(
        'What to do: issues (list), prs (list), commits (list), file (read), or create_issue (create new issue)'
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
    // Fields for create_issue action
    title: z.string().optional().describe(
        'Issue title (required for create_issue action)'
    ),
    body: z.string().optional().describe(
        'Issue body/description (for create_issue action)'
    ),
    labels: z.array(z.string()).optional().describe(
        'Labels to add to the issue (for create_issue action). E.g., ["bug", "high-priority"]'
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

            case 'create_issue': {
                if (!args.title) {
                    return {
                        success: false,
                        error: 'Title required for create_issue action',
                        summary: 'Missing issue title',
                    };
                }
                if (!token) {
                    return {
                        success: false,
                        error: 'GitHub token required to create issues',
                        summary: 'GitHub token missing',
                    };
                }

                const issueBody = {
                    title: args.title,
                    body: args.body || '',
                    labels: args.labels || [],
                };

                const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/issues`, {
                    method: 'POST',
                    headers: {
                        'Accept': 'application/vnd.github.v3+json',
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(issueBody),
                });

                if (!response.ok) {
                    const errorData = await response.json().catch(() => ({}));
                    throw new Error(`Failed to create issue: ${response.status} - ${errorData.message || 'Unknown error'}`);
                }

                const createdIssue = await response.json();

                return {
                    success: true,
                    data: {
                        number: createdIssue.number,
                        title: createdIssue.title,
                        url: createdIssue.html_url,
                        state: createdIssue.state,
                    },
                    summary: `Created issue #${createdIssue.number}: "${args.title}" in ${owner}/${repo}`,
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
    action: z.enum(['tasks', 'task_details', 'create_task', 'update_task']).describe(
        'What to do: tasks (list all), task_details (get one), create_task (new task), update_task (modify existing)'
    ),
    taskId: z.string().optional().describe(
        'Task ID (required for task_details and update_task actions)'
    ),
    status: z.string().optional().describe(
        'Filter by status name (for tasks action) or new status (for update_task action)'
    ),
    limit: z.number().optional().describe(
        'Max number of results. Default: 20'
    ),
    // Fields for create_task action
    name: z.string().optional().describe(
        'Task name (required for create_task action)'
    ),
    description: z.string().optional().describe(
        'Task description (for create_task or update_task actions)'
    ),
    priority: z.number().min(1).max(4).optional().describe(
        'Priority level 1-4 (1=urgent, 2=high, 3=normal, 4=low) for create_task or update_task'
    ),
    dueDate: z.string().optional().describe(
        'Due date as ISO string or timestamp (for create_task or update_task)'
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

            case 'create_task': {
                if (!args.name) {
                    return {
                        success: false,
                        error: 'Task name required for create_task action',
                        summary: 'Missing task name',
                    };
                }

                const taskBody: Record<string, unknown> = {
                    name: args.name,
                    description: args.description || '',
                };

                if (args.priority) {
                    taskBody.priority = args.priority;
                }

                if (args.dueDate) {
                    // Convert to milliseconds timestamp if it's an ISO string
                    const dueTimestamp = isNaN(Number(args.dueDate))
                        ? new Date(args.dueDate).getTime()
                        : Number(args.dueDate);
                    taskBody.due_date = dueTimestamp;
                }

                const response = await fetch(`https://api.clickup.com/api/v2/list/${listId}/task`, {
                    method: 'POST',
                    headers: {
                        'Authorization': token,
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(taskBody),
                });

                if (!response.ok) {
                    const errorData = await response.json().catch(() => ({}));
                    throw new Error(`Failed to create task: ${response.status} - ${errorData.err || 'Unknown error'}`);
                }

                const createdTask = await response.json();

                return {
                    success: true,
                    data: {
                        id: createdTask.id,
                        name: createdTask.name,
                        url: createdTask.url,
                        status: createdTask.status?.status || 'created',
                    },
                    summary: `Created task "${args.name}" in ClickUp (ID: ${createdTask.id})`,
                };
            }

            case 'update_task': {
                if (!args.taskId) {
                    return {
                        success: false,
                        error: 'Task ID required for update_task action',
                        summary: 'Missing task ID',
                    };
                }

                const updateBody: Record<string, unknown> = {};

                if (args.name) {
                    updateBody.name = args.name;
                }

                if (args.description) {
                    updateBody.description = args.description;
                }

                if (args.status) {
                    updateBody.status = args.status;
                }

                if (args.priority) {
                    updateBody.priority = args.priority;
                }

                if (args.dueDate) {
                    const dueTimestamp = isNaN(Number(args.dueDate))
                        ? new Date(args.dueDate).getTime()
                        : Number(args.dueDate);
                    updateBody.due_date = dueTimestamp;
                }

                if (Object.keys(updateBody).length === 0) {
                    return {
                        success: false,
                        error: 'At least one field to update is required',
                        summary: 'No updates specified',
                    };
                }

                const response = await fetch(`https://api.clickup.com/api/v2/task/${args.taskId}`, {
                    method: 'PUT',
                    headers: {
                        'Authorization': token,
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(updateBody),
                });

                if (!response.ok) {
                    const errorData = await response.json().catch(() => ({}));
                    throw new Error(`Failed to update task: ${response.status} - ${errorData.err || 'Unknown error'}`);
                }

                const updatedTask = await response.json();

                return {
                    success: true,
                    data: {
                        id: updatedTask.id,
                        name: updatedTask.name,
                        status: updatedTask.status?.status,
                    },
                    summary: `Updated task "${updatedTask.name}" (ID: ${args.taskId})`,
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

// Browser Tool Schema
export const browserToolSchema = z.object({
    action: z.enum(['browse', 'extract', 'search']).describe(
        'What to do: browse (visit URL and get content), extract (get specific data), search (Google search)'
    ),
    url: z.string().optional().describe(
        'URL to visit (required for browse and extract actions)'
    ),
    query: z.string().optional().describe(
        'Search query (required for search action)'
    ),
    instruction: z.string().optional().describe(
        'What specific information to extract or look for on the page'
    ),
});

export type BrowserToolArgs = z.infer<typeof browserToolSchema>;

// Browser Tool Execute
export async function executeBrowserTool(
    args: BrowserToolArgs,
    baseUrl: string
): Promise<{ success: boolean; data?: unknown; error?: string; summary: string }> {
    try {
        const response = await fetch(`${baseUrl}/api/browser`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(args),
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error || `Browser API error: ${response.status}`);
        }

        const result = await response.json();

        if (!result.success) {
            return {
                success: false,
                error: result.error || 'Unknown browser error',
                summary: 'Browser operation failed',
            };
        }

        // Create a summary based on the action
        let summary = '';
        switch (args.action) {
            case 'browse':
                summary = `Browsed to ${args.url} - ${result.data?.title || 'Page loaded'}`;
                break;
            case 'extract':
                summary = `Extracted data from ${args.url}`;
                break;
            case 'search':
                const resultCount = result.data?.results?.length || 0;
                summary = `Found ${resultCount} search results for "${args.query}"`;
                break;
            default:
                summary = 'Browser operation completed';
        }

        return {
            success: true,
            data: result.data,
            summary,
        };
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return {
            success: false,
            error: message,
            summary: `Browser error: ${message}`,
        };
    }
}

// Tool descriptions for agent system prompts
export const GITHUB_TOOL_DESCRIPTION = `
You have access to a GitHub tool to interact with the project's repository.
Use it when you need to:
- Check open issues or PRs
- Look at recent commits
- Read a specific file from the repo
- Create a new issue (for bug reports, feature requests, etc.)

Actions available: issues, prs, commits, file, create_issue
`;

export const CLICKUP_TOOL_DESCRIPTION = `
You have access to a ClickUp tool to manage tasks in the project's task list.
Use it when you need to:
- See current tasks and their status
- Get details about a specific task
- Create a new task
- Update an existing task (status, priority, description)

Actions available: tasks, task_details, create_task, update_task
`;

export const BROWSER_TOOL_DESCRIPTION = `
You have access to a Browser tool to browse the web and gather information.
Use it when you need to:
- Research technical documentation or solutions
- Look up information from websites
- Search Google for answers or resources
- Extract specific data from web pages

Actions available:
- browse: Visit a URL and extract its main content
- extract: Get specific information from a page (provide instruction for what to extract)
- search: Perform a Google search and get results
`;
