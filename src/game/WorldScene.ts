// Main game world scene
import Phaser from 'phaser';
import { Player } from './Player';
import { Agent, AgentState } from './Agent';
import { AGENT_PERSONALITIES } from '../agents/personalities';
import { Navigation } from './Navigation';
import { ThoughtBubbleManager } from './ThoughtBubble';
import { SpaceManager, ProjectSpace } from './SpaceManager';
import { CameraController } from './CameraController';
import { Project, SPACE_WIDTH, SPACE_HEIGHT, SPACE_GAP, gridToWorldPosition } from '@/types/project';

// Event types for communication with React
export interface GameEvents {
    onNearAgent: (agentId: string, distance: number) => void;
    onLeaveAgent: () => void;
    onInteractRequest: (agentId: string) => void;
    onEnterCallStation: () => void;
    onLeaveCallStation: () => void;
    onAgentArrived: (agentId: string) => void;
    // New events for tool call visualization
    onAgentStartedWalking?: (agentId: string, targetAgentId: string) => void;
    onAgentArrivedAtAgent?: (agentId: string, targetAgentId: string) => void;
    onAgentStartedReturning?: (agentId: string) => void;
    // Multi-space events
    onSpaceChanged?: (projectId: string | null) => void;
    onZoomChanged?: (zoom: number) => void;
}

export class WorldScene extends Phaser.Scene {
    private player!: Player;
    private agents: Agent[] = [];
    private gameEvents?: GameEvents;
    private nearestAgent: Agent | null = null;
    private interactKey!: Phaser.Input.Keyboard.Key;
    private isPlayerInteracting: boolean = false;
    private furniture!: Phaser.Physics.Arcade.StaticGroup;
    private isAtCallStation: boolean = false;
    private summonedAgent: Agent | null = null;
    private navigation!: Navigation;
    private thoughtBubbleManager!: ThoughtBubbleManager;

    // Multi-space support
    private spaceManager!: SpaceManager;
    private cameraController!: CameraController;
    private projects: Project[] = [];
    private activeProjectId: string | null = null;
    private isMultiSpaceMode: boolean = false;

    // World configuration (for single-space backward compatibility)
    private readonly WORLD_WIDTH = 1000;
    private readonly WORLD_HEIGHT = 700;
    private readonly INTERACTION_DISTANCE = 60;
    private readonly TILE_SIZE = 32;
    private readonly NAV_TILE_SIZE = 16; // Smaller tiles for better pathfinding
    private readonly CALL_STATION = { x: 550, y: 500 };
    private readonly CALL_STATION_RADIUS = 50;

    constructor() {
        super({ key: 'WorldScene' });
    }

    setGameEvents(events: GameEvents): void {
        this.gameEvents = events;
    }

    // === PROJECT MANAGEMENT METHODS ===

    // Set projects for multi-space mode
    setProjects(projects: Project[]): void {
        this.projects = projects;
        this.isMultiSpaceMode = projects.length > 0;

        if (this.isMultiSpaceMode && this.spaceManager) {
            // Create spaces for each project
            projects.forEach(project => {
                if (!this.spaceManager.getSpace(project.id)) {
                    const space = this.spaceManager.createSpace(project);
                    // Add collision between player and furniture
                    if (this.player) {
                        this.physics.add.collider(this.player, space.furniture);
                    }
                    // Add collision between agents
                    space.agents.forEach((agent, i) => {
                        space.agents.slice(i + 1).forEach(otherAgent => {
                            this.physics.add.collider(agent, otherAgent);
                        });
                        if (this.player) {
                            this.physics.add.collider(this.player, agent);
                        }
                    });
                }
            });

            // Update world bounds
            const bounds = this.spaceManager.getWorldBounds();
            this.physics.world.setBounds(0, 0, bounds.width, bounds.height);
            this.cameraController?.setBounds(bounds.width, bounds.height);

            // Collect all agents from spaces
            this.agents = [];
            this.spaceManager.getAllSpaces().forEach(space => {
                this.agents.push(...space.agents);
            });
        }
    }

    // Add a single project
    addProject(project: Project): void {
        if (!this.projects.find(p => p.id === project.id)) {
            this.projects.push(project);
            this.setProjects(this.projects);
        }
    }

    // Remove a project
    removeProject(projectId: string): void {
        this.projects = this.projects.filter(p => p.id !== projectId);
        this.spaceManager?.removeSpace(projectId);

        // Rebuild agents list
        this.agents = [];
        this.spaceManager?.getAllSpaces().forEach(space => {
            this.agents.push(...space.agents);
        });
    }

