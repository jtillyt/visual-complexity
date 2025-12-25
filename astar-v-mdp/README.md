# The Planner: A* vs MDP Visualization

A real-time interactive visualization comparing **Deterministic (A*)** and **Probabilistic (MDP)** planning algorithms in a grid world.

Built with **Babylon.js**, **TypeScript**, and **Vite**.

## 🚀 Quick Start

1.  **Install Dependencies:**
    ```bash
    npm install
    ```

2.  **Run Development Server:**
    ```bash
    npm run dev
    ```
    Open the local URL (usually `http://localhost:5173`) in your browser.

## 🎮 How to Use

### 1. Select Algorithm
Use the dropdown in the tools panel to switch between:
-   **MDP (Probabilistic):** The agent assumes the world is slippery (noise). It generates a global "Policy Field" that guides the agent safely.
-   **A* (Deterministic):** Finds the absolute shortest path. It assumes perfect movement and ignores environmental risks like wind during the planning phase.

### 2. Paint the World
-   **Goal (3):** The destination for the rover.
-   **Wall (1):** Impassable obstacles.
-   **Wind (2):** Invisible hazards that only affect the agent upon contact. When selected, you can configure:
    -   **Direction:** The push vector of the wind (Up, Down, Left, Right).
    -   **Force:** The magnitude of the push (how many blocks per second of offset).
-   **Erase (0):** Clear tiles.
-   **Inspect (4):** Hover to see exact Value estimates, Policy angles, and Wind configurations.

### 3. Place Agent
-   Select **Place Agent** or **Right Click** anywhere to teleport the rover.
-   Watch it follow the policy field!

## 🧠 The "Rigid vs Fluid" Insight

This visualization demonstrates the core difference between pathfinding and policy-based planning:

### The Invisible Trap (Wind)
Unlike Walls, **Wind is ignored during the pre-planning phase** for both algorithms. This creates a "Trap" scenario:
-   The **A* Solver** chooses the direct line through the wind, assuming it can move perfectly. Once it hits the wind, it is blown off course and must constantly recalculate.
-   The **MDP Solver** (in its current state) also plans through the wind but demonstrates how a global policy field allows for immediate correction even when pushed far from the "optimal" path.

### Visual Representation
-   **Policy Field (Cyan Arrows):** The "Brain" of the agent. Shows the intended direction for every cell.
-   **Wind Vectors (Light Blue Pulsating Arrows):** The "Fluid" world. Shows the direction and force of physical displacement.
-   **Heatmap:** Red to Green gradients represent the "Value" (proximity to goal/safety) of each cell.

## 📂 Project Structure

-   `src/GridSystem.ts`: Data layer for Walls, Goals, and Wind configurations.
-   `src/MdpSolver.ts`: Implements Value Iteration (Bellman Equation).
-   `src/AStarSolver.ts`: Implements A* Heuristic Search.
-   `src/FlowRenderer.ts`: High-performance visualization of the policy field.
-   `src/WindRenderer.ts`: Visualizes environmental forces with pulsating light-blue vectors.
-   `src/Agent.ts`: The "Rover" that interacts with both the policy and the physics of the world.

## 🎨 Visual Style
"Cyberpunk Lab" / "Neon" aesthetic:
-   Dark background for high contrast.
-   Neon Cyan for Policy / Intelligence.
-   Neon Blue (Pulsating) for Environmental Forces.
-   Neon Green for Goals and High-Value zones.