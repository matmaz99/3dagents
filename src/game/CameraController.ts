// CameraController - Handles zoom and pan for multi-space navigation
import Phaser from 'phaser';
import {
    SPACE_WIDTH,
    SPACE_HEIGHT,
    SPACE_GAP,
    gridToWorldPosition,
    GridPosition,
} from '@/types/project';

export interface CameraControllerConfig {
    minZoom: number;
    maxZoom: number;
    panSpeed: number;
    zoomSpeed: number;
}

const DEFAULT_CONFIG: CameraControllerConfig = {
    minZoom: 0.3,
    maxZoom: 1.5,
    panSpeed: 10,
    zoomSpeed: 0.1,
};

export class CameraController {
    private scene: Phaser.Scene;
    private camera: Phaser.Cameras.Scene2D.Camera;
    private config: CameraControllerConfig;
    private isDragging: boolean = false;
    private dragStartX: number = 0;
    private dragStartY: number = 0;
    private cameraStartX: number = 0;
    private cameraStartY: number = 0;
    private targetZoom: number = 1;
    private followTarget: Phaser.GameObjects.GameObject | null = null;
    private isFollowing: boolean = true;
    private focusedSpace: { x: number; y: number } | null = null;

    // Event callbacks
    public onZoomChange?: (zoom: number) => void;
    public onSpaceFocus?: (gridPosition: GridPosition | null) => void;

    constructor(
        scene: Phaser.Scene,
        config: Partial<CameraControllerConfig> = {}
    ) {
        this.scene = scene;
        this.camera = scene.cameras.main;
        this.config = { ...DEFAULT_CONFIG, ...config };
        this.targetZoom = this.camera.zoom;

        this.setupInputHandlers();
    }

