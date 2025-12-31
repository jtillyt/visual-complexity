import { Scene } from '@babylonjs/core/scene';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { GridSystem, CellType } from './GridSystem';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Matrix, Vector3, Quaternion } from '@babylonjs/core/Maths/math.vector';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture';
import { Texture } from '@babylonjs/core/Materials/Textures/texture';
import "@babylonjs/core/Meshes/thinInstanceMesh"; 

/**
 * GridRenderer handles the visualization of the grid.
 * - Floor: Holographic, floating tiles.
 * - Walls: Solid, glowing blocks.
 * - Goal: Floating, pulsating arrow.
 */
export class GridRenderer {
    private gridSystem: GridSystem;
    private scene: Scene;
    
    private floorMesh: Mesh;
    private wallMesh: Mesh;
    private goalMesh: Mesh;
    
    // Buffers
    private matricesFloor: Float32Array;
    private colorsFloor: Float32Array;
    private matricesWall: Float32Array;
    private matricesGoal: Float32Array;
    
    // State
    private goalIndices: number[] = [];
    private time: number = 0;

    constructor(gridSystem: GridSystem, scene: Scene) {
        this.gridSystem = gridSystem;
        this.scene = scene;
        
        const count = gridSystem.width * gridSystem.height;
        this.matricesFloor = new Float32Array(count * 16);
        this.colorsFloor = new Float32Array(count * 4);
        this.matricesWall = new Float32Array(count * 16);
        this.matricesGoal = new Float32Array(count * 16);
        
        this.floorMesh = this.createFloorMesh();
        this.wallMesh = this.createWallMesh();
        this.goalMesh = this.createGoalMesh();
        
        this.update(); 
        
        // Register animation loop
        this.scene.onBeforeRenderObservable.add(() => {
            this.animate();
        });
    }

    private createFloorMesh(): Mesh {
        // TILE_THICKNESS: Adjust this value to change the base height of floor cubes
        const tileThickness = 0.02;
        const tile = MeshBuilder.CreateBox("floorTile", { width: 1.0, height: tileThickness, depth: 1.0 }, this.scene);
        tile.useVertexColors = true; 
        
        const material = new StandardMaterial("floorMat", this.scene);
        
        // Holographic Border Texture
        const texture = new DynamicTexture("gridTex", { width: 128, height: 128 }, this.scene, false);
        texture.hasAlpha = true;
        const ctx = texture.getContext();
        ctx.clearRect(0, 0, 128, 128);
        ctx.strokeStyle = "white";
        ctx.lineWidth = 20;
        ctx.strokeRect(0, 0, 128, 128);
        texture.update();
        texture.updateSamplingMode(Texture.TRILINEAR_SAMPLINGMODE);
        texture.anisotropicFilteringLevel = 4;

        material.emissiveTexture = texture;
        material.opacityTexture = texture;
        material.diffuseColor = Color3.Black();
        material.disableLighting = true; 
        material.backFaceCulling = false; 
        material.emissiveColor = Color3.White(); 

        tile.material = material;
        tile.alwaysSelectAsActiveMesh = true;
        tile.isPickable = false;

        return tile;
    }

    private createWallMesh(): Mesh {
        const wall = MeshBuilder.CreateBox("wallBlock", { size: 1.0 }, this.scene);
        const material = new StandardMaterial("wallMat", this.scene);
        
        // Cyberpunk Wall Texture (Bordered/Beveled Look)
        const texture = new DynamicTexture("wallTex", { width: 128, height: 128 }, this.scene, false);
        const ctx = texture.getContext();
        
        // 1. Base Dark Background
        ctx.fillStyle = "#3a79c2"; 
        ctx.fillRect(0, 0, 128, 128);
        
        // 2. Primary Border (Blue Energy)
        ctx.strokeStyle = "#4895ef";
        ctx.lineWidth = 16;
        ctx.strokeRect(8, 8, 112, 112);
        
        // 3. Inner Detail (Optional subtle cross)
        // ctx.strokeStyle = "#4895ef33"; // Transparent Blue
        // ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(30, 30); ctx.lineTo(98, 98);
        ctx.moveTo(98, 30); ctx.lineTo(30, 98);
        ctx.stroke();

        // 4. Edge Highlight (Sky Aqua)
        ctx.strokeStyle = "#4895ef";
        ctx.lineWidth = 4;
        ctx.strokeRect(2, 2, 124, 124);
        
        texture.update();
        texture.hasAlpha = false;

        material.diffuseTexture = texture; // Bind to diffuse as well
        material.emissiveTexture = texture;
        material.emissiveColor = Color3.White(); 
        material.diffuseColor = Color3.Black();
        material.specularColor = Color3.Black();
        material.disableLighting = false; // Enable lighting pipeline but use Emissive
        
        wall.material = material;
        wall.useVertexColors = false; // Ensure vertex colors don't override
        wall.alwaysSelectAsActiveMesh = true;
        wall.isPickable = false;
        return wall;
    }

