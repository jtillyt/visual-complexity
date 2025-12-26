import { Scene } from '@babylonjs/core/scene';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { Matrix, Vector3, Quaternion } from '@babylonjs/core/Maths/math.vector';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { GridSystem, CellType } from './GridSystem';
import "@babylonjs/core/Meshes/thinInstanceMesh";

/**
 * WindRenderer visualizes the wind field.
 * 1. Renders "Fan" models at the wind source.
 * 2. Renders "Particle Streams" flowing through the wind field.
 */
export class WindRenderer {
    private gridSystem: GridSystem;
    private scene: Scene;
    
    // Meshes
    private housingMesh!: Mesh;
    private bladeMesh!: Mesh;
    private dotMesh!: Mesh;
    
    // Buffers
    private matricesHousing: Float32Array;
    private matricesBlades: Float32Array;
    private matricesParticles: Float32Array;
    private colorsParticles: Float32Array;
    
    // Constants
    private readonly PARTICLES_PER_CELL = 4;
    private numCells: number;
    
    private time: number = 0;

    constructor(gridSystem: GridSystem, scene: Scene) {
        this.gridSystem = gridSystem;
        this.scene = scene;
        this.numCells = gridSystem.width * gridSystem.height;
        
        // Allocate buffers
        this.matricesHousing = new Float32Array(this.numCells * 16);
        this.matricesBlades = new Float32Array(this.numCells * 16);
        this.matricesParticles = new Float32Array(this.numCells * this.PARTICLES_PER_CELL * 16);
        this.colorsParticles = new Float32Array(this.numCells * this.PARTICLES_PER_CELL * 4);

        this.createMeshes();
        
        // Register update loop
        this.scene.onBeforeRenderObservable.add(() => {
            this.animate();
        });
    }

    private createMeshes(): void {
        // --- 1. Fan Housing (Ring) ---
        const ring = MeshBuilder.CreateTorus("fanHousing", {
            diameter: 0.8,
            thickness: 0.15,
            tessellation: 16
        }, this.scene);
        ring.rotation.z = Math.PI / 2; // Face X
        
        const housingMat = new StandardMaterial("fanHousingMat", this.scene);
        housingMat.emissiveColor = new Color3(0.2, 0.4, 0.6); 
        housingMat.disableLighting = true;
        ring.material = housingMat;
        this.housingMesh = ring;

        // --- 2. Fan Blades (Propeller) ---
        const blade1 = MeshBuilder.CreateBox("b1", { width: 0.05, height: 0.7, depth: 0.1 }, this.scene);
        const blade2 = MeshBuilder.CreateBox("b2", { width: 0.05, height: 0.1, depth: 0.7 }, this.scene);
        const propeller = Mesh.MergeMeshes([blade1, blade2], true, true, undefined, false, true)!;
        
        const bladeMat = new StandardMaterial("fanBladeMat", this.scene);
        bladeMat.emissiveColor = new Color3(0.6, 0.9, 1.0); 
        bladeMat.disableLighting = true;
        propeller.material = bladeMat;
        this.bladeMesh = propeller;

        // --- 3. Particles (Dot) ---
        const dot = MeshBuilder.CreatePlane("windDot", { size: 0.12 }, this.scene);
        dot.rotation.x = Math.PI / 2;
        dot.bakeCurrentTransformIntoVertices();
        
        const dotMat = new StandardMaterial("windDotMat", this.scene);
        dotMat.emissiveColor = new Color3(0.8, 0.9, 1.0);
        dotMat.disableLighting = true;
        dot.material = dotMat;
        dot.useVertexColors = true;
        this.dotMesh = dot;
    }

    public updateWindData(): void {
        // No pre-processing needed, we read live from GridSystem in animate()
        // but we could optimize here if needed.
    }

