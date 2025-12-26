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
 * - Walls: Solid, brick-textured blocks.
 */
export class GridRenderer {
    private gridSystem: GridSystem;
    private scene: Scene;
    
    private floorMesh: Mesh;
    private wallMesh: Mesh;
    
    // Buffers
    private matricesFloor: Float32Array;
    private colorsFloor: Float32Array;
    
    private matricesWall: Float32Array;

    constructor(gridSystem: GridSystem, scene: Scene) {
        this.gridSystem = gridSystem;
        this.scene = scene;
        
        const count = gridSystem.width * gridSystem.height;
        this.matricesFloor = new Float32Array(count * 16);
        this.colorsFloor = new Float32Array(count * 4);
        this.matricesWall = new Float32Array(count * 16);
        
        this.floorMesh = this.createFloorMesh();
        this.wallMesh = this.createWallMesh();
        
        this.update(); 
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
        
        // Light Cyberpunk Blue Color
        material.emissiveColor = new Color3(0.3, 0.6, 1.0);
        material.disableLighting = true; 
        
        wall.material = material;
        wall.alwaysSelectAsActiveMesh = true;
        wall.isPickable = false;
        
        return wall;
    }

    public update(): void {
        const width = this.gridSystem.width;
        const height = this.gridSystem.height;
        
        // Reusable objects
        const zeroMatrix = Matrix.Compose(Vector3.Zero(), Quaternion.Identity(), Vector3.Zero());
        
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const index = y * width + x;
                const type = this.gridSystem.getCell(x, y);
                
                const worldX = x + 0.5;
                const worldZ = y + 0.5;

                if (type === CellType.Wall) {
                    // It's a Wall
                    const matrix = Matrix.Compose(
                        new Vector3(1.0, 1.0, 1.0), // Full block
                        Quaternion.Identity(),
                        new Vector3(worldX, 0.5, worldZ)
                    );
                    matrix.copyToArray(this.matricesWall, index * 16);
                    
                    // Hide Floor
                    zeroMatrix.copyToArray(this.matricesFloor, index * 16);
                    
                } else {
                    // It's Floor/Wind/Goal
                    const matrix = Matrix.Compose(
                        new Vector3(0.95, 0.1, 0.95), // Floating tile
                        Quaternion.Identity(),
                        new Vector3(worldX, 0.05, worldZ)
                    );
                    matrix.copyToArray(this.matricesFloor, index * 16);
                    
                    // Hide Wall
                    zeroMatrix.copyToArray(this.matricesWall, index * 16);
                }
                
                // Initialize floor color (Wall has no vertex color)
                this.setFloorColor(index, type, 0, 'mdp');
            }
        }
        
        this.floorMesh.thinInstanceSetBuffer("matrix", this.matricesFloor, 16, false);
        this.floorMesh.thinInstanceSetBuffer("color", this.colorsFloor, 4, false);
        
        this.wallMesh.thinInstanceSetBuffer("matrix", this.matricesWall, 16, false);
    }

    public updateVisuals(values: Float32Array, mode: 'astar' | 'mdp'): void {
         const width = this.gridSystem.width;
         const height = this.gridSystem.height;
         
         for (let i = 0; i < width * height; i++) {
             const x = i % width;
             const y = Math.floor(i / width);
             const type = this.gridSystem.getCell(x, y);
             
             // Only update floor colors. Walls are static.
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
                // Should not happen here, but safety
                break;
            case CellType.Wind:
                r = 0.0; g = 0.6; b = 1.0; // Neon Blue
                break;
            case CellType.Goal:
                r = 0.0; g = 1.0; b = 0.5; // Neon Green
                break;
            case CellType.Empty:
            default:
                if (mode === 'astar') {
                    if (value > 0.9) {
                        // Path
                        r = 0.0; g = 1.0; b = 0.5; 
                    } else if (value > 0.1) {
                        // Visited
                        r = 0.0; g = 0.3; b = 0.2; 
                    } else {
                        // Unvisited
                        r = 0.05; g = 0.15; b = 0.25; 
                    }
                } else {
                    // MDP Mode
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

