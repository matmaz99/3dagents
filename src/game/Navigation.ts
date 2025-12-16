// Pathfinding navigation system using EasyStar.js
import EasyStar from 'easystarjs';

export class Navigation {
    private easyStar: EasyStar.js;
    private grid: number[][] = [];
    private tileSize: number;
    private worldWidth: number;
    private worldHeight: number;
    private gridWidth: number;
    private gridHeight: number;

    constructor(worldWidth: number, worldHeight: number, tileSize: number = 16) {
        this.worldWidth = worldWidth;
        this.worldHeight = worldHeight;
        this.tileSize = tileSize;
        this.gridWidth = Math.ceil(worldWidth / tileSize);
        this.gridHeight = Math.ceil(worldHeight / tileSize);

        this.easyStar = new EasyStar.js();
        this.easyStar.setAcceptableTiles([0]);
        this.easyStar.enableDiagonals();
        this.easyStar.enableCornerCutting();

        // Initialize empty grid (all walkable)
        this.initializeGrid();
    }

    private initializeGrid(): void {
        this.grid = [];
        for (let y = 0; y < this.gridHeight; y++) {
            const row: number[] = [];
            for (let x = 0; x < this.gridWidth; x++) {
                row.push(0); // 0 = walkable
            }
            this.grid.push(row);
        }
        this.easyStar.setGrid(this.grid);
    }

    // Mark a rectangular area as blocked
    markBlocked(worldX: number, worldY: number, width: number, height: number): void {
        const startX = Math.floor((worldX - width / 2) / this.tileSize);
        const startY = Math.floor((worldY - height / 2) / this.tileSize);
        const endX = Math.ceil((worldX + width / 2) / this.tileSize);
        const endY = Math.ceil((worldY + height / 2) / this.tileSize);

        for (let y = startY; y < endY; y++) {
            for (let x = startX; x < endX; x++) {
                if (y >= 0 && y < this.gridHeight && x >= 0 && x < this.gridWidth) {
                    this.grid[y][x] = 1; // 1 = blocked
                }
            }
        }
        this.easyStar.setGrid(this.grid);
    }

    // Mark walls around the perimeter
    markPerimeterWalls(wallThickness: number = 32): void {
        const tiles = Math.ceil(wallThickness / this.tileSize);

        // Top and bottom walls
        for (let x = 0; x < this.gridWidth; x++) {
            for (let t = 0; t < tiles; t++) {
                if (t < this.gridHeight) this.grid[t][x] = 1;
                if (this.gridHeight - 1 - t >= 0) this.grid[this.gridHeight - 1 - t][x] = 1;
            }
        }

        // Left and right walls
        for (let y = 0; y < this.gridHeight; y++) {
            for (let t = 0; t < tiles; t++) {
                if (t < this.gridWidth) this.grid[y][t] = 1;
                if (this.gridWidth - 1 - t >= 0) this.grid[y][this.gridWidth - 1 - t] = 1;
            }
        }

        this.easyStar.setGrid(this.grid);
    }

    // Convert world coordinates to grid coordinates
    worldToGrid(worldX: number, worldY: number): { x: number; y: number } {
        return {
            x: Math.floor(worldX / this.tileSize),
            y: Math.floor(worldY / this.tileSize)
        };
    }

    // Convert grid coordinates to world coordinates (center of tile)
    gridToWorld(gridX: number, gridY: number): { x: number; y: number } {
        return {
            x: gridX * this.tileSize + this.tileSize / 2,
            y: gridY * this.tileSize + this.tileSize / 2
        };
    }

    // Find path from start to end (world coordinates)
    findPath(
        startX: number,
        startY: number,
        endX: number,
        endY: number,
        callback: (path: { x: number; y: number }[] | null) => void
    ): void {
        const start = this.worldToGrid(startX, startY);
        const end = this.worldToGrid(endX, endY);

        // Clamp to grid bounds
        start.x = Math.max(0, Math.min(this.gridWidth - 1, start.x));
        start.y = Math.max(0, Math.min(this.gridHeight - 1, start.y));
        end.x = Math.max(0, Math.min(this.gridWidth - 1, end.x));
        end.y = Math.max(0, Math.min(this.gridHeight - 1, end.y));

        // If start position is blocked, find nearest walkable tile
        if (this.grid[start.y]?.[start.x] === 1) {
            const nearestStart = this.findNearestWalkable(start.x, start.y);
            if (nearestStart) {
                start.x = nearestStart.x;
                start.y = nearestStart.y;
            }
        }

        // If end position is blocked, find nearest walkable tile
        if (this.grid[end.y]?.[end.x] === 1) {
            const nearest = this.findNearestWalkable(end.x, end.y);
            if (nearest) {
                end.x = nearest.x;
                end.y = nearest.y;
            }
        }

        this.easyStar.findPath(start.x, start.y, end.x, end.y, (path) => {
            if (path && path.length > 0) {
                // Convert grid path to world coordinates
                const worldPath = path.map(point => this.gridToWorld(point.x, point.y));
                callback(worldPath);
            } else {
                // No path found - try direct line as fallback
                callback([{ x: endX, y: endY }]);
            }
        });
        this.easyStar.calculate();
    }

    // Find nearest walkable tile to a blocked position
    private findNearestWalkable(gridX: number, gridY: number): { x: number; y: number } | null {
        const maxRadius = 10;
        for (let radius = 1; radius <= maxRadius; radius++) {
            for (let dy = -radius; dy <= radius; dy++) {
                for (let dx = -radius; dx <= radius; dx++) {
                    const nx = gridX + dx;
                    const ny = gridY + dy;
                    if (
                        ny >= 0 && ny < this.gridHeight &&
                        nx >= 0 && nx < this.gridWidth &&
                        this.grid[ny][nx] === 0
                    ) {
                        return { x: nx, y: ny };
                    }
                }
            }
        }
        return null;
    }

    // Get the tile size
    getTileSize(): number {
        return this.tileSize;
    }
}
