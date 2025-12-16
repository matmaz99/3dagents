// SpaceManager - Handles multiple project spaces in a grid layout
import Phaser from 'phaser';
import { Agent } from './Agent';
import { Navigation } from './Navigation';
import { AGENT_PERSONALITIES, AgentPersonality } from '@/agents/personalities';
import {
    Project,
    SPACE_WIDTH,
    SPACE_HEIGHT,
    SPACE_GAP,
    gridToWorldPosition,
} from '@/types/project';

// A single project space containing furniture and agents
export interface ProjectSpace {
    projectId: string;
    project: Project;
    worldX: number;
    worldY: number;
    agents: Agent[];
    furniture: Phaser.Physics.Arcade.StaticGroup;
    navigation: Navigation;
    container: Phaser.GameObjects.Container;
}

// Agent positions within a smaller space (relative coordinates)
const AGENT_POSITIONS = [
    { x: 60, y: 80 },   // Agent 1 - top left desk
    { x: 160, y: 80 },  // Agent 2 - top right desk
    { x: 60, y: 200 },  // Agent 3 - bottom left desk
    { x: 160, y: 200 }, // Agent 4 - bottom right desk
];

export class SpaceManager {
    private scene: Phaser.Scene;
    private spaces: Map<string, ProjectSpace> = new Map();
    private textureCreated = false;
    private readonly NAV_TILE_SIZE = 16;

    constructor(scene: Phaser.Scene) {
        this.scene = scene;
    }

    // Create textures for space elements (only once)
    createTextures(): void {
        if (this.textureCreated) return;
        this.textureCreated = true;

        // Space floor
        const floorGraphics = this.scene.make.graphics({ x: 0, y: 0 });
        floorGraphics.fillStyle(0x4a5568, 1);
        floorGraphics.fillRect(0, 0, 32, 32);
        floorGraphics.lineStyle(1, 0x3d4852, 0.3);
        floorGraphics.strokeRect(0, 0, 32, 32);
        floorGraphics.generateTexture('spaceFloor', 32, 32);
        floorGraphics.destroy();

        // Space wall
        const wallGraphics = this.scene.make.graphics({ x: 0, y: 0 });
        wallGraphics.fillStyle(0x2d3748, 1);
        wallGraphics.fillRect(0, 0, 32, 32);
        wallGraphics.lineStyle(2, 0x1a202c, 1);
        wallGraphics.strokeRect(0, 0, 32, 32);
        wallGraphics.generateTexture('spaceWall', 32, 32);
        wallGraphics.destroy();

        // Small desk
        const deskGraphics = this.scene.make.graphics({ x: 0, y: 0 });
        deskGraphics.fillStyle(0x8b6914, 1);
        deskGraphics.fillRoundedRect(0, 0, 48, 32, 2);
        deskGraphics.fillStyle(0x6b5210, 1);
        deskGraphics.fillRect(4, 28, 6, 6);
        deskGraphics.fillRect(38, 28, 6, 6);
        deskGraphics.generateTexture('smallDesk', 48, 36);
        deskGraphics.destroy();

        // Small computer
        const computerGraphics = this.scene.make.graphics({ x: 0, y: 0 });
        computerGraphics.fillStyle(0x2d3748, 1);
        computerGraphics.fillRoundedRect(0, 0, 18, 14, 2);
        computerGraphics.fillStyle(0x4299e1, 1);
        computerGraphics.fillRect(2, 2, 14, 9);
        computerGraphics.fillStyle(0x2d3748, 1);
        computerGraphics.fillRect(7, 14, 4, 3);
        computerGraphics.fillRect(4, 17, 10, 2);
        computerGraphics.generateTexture('smallComputer', 18, 20);
        computerGraphics.destroy();

        // Small chair
        const chairGraphics = this.scene.make.graphics({ x: 0, y: 0 });
        chairGraphics.fillStyle(0x1a202c, 1);
        chairGraphics.fillCircle(8, 14, 6);
        chairGraphics.fillStyle(0x2b6cb0, 1);
        chairGraphics.fillRoundedRect(2, 2, 12, 10, 2);
        chairGraphics.fillStyle(0x2c5282, 1);
        chairGraphics.fillRoundedRect(1, 10, 14, 6, 2);
        chairGraphics.generateTexture('smallChair', 16, 20);
        chairGraphics.destroy();

        // Small plant
        const plantGraphics = this.scene.make.graphics({ x: 0, y: 0 });
        plantGraphics.fillStyle(0xc53030, 1);
        plantGraphics.fillRect(6, 14, 10, 10);
        plantGraphics.fillRect(4, 12, 14, 3);
        plantGraphics.fillStyle(0x276749, 1);
        plantGraphics.fillCircle(11, 8, 7);
        plantGraphics.fillCircle(7, 10, 4);
        plantGraphics.fillCircle(15, 10, 4);
        plantGraphics.generateTexture('smallPlant', 22, 26);
        plantGraphics.destroy();

        // Space label background
        const labelBgGraphics = this.scene.make.graphics({ x: 0, y: 0 });
        labelBgGraphics.fillStyle(0x1a202c, 0.8);
        labelBgGraphics.fillRoundedRect(0, 0, 160, 24, 4);
        labelBgGraphics.generateTexture('spaceLabelBg', 160, 24);
        labelBgGraphics.destroy();
    }

