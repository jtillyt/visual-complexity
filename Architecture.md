# Project: "The Planner" (Windy Grid World)

## Strategic Context
This project is part of the "Jaybird Labs" portfolio (Principal Engineer Brand).
**Goal:** Visualize the difference between deterministic planning (A*) and probabilistic planning (MDP) in robotics.
**Key Insight:** "Code is rigid, but the world is fluid." We demonstrate this by visualizing the Policy ($\pi$) not as static arrows, but as a dynamic "flow field" that reacts to obstacles like water flowing around a rock.

## Tech Stack Rules (Strict)
1.  **Frontend:** Vite + TypeScript (No Blazor).
2.  **Graphics:** Babylon.js (WebGL).
3.  **Math Layer:** TypeScript (Value Iteration Solver).
4.  **Styling:** "Cyberpunk Lab" / "Neon" (Dark background, glowing vectors, high contrast).

## Architecture Patterns
### 1. The Separation of Concerns
-   **`GridSystem.ts` (The Data):** Holds the state of every cell (Wall, Wind, Goal, Empty). Pure data structure.
-   **`MdpSolver.ts` (The Math):**
    -   Implements Value Iteration (Bellman Equation).
    -   Must be **non-blocking** (run one iteration per frame or via WebWorker) to ensure 60FPS UI.
-   **`FlowRenderer.ts` (The View):**
    -   Instead of drawing 1 mesh per arrow (too slow for 2500 cells), use **Babylon.js Solid Particle System (SPS)** or **Thin Instances** to render thousands of policy arrows efficiently.
    -   Arrows should smoothly interpolate directions, creating a "liquid" visual effect.

### 2. The Interaction Model
-   **Mode A (Deterministic):** User draws walls. Agent plans straight line (A* style).
-   **Mode B (Probabilistic):** User paints "Wind" (High cost/Uncertainty zones).
    -   Solver updates Value Map in real-time.
    -   Policy arrows ripple around the wind.
    -   Agent takes a curved path to maximize safety.

## Implementation Phases

### Phase 1: The Grid & Camera
-   Setup a top-down Orthographic Camera in Babylon.js.
-   Render a 50x50 grid of tiles.
-   Implement Mouse Interaction: Click-drag to paint "Walls" and "Wind" (visualized as semi-transparent red zones).

### Phase 2: The "Flow" Visualization
-   Implement `FlowRenderer`.
-   **Crucial Visual:** Create a field of 2,500 arrows floating above the grid.
-   Test the aesthetic: When a vector changes from "Up" to "Right," it should lerp (rotate smoothly), not snap.

### Phase 3: The Solver (The Brain)
-   Implement the Bellman Update: `V(s) = R(s) + gamma * max(sum(P(s'|s,a) * V(s')))`
-   Wire the Solver to the Render Loop:
    ```typescript
    scene.onBeforeRenderObservable.add(() => {
       solver.iterate(); // Run 1 step
       renderer.updateArrows(solver.policy);
    });
    ```
-   *Optimization:* Use 1D array flattening for the grid data to improve cache locality.

### Phase 4: The Agent
-   Spawn a "Rover" mesh.
-   Movement logic: The Rover queries the current cell's Policy Vector and applies force in that direction (plus random noise if in a Wind tile).

## Future Context
-   This project must share a visual language with "The Controller" (PID vs AI). Use the same color palette (Neon Green for good, Red for bad/high cost).