    private createGoalMesh(): Mesh {
        // Arrow pointing DOWN
        // Shaft
        const shaft = MeshBuilder.CreateCylinder("shaft", { height: 0.5, diameter: 0.2 }, this.scene);
        shaft.position.y = 0.5; // Top half
        
        // Head (Cone)
        const head = MeshBuilder.CreateCylinder("head", { height: 0.4, diameterTop: 0.5, diameterBottom: 0 }, this.scene);
        head.position.y = 0.0; // Bottom point at 0 (relative to mesh center approx)
        // Adjust positions so arrow tip is at 0,0,0 local?
        // Actually let's make the center of the mesh the "hover point".
        
        shaft.position.y = 0.4;
        head.position.y = 0.0; // Tip at -0.2?
        // Let's merge and bake.
        
        const arrow = Mesh.MergeMeshes([shaft, head], true, true, undefined, false, true)!;
        arrow.name = "goalArrow";
        
        // Rotate so it points DOWN (-Y)
        // Cylinder default is Y-aligned. Head at 0, Shaft at 0.4.
        // It currently points UP (if head is cone pointing up).
        // Wait, diameterTop=0.5, diameterBottom=0. That's an inverted cone (funnel).
        // Cylinder default: Top is +Y.
        // diameterTop=0.5 (Wide), diameterBottom=0 (Point).
        // So this points DOWN (-Y) already? No, the point is at -Y/2.
        // So the wide part is at +Y. Yes, it points down.
        
        const material = new StandardMaterial("goalMat", this.scene);
        material.emissiveColor = new Color3(0.0, 1.0, 0.5); // Neon Green
        material.disableLighting = true;
        arrow.material = material;
        
        return arrow;
    }