    // Set active project (camera focuses on it)
    setActiveProject(projectId: string | null): void {
        this.activeProjectId = projectId;

        if (projectId && this.isMultiSpaceMode) {
            const space = this.spaceManager?.getSpace(projectId);
            if (space) {
                this.cameraController?.focusOnGridPosition(space.project.gridPosition);
            }
        }

        this.gameEvents?.onSpaceChanged?.(projectId);
    }

    // Get active project ID
    getActiveProjectId(): string | null {
        return this.activeProjectId;
    }

    // Focus camera on a project space
    focusOnProject(projectId: string): void {
        const space = this.spaceManager?.getSpace(projectId);
        if (space) {
            this.cameraController?.focusOnGridPosition(space.project.gridPosition);
            this.activeProjectId = projectId;
            this.gameEvents?.onSpaceChanged?.(projectId);
        }
    }

    // Zoom out to see all spaces
    zoomOutToOverview(): void {
        this.cameraController?.zoomOut();
    }

    // Zoom in to focused space
    zoomInToSpace(): void {
        this.cameraController?.zoomIn();
    }

    setPlayerInteracting(value: boolean): void {
        this.isPlayerInteracting = value;
        if (this.player) {
            this.player.setInteracting(value);
        }

        // Set relevant agent to talking state or return to desk
        if (this.nearestAgent) {
            if (value) {
                this.nearestAgent.setAgentState('talking');
            } else {
                // Conversation ended - agent returns to their desk
                this.nearestAgent.returnToDesk();
            }
        }

        // Handle summoned agent returning to desk
        if (!value && this.summonedAgent) {
            if (this.summonedAgent !== this.nearestAgent) {
                this.summonedAgent.returnToDesk();
            }
            this.summonedAgent = null;
        }
    }

    // Summon an agent to come to the player
    summonAgent(agentId: string): void {
        const agent = this.agents.find(a => a.agentId === agentId);
        if (!agent) return;

        this.summonedAgent = agent;
        const playerPos = this.player.getPosition();

        // Calculate position in front of player (offset by interaction distance)
        const targetX = playerPos.x;
        const targetY = playerPos.y - 40; // Position in front of player

        agent.walkTo(targetX, targetY, () => {
            // Agent has arrived - set as nearest agent for proper return logic
            this.nearestAgent = agent;
            this.gameEvents?.onAgentArrived(agentId);
        });
    }

    preload(): void {
        // Create simple colored rectangle textures for player and agents
        this.createCharacterTextures();
        this.createEnvironmentTextures();
    }

    private createCharacterTextures(): void {
        // Player texture (blue square)
        const playerGraphics = this.make.graphics({ x: 0, y: 0 });
        playerGraphics.fillStyle(0x4a9eff, 1);
        playerGraphics.fillRoundedRect(0, 0, 32, 32, 8);
        playerGraphics.lineStyle(2, 0xffffff, 1);
        playerGraphics.strokeRoundedRect(0, 0, 32, 32, 8);
        playerGraphics.generateTexture('player', 32, 32);
        playerGraphics.destroy();

        // Agent texture (circle)
        const agentGraphics = this.make.graphics({ x: 0, y: 0 });
        agentGraphics.fillStyle(0xffffff, 1);
        agentGraphics.fillCircle(16, 16, 14);
        agentGraphics.lineStyle(2, 0x333333, 1);
        agentGraphics.strokeCircle(16, 16, 14);
        agentGraphics.generateTexture('agent', 32, 32);
        agentGraphics.destroy();
    }

