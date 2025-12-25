import { Vector3 } from '@babylonjs/core/Maths/math.vector';

export interface Solver {
    /**
     * The policy grid: an array of angles (in radians) representing the best direction 
     * for each cell.
     */
    policy: Float32Array;

    /**
     * Run one iteration of the solver (or full solve for A*).
     * @param agentPosition Optional position of the agent, needed for A* replanning.
     */
    iterate(agentPosition?: Vector3): void;

    /**
     * Get the value grid for visualization.
     */
    getValues(): Float32Array;

    /**
     * Reset the internal state.
     */
    reset(): void;
}
