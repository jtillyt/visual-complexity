import { GridSystem, CellType } from './GridSystem';
import type { Solver } from './Solver';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';

/**
 * MdpSolver implements Value Iteration to solve the Bellman Equation.
 * It provides a comprehensive policy for every cell in the grid, accounting for uncertainty.
 */
export class MdpSolver implements Solver {
    private grid: GridSystem;
    private values: Float32Array;
    public policy: Float32Array; // Angles in radians
    
    // Hyperparameters
    private gamma: number = 0.95; // Discount factor
    private noise: number = 0.2;  // Probability of moving in a random perpendicular direction
    
    // Rewards
    private rewardGoal: number = 10.0;
    // private rewardWind: number = -2.0; // Removed, wind is invisible to planner
    private rewardStep: number = -0.1;
    private rewardWall: number = -1.0; // Penalty for hitting a wall

    // Actions: 0: Up, 1: Right, 2: Down, 3: Left
    private actions = [
        { dx: 0, dy: 1, angle: Math.PI / 2 },    // Up
        { dx: 1, dy: 0, angle: 0 },              // Right
        { dx: 0, dy: -1, angle: -Math.PI / 2 },  // Down
        { dx: -1, dy: 0, angle: Math.PI }        // Left
    ];

    constructor(grid: GridSystem) {
        this.grid = grid;
        const size = grid.width * grid.height;
        this.values = new Float32Array(size);
        this.policy = new Float32Array(size);
    }

    /**
     * Performs one iteration of Value Iteration over the entire grid.
     * @param _agentPosition Optional, ignored by MDP (solves for all states).
     */
    public iterate(_agentPosition?: Vector3): void {
        const nextValues = new Float32Array(this.values.length);
        const width = this.grid.width;
        const height = this.grid.height;

        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const index = this.grid.getFlatIndex(x, y);
                const cellType = this.grid.getCell(x, y);

                // Terminal state: Goal
                if (cellType === CellType.Goal) {
                    nextValues[index] = this.rewardGoal;
                    this.policy[index] = 0; // Doesn't matter
                    continue;
                }

                // Walls don't have values/policy
                if (cellType === CellType.Wall) {
                    nextValues[index] = 0;
                    continue;
                }

                // Standard Bellman Update: V(s) = max_a sum_s' P(s'|s,a) [R(s,a,s') + gamma * V(s')]
                let bestValue = -Infinity;
                let bestAngle = 0;

                for (let a = 0; a < this.actions.length; a++) {
                    const qValue = this.calculateQValue(x, y, a);
                    if (qValue > bestValue) {
                        bestValue = qValue;
                        bestAngle = this.actions[a].angle;
                    }
                }

                nextValues[index] = bestValue;
                this.policy[index] = bestAngle;
            }
        }

        this.values = nextValues;
    }

    private calculateQValue(x: number, y: number, actionIdx: number): number {
        const leftIdx = (actionIdx + 3) % 4;
        const rightIdx = (actionIdx + 1) % 4;
        
        // Probability distribution
        // 1 - noise: Intended direction
        // noise / 2: Left
        // noise / 2: Right
        
        let q = 0;
        
        // Intended
        q += (1 - this.noise) * this.getTransitionValue(x, y, actionIdx);
        // Noise directions
        q += (this.noise / 2) * this.getTransitionValue(x, y, leftIdx);
        q += (this.noise / 2) * this.getTransitionValue(x, y, rightIdx);
        
        return q;
    }

    private getTransitionValue(x: number, y: number, actionIdx: number): number {
        const action = this.actions[actionIdx];
        let nx = x + action.dx;
        let ny = y + action.dy;

        let reward = this.rewardStep;
        
        // Check bounds and walls
        if (!this.grid.isValid(nx, ny) || this.grid.getCell(nx, ny) === CellType.Wall) {
            nx = x;
            ny = y;
            reward += this.rewardWall; // Bumped into wall
        }

        // Wind is now invisible to the planner (no extra penalty)
        // const nextCellType = this.grid.getCell(nx, ny);
        // if (nextCellType === CellType.Wind) {
        //     reward += this.rewardWind;
        // }

        const nextIndex = this.grid.getFlatIndex(nx, ny);
        return reward + this.gamma * this.values[nextIndex];
    }

    public getValues(): Float32Array {
        return this.values;
    }
    
    public reset(): void {
        this.values.fill(0);
        this.policy.fill(0);
    }
}
