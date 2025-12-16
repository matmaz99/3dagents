// Project store - manages projects with localStorage persistence

import {
    Project,
    findNextAvailablePosition,
    generateProjectId,
    generateProjectColor,
    GitHubConfig,
    ClickUpConfig,
} from '@/types/project';

const STORAGE_KEY = 'ai-town-projects';
const ACTIVE_PROJECT_KEY = 'ai-town-active-project';

interface ProjectStoreState {
    projects: Map<string, Project>;
    activeProjectId: string | null;
}

class ProjectStore {
    private state: ProjectStoreState;
    private listeners: Set<() => void> = new Set();

    constructor() {
        this.state = {
            projects: new Map(),
            activeProjectId: null,
        };
        this.load();
    }

    // Load from localStorage
    private load(): void {
        if (typeof window === 'undefined') return;

        try {
            const stored = localStorage.getItem(STORAGE_KEY);
            if (stored) {
                const projects: Project[] = JSON.parse(stored);
                this.state.projects = new Map(projects.map(p => [p.id, p]));
            }

            const activeId = localStorage.getItem(ACTIVE_PROJECT_KEY);
            if (activeId && this.state.projects.has(activeId)) {
                this.state.activeProjectId = activeId;
            } else if (this.state.projects.size > 0) {
                // Default to first project
                this.state.activeProjectId = this.state.projects.keys().next().value ?? null;
            }

            // If no projects exist, create a default one
            if (this.state.projects.size === 0) {
                this.createProject('My First Project');
            }
        } catch (error) {
            console.error('Failed to load projects:', error);
        }
    }

    // Save to localStorage
    private save(): void {
        if (typeof window === 'undefined') return;

        try {
            const projects = Array.from(this.state.projects.values());
            localStorage.setItem(STORAGE_KEY, JSON.stringify(projects));

            if (this.state.activeProjectId) {
                localStorage.setItem(ACTIVE_PROJECT_KEY, this.state.activeProjectId);
            }
        } catch (error) {
            console.error('Failed to save projects:', error);
        }
    }

    // Notify listeners of state changes
    private notify(): void {
        this.listeners.forEach(listener => listener());
    }

    // Subscribe to changes
    subscribe(listener: () => void): () => void {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }

    // Get all projects
    getProjects(): Project[] {
        return Array.from(this.state.projects.values());
    }

    // Get project by ID
    getProject(id: string): Project | undefined {
        return this.state.projects.get(id);
    }

    // Get active project
    getActiveProject(): Project | undefined {
        if (!this.state.activeProjectId) return undefined;
        return this.state.projects.get(this.state.activeProjectId);
    }

    // Get active project ID
    getActiveProjectId(): string | null {
        return this.state.activeProjectId;
    }

    // Set active project
    setActiveProject(projectId: string): void {
        if (this.state.projects.has(projectId)) {
            this.state.activeProjectId = projectId;
            this.save();
            this.notify();
        }
    }

    // Create a new project
    createProject(
        name: string,
        options?: {
            description?: string;
            github?: GitHubConfig;
            clickup?: ClickUpConfig;
        }
    ): Project {
        const id = generateProjectId();
        const gridPosition = findNextAvailablePosition(this.getProjects());

        const project: Project = {
            id,
            name,
            description: options?.description,
            github: options?.github,
            clickup: options?.clickup,
            gridPosition,
            createdAt: Date.now(),
            color: generateProjectColor(),
        };

        this.state.projects.set(id, project);

        // Set as active if it's the first project
        if (!this.state.activeProjectId) {
            this.state.activeProjectId = id;
        }

        this.save();
        this.notify();

        return project;
    }

    // Update a project
    updateProject(id: string, updates: Partial<Omit<Project, 'id' | 'createdAt'>>): void {
        const project = this.state.projects.get(id);
        if (!project) return;

        const updated = { ...project, ...updates };
        this.state.projects.set(id, updated);
        this.save();
        this.notify();
    }

    // Delete a project
    deleteProject(id: string): void {
        if (!this.state.projects.has(id)) return;

        this.state.projects.delete(id);

        // If deleted project was active, switch to another
        if (this.state.activeProjectId === id) {
            const remaining = this.getProjects();
            this.state.activeProjectId = remaining.length > 0 ? remaining[0].id : null;
        }

        this.save();
        this.notify();
    }

    // Get project at grid position
    getProjectAtGridPosition(row: number, col: number): Project | undefined {
        return this.getProjects().find(
            p => p.gridPosition.row === row && p.gridPosition.col === col
        );
    }

    // Check if a grid position is occupied
    isGridPositionOccupied(row: number, col: number): boolean {
        return this.getProjectAtGridPosition(row, col) !== undefined;
    }
}

// Singleton instance
export const projectStore = new ProjectStore();
