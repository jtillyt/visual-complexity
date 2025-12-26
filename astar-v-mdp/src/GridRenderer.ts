import { Scene } from '@babylonjs/core/scene';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { GridSystem, CellType } from './GridSystem';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Matrix, Vector3, Quaternion } from '@babylonjs/core/Maths/math.vector';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture';
import "@babylonjs/core/Meshes/thinInstanceMesh"; 

/**
 * GridRenderer handles the visualization of the static grid cells (Floor, Walls, Goal).
 * Supports "Holographic Table" aesthetic with glowing paths and floating tiles.
 */
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
        
        // Create Holographic Border Texture
        const texture = new DynamicTexture("gridTex", { width: 128, height: 128 }, this.scene, false);
        texture.hasAlpha = true;
        const ctx = texture.getContext();
        
        // Clear (Transparent)
        ctx.clearRect(0, 0, 128, 128);
        
        // Draw Border
        ctx.strokeStyle = "white";
        ctx.lineWidth = 15;
        ctx.strokeRect(0, 0, 128, 128);
        
        // Optional: Fill center with very faint white for "glass" effect?
        // ctx.fillStyle = "rgba(255, 255, 255, 0.05)";
        // ctx.fillRect(0, 0, 128, 128);
        
        texture.update();

        // Apply Texture
        material.emissiveTexture = texture;
        material.opacityTexture = texture;
        material.diffuseColor = Color3.Black();
        material.disableLighting = true; 
        
        // Use Vertex Colors to tint the Emissive Texture
        // StandardMaterial multiplies EmissiveTexture * VertexColor if useVertexColors is true?
        // Actually, for Emissive to be tinted by vertex color, we might need to rely on the fact that
        // EmissiveColor is usually added.
        // Let's set EmissiveColor to White (default multiplier) and let texture define pattern.
        // Vertex Color usually tints Diffuse. For Emissive, we might need a custom shader or 
        // rely on standard behavior.
        // Babylon StandardMaterial: VertexColor multiplies Diffuse. 
        // Does it multiply Emissive? 
        // In newer versions yes if `useEmissiveAsIllumination`?
        // Let's try simple setup: EmissiveColor = White.
        // If Vertex Color doesn't tint emissive texture, everything will be white borders.
        // We might need to map Vertex Color to Emissive Color manually in shader or use PBR.
        // BUT: StandardMaterial VertexColor affects the final output.
        material.emissiveColor = Color3.White(); 

        tile.material = material;
        
        // Ensure bounding box covers all instances
        tile.alwaysSelectAsActiveMesh = true;
        tile.isPickable = false;

        return tile;
    }

    /**
     * Rebuilds geometry (matrices) and resets base colors.
     * Call this when grid structure changes (Paint).
     */
    public update(): void {
        const width = this.gridSystem.width;
        const height = this.gridSystem.height;
        
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const index = y * width + x;
                const type = this.gridSystem.getCell(x, y);
                
                // 1. Update Matrix (Scale & Position)
                const worldX = x + 0.5;
                const worldZ = y + 0.5;
                let scaleY = 0.1; // Floor thickness
                let posY = 0.05;  

                if (type === CellType.Wall) {
                    scaleY = 1.0; // Wall height
                    posY = 0.5;   
                }

                const matrix = Matrix.Compose(
                    new Vector3(0.95, scaleY, 0.95), // Small gap
                    Quaternion.Identity(),
                    new Vector3(worldX, posY, worldZ)
                );
                
                matrix.copyToArray(this.matricesData, index * 16);
                
                // Set default color
                this.setColor(index, type, 0, 'mdp');
            }
        }
        
        this.tileMesh.thinInstanceSetBuffer("matrix", this.matricesData, 16, false);
        this.tileMesh.thinInstanceSetBuffer("color", this.colorsData, 4, false);
    }

    /**
     * Updates only the colors based on solver values (Path highlighting).
     * Call this in the render loop.
     */
    public updateVisuals(values: Float32Array, mode: 'astar' | 'mdp'): void {
         const width = this.gridSystem.width;
         const height = this.gridSystem.height;
         
         for (let i = 0; i < width * height; i++) {
             const x = i % width;
             const y = Math.floor(i / width);
             const type = this.gridSystem.getCell(x, y);
             
             this.setColor(i, type, values[i], mode);
         }
         
         this.tileMesh.thinInstanceBufferUpdated("color");
    }

    private setColor(index: number, type: CellType, value: number, mode: 'astar' | 'mdp'): void {
        let r=0, g=0, b=0, a=1;

        switch (type) {
            case CellType.Wall:
                r = 0.1; g = 0.1; b = 0.15; // Dark Metal
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
                        // Unvisited - Default Light Blue Grid (Subtle)
                        r = 0.05; g = 0.15; b = 0.25; 
                    }
                } else {
                    // MDP Mode - Default Light Blue Grid (Subtle)
                    r = 0.05; g = 0.15; b = 0.25;
                }
                break;
        }

        this.colorsData[index * 4 + 0] = r;
        this.colorsData[index * 4 + 1] = g;
        this.colorsData[index * 4 + 2] = b;
        this.colorsData[index * 4 + 3] = a;
    }
}
