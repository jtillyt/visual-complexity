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
    private bladeMesh!: Mesh;
    private dotMesh!: Mesh;
    
    // Buffers
    private matricesBlades: Float32Array;
    private matricesParticles: Float32Array;
    private colorsParticles: Float32Array;
    private particleOffsets: Float32Array; // Optimization: Pre-calc offsets
    
    // Constants
    private readonly PARTICLES_PER_CELL = 8;
    private numCells: number;
    
    private time: number = 0;

    constructor(gridSystem: GridSystem, scene: Scene) {
        this.gridSystem = gridSystem;
        this.scene = scene;
        this.numCells = gridSystem.width * gridSystem.height;
        
        // Allocate buffers
        this.matricesBlades = new Float32Array(this.numCells * 16);
        this.matricesParticles = new Float32Array(this.numCells * this.PARTICLES_PER_CELL * 16);
        this.colorsParticles = new Float32Array(this.numCells * this.PARTICLES_PER_CELL * 4);
        
        // Pre-calc random offsets to avoid 20k sin/cos calls per frame
        this.particleOffsets = new Float32Array(this.numCells * this.PARTICLES_PER_CELL * 2);
        for (let i = 0; i < this.numCells; i++) {
            for (let p = 0; p < this.PARTICLES_PER_CELL; p++) {
                const idx = (i * this.PARTICLES_PER_CELL + p) * 2;
                const seed = i * 100 + p;
                this.particleOffsets[idx] = Math.sin(seed) * 0.5 + 0.5; // u
                this.particleOffsets[idx + 1] = Math.cos(seed) * 0.5 + 0.5; // v
            }
        }

        this.createMeshes();
        
        // Register update loop
        this.scene.onBeforeRenderObservable.add(() => {
            this.animate();
        });
    }

    private createMeshes(): void {
        // --- 1. Fan Blades (Propeller) ---
        const blade1 = MeshBuilder.CreateBox("b1", { width: 0.05, height: 0.7, depth: 0.1 }, this.scene);
        const blade2 = MeshBuilder.CreateBox("b2", { width: 0.05, height: 0.1, depth: 0.7 }, this.scene);
        const propeller = Mesh.MergeMeshes([blade1, blade2], true, true, undefined, false, true)!;
        // No initial rotation needed for propeller as it's built in YZ plane
        propeller.bakeCurrentTransformIntoVertices();
        
        const bladeMat = new StandardMaterial("fanBladeMat", this.scene);
        bladeMat.emissiveColor = Color3.FromHexString("#4cc9f0"); 
        bladeMat.disableLighting = false;
        propeller.material = bladeMat;
        this.bladeMesh = propeller;

        // --- 2. Particles (Dot) ---
        const dot = MeshBuilder.CreatePlane("windDot", { size: 0.12 }, this.scene);
        dot.rotation.x = Math.PI / 2;
        dot.bakeCurrentTransformIntoVertices();
        
        const dotMat = new StandardMaterial("windDotMat", this.scene);
        dotMat.emissiveColor = Color3.FromHexString("#4cc9f0");
        dotMat.disableLighting = false;
        dot.material = dotMat;
        dot.useVertexColors = false;
        this.dotMesh = dot;
    }

    public updateWindData(): void {
        // No pre-processing needed
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
                    
                    translation.set(worldX, 0.4, worldZ);
                    scale.setAll(0.8); // Fan Scale
                    
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
                    const offsetIdx = (i * this.PARTICLES_PER_CELL + p) * 2;
                    const randX = this.particleOffsets[offsetIdx];
                    const randY = this.particleOffsets[offsetIdx + 1];

                    const travel = this.time * speed * 0.5;
                    
                    const ndx = windVec.x / speed;
                    const ndy = windVec.y / speed;

                    let u = randX + ndx * travel;
                    let v = randY + ndy * travel;
                    
                    u = u - Math.floor(u);
                    v = v - Math.floor(v);
                    
                    translation.set(x + u, 0.2, y + v);
                    scale.setAll(1.0);
                    
                    Matrix.ComposeToRef(scale, Quaternion.Identity(), translation, tempMatrix);
                    tempMatrix.copyToArray(this.matricesParticles, pIdx * 16);
                    
                    this.colorsParticles[pIdx * 4 + 0] = 0.28;
                    this.colorsParticles[pIdx * 4 + 1] = 0.58;
                    this.colorsParticles[pIdx * 4 + 2] = 0.94;
                    this.colorsParticles[pIdx * 4 + 3] = Math.min(1.0, speed * 0.3);
                    
                    pIdx++;
                }
            }
        }

        this.bladeMesh.thinInstanceSetBuffer("matrix", this.matricesBlades, 16, false);
        this.dotMesh.thinInstanceSetBuffer("matrix", this.matricesParticles, 16, false);
        this.dotMesh.thinInstanceSetBuffer("color", this.colorsParticles, 4, false);
    }

    public dispose(): void {
        this.bladeMesh.dispose();
        this.dotMesh.dispose();
    }
}


