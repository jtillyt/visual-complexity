import { Scene } from '@babylonjs/core/scene';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { Matrix, Vector3, Quaternion } from '@babylonjs/core/Maths/math.vector';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { GridSystem, CellType } from './GridSystem';
import "@babylonjs/core/Meshes/thinInstanceMesh";

/**
 * FlowRenderer visualizes the policy field as a grid of floating arrows.
 * Uses Babylon.js Thin Instances for high-performance rendering of 2500+ meshes.
 * Handles smooth interpolation (lerping) of arrow directions.
 */
export class FlowRenderer {
    private gridSystem: GridSystem;
    private scene: Scene;
    private arrowMesh: Mesh;
    
    private numInstances: number;
    private matrices: Float32Array;
    
    // Current and Target rotations for lerping
    private currentAngles: Float32Array;
    private targetAngles: Float32Array;
    
    // Visibility Scale (0 or 1)
    private scales: Float32Array;
    
    private colors: Float32Array; // Added for value visualization

    private lerpSpeed: number = 0.1;

    constructor(gridSystem: GridSystem, scene: Scene) {
        this.gridSystem = gridSystem;
        this.scene = scene;
        this.numInstances = gridSystem.width * gridSystem.height;
        
        this.matrices = new Float32Array(this.numInstances * 16);
        this.currentAngles = new Float32Array(this.numInstances);
        this.targetAngles = new Float32Array(this.numInstances);
        this.scales = new Float32Array(this.numInstances).fill(1);
        this.colors = new Float32Array(this.numInstances * 4); // RGBA
        
        this.arrowMesh = this.createArrowMesh();
        this.initializeInstances();
        
        // Register update loop for lerping
        this.scene.onBeforeRenderObservable.add(() => {
            this.animateArrows();
        });
    }

    private createArrowMesh(): Mesh {
        // Create a simple arrow pointing along +X (Right) as the default (Angle 0)
        const shaft = MeshBuilder.CreateCylinder("shaft", { height: 0.4, diameter: 0.05 }, this.scene);
        shaft.rotation.z = -Math.PI / 2; // Rotate from Y to X
        shaft.position.x = 0.2;

        const head = MeshBuilder.CreateCylinder("head", { height: 0.2, diameterTop: 0, diameterBottom: 0.15 }, this.scene);
        head.rotation.z = -Math.PI / 2; // Rotate from Y to X
        head.position.x = 0.5;

        const arrow = Mesh.MergeMeshes([shaft, head], true, true, undefined, false, true)!;
        arrow.name = "policyArrow";
        
        const material = new StandardMaterial("arrowMat", this.scene);
        material.emissiveColor = new Color3(1, 1, 1); // Base white for vertex colors
        material.disableLighting = true;
        arrow.material = material;
        arrow.useVertexColors = true; // Enable vertex colors
        
        return arrow;
    }

