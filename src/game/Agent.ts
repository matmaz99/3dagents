// AI Agent character class
import Phaser from 'phaser';
import { AgentPersonality } from '../agents/personalities';

export type AgentState = 'idle' | 'walking' | 'talking' | 'working';

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
        } else {
            this.stateIndicator.setText('');
        }
    }

    getAgentState(): AgentState {
        return this.agentState;
    }

    update(time: number, delta: number): void {
        // Update label positions
        this.nameText.setPosition(this.x, this.y - 25);
        this.stateIndicator.setPosition(this.x, this.y - 38);

        // Don't move while talking
        if (this.agentState === 'talking') {
            return;
        }

        // Working at desk - stay stationary
        if (this.agentState === 'working') {
            this.setVelocity(0, 0);
            // Agents stay at their desk working - no random movement
            return;
        }

        // Idle state - stay stationary at current position
        if (this.agentState === 'idle') {
            this.setVelocity(0, 0);
            return;
        }

        // Walking state (only used when explicitly triggered, not by default)
        if (this.agentState === 'walking') {
            this.moveTimer -= delta;

            if (this.moveTimer <= 0) {
                // Return to working state at home position
                this.returnToDesk();
            } else {
                // Keep moving
                this.setVelocity(this.moveDirection.x * this.speed, this.moveDirection.y * this.speed);
            }
        }
    }

    // Method to make agent return to their desk
    private returnToDesk(): void {
        const distanceToHome = Phaser.Math.Distance.Between(this.x, this.y, this.homePosition.x, this.homePosition.y);

        if (distanceToHome < 10) {
            // Close enough, snap to position and start working
            this.setPosition(this.homePosition.x, this.homePosition.y);
            this.setAgentState('working');
        } else {
            // Move towards home
            this.isReturningHome = true;
            const angle = Phaser.Math.Angle.Between(this.x, this.y, this.homePosition.x, this.homePosition.y);
            this.setVelocity(Math.cos(angle) * this.speed, Math.sin(angle) * this.speed);
            this.moveTimer = 100; // Small timer to keep checking
        }
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

    destroy(fromScene?: boolean): void {
        this.nameText.destroy();
        this.stateIndicator.destroy();
        super.destroy(fromScene);
    }
}
