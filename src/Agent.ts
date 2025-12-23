import { Scene } from '@babylonjs/core/scene';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { GridSystem, CellType } from './GridSystem';
import { MdpSolver } from './MdpSolver';

export class Agent {
    private mesh: Mesh;
    private gridSystem: GridSystem;
    private scene: Scene;
    private position: Vector3;
    private speed: number = 8.0; // Units per second

    constructor(gridSystem: GridSystem, scene: Scene, startX: number, startY: number) {
        this.gridSystem = gridSystem;
        this.scene = scene;
        this.position = new Vector3(startX + 0.5, 0.5, startY + 0.5); // Center of tile, slightly up

        this.mesh = this.createMesh();
        this.updateMeshPosition();
    }

    private createMesh(): Mesh {
        const mesh = MeshBuilder.CreateBox("agent", { size: 0.6 }, this.scene);
        const material = new StandardMaterial("agentMat", this.scene);
        material.emissiveColor = new Color3(0.3, 0.7, 1.0); // Light Neon Blue
        material.disableLighting = true;
        mesh.material = material;
        return mesh;
    }

    public update(deltaTime: number, solver: MdpSolver): void {
        // 1. Get current grid cell
        const gridX = Math.floor(this.position.x);
        const gridZ = Math.floor(this.position.z);

        if (!this.gridSystem.isValid(gridX, gridZ)) {
            return;
        }

        const cellType = this.gridSystem.getCell(gridX, gridZ);

        // 2. Behavior based on cell type
        if (cellType === CellType.Goal) {
            // Spin to celebrate
            this.mesh.rotation.y += 5 * deltaTime;
            return;
        }

        // 3. Get Policy Angle
        const index = this.gridSystem.getFlatIndex(gridX, gridZ);
        const targetAngle = solver.policy[index];

        // 4. Calculate Velocity
        let vx = Math.cos(targetAngle);
        let vz = Math.sin(targetAngle);

        // 5. Apply Wind/Noise
        if (cellType === CellType.Wind) {
            // High turbulence
            vx += (Math.random() - 0.5) * 3.0;
            vz += (Math.random() - 0.5) * 3.0;
        } else {
             // Slight jitter for organic feel
             vx += (Math.random() - 0.5) * 0.2;
             vz += (Math.random() - 0.5) * 0.2;
        }

        // Normalize speed (unless it's wind chaos, which can be faster/slower)
        // Actually, let's just apply the speed to the vector
        const currentSpeed = this.speed * deltaTime;
        const nextX = this.position.x + vx * currentSpeed;
        const nextZ = this.position.z + vz * currentSpeed;

        // Simple wall collision check (center point)
        const nextGridX = Math.floor(nextX);
        const nextGridZ = Math.floor(nextZ);
        
        // Prevent moving into walls
        if (this.gridSystem.isValid(nextGridX, nextGridZ)) {
             const nextCell = this.gridSystem.getCell(nextGridX, nextGridZ);
             if (nextCell !== CellType.Wall) {
                 this.position.x = nextX;
                 this.position.z = nextZ;
             }
        }

        this.updateMeshPosition();
    }

    private updateMeshPosition(): void {
        this.mesh.position.copyFrom(this.position);
    }
    
    public setPosition(x: number, y: number) {
        this.position.x = x + 0.5;
        this.position.z = y + 0.5;
        this.updateMeshPosition();
    }
}