    private setupInputHandlers(): void {
        // Mouse wheel for zoom
        this.scene.input.on('wheel', (
            pointer: Phaser.Input.Pointer,
            gameObjects: Phaser.GameObjects.GameObject[],
            deltaX: number,
            deltaY: number
        ) => {
            this.handleZoom(deltaY, pointer.worldX, pointer.worldY);
        });

        // Middle mouse button or right click for pan
        this.scene.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
            if (pointer.middleButtonDown() || pointer.rightButtonDown()) {
                this.startDrag(pointer.x, pointer.y);
            }
        });

        this.scene.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
            if (this.isDragging) {
                this.updateDrag(pointer.x, pointer.y);
            }
        });

        this.scene.input.on('pointerup', (pointer: Phaser.Input.Pointer) => {
            if (this.isDragging) {
                this.endDrag();
            }
        });

        // Double click to focus on space
        let lastClickTime = 0;
        this.scene.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
            if (pointer.leftButtonDown()) {
                const now = Date.now();
                if (now - lastClickTime < 300) {
                    // Double click detected
                    this.handleDoubleClick(pointer.worldX, pointer.worldY);
                }
                lastClickTime = now;
            }
        });

        // Prevent context menu
        this.scene.game.canvas.addEventListener('contextmenu', (e) => {
            e.preventDefault();
        });
    }

    private handleZoom(deltaY: number, worldX: number, worldY: number): void {
        // Calculate new zoom level
        const zoomDelta = deltaY > 0 ? -this.config.zoomSpeed : this.config.zoomSpeed;
        const newZoom = Phaser.Math.Clamp(
            this.camera.zoom + zoomDelta,
            this.config.minZoom,
            this.config.maxZoom
        );

        if (newZoom !== this.camera.zoom) {
            // Zoom towards mouse position
            const preZoomX = worldX;
            const preZoomY = worldY;

            this.camera.zoom = newZoom;
            this.targetZoom = newZoom;

            // Adjust camera position to zoom towards cursor
            const postZoomX = this.camera.getWorldPoint(
                this.scene.input.activePointer.x,
                this.scene.input.activePointer.y
            ).x;
            const postZoomY = this.camera.getWorldPoint(
                this.scene.input.activePointer.x,
                this.scene.input.activePointer.y
            ).y;

            this.camera.scrollX += preZoomX - postZoomX;
            this.camera.scrollY += preZoomY - postZoomY;

            // Stop following when zooming out
            if (newZoom < 0.8) {
                this.stopFollowing();
            }

            this.onZoomChange?.(newZoom);
        }
    }

    private startDrag(x: number, y: number): void {
        this.isDragging = true;
        this.dragStartX = x;
        this.dragStartY = y;
        this.cameraStartX = this.camera.scrollX;
        this.cameraStartY = this.camera.scrollY;

        // Stop following when dragging
        this.stopFollowing();
    }

    private updateDrag(x: number, y: number): void {
        const dx = (this.dragStartX - x) / this.camera.zoom;
        const dy = (this.dragStartY - y) / this.camera.zoom;

        this.camera.scrollX = this.cameraStartX + dx;
        this.camera.scrollY = this.cameraStartY + dy;
    }

    private endDrag(): void {
        this.isDragging = false;
    }

    private handleDoubleClick(worldX: number, worldY: number): void {
        // Calculate which grid cell was clicked
        const gridCol = Math.floor(worldX / (SPACE_WIDTH + SPACE_GAP));
        const gridRow = Math.floor(worldY / (SPACE_HEIGHT + SPACE_GAP));

        // Check if click is within a space (not in the gap)
        const localX = worldX - gridCol * (SPACE_WIDTH + SPACE_GAP);
        const localY = worldY - gridRow * (SPACE_HEIGHT + SPACE_GAP);

        if (localX >= 0 && localX < SPACE_WIDTH && localY >= 0 && localY < SPACE_HEIGHT) {
            this.focusOnGridPosition({ row: gridRow, col: gridCol });
        }
    }

    // Focus camera on a specific grid position
    focusOnGridPosition(gridPosition: GridPosition, animate: boolean = true): void {
        const worldPos = gridToWorldPosition(gridPosition);
        const centerX = worldPos.x + SPACE_WIDTH / 2;
        const centerY = worldPos.y + SPACE_HEIGHT / 2;

        this.focusedSpace = { x: centerX, y: centerY };
        this.stopFollowing();

        if (animate) {
            // Animate zoom and pan
            this.scene.tweens.add({
                targets: this.camera,
                zoom: 1,
                scrollX: centerX - this.camera.width / 2,
                scrollY: centerY - this.camera.height / 2,
                duration: 500,
                ease: 'Power2',
                onComplete: () => {
                    this.targetZoom = 1;
                    this.onZoomChange?.(1);
                    this.onSpaceFocus?.(gridPosition);
                },
            });
        } else {
            this.camera.zoom = 1;
            this.camera.scrollX = centerX - this.camera.width / 2;
            this.camera.scrollY = centerY - this.camera.height / 2;
            this.targetZoom = 1;
            this.onZoomChange?.(1);
            this.onSpaceFocus?.(gridPosition);
        }
    }

    // Set a target for the camera to follow
    setFollowTarget(target: Phaser.GameObjects.GameObject | null): void {
        this.followTarget = target;
        if (target) {
            this.isFollowing = true;
            this.focusedSpace = null;
            this.camera.startFollow(target, true, 0.1, 0.1);
        } else {
            this.isFollowing = false;
            this.camera.stopFollow();
        }
    }

    // Stop following any target
    stopFollowing(): void {
        this.isFollowing = false;
        this.camera.stopFollow();
    }

    // Resume following the target
    resumeFollowing(): void {
        if (this.followTarget) {
            this.isFollowing = true;
            this.focusedSpace = null;
            this.camera.startFollow(this.followTarget, true, 0.1, 0.1);
        }
    }

    // Zoom out to see all spaces
    zoomOut(): void {
        this.stopFollowing();

        this.scene.tweens.add({
            targets: this.camera,
            zoom: this.config.minZoom + 0.2,
            duration: 500,
            ease: 'Power2',
            onComplete: () => {
                this.targetZoom = this.config.minZoom + 0.2;
                this.onZoomChange?.(this.targetZoom);
            },
        });
    }

    // Zoom in to default level
    zoomIn(): void {
        this.scene.tweens.add({
            targets: this.camera,
            zoom: 1,
            duration: 500,
            ease: 'Power2',
            onComplete: () => {
                this.targetZoom = 1;
                this.onZoomChange?.(1);
            },
        });
    }

    // Set zoom level directly
    setZoom(zoom: number): void {
        const clampedZoom = Phaser.Math.Clamp(
            zoom,
            this.config.minZoom,
            this.config.maxZoom
        );
        this.camera.zoom = clampedZoom;
        this.targetZoom = clampedZoom;
        this.onZoomChange?.(clampedZoom);
    }

    // Get current zoom level
    getZoom(): number {
        return this.camera.zoom;
    }

    // Check if camera is following a target
    isFollowingTarget(): boolean {
        return this.isFollowing;
    }

    // Update camera bounds based on world size
    setBounds(width: number, height: number): void {
        this.camera.setBounds(0, 0, width, height);
    }

    // Center camera on a world position
    centerOn(x: number, y: number, animate: boolean = false): void {
        if (animate) {
            this.scene.tweens.add({
                targets: this.camera,
                scrollX: x - this.camera.width / 2,
                scrollY: y - this.camera.height / 2,
                duration: 300,
                ease: 'Power2',
            });
        } else {
            this.camera.scrollX = x - this.camera.width / 2;
            this.camera.scrollY = y - this.camera.height / 2;
        }
    }

    // Update method (call in scene update)
    update(): void {
        // Smooth zoom transition (if needed in future)
        // Currently instant zoom via mouse wheel
    }
}