    public update(): void {
        const width = this.gridSystem.width;
        const height = this.gridSystem.height;
        this.goalIndices = [];
        
        const zeroMatrix = Matrix.Compose(Vector3.Zero(), Quaternion.Identity(), Vector3.Zero());
        
        // Reset buffers
        this.matricesGoal.fill(0); 

        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const index = y * width + x;
                const type = this.gridSystem.getCell(x, y);
                
                const worldX = x + 0.5;
                const worldZ = y + 0.5;

                if (type === CellType.Wall) {
                    // Wall (Reduced scale to 0.98 to show small gaps between adjacent walls)
                    const matrix = Matrix.Compose(
                        new Vector3(0.98, 1.0, 0.98),
                        Quaternion.Identity(),
                        new Vector3(worldX, 0.5, worldZ)
                    );
                    matrix.copyToArray(this.matricesWall, index * 16);
                    zeroMatrix.copyToArray(this.matricesFloor, index * 16);
                    zeroMatrix.copyToArray(this.matricesGoal, index * 16);
                    
                } else if (type === CellType.Goal) {
                    // Goal: Show Floor + Arrow
                    this.goalIndices.push(index);
                    
                    // Floor (Nearly Flat)
                    // Scale: 0.95 for small gaps between tiles. Y-Scale: 1.0 (uses base mesh thickness)
                    // Position: worldY = 0.01 (half of 0.02 thickness) to sit exactly on 0
                    const matrix = Matrix.Compose(
                        new Vector3(0.95, 1.0, 0.95),
                        Quaternion.Identity(),
                        new Vector3(worldX, 0.01, worldZ)
                    );
                    matrix.copyToArray(this.matricesFloor, index * 16);
                    zeroMatrix.copyToArray(this.matricesWall, index * 16);
                    
                    // Goal Arrow Matrix is updated in animate()
                    
                } else {
                    // Normal Floor (Nearly Flat)
                    // Scale: 0.95 for small gaps between tiles. Y-Scale: 1.0 (uses base mesh thickness)
                    // Position: worldY = 0.01 (half of 0.02 thickness) to sit exactly on 0
                    const matrix = Matrix.Compose(
                        new Vector3(0.95, 1.0, 0.95),
                        Quaternion.Identity(),
                        new Vector3(worldX, 0.01, worldZ)
                    );
                    matrix.copyToArray(this.matricesFloor, index * 16);
                    zeroMatrix.copyToArray(this.matricesWall, index * 16);
                    zeroMatrix.copyToArray(this.matricesGoal, index * 16);
                }
                
                if (type !== CellType.Wall) {
                    this.setFloorColor(index, type, 0, 'mdp');
                }
            }
        }
        
        this.floorMesh.thinInstanceSetBuffer("matrix", this.matricesFloor, 16, false);
        this.floorMesh.thinInstanceSetBuffer("color", this.colorsFloor, 4, false);
        this.wallMesh.thinInstanceSetBuffer("matrix", this.matricesWall, 16, false);
        this.goalMesh.thinInstanceSetBuffer("matrix", this.matricesGoal, 16, false);
    }

    private animate(): void {
        const dt = this.scene.getEngine().getDeltaTime() / 1000.0;
        this.time += dt;
        
        // Animate Goals
        const tempMatrix = Matrix.Identity();
        const translation = Vector3.Zero();
        const scale = Vector3.Zero();
        
        // Bobbing math
        const hoverHeight = 1.5;
        const bobOffset = Math.sin(this.time * 3.0) * 0.2;
        const currentY = hoverHeight + bobOffset;
        const scaleFactor = 1.0 + Math.sin(this.time * 3.0) * 0.1; // Pulse size
        
        for (const index of this.goalIndices) {
            const x = index % this.gridSystem.width;
            const y = Math.floor(index / this.gridSystem.width);
            
            translation.set(x + 0.5, currentY, y + 0.5);
            scale.setAll(scaleFactor);
            
            Matrix.ComposeToRef(scale, Quaternion.Identity(), translation, tempMatrix);
            tempMatrix.copyToArray(this.matricesGoal, index * 16);
        }
        
        if (this.goalIndices.length > 0) {
            this.goalMesh.thinInstanceBufferUpdated("matrix");
        }
    }

    public updateVisuals(values: Float32Array, mode: 'astar' | 'mdp'): void {
         const width = this.gridSystem.width;
         const height = this.gridSystem.height;
         
         for (let i = 0; i < width * height; i++) {
             const x = i % width;
             const y = Math.floor(i / width);
             const type = this.gridSystem.getCell(x, y);
             
             if (type !== CellType.Wall) {
                 this.setFloorColor(i, type, values[i], mode);
             }
         }
         
         this.floorMesh.thinInstanceBufferUpdated("color");
    }

    private setFloorColor(index: number, type: CellType, value: number, mode: 'astar' | 'mdp'): void {
        let r=0, g=0, b=0, a=1;

        switch (type) {
            case CellType.Wall:
                break;
            case CellType.Wind:
                // Blue Energy (#4895ef) -> 0.28, 0.58, 0.94
                r = 0.28; g = 0.58; b = 0.94; 
                break;
            case CellType.Goal:
                // Sky Aqua (#4cc9f0) -> 0.3, 0.79, 0.94
                r = 0.3; g = 0.79; b = 0.94; 
                break;
            case CellType.Empty:
            default:
                if (mode === 'astar') {
                    if (value > 0.9) {
                        r = 0.3; g = 0.79; b = 0.94; // Sky Aqua (Vibrant)
                    } else if (value > 0.1) {
                        r = 0.15; g = 0.4; b = 0.47; // Mid Sky Aqua
                    } else {
                        r = 0.3; g = 0.32; b = 0.38; // Brighter Floor Base
                    }
                } else {
                    r = 0.3; g = 0.32; b = 0.38; // Brighter Floor Base
                }
                break;
        }

        this.colorsFloor[index * 4 + 0] = r;
        this.colorsFloor[index * 4 + 1] = g;
        this.colorsFloor[index * 4 + 2] = b;
        this.colorsFloor[index * 4 + 3] = a;
    }

    public dispose(): void {
        this.floorMesh.dispose();
        this.wallMesh.dispose();
        this.goalMesh.dispose();
    }
}