    private initializeInstances(): void {
        const width = this.gridSystem.width;
        const height = this.gridSystem.height;
        
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const index = y * width + x;
                const worldX = x + 0.5;
                const worldZ = y + 0.5;
                
                this.currentAngles[index] = 0;
                this.targetAngles[index] = 0;
                
                // Default color (Sky Aqua)
                this.colors[index * 4 + 0] = 0.3;
                this.colors[index * 4 + 1] = 0.79;
                this.colors[index * 4 + 2] = 0.94;
                this.colors[index * 4 + 3] = 1;

                this.updateMatrix(index, worldX, worldZ, 0, 1);
            }
        }
        
        this.arrowMesh.thinInstanceSetBuffer("matrix", this.matrices, 16, false);
        this.arrowMesh.thinInstanceSetBuffer("color", this.colors, 4, false);
    }

    private updateMatrix(index: number, x: number, z: number, angle: number, scale: number): void {
        const rotation = Quaternion.RotationAxis(Vector3.Up(), -angle); // Negate angle to match grid coordinates
        const matrix = Matrix.Compose(
            new Vector3(scale, scale, scale),
            rotation,
            new Vector3(x, 0.1, z) // Slightly above grid
        );
        matrix.copyToArray(this.matrices, index * 16);
    }

    /**
     * Smoothly interpolates the arrow rotation towards the target angle.
     */
    private animateArrows(): void {
        const width = this.gridSystem.width;
        let changed = false;

        for (let i = 0; i < this.numInstances; i++) {
            // Simple angle lerp
            let diff = this.targetAngles[i] - this.currentAngles[i];
            
            // Wrap around
            while (diff > Math.PI) diff -= Math.PI * 2;
            while (diff < -Math.PI) diff += Math.PI * 2;

            const scale = this.scales[i];

            // If scale is 0, we force an update once to hide it.
            // Ideally we track dirty state, but checking scale > 0 covers visible ones.
            // We just update if diff > epsilon or if scale is involved.
            if (Math.abs(diff) > 0.001 || scale > 0) {
                this.currentAngles[i] += diff * this.lerpSpeed;
                const x = i % width + 0.5;
                const z = Math.floor(i / width) + 0.5;
                this.updateMatrix(i, x, z, this.currentAngles[i], scale);
                changed = true;
            }
        }

        if (changed) {
            this.arrowMesh.thinInstanceBufferUpdated("matrix");
        }
    }

    /**
     * Update target directions and colors for the arrows based on value.
     * @param directions Array of angles in radians
     * @param values Array of value estimates
     * @param mode Solver mode to determine filtering
     */
    public updatePolicy(directions: Float32Array, values: Float32Array, mode: 'astar' | 'mdp'): void {
        if (directions.length !== this.numInstances) return;
        this.targetAngles.set(directions);

        // Normalize values for coloring
        let minVal = Infinity;
        let maxVal = -Infinity;
        for (let v of values) {
            if (v > maxVal) maxVal = v;
            if (v < minVal) minVal = v;
        }
        
        const range = maxVal - minVal || 1;

        for (let i = 0; i < this.numInstances; i++) {
            const x = i % this.gridSystem.width;
            const y = Math.floor(i / this.gridSystem.width);
            const cellType = this.gridSystem.getCell(x, y);

            // --- Visibility Logic ---
            let isVisible = true;
            
            // 1. Hard Rules (Never show on obstacles/hazards)
            if (cellType === CellType.Wall || cellType === CellType.Goal || cellType === CellType.Wind) {
                isVisible = false;
            } else {
                // 2. Mode Rules
                if (mode === 'astar') {
                    // Only show on path (Value ~= 1.0)
                    if (values[i] < 0.9) isVisible = false;
                }
                // MDP shows all remaining Empty cells
            }

            this.scales[i] = isVisible ? 1 : 0;
            
            // Force update matrix if we're hiding it now to ensure it disappears instantly
            if (!isVisible) {
                 const x = i % this.gridSystem.width + 0.5;
                 const z = Math.floor(i / this.gridSystem.width) + 0.5;
                 this.updateMatrix(i, x, z, this.currentAngles[i], 0);
            }

            // --- Color Logic ---
            const val = values[i];
            const t = (val - minVal) / range; // 0 to 1
            
            // Lerp from Raspberry Plum (Low) to Sky Aqua (High)
            // Plum: 0.71, 0.09, 0.62
            // Sky Aqua: 0.3, 0.79, 0.94
            
            const r = 0.71 + (0.3 - 0.71) * t;
            const g = 0.09 + (0.79 - 0.09) * t;
            const b = 0.62 + (0.94 - 0.62) * t;

            this.colors[i * 4 + 0] = r;
            this.colors[i * 4 + 1] = g;
            this.colors[i * 4 + 2] = b;
            this.colors[i * 4 + 3] = 1;
        }
        
        this.arrowMesh.thinInstanceBufferUpdated("color");
        this.arrowMesh.thinInstanceBufferUpdated("matrix"); // Force update for visibility changes
    }

    public dispose(): void {
        this.arrowMesh.dispose();
    }
}
