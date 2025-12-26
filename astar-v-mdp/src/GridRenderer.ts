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
        const tile = MeshBuilder.CreateBox("floorTile", { size: 1.0 }, this.scene);
        tile.useVertexColors = true; 
        
        const material = new StandardMaterial("floorMat", this.scene);
        
        // Holographic Border Texture
        const texture = new DynamicTexture("gridTex", { width: 128, height: 128 }, this.scene, false);
        texture.hasAlpha = true;
        const ctx = texture.getContext();
        ctx.clearRect(0, 0, 128, 128);
        ctx.strokeStyle = "white";
        ctx.lineWidth = 15;
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
        material.emissiveColor = new Color3(0.3, 0.6, 1.0); // Cyberpunk Blue
        material.disableLighting = true; 
        wall.material = material;
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
                    // Wall
                    const matrix = Matrix.Compose(
                        new Vector3(1.0, 1.0, 1.0),
                        Quaternion.Identity(),
                        new Vector3(worldX, 0.5, worldZ)
                    );
                    matrix.copyToArray(this.matricesWall, index * 16);
                    zeroMatrix.copyToArray(this.matricesFloor, index * 16);
                    zeroMatrix.copyToArray(this.matricesGoal, index * 16);
                    
                } else if (type === CellType.Goal) {
                    // Goal: Show Floor + Arrow
                    this.goalIndices.push(index);
                    
                    // Floor
                    const matrix = Matrix.Compose(
                        new Vector3(0.95, 0.1, 0.95),
                        Quaternion.Identity(),
                        new Vector3(worldX, 0.05, worldZ)
                    );
                    matrix.copyToArray(this.matricesFloor, index * 16);
                    zeroMatrix.copyToArray(this.matricesWall, index * 16);
                    
                    // Goal Arrow Matrix is updated in animate()
                    
                } else {
                    // Normal Floor
                    const matrix = Matrix.Compose(
                        new Vector3(0.95, 0.1, 0.95),
                        Quaternion.Identity(),
                        new Vector3(worldX, 0.05, worldZ)
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
                r = 0.0; g = 0.6; b = 1.0; 
                break;
            case CellType.Goal:
                r = 0.0; g = 1.0; b = 0.5; 
                break;
            case CellType.Empty:
            default:
                if (mode === 'astar') {
                    if (value > 0.9) {
                        r = 0.0; g = 1.0; b = 0.5; 
                    } else if (value > 0.1) {
                        r = 0.0; g = 0.3; b = 0.2; 
                    } else {
                        r = 0.05; g = 0.15; b = 0.25; 
                    }
                } else {
                    r = 0.05; g = 0.15; b = 0.25;
                }
                break;
        }

        this.colorsFloor[index * 4 + 0] = r;
        this.colorsFloor[index * 4 + 1] = g;
        this.colorsFloor[index * 4 + 2] = b;
        this.colorsFloor[index * 4 + 3] = a;
    }
}

