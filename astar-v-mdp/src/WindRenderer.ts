import { Scene } from '@babylonjs/core/scene';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { Matrix, Vector3, Quaternion } from '@babylonjs/core/Maths/math.vector';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Color3, Color4 } from '@babylonjs/core/Maths/math.color';
import { GridSystem, CellType } from './GridSystem';
import "@babylonjs/core/Meshes/thinInstanceMesh";

/**
 * WindRenderer visualizes the configured wind vectors using Fan models.
 * Renders a static housing and spinning blades indicating direction and force.
 */
export class WindRenderer {
    private gridSystem: GridSystem;
    private scene: Scene;
    
    private housingMesh!: Mesh;
    private bladeMesh!: Mesh;
    
    private numInstances: number;
    private matricesHousing: Float32Array;
    private matricesBlades: Float32Array;
    private colors: Float32Array;
    
    // Store wind data locally for animation
    private windData: Float32Array; // [dx, dy, force, active(0/1)] per cell

    private time: number = 0;

    constructor(gridSystem: GridSystem, scene: Scene) {
        this.gridSystem = gridSystem;
        this.scene = scene;
        this.numInstances = gridSystem.width * gridSystem.height;
        
        this.matricesHousing = new Float32Array(this.numInstances * 16);
        this.matricesBlades = new Float32Array(this.numInstances * 16);
        this.colors = new Float32Array(this.numInstances * 4);
        this.windData = new Float32Array(this.numInstances * 4);

        this.createMeshes();
        this.initializeInstances();
        
        // Register update loop for spinning/pulsing
        this.scene.onBeforeRenderObservable.add(() => {
            this.animate();
        });
    }

    private createMeshes(): void {
        // 1. Create Housing (Ring)
        // Oriented to face +X direction (Rotation 0)
        const ring = MeshBuilder.CreateTorus("fanHousing", {
            diameter: 0.8,
            thickness: 0.15,
            tessellation: 16
        }, this.scene);
        
        // Torus default lies on XZ. Rotate to lie on YZ (Facing X)
        ring.rotation.z = Math.PI / 2;
        
        const housingMat = new StandardMaterial("fanHousingMat", this.scene);
        housingMat.emissiveColor = new Color3(0.2, 0.4, 0.6); // Darker Blue structure
        housingMat.disableLighting = true;
        ring.material = housingMat;
        ring.useVertexColors = true; // Use instance colors

        this.housingMesh = ring;

        // 2. Create Blades (Propeller)
        // Two crossed boxes
        // They need to be in the YZ plane to face X.
        // Thickness in X.
        const blade1 = MeshBuilder.CreateBox("b1", { width: 0.05, height: 0.7, depth: 0.1 }, this.scene);
        const blade2 = MeshBuilder.CreateBox("b2", { width: 0.05, height: 0.1, depth: 0.7 }, this.scene);
        
        const propeller = Mesh.MergeMeshes([blade1, blade2], true, true, undefined, false, true)!;
        propeller.name = "fanBlades";
        
        const bladeMat = new StandardMaterial("fanBladeMat", this.scene);
        bladeMat.emissiveColor = new Color3(0.6, 0.9, 1.0); // Bright Cyan
        bladeMat.disableLighting = true;
        propeller.material = bladeMat;
        propeller.useVertexColors = true;

        this.bladeMesh = propeller;
    }

    private initializeInstances(): void {
        this.updateWindData(); // Initial population
    }

