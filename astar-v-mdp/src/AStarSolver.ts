import { GridSystem, CellType } from './GridSystem';
import type { Solver } from './Solver';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';

/**
 * AStarSolver implements the A* pathfinding algorithm.
 * Unlike MDP, it produces a single optimal path from the Agent to the Goal.
 */
export class AStarSolver implements Solver {
    private grid: GridSystem;
    public policy: Float32Array;
    private values: Float32Array;

    // Directions: Up, Right, Down, Left
    private actions = [
        { dx: 0, dy: 1, angle: Math.PI / 2 },
        { dx: 1, dy: 0, angle: 0 },
        { dx: 0, dy: -1, angle: -Math.PI / 2 },
        { dx: -1, dy: 0, angle: Math.PI }
    ];

    constructor(grid: GridSystem) {
        this.grid = grid;
        const size = grid.width * grid.height;
        this.policy = new Float32Array(size);
        this.values = new Float32Array(size); // We can use this to show G or F costs
    }

    /**
     * Executes the A* search from the given Agent position to the Goal(s).
     * @param agentPosition The current position of the agent in world space.
     */
    public iterate(agentPosition?: Vector3): void {
        if (!agentPosition) return;

        // Reset
        this.policy.fill(0); // Default direction (Right) or maybe we should use a sentinel?
                             // 0 is Right, which is confusing if it's "no path". 
                             // But FlowRenderer lerps, so maybe it's fine.
        this.values.fill(0);

        const startX = Math.floor(agentPosition.x);
        const startY = Math.floor(agentPosition.z);

        if (!this.grid.isValid(startX, startY)) return;

        // Find Goal(s)
        const goals: { x: number, y: number }[] = [];
        for (let y = 0; y < this.grid.height; y++) {
            for (let x = 0; x < this.grid.width; x++) {
                if (this.grid.getCell(x, y) === CellType.Goal) {
                    goals.push({ x, y });
                }
            }
        }

        if (goals.length === 0) return; // No goal

        // A* Algorithm
        // For simplicity, just target the first found goal (or nearest).
        const goal = goals[0]; 

        const openSet: { x: number, y: number, f: number, g: number, parent?: {x: number, y: number, angle: number} }[] = [];
        const closedSet = new Set<number>();
        
        // Map to store nodes by index for easy lookup
        const gScores = new Map<number, number>();
        
        const startIdx = this.grid.getFlatIndex(startX, startY);
        gScores.set(startIdx, 0);

        const h = (x1: number, y1: number, x2: number, y2: number) => Math.abs(x1 - x2) + Math.abs(y1 - y2); // Manhattan

        openSet.push({ 
            x: startX, 
            y: startY, 
            g: 0, 
            f: h(startX, startY, goal.x, goal.y) 
        });

        const cameFrom = new Map<number, { fromIdx: number, angle: number }>();

        while (openSet.length > 0) {
            // Sort by f (lowest first) - inefficient but works for grid size
            openSet.sort((a, b) => a.f - b.f);
            const current = openSet.shift()!;
            const currentIdx = this.grid.getFlatIndex(current.x, current.y);

            if (current.x === goal.x && current.y === goal.y) {
                // Reconstruct path
                this.reconstructPath(cameFrom, currentIdx);
                return;
            }

            closedSet.add(currentIdx);

            for (let action of this.actions) {
                const nx = current.x + action.dx;
                const ny = current.y + action.dy;
                
                if (!this.grid.isValid(nx, ny)) continue;
                if (this.grid.getCell(nx, ny) === CellType.Wall) continue;
                
                const neighborIdx = this.grid.getFlatIndex(nx, ny);
                if (closedSet.has(neighborIdx)) continue;

                // Cost is 1 for generic move.
                // Wind is now invisible to planner (cost 1).
                let stepCost = 1;
                // if (this.grid.getCell(nx, ny) === CellType.Wind) stepCost = 5;

                const tentativeG = current.g + stepCost;
                
                const existingNode = openSet.find(n => n.x === nx && n.y === ny);
                if (!existingNode || tentativeG < existingNode.g) {
                    cameFrom.set(neighborIdx, { fromIdx: currentIdx, angle: action.angle });
                    
                    const f = tentativeG + h(nx, ny, goal.x, goal.y);
                    if (!existingNode) {
                        openSet.push({ x: nx, y: ny, g: tentativeG, f: f });
                    } else {
                        existingNode.g = tentativeG;
                        existingNode.f = f;
                    }
                    
                    // Visualization: Show visited set in Values
                    this.values[neighborIdx] = 0.2; // Dim color for visited
                }
            }
        }
    }

    private reconstructPath(cameFrom: Map<number, { fromIdx: number, angle: number }>, currentIdx: number) {
        let curr = currentIdx;
        while (cameFrom.has(curr)) {
            const data = cameFrom.get(curr)!;
            // The 'angle' stored is how we GOT to curr (from parent).
            // But the policy needs to be: at Parent, go Angle.
            const parentIdx = data.fromIdx;
            
            this.policy[parentIdx] = data.angle;
            this.values[parentIdx] = 1.0; // Highlight path
            
            curr = parentIdx;
        }
        // Mark goal
        this.values[currentIdx] = 1.0;
    }

    public getValues(): Float32Array {
        return this.values;
    }

    public reset(): void {
        this.policy.fill(0);
        this.values.fill(0);
    }
}
