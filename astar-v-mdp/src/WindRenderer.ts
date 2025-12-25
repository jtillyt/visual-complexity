import { Scene } from '@babylonjs/core/scene';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { Matrix, Vector3, Quaternion } from '@babylonjs/core/Maths/math.vector';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Color3, Color4 } from '@babylonjs/core/Maths/math.color';
import { GridSystem, CellType } from './GridSystem';
import "@babylonjs/core/Meshes/thinInstanceMesh";

/**
 * WindRenderer visualizes the configured wind vectors.
 * Renders light blue pulsating arrows indicating direction and force.
 */
export class WindRenderer {
    private gridSystem: GridSystem;
    private scene: Scene;
    private arrowMesh: Mesh;
    
    private numInstances: number;
    private matrices: Float32Array;
    private colors: Float32Array;
    
    // Store wind data locally for animation
    private windData: Float32Array; // [dx, dy, force, active(0/1)] per cell

    private time: number = 0;

    constructor(gridSystem: GridSystem, scene: Scene) {
        this.gridSystem = gridSystem;
        this.scene = scene;
        this.numInstances = gridSystem.width * gridSystem.height;
        
        this.matrices = new Float32Array(this.numInstances * 16);
        this.colors = new Float32Array(this.numInstances * 4);
        this.windData = new Float32Array(this.numInstances * 4);

        this.arrowMesh = this.createArrowMesh();
        this.initializeInstances();
        
        // Register update loop for pulsing
        this.scene.onBeforeRenderObservable.add(() => {
            this.animate();
        });
    }

    private createArrowMesh(): Mesh {
        // Create a stylized wind arrow (maybe simpler or different from policy arrow)
        // Let's use a similar shape but maybe longer shaft
        const shaft = MeshBuilder.CreateCylinder("windShaft", { height: 0.6, diameter: 0.08 }, this.scene);
        shaft.rotation.z = -Math.PI / 2; 
        shaft.position.x = 0.3;

        const head = MeshBuilder.CreateCylinder("windHead", { height: 0.3, diameterTop: 0, diameterBottom: 0.2 }, this.scene);
        head.rotation.z = -Math.PI / 2;
        head.position.x = 0.75;

        const arrow = Mesh.MergeMeshes([shaft, head], true, true, undefined, false, true)!;
        arrow.name = "windArrow";
        
        const material = new StandardMaterial("windMat", this.scene);
        material.emissiveColor = new Color3(0.5, 0.8, 1.0); // Light Blue
        material.disableLighting = true;
        arrow.material = material;
        arrow.useVertexColors = true; 
        
        return arrow;
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
        
        // Color is constant light blue
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
                        this.colors[index * 4 + 3] = 0; // Transparent
                    }
                } else {
                    this.windData[index * 4 + 3] = 0;
                    this.colors[index * 4 + 3] = 0; // Transparent
                }
            }
        }

        // We update matrices in animate(), but colors only need update here
        this.arrowMesh.thinInstanceSetBuffer("color", this.colors, 4);
    }

    private animate(): void {
        this.time += this.scene.getEngine().getDeltaTime() / 1000.0;
        const pulse = (Math.sin(this.time * 5.0) + 1) * 0.5; // 0 to 1

        const width = this.gridSystem.width;

        for (let i = 0; i < this.numInstances; i++) {
            if (this.windData[i * 4 + 3] === 1) { // If active
                const dx = this.windData[i * 4 + 0];
                const dy = this.windData[i * 4 + 1];
                const force = this.windData[i * 4 + 2];
                
                const x = i % width;
                const y = Math.floor(i / width);
                const worldX = x + 0.5;
                const worldZ = y + 0.5;

                // Calculate Rotation
                const angle = Math.atan2(dy, dx);
                const rotation = Quaternion.RotationAxis(Vector3.Up(), -angle);

                // Calculate Scale based on Force and Pulse
                // Base scale increases with force (logarithmic or linear?)
                // Force 1..10. 
                const baseScale = 0.5 + (force / 5.0); // 0.7 to 2.5
                const pulseScale = baseScale + (pulse * 0.2); // Pulse adds up to 0.2 size

                const matrix = Matrix.Compose(
                    new Vector3(pulseScale, pulseScale, pulseScale),
                    rotation,
                    new Vector3(worldX, 0.4, worldZ) // Higher than policy arrows (0.1)
                );
                
                matrix.copyToArray(this.matrices, i * 16);
            } else {
                // Ensure hidden instances stay hidden (scale 0)
                // If we don't update them every frame, they stay 0 from initialization
                // But initialization logic needs to set them to 0.
                // Let's just set 0 scale here to be safe if they were just turned off
                // Optimization: Track dirty state? No, 900 iterations is fast.
                
                // Set scale to 0
                const matrix = Matrix.Compose(
                    Vector3.Zero(),
                    Quaternion.Identity(),
                    Vector3.Zero()
                );
                matrix.copyToArray(this.matrices, i * 16);
                // Ideally we shouldn't iterate all if few are wind, but array is packed.
            }
        }

        this.arrowMesh.thinInstanceSetBuffer("matrix", this.matrices, 16, false);
    }
}
