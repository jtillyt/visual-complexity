import { Scene } from '@babylonjs/core/scene';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { Matrix, Vector3, Quaternion } from '@babylonjs/core/Maths/math.vector';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { GridSystem, CellType } from './GridSystem';
import "@babylonjs/core/Meshes/thinInstanceMesh";

/**
 * WindRenderer visualizes the wind as a stream of particles.
 * It uses Thin Instances to render thousands of dots flowing through wind cells.
 */
export class WindRenderer {
    private gridSystem: GridSystem;
    private scene: Scene;
    
    private dotMesh: Mesh;
    
    // Constants
    private readonly PARTICLES_PER_CELL = 8;
    private numInstances: number;
    
    // Buffers
    private matrices: Float32Array;
    private colors: Float32Array;
    
    // Local State
    private time: number = 0;

    constructor(gridSystem: GridSystem, scene: Scene) {
        this.gridSystem = gridSystem;
        this.scene = scene;
        this.numInstances = gridSystem.width * gridSystem.height * this.PARTICLES_PER_CELL;
        
        this.matrices = new Float32Array(this.numInstances * 16);
        this.colors = new Float32Array(this.numInstances * 4);

        this.dotMesh = this.createDotMesh();
        
        // Initial setup (hide everything)
        this.matrices.fill(0);
        this.dotMesh.thinInstanceSetBuffer("matrix", this.matrices, 16, false);
        
        // Register update loop
        this.scene.onBeforeRenderObservable.add(() => {
            this.animate();
        });
    }

    private createDotMesh(): Mesh {
        // Create a small flat plane (dot)
        const dot = MeshBuilder.CreatePlane("windDot", { size: 0.12 }, this.scene);
        
        // Rotate to lie on XZ plane
        dot.rotation.x = Math.PI / 2;
        // Bake this rotation into vertices so the mesh local axis aligns with world axis
        // This ensures instance translations (which are local to mesh) map directly to world coordinates
        dot.bakeCurrentTransformIntoVertices();
        
        const material = new StandardMaterial("windDotMat", this.scene);
        material.emissiveColor = new Color3(0.8, 0.9, 1.0);
        material.disableLighting = true;
        material.alpha = 0.8;
        dot.material = material;
        dot.useVertexColors = true;

        return dot;
    }

    public updateWindData(): void {
        // No heavy data pre-processing needed for particles since we calculate on the fly
        // in animate(). But we could optimize by flagging active cells if needed.
        // For now, checking cell type in animate loop is fast enough (900 cells).
    }

    private animate(): void {
        const dt = this.scene.getEngine().getDeltaTime() / 1000.0;
        this.time += dt;

        const width = this.gridSystem.width;
        const height = this.gridSystem.height;

        // Reusable objects
        const tempMatrix = Matrix.Identity();
        const translation = Vector3.Zero();
        const scaleVec = Vector3.Zero();
        const rotation = Quaternion.Identity(); // No rotation needed for dots usually

        // Base speed factor
        const speedMultiplier = 0.5;

        let instanceIdx = 0;

        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const cellType = this.gridSystem.getCell(x, y);
                
                // Process particles for this cell
                if (cellType === CellType.Wind) {
                    const config = this.gridSystem.getWindConfig(x, y);
                    const dx = config ? config.dx : 0;
                    const dy = config ? config.dy : 0;
                    const force = config ? config.force : 0;
                    
                    for (let p = 0; p < this.PARTICLES_PER_CELL; p++) {
                        // Pseudo-random seed based on index
                        // We want stable random positions so particles flow smoothly
                        // Seed: (cellIndex * 100 + p)
                        const seed = (y * width + x) * 100 + p;
                        const randX = Math.sin(seed) * 0.5 + 0.5; // 0..1
                        const randY = Math.cos(seed) * 0.5 + 0.5; // 0..1
                        
                        // Calculate Flow Position
                        // Pos = Start + Direction * Speed * Time
                        // Speed is proportional to Force
                        const travel = this.time * force * speedMultiplier;
                        
                        let u = randX + dx * travel;
                        let v = randY + dy * travel;
                        
                        // Wrap around 0..1
                        // JS % operator can be negative, so we handle that
                        u = u - Math.floor(u);
                        v = v - Math.floor(v);
                        
                        // Map to World Space
                        // Cell center is (x+0.5, y+0.5).
                        // Particle local space is -0.5 to 0.5 relative to center?
                        // Let's say u,v are 0..1 within the cell (x..x+1, y..y+1)
                        const worldX = x + u;
                        const worldZ = y + v;
                        
                        // Visual Settings
                        // Fade in/out at edges? Simple version first: constant.
                        // Variation in color?
                        // High force = brighter?
                        
                        translation.set(worldX, 0.15, worldZ); // Slightly above floor
                        scaleVec.setAll(1.0); 

                        // Update Matrix
                        Matrix.ComposeToRef(scaleVec, rotation, translation, tempMatrix);
                        tempMatrix.copyToArray(this.matrices, instanceIdx * 16);
                        
                        // Update Color
                        // White-ish blue. 
                        // Let's vary opacity based on life or just randomness
                        this.colors[instanceIdx * 4 + 0] = 0.6; // R
                        this.colors[instanceIdx * 4 + 1] = 0.9; // G
                        this.colors[instanceIdx * 4 + 2] = 1.0; // B
                        this.colors[instanceIdx * 4 + 3] = 0.8; // A
                        
                        instanceIdx++;
                    }
                } else {
                    // Hide unused particles for this cell
                    scaleVec.setAll(0);
                    Matrix.ComposeToRef(scaleVec, rotation, translation, tempMatrix);
                    
                    for (let p = 0; p < this.PARTICLES_PER_CELL; p++) {
                        tempMatrix.copyToArray(this.matrices, instanceIdx * 16);
                        instanceIdx++;
                    }
                }
            }
        }

        this.dotMesh.thinInstanceSetBuffer("matrix", this.matrices, 16, false);
        this.dotMesh.thinInstanceSetBuffer("color", this.colors, 4, false);
    }
}