    // Create a space for a project
    createSpace(project: Project): ProjectSpace {
        const worldPos = gridToWorldPosition(project.gridPosition);
        const worldX = worldPos.x;
        const worldY = worldPos.y;

        // Create container for all space elements
        const container = this.scene.add.container(worldX, worldY);

        // Create navigation for this space
        const navigation = new Navigation(SPACE_WIDTH, SPACE_HEIGHT, this.NAV_TILE_SIZE);
        navigation.markPerimeterWalls(32);

        // Create furniture group
        const furniture = this.scene.physics.add.staticGroup();

        // Create floor tiles
        for (let x = 0; x < SPACE_WIDTH; x += 32) {
            for (let y = 0; y < SPACE_HEIGHT; y += 32) {
                const floor = this.scene.add.image(x + 16, y + 16, 'spaceFloor');
                container.add(floor);
            }
        }

        // Create walls
        for (let x = 0; x < SPACE_WIDTH; x += 32) {
            // Top wall
            const topWall = this.scene.physics.add.staticImage(worldX + x + 16, worldY + 16, 'spaceWall');
            furniture.add(topWall);
            // Bottom wall
            const bottomWall = this.scene.physics.add.staticImage(worldX + x + 16, worldY + SPACE_HEIGHT - 16, 'spaceWall');
            furniture.add(bottomWall);
        }
        for (let y = 32; y < SPACE_HEIGHT - 32; y += 32) {
            // Left wall
            const leftWall = this.scene.physics.add.staticImage(worldX + 16, worldY + y + 16, 'spaceWall');
            furniture.add(leftWall);
            // Right wall
            const rightWall = this.scene.physics.add.staticImage(worldX + SPACE_WIDTH - 16, worldY + y + 16, 'spaceWall');
            furniture.add(rightWall);
        }

        // Add desks and computers at each agent position
        AGENT_POSITIONS.forEach((pos) => {
            // Desk
            const desk = this.scene.physics.add.staticImage(worldX + pos.x, worldY + pos.y - 20, 'smallDesk');
            furniture.add(desk);
            navigation.markBlocked(pos.x, pos.y - 20, 48, 36);

            // Computer (decorative)
            const computer = this.scene.add.image(pos.x, pos.y - 30, 'smallComputer').setDepth(2);
            container.add(computer);

            // Chair (decorative)
            const chair = this.scene.add.image(pos.x, pos.y + 10, 'smallChair').setDepth(1);
            container.add(chair);
        });

        // Add decorative plants
        const plantPos = [
            { x: SPACE_WIDTH - 30, y: 50 },
            { x: 30, y: SPACE_HEIGHT - 50 },
        ];
        plantPos.forEach((pos) => {
            const plant = this.scene.physics.add.staticImage(worldX + pos.x, worldY + pos.y, 'smallPlant');
            furniture.add(plant);
            navigation.markBlocked(pos.x, pos.y, 22, 26);
        });

        // Add project name label with colored indicator
        const labelBg = this.scene.add.image(SPACE_WIDTH / 2, 40, 'spaceLabelBg').setDepth(100);
        container.add(labelBg);

        // Colored dot for project
        const dot = this.scene.add.graphics();
        dot.fillStyle(parseInt(project.color.replace('#', ''), 16), 1);
        dot.fillCircle(SPACE_WIDTH / 2 - 70, 40, 6);
        container.add(dot);

        // Project name text
        const nameText = this.scene.add.text(SPACE_WIDTH / 2 - 55, 40, project.name, {
            fontSize: '12px',
            fontFamily: 'Arial',
            color: '#ffffff',
        }).setOrigin(0, 0.5).setDepth(101);
        container.add(nameText);

        // Integration indicators
        let indicatorX = SPACE_WIDTH / 2 + 40;
        if (project.github) {
            const ghText = this.scene.add.text(indicatorX, 40, 'GH', {
                fontSize: '10px',
                fontFamily: 'Arial',
                color: '#888888',
                backgroundColor: '#2d3748',
                padding: { x: 4, y: 2 },
            }).setOrigin(0, 0.5).setDepth(101);
            container.add(ghText);
            indicatorX += 30;
        }
        if (project.clickup) {
            const cuText = this.scene.add.text(indicatorX, 40, 'CU', {
                fontSize: '10px',
                fontFamily: 'Arial',
                color: '#888888',
                backgroundColor: '#2d3748',
                padding: { x: 4, y: 2 },
            }).setOrigin(0, 0.5).setDepth(101);
            container.add(cuText);
        }

        // Create agents for this space
        const agents: Agent[] = [];
        AGENT_PERSONALITIES.forEach((personality, index) => {
            const pos = AGENT_POSITIONS[index];
            const agent = new Agent(
                this.scene,
                worldX + pos.x,
                worldY + pos.y,
                personality
            );
            agent.setNavigation(navigation);
            // Offset home position by world coordinates
            agent.setHomePosition(worldX + pos.x, worldY + pos.y);
            agents.push(agent);
        });

        const space: ProjectSpace = {
            projectId: project.id,
            project,
            worldX,
            worldY,
            agents,
            furniture,
            navigation,
            container,
        };

        this.spaces.set(project.id, space);
        return space;
    }