    private createEnvironmentTextures(): void {
        // Floor tile - office carpet
        const floorGraphics = this.make.graphics({ x: 0, y: 0 });
        floorGraphics.fillStyle(0x4a5568, 1);
        floorGraphics.fillRect(0, 0, 32, 32);
        floorGraphics.lineStyle(1, 0x3d4852, 0.3);
        floorGraphics.strokeRect(0, 0, 32, 32);
        floorGraphics.generateTexture('floor', 32, 32);
        floorGraphics.destroy();

        // Wall tile
        const wallGraphics = this.make.graphics({ x: 0, y: 0 });
        wallGraphics.fillStyle(0x2d3748, 1);
        wallGraphics.fillRect(0, 0, 32, 32);
        wallGraphics.lineStyle(2, 0x1a202c, 1);
        wallGraphics.strokeRect(0, 0, 32, 32);
        wallGraphics.generateTexture('wall', 32, 32);
        wallGraphics.destroy();

        // Office desk (brown wooden desk)
        const deskGraphics = this.make.graphics({ x: 0, y: 0 });
        deskGraphics.fillStyle(0x8b6914, 1);
        deskGraphics.fillRoundedRect(0, 0, 64, 40, 3);
        deskGraphics.fillStyle(0x6b5210, 1);
        deskGraphics.fillRect(4, 36, 8, 8); // legs
        deskGraphics.fillRect(52, 36, 8, 8);
        deskGraphics.generateTexture('desk', 64, 48);
        deskGraphics.destroy();

        // Computer monitor
        const computerGraphics = this.make.graphics({ x: 0, y: 0 });
        computerGraphics.fillStyle(0x2d3748, 1);
        computerGraphics.fillRoundedRect(0, 0, 24, 20, 2);
        computerGraphics.fillStyle(0x4299e1, 1);
        computerGraphics.fillRect(2, 2, 20, 14); // screen
        computerGraphics.fillStyle(0x2d3748, 1);
        computerGraphics.fillRect(10, 20, 4, 4); // stand
        computerGraphics.fillRect(6, 24, 12, 2); // base
        computerGraphics.generateTexture('computer', 24, 28);
        computerGraphics.destroy();

        // Office chair
        const chairGraphics = this.make.graphics({ x: 0, y: 0 });
        chairGraphics.fillStyle(0x1a202c, 1);
        chairGraphics.fillCircle(12, 20, 8); // base
        chairGraphics.fillStyle(0x2b6cb0, 1);
        chairGraphics.fillRoundedRect(4, 4, 16, 14, 3); // seat back
        chairGraphics.fillStyle(0x2c5282, 1);
        chairGraphics.fillRoundedRect(2, 14, 20, 8, 2); // seat
        chairGraphics.generateTexture('chair', 24, 28);
        chairGraphics.destroy();

        // Bookshelf
        const bookshelfGraphics = this.make.graphics({ x: 0, y: 0 });
        bookshelfGraphics.fillStyle(0x744210, 1);
        bookshelfGraphics.fillRect(0, 0, 48, 64);
        bookshelfGraphics.fillStyle(0x5c3d0e, 1);
        bookshelfGraphics.fillRect(4, 4, 40, 2); // shelves
        bookshelfGraphics.fillRect(4, 20, 40, 2);
        bookshelfGraphics.fillRect(4, 36, 40, 2);
        bookshelfGraphics.fillRect(4, 52, 40, 2);
        // Books
        bookshelfGraphics.fillStyle(0xe53e3e, 1);
        bookshelfGraphics.fillRect(6, 6, 6, 12);
        bookshelfGraphics.fillStyle(0x3182ce, 1);
        bookshelfGraphics.fillRect(14, 6, 6, 12);
        bookshelfGraphics.fillStyle(0x38a169, 1);
        bookshelfGraphics.fillRect(22, 6, 6, 12);
        bookshelfGraphics.fillStyle(0xd69e2e, 1);
        bookshelfGraphics.fillRect(30, 6, 6, 12);
        bookshelfGraphics.fillStyle(0x805ad5, 1);
        bookshelfGraphics.fillRect(6, 22, 6, 12);
        bookshelfGraphics.fillStyle(0xed8936, 1);
        bookshelfGraphics.fillRect(14, 22, 6, 12);
        bookshelfGraphics.generateTexture('bookshelf', 48, 64);
        bookshelfGraphics.destroy();

        // Sofa/couch
        const couchGraphics = this.make.graphics({ x: 0, y: 0 });
        couchGraphics.fillStyle(0x553c9a, 1);
        couchGraphics.fillRoundedRect(0, 8, 80, 32, 6);
        couchGraphics.fillStyle(0x6b46c1, 1);
        couchGraphics.fillRoundedRect(4, 0, 72, 20, 4);
        couchGraphics.fillStyle(0x44337a, 1);
        couchGraphics.fillRoundedRect(0, 8, 16, 32, 4); // armrest left
        couchGraphics.fillRoundedRect(64, 8, 16, 32, 4); // armrest right
        couchGraphics.generateTexture('couch', 80, 44);
        couchGraphics.destroy();

        // Coffee table
        const coffeeTableGraphics = this.make.graphics({ x: 0, y: 0 });
        coffeeTableGraphics.fillStyle(0x744210, 1);
        coffeeTableGraphics.fillRoundedRect(0, 0, 48, 28, 3);
        coffeeTableGraphics.fillStyle(0x5c3d0e, 1);
        coffeeTableGraphics.fillRect(4, 24, 6, 8);
        coffeeTableGraphics.fillRect(38, 24, 6, 8);
        coffeeTableGraphics.generateTexture('coffeeTable', 48, 32);
        coffeeTableGraphics.destroy();

        // Plant in pot
        const plantGraphics = this.make.graphics({ x: 0, y: 0 });
        plantGraphics.fillStyle(0xc53030, 1); // terracotta pot
        plantGraphics.fillRect(8, 20, 16, 14);
        plantGraphics.fillRect(6, 18, 20, 4);
        plantGraphics.fillStyle(0x276749, 1); // leaves
        plantGraphics.fillCircle(16, 10, 10);
        plantGraphics.fillCircle(10, 14, 6);
        plantGraphics.fillCircle(22, 14, 6);
        plantGraphics.fillStyle(0x2f855a, 1);
        plantGraphics.fillCircle(16, 8, 6);
        plantGraphics.generateTexture('plant', 32, 36);
        plantGraphics.destroy();

        // Water cooler
        const waterCoolerGraphics = this.make.graphics({ x: 0, y: 0 });
        waterCoolerGraphics.fillStyle(0xe2e8f0, 1);
        waterCoolerGraphics.fillRoundedRect(4, 20, 24, 36, 3);
        waterCoolerGraphics.fillStyle(0x63b3ed, 1);
        waterCoolerGraphics.fillRoundedRect(8, 0, 16, 24, 8); // water bottle
        waterCoolerGraphics.fillStyle(0x4299e1, 1);
        waterCoolerGraphics.fillRect(10, 4, 12, 16);
        waterCoolerGraphics.generateTexture('waterCooler', 32, 56);
        waterCoolerGraphics.destroy();

        // Whiteboard
        const whiteboardGraphics = this.make.graphics({ x: 0, y: 0 });
        whiteboardGraphics.fillStyle(0x718096, 1);
        whiteboardGraphics.fillRect(0, 0, 80, 48);
        whiteboardGraphics.fillStyle(0xffffff, 1);
        whiteboardGraphics.fillRect(4, 4, 72, 40);
        whiteboardGraphics.lineStyle(1, 0x3182ce, 1);
        whiteboardGraphics.lineBetween(20, 15, 60, 20);
        whiteboardGraphics.lineBetween(15, 25, 50, 30);
        whiteboardGraphics.generateTexture('whiteboard', 80, 48);
        whiteboardGraphics.destroy();

        // Meeting table (large)
        const meetingTableGraphics = this.make.graphics({ x: 0, y: 0 });
        meetingTableGraphics.fillStyle(0x5c3d0e, 1);
        meetingTableGraphics.fillRoundedRect(0, 0, 96, 48, 4);
        meetingTableGraphics.fillStyle(0x744210, 1);
        meetingTableGraphics.fillRoundedRect(4, 4, 88, 40, 2);
        meetingTableGraphics.generateTexture('meetingTable', 96, 48);
        meetingTableGraphics.destroy();

        // Rug
        const rugGraphics = this.make.graphics({ x: 0, y: 0 });
        rugGraphics.fillStyle(0x9f7aea, 1);
        rugGraphics.fillRoundedRect(0, 0, 96, 64, 4);
        rugGraphics.fillStyle(0x805ad5, 1);
        rugGraphics.fillRoundedRect(8, 8, 80, 48, 2);
        rugGraphics.generateTexture('rug', 96, 64);
        rugGraphics.destroy();

        // Window
        const windowGraphics = this.make.graphics({ x: 0, y: 0 });
        windowGraphics.fillStyle(0x4a5568, 1);
        windowGraphics.fillRect(0, 0, 48, 40);
        windowGraphics.fillStyle(0x90cdf4, 1);
        windowGraphics.fillRect(4, 4, 18, 14);
        windowGraphics.fillRect(26, 4, 18, 14);
        windowGraphics.fillRect(4, 22, 18, 14);
        windowGraphics.fillRect(26, 22, 18, 14);
        windowGraphics.generateTexture('window', 48, 40);
        windowGraphics.destroy();
    }