    /**
     * Scans the grid system and updates local wind data buffers.
     * Call this when the grid changes (paint).
     */
    public updateWindData(): void {
        const width = this.gridSystem.width;
        const height = this.gridSystem.height;
        
        // Base Color
        const color = new Color4(0.5, 0.8, 1.0, 1.0);

        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const index = y * width + x;
                const cellType = this.gridSystem.getCell(x, y);
                
                if (cellType === CellType.Wind) {
                    const config = this.gridSystem.getWindConfig(x, y);
                    if (config) {
                        // Store data
                        this.windData[index * 4 + 0] = config.dx;
                        this.windData[index * 4 + 1] = config.dy;
                        this.windData[index * 4 + 2] = config.force;
                        this.windData[index * 4 + 3] = 1; // Active

                        // Set Color
                        this.colors[index * 4 + 0] = color.r;
                        this.colors[index * 4 + 1] = color.g;
                        this.colors[index * 4 + 2] = color.b;
                        this.colors[index * 4 + 3] = color.a;
                    } else {
                        this.windData[index * 4 + 3] = 0;
                        this.colors[index * 4 + 3] = 0;
                    }
                } else {
                    this.windData[index * 4 + 3] = 0;
                    this.colors[index * 4 + 3] = 0;
                }
            }
        }

        // Update colors for both meshes
        this.housingMesh.thinInstanceSetBuffer("color", this.colors, 4);
        this.bladeMesh.thinInstanceSetBuffer("color", this.colors, 4);
    }

    private animate(): void {
        const dt = this.scene.getEngine().getDeltaTime() / 1000.0;
        this.time += dt;

        const width = this.gridSystem.width;

        // Reusable objects to avoid GC
        const translation = Vector3.Zero();
        const scale = Vector3.Zero();
        const housingRot = Quaternion.Identity();
        const spinRot = Quaternion.Identity();
        const bladeRot = Quaternion.Identity();
        const tempMatrix = Matrix.Identity();
        
        // Static vectors
        const up = Vector3.Up();
        const right = Vector3.Right();
        
        // Spin speed factor (radians per second)
        const baseSpinSpeed = 10.0; 

        for (let i = 0; i < this.numInstances; i++) {
            if (this.windData[i * 4 + 3] === 1) { // If active
                const dx = this.windData[i * 4 + 0];
                const dy = this.windData[i * 4 + 1];
                const force = this.windData[i * 4 + 2];
                
                const x = i % width;
                const y = Math.floor(i / width);
                const worldX = x + 0.5;
                const worldZ = y + 0.5;

                // 1. Directional Rotation (Housing & Blades)
                // Default points +X.
                const angle = Math.atan2(dy, dx);
                Quaternion.RotationAxisToRef(up, -angle, housingRot);

                // 2. Scale
                const baseScale = 0.6 + (force * 0.05); // Subtle size difference based on force
                scale.set(baseScale, baseScale, baseScale);
                
                // 3. Position (Hover slightly)
                translation.set(worldX, 0.5, worldZ); 

                // --- Build Housing Matrix ---
                Matrix.ComposeToRef(scale, housingRot, translation, tempMatrix);
                tempMatrix.copyToArray(this.matricesHousing, i * 16);

                // --- Build Blade Matrix ---
                // Spin around local X axis (since mesh faces X)
                // Spin speed increases with force
                const currentSpin = this.time * (baseSpinSpeed + force * 2.0);
                Quaternion.RotationAxisToRef(right, currentSpin, spinRot);
                
                // Combine rotations: Apply spin first (local), then direction (global)
                // Q_final = Q_direction * Q_spin
                housingRot.multiplyToRef(spinRot, bladeRot);
                
                Matrix.ComposeToRef(scale, bladeRot, translation, tempMatrix);
                tempMatrix.copyToArray(this.matricesBlades, i * 16);

            } else {
                // Set scale to 0 to hide
                scale.setAll(0);
                translation.setAll(0); // Optional, but keeps it clean
                
                // We can reuse the same zero matrix for both
                // Use housingRot (which might be dirty)? No, Identity is safer but ComposeToRef handles it.
                // Just use Identity rotation for zero matrix.
                Matrix.ComposeToRef(scale, housingRot, translation, tempMatrix); // Rotation doesn't matter if scale is 0
                
                tempMatrix.copyToArray(this.matricesHousing, i * 16);
                tempMatrix.copyToArray(this.matricesBlades, i * 16);
            }
        }

        this.housingMesh.thinInstanceSetBuffer("matrix", this.matricesHousing, 16, false);
        this.bladeMesh.thinInstanceSetBuffer("matrix", this.matricesBlades, 16, false);
    }
}
