import { Scene } from '@babylonjs/core/scene';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { GridSystem, CellType } from './GridSystem';
import { Color4, Color3 } from '@babylonjs/core/Maths/math.color';
import { Matrix } from '@babylonjs/core/Maths/math.vector';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import "@babylonjs/core/Meshes/thinInstanceMesh"; // Augment Mesh with Thin Instances

export class GridRenderer {
    private gridSystem: GridSystem;
    private scene: Scene;
    private tileMesh: Mesh;
    private colorsData: Float32Array;

    constructor(gridSystem: GridSystem, scene: Scene) {
        this.gridSystem = gridSystem;
        this.scene = scene;
        this.colorsData = new Float32Array(gridSystem.width * gridSystem.height * 4);
        this.tileMesh = this.createTileMesh();
        this.initializeInstances();
    }

    private createTileMesh(): Mesh {
        // Use CreateGround which is already on XZ plane (facing up)
        const tile = MeshBuilder.CreateGround("tile", { width: 0.9, height: 0.9 }, this.scene);
        tile.useVertexColors = true; // Required for thin instance colors to work
        
        const material = new StandardMaterial("tileMat", this.scene);
        material.disableLighting = true; // Flat color
        material.emissiveColor = new Color3(1, 1, 1); // Base color for vertex colors
        material.backFaceCulling = false; // Ensure visibility from both sides
        tile.material = material;
        
        return tile;
    }

    private initializeInstances(): void {
        const width = this.gridSystem.width;
        const height = this.gridSystem.height;
        const matrices = new Float32Array(width * height * 16);
        
        let index = 0;
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                // Grid coordinates to World coordinates
                // Grid (0,0) is usually bottom-left or top-left.
                // Let's map (0,0) to (0.5, 0.5) so the grid is [0, 50]x[0, 50].
                const worldX = x + 0.5;
                const worldZ = y + 0.5;
                
                const matrix = Matrix.Translation(worldX, 0, worldZ);
                matrix.copyToArray(matrices, index * 16);
                index++;
            }
        }
        
        this.tileMesh.thinInstanceSetBuffer("matrix", matrices, 16, true);
        this.update(); // Initial color set
    }

    public update(): void {
        const width = this.gridSystem.width;
        const height = this.gridSystem.height;
        
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const index = y * width + x;
                const type = this.gridSystem.getCell(x, y);
                const color = this.getColorForType(type);
                
                this.colorsData[index * 4 + 0] = color.r;
                this.colorsData[index * 4 + 1] = color.g;
                this.colorsData[index * 4 + 2] = color.b;
                this.colorsData[index * 4 + 3] = color.a;
            }
        }
        
        this.tileMesh.thinInstanceSetBuffer("color", this.colorsData, 4);
    }

    private getColorForType(type: CellType): Color4 {
        switch (type) {
            case CellType.Wall:
                return new Color4(0.5, 0.5, 0.5, 1); // Lighter Grey Wall
            case CellType.Wind:
                return new Color4(1.0, 0.2, 0.2, 1); // Bright Red Wind (Opaque for now)
            case CellType.Goal:
                return new Color4(0.2, 1.0, 0.2, 1); // Bright Green Goal
            case CellType.Empty:
            default:
                return new Color4(0.2, 0.2, 0.3, 1); // Visible Dark Blue
        }
    }
}