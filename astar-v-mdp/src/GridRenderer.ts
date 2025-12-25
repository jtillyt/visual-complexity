import { Scene } from '@babylonjs/core/scene';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { GridSystem, CellType } from './GridSystem';
import { Color4, Color3 } from '@babylonjs/core/Maths/math.color';
import { Matrix, Vector3, Quaternion } from '@babylonjs/core/Maths/math.vector';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import "@babylonjs/core/Meshes/thinInstanceMesh"; 

export class GridRenderer {
    private gridSystem: GridSystem;
    private scene: Scene;
    private tileMesh: Mesh;
    private colorsData: Float32Array;
    private matricesData: Float32Array;

    constructor(gridSystem: GridSystem, scene: Scene) {
        this.gridSystem = gridSystem;
        this.scene = scene;
        this.colorsData = new Float32Array(gridSystem.width * gridSystem.height * 4);
        this.matricesData = new Float32Array(gridSystem.width * gridSystem.height * 16);
        
        this.tileMesh = this.createTileMesh();
        
        // Initial full update
        this.update(); 
    }

    private createTileMesh(): Mesh {
        // Create a Box. Default size 1 centered at origin.
        const tile = MeshBuilder.CreateBox("tile", { size: 1.0 }, this.scene);
        tile.useVertexColors = true; 
        
        const material = new StandardMaterial("tileMat", this.scene);
        // Lighting enabled for 3D depth, but with high emissive for visibility against dark bg
        material.disableLighting = false; 
        material.emissiveColor = new Color3(0.2, 0.2, 0.2); 
        material.specularColor = new Color3(0.1, 0.1, 0.1);
        tile.material = material;
        
        // Ensure bounding box covers all instances
        tile.alwaysSelectAsActiveMesh = true;
        // Disable picking on visual tiles so we hit the invisible ground plane
        tile.isPickable = false;

        return tile;
    }

    public update(): void {
        const width = this.gridSystem.width;
        const height = this.gridSystem.height;
        
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const index = y * width + x;
                const type = this.gridSystem.getCell(x, y);
                
                // 1. Update Color
                const color = this.getColorForType(type);
                this.colorsData[index * 4 + 0] = color.r;
                this.colorsData[index * 4 + 1] = color.g;
                this.colorsData[index * 4 + 2] = color.b;
                this.colorsData[index * 4 + 3] = color.a;

                // 2. Update Matrix (Scale & Position)
                const worldX = x + 0.5;
                const worldZ = y + 0.5;
                let scaleY = 0.1; // Default floor thickness
                let posY = 0.05;  // Half of 0.1

                if (type === CellType.Wall) {
                    scaleY = 1.0; // Wall height
                    posY = 0.5;   // Half of 1.0
                }

                const matrix = Matrix.Compose(
                    new Vector3(0.9, scaleY, 0.9), // Gap between tiles
                    Quaternion.Identity(),
                    new Vector3(worldX, posY, worldZ)
                );
                
                matrix.copyToArray(this.matricesData, index * 16);
            }
        }
        
        this.tileMesh.thinInstanceSetBuffer("matrix", this.matricesData, 16, false);
        this.tileMesh.thinInstanceSetBuffer("color", this.colorsData, 4, false);
    }

    private getColorForType(type: CellType): Color4 {
        switch (type) {
            case CellType.Wall:
                return new Color4(0.5, 0.5, 0.6, 1); // Brighter Steel Wall
            case CellType.Wind:
                return new Color4(0.8, 0.3, 0.3, 1); // Reddish floor
            case CellType.Goal:
                return new Color4(0.3, 0.9, 0.3, 1); // Green floor
            case CellType.Empty:
            default:
                return new Color4(0.2, 0.2, 0.3, 1); // Brighter Blue-Grey floor
        }
    }
}