    // Remove a space
    removeSpace(projectId: string): void {
        const space = this.spaces.get(projectId);
        if (!space) return;

        // Destroy agents
        space.agents.forEach(agent => agent.destroy());

        // Destroy furniture
        space.furniture.clear(true, true);

        // Destroy container
        space.container.destroy();

        this.spaces.delete(projectId);
    }

    // Get a space by project ID
    getSpace(projectId: string): ProjectSpace | undefined {
        return this.spaces.get(projectId);
    }

    // Get all spaces
    getAllSpaces(): ProjectSpace[] {
        return Array.from(this.spaces.values());
    }

    // Get agent from any space
    getAgentById(agentId: string): { agent: Agent; space: ProjectSpace } | undefined {
        for (const space of this.spaces.values()) {
            const agent = space.agents.find(a => a.agentId === agentId);
            if (agent) {
                return { agent, space };
            }
        }
        return undefined;
    }

    // Get agents for a specific project
    getAgentsForProject(projectId: string): Agent[] {
        const space = this.spaces.get(projectId);
        return space ? space.agents : [];
    }

    // Calculate total world size based on spaces
    getWorldBounds(): { width: number; height: number } {
        let maxX = SPACE_WIDTH;
        let maxY = SPACE_HEIGHT;

        this.spaces.forEach(space => {
            const endX = space.worldX + SPACE_WIDTH;
            const endY = space.worldY + SPACE_HEIGHT;
            maxX = Math.max(maxX, endX);
            maxY = Math.max(maxY, endY);
        });

        // Add some padding
        return {
            width: maxX + SPACE_GAP,
            height: maxY + SPACE_GAP,
        };
    }

    // Update all agents in all spaces
    update(time: number, delta: number): void {
        this.spaces.forEach(space => {
            space.agents.forEach(agent => {
                agent.update(time, delta);
            });
        });
    }

    // Add collision between an object and all furniture
    addCollisionWithFurniture(
        object: Phaser.GameObjects.GameObject
    ): void {
        this.spaces.forEach(space => {
            this.scene.physics.add.collider(object, space.furniture);
        });
    }

    // Get space at world position
    getSpaceAtPosition(worldX: number, worldY: number): ProjectSpace | undefined {
        for (const space of this.spaces.values()) {
            if (
                worldX >= space.worldX &&
                worldX < space.worldX + SPACE_WIDTH &&
                worldY >= space.worldY &&
                worldY < space.worldY + SPACE_HEIGHT
            ) {
                return space;
            }
        }
        return undefined;
    }
}