    create(): void {
        // Initialize space manager for multi-space support
        this.spaceManager = new SpaceManager(this);
        this.spaceManager.createTextures();

        // Initialize camera controller
        this.cameraController = new CameraController(this);
        this.cameraController.onZoomChange = (zoom) => {
            this.gameEvents?.onZoomChanged?.(zoom);
        };
        this.cameraController.onSpaceFocus = (gridPos) => {
            if (gridPos) {
                // Find project at this grid position
                const space = this.spaceManager.getAllSpaces().find(
                    s => s.project.gridPosition.row === gridPos.row &&
                        s.project.gridPosition.col === gridPos.col
                );
                if (space) {
                    this.activeProjectId = space.projectId;
                    this.gameEvents?.onSpaceChanged?.(space.projectId);
                }
            }
        };

        // Initialize thought bubble manager
        this.thoughtBubbleManager = new ThoughtBubbleManager(this);

        // Set up interaction key
        if (this.input.keyboard) {
            this.interactKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.E);
            // Disable global keyboard capture so input fields work normally
            this.input.keyboard.disableGlobalCapture();
        }

        // If projects were set before create(), initialize multi-space mode
        // Otherwise, create the legacy single-office environment
        if (this.projects.length > 0) {
            this.initializeMultiSpaceMode();
        } else {
            this.initializeSingleSpaceMode();
        }
    }

    // Initialize for multi-space mode (projects)
    private initializeMultiSpaceMode(): void {
        this.isMultiSpaceMode = true;

        // Create player at first project space
        const firstProject = this.projects[0];
        const worldPos = gridToWorldPosition(firstProject.gridPosition);
        this.player = new Player(this, worldPos.x + SPACE_WIDTH / 2, worldPos.y + SPACE_HEIGHT / 2);

        // Create spaces for each project
        this.projects.forEach(project => {
            const space = this.spaceManager.createSpace(project);
            // Add collision between player and furniture
            this.physics.add.collider(this.player, space.furniture);
            // Add collision between agents
            space.agents.forEach((agent, i) => {
                space.agents.slice(i + 1).forEach(otherAgent => {
                    this.physics.add.collider(agent, otherAgent);
                });
                this.physics.add.collider(this.player, agent);
            });
        });

        // Collect all agents from spaces
        this.agents = [];
        this.spaceManager.getAllSpaces().forEach(space => {
            this.agents.push(...space.agents);
        });

        // Update world bounds based on spaces
        const bounds = this.spaceManager.getWorldBounds();
        this.physics.world.setBounds(0, 0, bounds.width, bounds.height);
        this.cameraController.setBounds(bounds.width, bounds.height);

        // Focus on first project
        if (this.projects.length > 0) {
            this.activeProjectId = this.projects[0].id;
            this.cameraController.focusOnGridPosition(this.projects[0].gridPosition, false);
        }
    }

    // Initialize for single-space mode (legacy, no projects)
    private initializeSingleSpaceMode(): void {
        this.isMultiSpaceMode = false;

        // Set world bounds
        this.physics.world.setBounds(0, 0, this.WORLD_WIDTH, this.WORLD_HEIGHT);

        // Initialize navigation system
        this.navigation = new Navigation(this.WORLD_WIDTH, this.WORLD_HEIGHT, this.NAV_TILE_SIZE);
        this.navigation.markPerimeterWalls(this.TILE_SIZE);

        // Create the environment (this also sets up navigation obstacles)
        this.createEnvironment();

        // Create player in center
        this.player = new Player(this, this.WORLD_WIDTH / 2, this.WORLD_HEIGHT / 2);

        // Create agents at their dedicated desks (at chair positions)
        const agentPositions = [
            { x: 120, y: 190 },   // Luna - desk row 1, position 1
            { x: 220, y: 190 },   // Max - desk row 1, position 2
            { x: 320, y: 340 },   // Sage - desk row 2, position 3
            { x: 500, y: 290 },   // Rex - center desk
        ];

        AGENT_PERSONALITIES.forEach((personality, index) => {
            const pos = agentPositions[index];
            const agent = new Agent(this, pos.x, pos.y, personality);
            agent.setNavigation(this.navigation);
            this.agents.push(agent);
        });

        // Set up camera
        this.cameras.main.setBounds(0, 0, this.WORLD_WIDTH, this.WORLD_HEIGHT);
        this.cameraController.setFollowTarget(this.player);

        // Add collision between agents
        this.agents.forEach((agent, i) => {
            this.agents.slice(i + 1).forEach(otherAgent => {
                this.physics.add.collider(agent, otherAgent);
            });
            this.physics.add.collider(this.player, agent);
        });

        // Add collision between player/agents and furniture
        this.physics.add.collider(this.player, this.furniture);
        this.agents.forEach(agent => {
            this.physics.add.collider(agent, this.furniture);
        });
    }

    private createEnvironment(): void {
        // Create static furniture group for collisions
        this.furniture = this.physics.add.staticGroup();

        // Create floor tiles
        for (let x = 0; x < this.WORLD_WIDTH; x += this.TILE_SIZE) {
            for (let y = 0; y < this.WORLD_HEIGHT; y += this.TILE_SIZE) {
                this.add.image(x + this.TILE_SIZE / 2, y + this.TILE_SIZE / 2, 'floor');
            }
        }

        // Create walls around the perimeter (with collision)
        for (let x = 0; x < this.WORLD_WIDTH; x += this.TILE_SIZE) {
            this.furniture.create(x + this.TILE_SIZE / 2, this.TILE_SIZE / 2, 'wall');
            this.furniture.create(x + this.TILE_SIZE / 2, this.WORLD_HEIGHT - this.TILE_SIZE / 2, 'wall');
        }
        for (let y = this.TILE_SIZE; y < this.WORLD_HEIGHT - this.TILE_SIZE; y += this.TILE_SIZE) {
            this.furniture.create(this.TILE_SIZE / 2, y + this.TILE_SIZE / 2, 'wall');
            this.furniture.create(this.WORLD_WIDTH - this.TILE_SIZE / 2, y + this.TILE_SIZE / 2, 'wall');
        }

        // === WORKSTATION AREA (Left side) ===
        // Row 1 - Workstations
        this.addFurniture(120, 150, 'desk');
        this.add.image(120, 130, 'computer').setDepth(2); // No collision for small items on desk
        this.add.image(120, 190, 'chair').setDepth(1); // Chairs don't block (agents sit there)

        this.addFurniture(220, 150, 'desk');
        this.add.image(220, 130, 'computer').setDepth(2);
        this.add.image(220, 190, 'chair').setDepth(1);

        this.addFurniture(320, 150, 'desk');
        this.add.image(320, 130, 'computer').setDepth(2);
        this.add.image(320, 190, 'chair').setDepth(1);

        // Row 2 - Workstations
        this.addFurniture(120, 300, 'desk');
        this.add.image(120, 280, 'computer').setDepth(2);
        this.add.image(120, 340, 'chair').setDepth(1);

        this.addFurniture(220, 300, 'desk');
        this.add.image(220, 280, 'computer').setDepth(2);
        this.add.image(220, 340, 'chair').setDepth(1);

        this.addFurniture(320, 300, 'desk');
        this.add.image(320, 280, 'computer').setDepth(2);
        this.add.image(320, 340, 'chair').setDepth(1);

        // === MEETING ROOM AREA (Top right) ===
        this.addFurniture(750, 180, 'meetingTable');
        this.add.image(700, 140, 'chair').setDepth(1);
        this.add.image(750, 140, 'chair').setDepth(1);
        this.add.image(800, 140, 'chair').setDepth(1);
        this.add.image(700, 220, 'chair').setDepth(1).setAngle(180);
        this.add.image(750, 220, 'chair').setDepth(1).setAngle(180);
        this.add.image(800, 220, 'chair').setDepth(1).setAngle(180);
        this.addFurniture(900, 150, 'whiteboard');

        // === BREAK ROOM / LOUNGE AREA (Bottom right) ===
        this.add.image(800, 520, 'rug').setDepth(0); // Rug has no collision
        this.addFurniture(800, 480, 'couch');
        this.addFurniture(800, 560, 'coffeeTable');
        this.addFurniture(920, 450, 'waterCooler');

        // === LIBRARY / RESOURCE AREA (Bottom left) ===
        this.addFurniture(100, 550, 'bookshelf');
        this.addFurniture(160, 550, 'bookshelf');
        this.add.image(130, 620, 'chair').setDepth(1);

        // === DECORATIVE ELEMENTS ===
        // Plants around the office (with collision)
        this.addFurniture(70, 80, 'plant');
        this.addFurniture(930, 80, 'plant');
        this.addFurniture(70, 620, 'plant');
        this.addFurniture(450, 350, 'plant');
        this.addFurniture(600, 400, 'plant');

        // Windows along the top wall (no collision - on wall)
        this.add.image(200, 48, 'window').setDepth(1);
        this.add.image(400, 48, 'window').setDepth(1);
        this.add.image(600, 48, 'window').setDepth(1);

        // Extra desk area (center)
        this.addFurniture(500, 250, 'desk');
        this.add.image(500, 230, 'computer').setDepth(2);
        this.add.image(500, 290, 'chair').setDepth(1);

        // Add call station
        this.createCallStation();

        // Add title text
        this.add.text(500, 50, '🏢 AI Office', {
            fontSize: '24px',
            fontFamily: 'Arial',
            color: '#ffffff',
            stroke: '#000000',
            strokeThickness: 3,
        }).setOrigin(0.5).setDepth(200);

        // Add controls hint
        this.add.text(500, this.WORLD_HEIGHT - 30, 'WASD/Arrows to move • E to talk • Stand on 📞 to call', {
            fontSize: '14px',
            fontFamily: 'Arial',
            color: '#888888',
        }).setOrigin(0.5).setDepth(200);
    }

    // Helper to add furniture with collision and navigation blocking
    private addFurniture(x: number, y: number, texture: string, width?: number, height?: number): Phaser.Physics.Arcade.Sprite {
        const sprite = this.furniture.create(x, y, texture) as Phaser.Physics.Arcade.Sprite;
        sprite.setDepth(1);
        // Refresh the physics body to match the texture size
        sprite.refreshBody();

        // Mark as blocked in navigation grid (minimal padding)
        const w = width || sprite.width;
        const h = height || sprite.height;
        this.navigation.markBlocked(x, y, w, h);

        return sprite;
    }

    // Create the call station visual
    private createCallStation(): void {
        // Call station floor marker (circular area)
        const callStationGraphics = this.make.graphics({ x: 0, y: 0 });
        callStationGraphics.fillStyle(0x38a169, 0.3);
        callStationGraphics.fillCircle(50, 50, 45);
        callStationGraphics.lineStyle(2, 0x38a169, 0.8);
        callStationGraphics.strokeCircle(50, 50, 45);
        callStationGraphics.generateTexture('callStation', 100, 100);
        callStationGraphics.destroy();

        // Add call station marker to the scene
        this.add.image(this.CALL_STATION.x, this.CALL_STATION.y, 'callStation').setDepth(0);

        // Add phone icon
        this.add.text(this.CALL_STATION.x, this.CALL_STATION.y - 10, '📞', {
            fontSize: '24px',
        }).setOrigin(0.5).setDepth(1);

        // Add label
        this.add.text(this.CALL_STATION.x, this.CALL_STATION.y + 25, 'Call Station', {
            fontSize: '10px',
            fontFamily: 'Arial',
            color: '#38a169',
        }).setOrigin(0.5).setDepth(1);
    }

    update(time: number, delta: number): void {
        // Update player
        this.player.update();

        // Update agents (both single-space and multi-space)
        if (this.isMultiSpaceMode) {
            this.spaceManager.update(time, delta);
        } else {
            this.agents.forEach(agent => {
                agent.update(time, delta);
            });
        }

        // Update thought bubbles (follow agents)
        this.thoughtBubbleManager.update();

        // Update camera controller
        this.cameraController?.update();

        // Check proximity to agents
        this.checkAgentProximity();

        // Check if player is at call station (only in single-space mode)
        if (!this.isMultiSpaceMode) {
            this.checkCallStation();
        }

        // Check for interaction input
        if (this.interactKey && Phaser.Input.Keyboard.JustDown(this.interactKey)) {
            if (this.nearestAgent && !this.isPlayerInteracting) {
                this.gameEvents?.onInteractRequest(this.nearestAgent.agentId);
            }
        }

        // In multi-space mode, detect which space the player is in
        if (this.isMultiSpaceMode) {
            const playerPos = this.player.getPosition();
            const currentSpace = this.spaceManager.getSpaceAtPosition(playerPos.x, playerPos.y);
            if (currentSpace && currentSpace.projectId !== this.activeProjectId) {
                this.activeProjectId = currentSpace.projectId;
                this.gameEvents?.onSpaceChanged?.(currentSpace.projectId);
            }
        }
    }

    private checkCallStation(): void {
        const playerPos = this.player.getPosition();
        const distanceToStation = Phaser.Math.Distance.Between(
            playerPos.x, playerPos.y,
            this.CALL_STATION.x, this.CALL_STATION.y
        );

        const wasAtCallStation = this.isAtCallStation;
        this.isAtCallStation = distanceToStation < this.CALL_STATION_RADIUS;

        if (this.isAtCallStation && !wasAtCallStation && !this.isPlayerInteracting) {
            this.gameEvents?.onEnterCallStation();
        } else if (!this.isAtCallStation && wasAtCallStation) {
            this.gameEvents?.onLeaveCallStation();
        }
    }

    private checkAgentProximity(): void {
        const playerPos = this.player.getPosition();
        let closestAgent: Agent | null = null;
        let closestDistance = Infinity;

        this.agents.forEach(agent => {
            const distance = agent.getDistanceToPlayer(playerPos.x, playerPos.y);
            if (distance < this.INTERACTION_DISTANCE && distance < closestDistance) {
                closestAgent = agent;
                closestDistance = distance;
            }
        });

        if (closestAgent !== this.nearestAgent) {
            this.nearestAgent = closestAgent;

            if (closestAgent) {
                this.gameEvents?.onNearAgent((closestAgent as Agent).agentId, closestDistance);
            } else {
                this.gameEvents?.onLeaveAgent();
            }
        } else if (closestAgent) {
            // Update distance for UI
            this.gameEvents?.onNearAgent((closestAgent as Agent).agentId, closestDistance);
        }
    }

    getNearestAgent(): Agent | null {
        return this.nearestAgent;
    }

    // === ORCHESTRATOR METHODS ===

    // Get an agent by ID
    getAgentById(agentId: string): Agent | undefined {
        return this.agents.find(a => a.agentId === agentId);
    }

    // Get agent position
    getAgentPosition(agentId: string): { x: number; y: number } | null {
        const agent = this.getAgentById(agentId);
        return agent ? agent.getPosition() : null;
    }

    // Set agent state
    setAgentState(agentId: string, state: AgentState): void {
        const agent = this.getAgentById(agentId);
        if (agent) {
            agent.setAgentState(state);
        }
    }

    // Walk an agent to another agent's position
    walkAgentToAgent(walkerId: string, targetId: string): Promise<void> {
        return new Promise((resolve) => {
            const walker = this.getAgentById(walkerId);
            const target = this.getAgentById(targetId);

            if (!walker || !target) {
                resolve();
                return;
            }

            const targetPos = target.getPosition();

            // Fire event
            this.gameEvents?.onAgentStartedWalking?.(walkerId, targetId);

            // Walk to near the target (offset to not overlap)
            walker.walkTo(targetPos.x + 30, targetPos.y, () => {
                this.gameEvents?.onAgentArrivedAtAgent?.(walkerId, targetId);
                resolve();
            });
        });
    }

    // Teleport an agent instantly to another agent's position
    teleportAgentToAgent(agentId: string, targetId: string): void {
        const agent = this.getAgentById(agentId);
        const target = this.getAgentById(targetId);

        if (!agent || !target) {
            return;
        }

        const targetPos = target.getPosition();
        // Teleport next to target (offset to not overlap)
        agent.setPosition(targetPos.x + 40, targetPos.y);
        agent.setVelocity(0, 0);
    }

    // Return agent to their desk
    returnAgentToDesk(agentId: string): Promise<void> {
        return new Promise((resolve) => {
            const agent = this.getAgentById(agentId);

            if (!agent) {
                resolve();
                return;
            }

            this.gameEvents?.onAgentStartedReturning?.(agentId);

            agent.returnToDesk();

            // Wait for agent to reach desk (estimate based on distance)
            const homePos = agent.getHomePosition();
            const currentPos = agent.getPosition();
            const distance = Phaser.Math.Distance.Between(
                currentPos.x, currentPos.y,
                homePos.x, homePos.y
            );

            // Estimate time based on agent speed (roughly 60px/s on average)
            const estimatedTime = Math.max(500, (distance / 60) * 1000 + 200);

            setTimeout(resolve, estimatedTime);
        });
    }

    // === THOUGHT BUBBLE METHODS ===

    // Show a thought bubble for an agent
    showThoughtBubble(
        bubbleId: string,
        agentId: string,
        content?: string,
        depth: number = 0
    ): void {
        const agent = this.getAgentById(agentId);
        if (agent) {
            this.thoughtBubbleManager.createBubbleForAgent(bubbleId, agent, content, depth);
        }
    }

    // Update thought bubble content
    updateThoughtBubble(bubbleId: string, content: string): void {
        this.thoughtBubbleManager.updateBubbleContent(bubbleId, content);
    }

    // Hide a thought bubble
    hideThoughtBubble(bubbleId: string): void {
        this.thoughtBubbleManager.removeBubble(bubbleId);
    }

    // Hide all thought bubbles
    hideAllThoughtBubbles(): void {
        this.thoughtBubbleManager.removeAllBubbles();
    }

    // Return all agents to their desks
    returnAllAgentsToDesks(): void {
        this.agents.forEach(agent => {
            if (agent.getAgentState() !== 'working') {
                agent.returnToDesk();
            }
        });
        this.hideAllThoughtBubbles();
    }
}
