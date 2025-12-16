// AI Agent character class
import Phaser from 'phaser';
import { AgentPersonality } from '../agents/personalities';
import { Navigation } from './Navigation';

export type AgentState = 'idle' | 'walking' | 'talking' | 'working' | 'consulting';

export class Agent extends Phaser.Physics.Arcade.Sprite {
    public agentId: string;
    public personality: AgentPersonality;
    private agentState: AgentState = 'working';
    private moveTimer: number = 0;
    private moveDirection: { x: number; y: number } = { x: 0, y: 0 };
    private idleTimer: number = 0;
    private workTimer: number = 0;
    private speed: number = 60;
    private nameText!: Phaser.GameObjects.Text;
    private stateIndicator!: Phaser.GameObjects.Text;
    private homePosition: { x: number; y: number };
    private isReturningHome: boolean = false;
    private walkTarget: { x: number; y: number } | null = null;
    private onArriveCallback: (() => void) | null = null;
    private currentPath: { x: number; y: number }[] = [];
    private currentPathIndex: number = 0;
    private navigation: Navigation | null = null;

    constructor(scene: Phaser.Scene, x: number, y: number, personality: AgentPersonality) {
        super(scene, x, y, 'agent');

        this.agentId = personality.id;
        this.personality = personality;
        this.homePosition = { x, y }; // Store desk position as home

        scene.add.existing(this);
        scene.physics.add.existing(this);

        // Set up physics body
        this.setCollideWorldBounds(true);
        this.setSize(24, 24);
        this.setOffset(4, 8);
        this.setTint(personality.color);

        // Adjust speed based on movement style
        switch (personality.movementStyle) {
            case 'energetic':
                this.speed = 90;
                break;
            case 'calm':
                this.speed = 40;
                break;
            case 'wanderer':
                this.speed = 50;
                break;
            case 'stationary':
                this.speed = 0;
                break;
        }

        // Create name label
        this.nameText = scene.add.text(x, y - 25, personality.name, {
            fontSize: '12px',
            fontFamily: 'Arial',
            color: personality.colorHex,
            stroke: '#000000',
            strokeThickness: 2,
        });
        this.nameText.setOrigin(0.5, 0.5);
        this.nameText.setDepth(100);

        // Create state indicator
        this.stateIndicator = scene.add.text(x, y - 38, '💻', {
            fontSize: '10px',
            fontFamily: 'Arial',
            color: '#ffffff',
            stroke: '#000000',
            strokeThickness: 2,
        });
        this.stateIndicator.setOrigin(0.5, 0.5);
        this.stateIndicator.setDepth(100);

        // Start working at desk for a random duration
        this.workTimer = Phaser.Math.Between(8000, 15000);
    }

    setAgentState(newState: AgentState): void {
        this.agentState = newState;
        this.isReturningHome = false;

        if (newState === 'talking') {
            this.setVelocity(0, 0);
            this.stateIndicator.setText('💬');
        } else if (newState === 'idle') {
            this.setVelocity(0, 0);
            this.stateIndicator.setText('');
        } else if (newState === 'working') {
            this.setVelocity(0, 0);
            this.stateIndicator.setText('💻');
            this.workTimer = Phaser.Math.Between(8000, 15000);
        } else if (newState === 'consulting') {
            this.setVelocity(0, 0);
            this.stateIndicator.setText('🤔');
        } else if (newState === 'walking') {
            this.stateIndicator.setText('🚶');
        } else {
            this.stateIndicator.setText('');
        }
    }

    getAgentState(): AgentState {
        return this.agentState;
    }

    // Set navigation system reference
    setNavigation(nav: Navigation): void {
        this.navigation = nav;
    }

    // Walk to a target position using pathfinding
    walkTo(targetX: number, targetY: number, onArrive?: () => void): void {
        this.walkTarget = { x: targetX, y: targetY };
        this.onArriveCallback = onArrive || null;
        this.stateIndicator.setText('🚶');

        // Disable collision with furniture while walking (agent passes through)
        const body = this.body as Phaser.Physics.Arcade.Body;
        if (body) {
            body.checkCollision.none = true;
        }

        if (this.navigation) {
            // Use pathfinding
            this.navigation.findPath(this.x, this.y, targetX, targetY, (path) => {
                if (path && path.length > 0) {
                    this.currentPath = path;
                    this.currentPathIndex = 0;
                    this.agentState = 'walking';
                } else {
                    // No path found, try direct movement
                    this.currentPath = [{ x: targetX, y: targetY }];
                    this.currentPathIndex = 0;
                    this.agentState = 'walking';
                }
            });
        } else {
            // No navigation, direct path
            this.currentPath = [{ x: targetX, y: targetY }];
            this.currentPathIndex = 0;
            this.agentState = 'walking';
        }
    }

