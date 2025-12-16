// Project and Space types for multi-project workspace

export interface GitHubConfig {
    owner: string;
    repo: string;
}

export interface ClickUpConfig {
    listId: string;
}

export interface GridPosition {
    row: number;
    col: number;
}

export interface Project {
    id: string;
    name: string;
    description?: string;
    github?: GitHubConfig;
    clickup?: ClickUpConfig;
    gridPosition: GridPosition;
    createdAt: number;
    color: string; // Hex color for visual identification
}

// Space dimensions
export const SPACE_WIDTH = 400;
export const SPACE_HEIGHT = 300;
export const SPACE_GAP = 50; // Gap between spaces (corridor)

// Grid configuration
export const MAX_GRID_COLS = 4;
export const MAX_GRID_ROWS = 4;

// Calculate world position from grid position
export function gridToWorldPosition(gridPos: GridPosition): { x: number; y: number } {
    return {
        x: gridPos.col * (SPACE_WIDTH + SPACE_GAP),
        y: gridPos.row * (SPACE_HEIGHT + SPACE_GAP),
    };
}

// Calculate grid position from world position
export function worldToGridPosition(worldX: number, worldY: number): GridPosition | null {
    const col = Math.floor(worldX / (SPACE_WIDTH + SPACE_GAP));
    const row = Math.floor(worldY / (SPACE_HEIGHT + SPACE_GAP));

    // Check if within a space (not in the gap)
    const localX = worldX % (SPACE_WIDTH + SPACE_GAP);
    const localY = worldY % (SPACE_HEIGHT + SPACE_GAP);

    if (localX < SPACE_WIDTH && localY < SPACE_HEIGHT) {
        return { row, col };
    }

    return null; // In the corridor/gap
}

// Find next available grid position
export function findNextAvailablePosition(existingProjects: Project[]): GridPosition {
    const occupied = new Set(
        existingProjects.map(p => `${p.gridPosition.row},${p.gridPosition.col}`)
    );

    for (let row = 0; row < MAX_GRID_ROWS; row++) {
        for (let col = 0; col < MAX_GRID_COLS; col++) {
            if (!occupied.has(`${row},${col}`)) {
                return { row, col };
            }
        }
    }

    // All positions taken, return next row
    return { row: MAX_GRID_ROWS, col: 0 };
}

// Generate a random project color
export function generateProjectColor(): string {
    const colors = [
        '#e74c3c', // Red
        '#3498db', // Blue
        '#2ecc71', // Green
        '#9b59b6', // Purple
        '#f39c12', // Orange
        '#1abc9c', // Teal
        '#e91e63', // Pink
        '#00bcd4', // Cyan
    ];
    return colors[Math.floor(Math.random() * colors.length)];
}

// Generate unique project ID
export function generateProjectId(): string {
    return `proj_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}
