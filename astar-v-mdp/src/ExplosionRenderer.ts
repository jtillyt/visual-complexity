import { Scene } from '@babylonjs/core/scene';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Color3 } from '@babylonjs/core/Maths/math.color';

interface Particle {
    mesh: Mesh;
    velocity: Vector3;
    life: number;
    maxLife: number;
}

export class ExplosionRenderer {
    private scene: Scene;
    private particles: Particle[] = [];
    private material: StandardMaterial;

    constructor(scene: Scene) {
        this.scene = scene;
        this.material = new StandardMaterial("explosionMat", scene);
        this.material.emissiveColor = Color3.FromHexString("#f72585"); // Neon Pink
        this.material.disableLighting = true;
    }

    public trigger(position: Vector3): void {
        const count = 40;
        for (let i = 0; i < count; i++) {
            // Random direction in a semi-sphere or sphere
            const theta = Math.random() * Math.PI * 2;
            const phi = Math.random() * Math.PI; // Full sphere
            
            const speed = 3.0 + Math.random() * 5.0;
            const vx = Math.sin(phi) * Math.cos(theta);
            const vy = Math.cos(phi);
            const vz = Math.sin(phi) * Math.sin(theta);
            
            const velocity = new Vector3(vx, Math.abs(vy) * 0.5, vz).scale(speed); // Bias upwards slightly

            // Create shard (Line-like tube)
            const length = 0.3 + Math.random() * 0.5;
            // Create tube along Z axis locally so we can lookAt to orient velocity
            const mesh = MeshBuilder.CreateTube("shard", {
                path: [Vector3.Zero(), new Vector3(0, 0, length)],
                radius: 0.03,
                tessellation: 3, // Triangle tube is cheap
                cap: Mesh.NO_CAP
            }, this.scene);
            
            mesh.position.copyFrom(position);
            mesh.position.y += 0.2; // Lift off floor slightly
            
            // Align with velocity
            const target = mesh.position.add(velocity);
            mesh.lookAt(target);
            
            mesh.material = this.material;
            
            this.particles.push({
                mesh,
                velocity,
                life: 0.8 + Math.random() * 0.4,
                maxLife: 1.0
            });
        }
    }

    public update(deltaTime: number): void {
        for (let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i];
            p.life -= deltaTime;
            
            if (p.life <= 0) {
                p.mesh.dispose();
                this.particles.splice(i, 1);
            } else {
                p.mesh.position.addInPlace(p.velocity.scale(deltaTime));
                
                // Scale down and fade
                const scale = Math.max(0, p.life / p.maxLife);
                p.mesh.scaling.setAll(scale);
            }
        }
    }
}
