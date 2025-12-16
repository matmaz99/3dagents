// Player character class
import Phaser from 'phaser';

export class Player extends Phaser.Physics.Arcade.Sprite {
    private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
    private wasdKeys!: {
        W: Phaser.Input.Keyboard.Key;
        A: Phaser.Input.Keyboard.Key;
        S: Phaser.Input.Keyboard.Key;
        D: Phaser.Input.Keyboard.Key;
    };
    private speed: number = 160;
    private isInteracting: boolean = false;

    constructor(scene: Phaser.Scene, x: number, y: number) {
        super(scene, x, y, 'player');

        scene.add.existing(this);
        scene.physics.add.existing(this);

        // Set up physics body
        this.setCollideWorldBounds(true);
        this.setSize(24, 24);
        this.setOffset(4, 8);

        // Set up input
        if (scene.input.keyboard) {
            this.cursors = scene.input.keyboard.createCursorKeys();
            this.wasdKeys = {
                W: scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.W),
                A: scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.A),
                S: scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.S),
                D: scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.D),
            };
        }
    }

    setInteracting(value: boolean): void {
        this.isInteracting = value;
        if (value) {
            this.setVelocity(0, 0);
        }
    }

    update(): void {
        if (this.isInteracting) {
            return;
        }

        // Don't process movement if user is typing in an input field
        const activeElement = document.activeElement;
        if (activeElement && (activeElement.tagName === 'INPUT' || activeElement.tagName === 'TEXTAREA')) {
            this.setVelocity(0, 0);
            return;
        }

        const velocity = { x: 0, y: 0 };

        // Horizontal movement
        if (this.cursors?.left.isDown || this.wasdKeys?.A.isDown) {
            velocity.x = -this.speed;
        } else if (this.cursors?.right.isDown || this.wasdKeys?.D.isDown) {
            velocity.x = this.speed;
        }

        // Vertical movement
        if (this.cursors?.up.isDown || this.wasdKeys?.W.isDown) {
            velocity.y = -this.speed;
        } else if (this.cursors?.down.isDown || this.wasdKeys?.S.isDown) {
            velocity.y = this.speed;
        }

        // Normalize diagonal movement
        if (velocity.x !== 0 && velocity.y !== 0) {
            velocity.x *= 0.707;
            velocity.y *= 0.707;
        }

        this.setVelocity(velocity.x, velocity.y);
    }

    getPosition(): { x: number; y: number } {
        return { x: this.x, y: this.y };
    }
}