    update(time: number, delta: number): void {
        // Update label positions
        this.nameText.setPosition(this.x, this.y - 25);
        this.stateIndicator.setPosition(this.x, this.y - 38);

        // Don't move while talking
        if (this.agentState === 'talking') {
            this.setVelocity(0, 0);
            return;
        }

        // Working at desk - stay stationary
        if (this.agentState === 'working') {
            this.setVelocity(0, 0);
            return;
        }

        // Idle state - stay stationary at current position
        if (this.agentState === 'idle') {
            this.setVelocity(0, 0);
            return;
        }

        // Consulting state - stay stationary (being consulted)
        if (this.agentState === 'consulting') {
            this.setVelocity(0, 0);
            return;
        }

        // Walking state - follow path
        if (this.agentState === 'walking') {
            this.followPath();
        }
    }

    // Follow the current path
    private followPath(): void {
        if (this.currentPath.length === 0 || this.currentPathIndex >= this.currentPath.length) {
            // Path complete
            this.arriveAtDestination();
            return;
        }

        const target = this.currentPath[this.currentPathIndex];
        const distance = Phaser.Math.Distance.Between(this.x, this.y, target.x, target.y);

        if (distance < 8) {
            // Reached current waypoint, move to next
            this.currentPathIndex++;

            if (this.currentPathIndex >= this.currentPath.length) {
                // Reached final destination
                this.arriveAtDestination();
            }
        } else {
            // Move towards current waypoint
            const angle = Phaser.Math.Angle.Between(this.x, this.y, target.x, target.y);
            this.setVelocity(Math.cos(angle) * this.speed, Math.sin(angle) * this.speed);
        }
    }

    // Called when agent arrives at destination
    private arriveAtDestination(): void {
        this.setVelocity(0, 0);
        this.currentPath = [];
        this.currentPathIndex = 0;

        // Re-enable collision
        const body = this.body as Phaser.Physics.Arcade.Body;
        if (body) {
            body.checkCollision.none = false;
        }

        if (this.onArriveCallback) {
            const callback = this.onArriveCallback;
            this.onArriveCallback = null;
            this.walkTarget = null;
            this.setAgentState('idle');
            callback();
        } else if (this.isReturningHome) {
            // Returned to desk
            this.isReturningHome = false;
            this.setPosition(this.homePosition.x, this.homePosition.y);
            this.setAgentState('working');
        } else {
            this.setAgentState('idle');
        }
    }

    // Method to make agent return to their desk
    returnToDesk(): void {
        this.isReturningHome = true;
        this.stateIndicator.setText('🚶');
        this.walkTo(this.homePosition.x, this.homePosition.y, () => {
            this.isReturningHome = false;
            this.setAgentState('working');
        });
    }

    private chooseNewDirection(): void {
        const directions = [
            { x: 1, y: 0 },
            { x: -1, y: 0 },
            { x: 0, y: 1 },
            { x: 0, y: -1 },
            { x: 0.707, y: 0.707 },
            { x: -0.707, y: 0.707 },
            { x: 0.707, y: -0.707 },
            { x: -0.707, y: -0.707 },
        ];

        this.moveDirection = Phaser.Math.RND.pick(directions);
    }

    getDistanceToPlayer(playerX: number, playerY: number): number {
        return Phaser.Math.Distance.Between(this.x, this.y, playerX, playerY);
    }

    // Get current position
    getPosition(): { x: number; y: number } {
        return { x: this.x, y: this.y };
    }

    // Get home (desk) position
    getHomePosition(): { x: number; y: number } {
        return { ...this.homePosition };
    }

    // Set home position (for multi-space support)
    setHomePosition(x: number, y: number): void {
        this.homePosition = { x, y };
    }

    destroy(fromScene?: boolean): void {
        this.nameText.destroy();
        this.stateIndicator.destroy();
        super.destroy(fromScene);
    }
}
