// Thought bubble visual for agent consultations
import Phaser from 'phaser';

export class ThoughtBubble extends Phaser.GameObjects.Container {
    private bubble: Phaser.GameObjects.Graphics;
    private text: Phaser.GameObjects.Text;
    private dots: Phaser.GameObjects.Text;
    private isThinking: boolean = true;
    private dotAnimation: Phaser.Time.TimerEvent | null = null;
    private dotCount: number = 1;
    private targetAgent: Phaser.GameObjects.Sprite | null = null;
    private offsetY: number = -55;

    constructor(
        scene: Phaser.Scene,
        x: number,
        y: number,
        content: string = '...',
        depth: number = 0
    ) {
        super(scene, x, y + (-55));
        scene.add.existing(this);

        // Create bubble background
        this.bubble = scene.add.graphics();
        this.add(this.bubble);

        // Create text
        this.text = scene.add.text(0, 0, '', {
            fontSize: '10px',
            fontFamily: 'Arial',
            color: '#333333',
            wordWrap: { width: 100 },
            align: 'center',
        });
        this.text.setOrigin(0.5, 0.5);
        this.text.setVisible(false);
        this.add(this.text);

        // Create thinking dots
        this.dots = scene.add.text(0, 0, '.', {
            fontSize: '14px',
            fontFamily: 'Arial',
            color: '#666666',
            fontStyle: 'bold',
        });
        this.dots.setOrigin(0.5, 0.5);
        this.add(this.dots);

        // Draw initial bubble
        this.drawBubble(40);

        // Set depth based on call depth
        this.setDepth(150 + depth);

        // Start with thinking animation
        this.startThinkingAnimation();

        // Entrance animation
        this.setScale(0);
        this.setAlpha(0);
        scene.tweens.add({
            targets: this,
            scale: 1,
            alpha: 1,
            duration: 200,
            ease: 'Back.easeOut',
        });

        // If content is provided and not dots, show it
        if (content && content !== '...') {
            this.setContent(content);
        }
    }

    private drawBubble(width: number): void {
        const height = 30;
        const padding = 8;

        this.bubble.clear();

        // Bubble fill with shadow
        this.bubble.fillStyle(0x000000, 0.1);
        this.bubble.fillRoundedRect(
            -width / 2 - padding + 2,
            -height / 2 - padding + 2,
            width + padding * 2,
            height + padding * 2,
            10
        );

        // Bubble fill
        this.bubble.fillStyle(0xffffff, 0.95);
        this.bubble.fillRoundedRect(
            -width / 2 - padding,
            -height / 2 - padding,
            width + padding * 2,
            height + padding * 2,
            10
        );

        // Bubble stroke
        this.bubble.lineStyle(2, 0xcccccc, 1);
        this.bubble.strokeRoundedRect(
            -width / 2 - padding,
            -height / 2 - padding,
            width + padding * 2,
            height + padding * 2,
            10
        );

        // Thought bubble connector dots
        const bubbleBottom = height / 2 + padding;

        this.bubble.fillStyle(0xffffff, 0.95);
        this.bubble.lineStyle(1.5, 0xcccccc, 1);

        // Dot 1
        this.bubble.fillCircle(0, bubbleBottom + 6, 4);
        this.bubble.strokeCircle(0, bubbleBottom + 6, 4);

        // Dot 2
        this.bubble.fillCircle(-4, bubbleBottom + 14, 3);
        this.bubble.strokeCircle(-4, bubbleBottom + 14, 3);
    }

    private startThinkingAnimation(): void {
        this.isThinking = true;
        this.dots.setVisible(true);
        this.text.setVisible(false);

        // Animate the dots
        this.dotAnimation = this.scene.time.addEvent({
            delay: 400,
            callback: () => {
                this.dotCount = (this.dotCount % 3) + 1;
                this.dots.setText('.'.repeat(this.dotCount));
            },
            loop: true,
        });
    }

    private stopThinkingAnimation(): void {
        if (this.dotAnimation) {
            this.dotAnimation.destroy();
            this.dotAnimation = null;
        }
        this.isThinking = false;
        this.dots.setVisible(false);
    }

    // Set the bubble content (switches from thinking to content)
    setContent(content: string): void {
        this.stopThinkingAnimation();

        // Truncate if too long
        const maxLength = 60;
        const displayContent = content.length > maxLength
            ? content.substring(0, maxLength - 3) + '...'
            : content;

        this.text.setText(displayContent);
        this.text.setVisible(true);

        // Adjust bubble width based on content
        const textWidth = Math.max(60, Math.min(120, displayContent.length * 6));
        this.drawBubble(textWidth);
    }

    // Attach to an agent sprite and follow it
    attachToAgent(agent: Phaser.GameObjects.Sprite): void {
        this.targetAgent = agent;
    }

    // Update position (call from scene update if attached to agent)
    updatePosition(): void {
        if (this.targetAgent) {
            this.setPosition(this.targetAgent.x, this.targetAgent.y + this.offsetY);
        }
    }

    // Fade out and destroy
    fadeOut(onComplete?: () => void): void {
        this.scene.tweens.add({
            targets: this,
            alpha: 0,
            scale: 0.8,
            duration: 300,
            ease: 'Power2',
            onComplete: () => {
                this.destroy();
                onComplete?.();
            },
        });
    }

    destroy(): void {
        this.stopThinkingAnimation();
        super.destroy();
    }
}

// Manager for multiple thought bubbles
export class ThoughtBubbleManager {
    private scene: Phaser.Scene;
    private bubbles: Map<string, ThoughtBubble> = new Map();

    constructor(scene: Phaser.Scene) {
        this.scene = scene;
    }

    // Create a new bubble
    createBubble(
        id: string,
        x: number,
        y: number,
        content?: string,
        depth: number = 0
    ): ThoughtBubble {
        // Remove existing bubble with same ID
        this.removeBubble(id);

        const bubble = new ThoughtBubble(this.scene, x, y, content, depth);
        this.bubbles.set(id, bubble);
        return bubble;
    }

    // Create and attach to an agent
    createBubbleForAgent(
        id: string,
        agent: Phaser.GameObjects.Sprite,
        content?: string,
        depth: number = 0
    ): ThoughtBubble {
        const bubble = this.createBubble(id, agent.x, agent.y, content, depth);
        bubble.attachToAgent(agent);
        return bubble;
    }

    // Get a bubble by ID
    getBubble(id: string): ThoughtBubble | undefined {
        return this.bubbles.get(id);
    }

    // Update bubble content
    updateBubbleContent(id: string, content: string): void {
        const bubble = this.bubbles.get(id);
        if (bubble) {
            bubble.setContent(content);
        }
    }

    // Remove a bubble with fade animation
    removeBubble(id: string, animate: boolean = true): void {
        const bubble = this.bubbles.get(id);
        if (bubble) {
            if (animate) {
                bubble.fadeOut(() => {
                    this.bubbles.delete(id);
                });
            } else {
                bubble.destroy();
                this.bubbles.delete(id);
            }
        }
    }

    // Remove all bubbles
    removeAllBubbles(animate: boolean = true): void {
        this.bubbles.forEach((bubble, id) => {
            if (animate) {
                bubble.fadeOut();
            } else {
                bubble.destroy();
            }
        });
        if (!animate) {
            this.bubbles.clear();
        }
    }

    // Update all bubble positions (call from scene update)
    update(): void {
        this.bubbles.forEach(bubble => {
            bubble.updatePosition();
        });
    }

    // Check if any bubbles exist
    hasBubbles(): boolean {
        return this.bubbles.size > 0;
    }
}