    private animate(): void {
        const dt = this.scene.getEngine().getDeltaTime() / 1000.0;
        this.time += dt;
        const width = this.gridSystem.width;
        
        // Reusable
        const tempMatrix = Matrix.Identity();
        const translation = Vector3.Zero();
        const scale = Vector3.Zero();
        const rot = Quaternion.Identity();
        const spinRot = Quaternion.Identity();
        const up = Vector3.Up();
        const right = Vector3.Right();

        let pIdx = 0;   // Counts particle instances

        // Reset buffers (fill 0 scale for unused slots)
        // Actually, we can just zero out the count and fill the rest with 0 later?
        // Or just overwrite. Since we render all active ones first, we need to hide the rest.
        // Fast way: Fill with 0 scale is safest.
        this.matricesHousing.fill(0);
        this.matricesBlades.fill(0);
        this.matricesParticles.fill(0);

        for (let i = 0; i < this.numCells; i++) {
            const x = i % width;
            const y = Math.floor(i / width);
            const worldX = x + 0.5;
            const worldZ = y + 0.5;
            
            // --- 1. Fan Logic (Source Only) ---
            if (this.gridSystem.getCell(x, y) === CellType.Wind) {
                const config = this.gridSystem.getWindConfig(x, y);
                if (config) {
                    // Orientation
                    const angle = Math.atan2(config.dy, config.dx);
                    Quaternion.RotationAxisToRef(up, -angle, rot);
                    
                    translation.set(worldX, 0.5, worldZ);
                    scale.setAll(0.8); // Fan Scale

                    // Housing Matrix
                    Matrix.ComposeToRef(scale, rot, translation, tempMatrix);
                    tempMatrix.copyToArray(this.matricesHousing, i * 16); // Use direct index 'i' so it matches grid
                    
                    // Blade Matrix (Spin)
                    const spin = this.time * (5.0 + config.force * 2.0);
                    Quaternion.RotationAxisToRef(right, spin, spinRot);
                    rot.multiplyToRef(spinRot, spinRot); // Combine
                    
                    Matrix.ComposeToRef(scale, spinRot, translation, tempMatrix);
                    tempMatrix.copyToArray(this.matricesBlades, i * 16);
                }
            }

            // --- 2. Particle Logic (Field) ---
            const windVec = this.gridSystem.getWindVector(x, y);
            const speed = Math.sqrt(windVec.x * windVec.x + windVec.y * windVec.y);

            if (speed > 0.01) {
                // Render Particles
                for (let p = 0; p < this.PARTICLES_PER_CELL; p++) {
                    const seed = i * 100 + p;
                    const randX = Math.sin(seed) * 0.5 + 0.5;
                    const randY = Math.cos(seed) * 0.5 + 0.5;

                    // Travel logic
                    // Speed is proportional to local field strength
                    const travel = this.time * speed * 0.5;
                    
                    // Normalized direction
                    const ndx = windVec.x / speed;
                    const ndy = windVec.y / speed;

                    let u = randX + ndx * travel;
                    let v = randY + ndy * travel;
                    
                    u = u - Math.floor(u);
                    v = v - Math.floor(v);
                    
                    translation.set(x + u, 0.2, y + v); // Low to ground
                    scale.setAll(1.0);
                    
                    Matrix.ComposeToRef(scale, Quaternion.Identity(), translation, tempMatrix);
                    tempMatrix.copyToArray(this.matricesParticles, pIdx * 16);
                    
                    // Color (Fade with speed?)
                    this.colorsParticles[pIdx * 4 + 0] = 0.8;
                    this.colorsParticles[pIdx * 4 + 1] = 0.9;
                    this.colorsParticles[pIdx * 4 + 2] = 1.0;
                    this.colorsParticles[pIdx * 4 + 3] = Math.min(1.0, speed * 0.3); // Fade if slow
                    
                    pIdx++;
                }
            }
        }

        // Upload
        this.housingMesh.thinInstanceSetBuffer("matrix", this.matricesHousing, 16, false);
        this.bladeMesh.thinInstanceSetBuffer("matrix", this.matricesBlades, 16, false);
        
        // For particles, we used a linear index `pIdx`. Need to handle unused.
        // The buffer was zeroed at start? No, only housing/blades were cleared implicitly by logic?
        // Wait, `matricesParticles.fill(0)` was commented out in thought but I wrote it in code.
        // Yes, `this.matricesParticles.fill(0)` is in the code.
        // But `thinInstanceSetBuffer` usually expects the full buffer.
        // We set the full buffer.
        this.dotMesh.thinInstanceSetBuffer("matrix", this.matricesParticles, 16, false);
        this.dotMesh.thinInstanceSetBuffer("color", this.colorsParticles, 4, false);
    }
}


