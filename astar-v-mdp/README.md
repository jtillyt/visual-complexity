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
-   **MDP (Probabilistic):** The default mode. The agent assumes the world is slippery (noise). It generates a "Policy Field" that guides the agent safely away from hazards, even if the path is longer.
-   **A* (Deterministic):** Finds the absolute shortest path. It assumes perfect movement and ignores the risk of slipping, often hugging walls or wind zones dangerously.

### 2. Paint the World
Use the toolbar or keyboard shortcuts to modify the grid:
-   **Goal (3):** Where the agent wants to go.
-   **Wall (1):** Impassable obstacles.
-   **Wind (2):** High-cost zones. In MDP mode, these push the agent around.
-   **Erase (0):** Clear tiles.
-   **Inspect (4):** Hover to see exact Value estimates and Policy angles.

### 3. Place Agent
-   Select **Place Agent** or **Right Click** anywhere to teleport the rover.
-   Watch it follow the flow field!

## 🧠 The Math

### MDP (Markov Decision Process)
Uses **Value Iteration** to solve the Bellman Equation:
$$ V(s) = R(s) + \gamma \max_a \sum_{s'} P(s'|s,a) V(s') $$

-   **Insight:** The arrows don't just point to the goal; they point to the *safest* direction that makes progress.
-   **Visual:** Watch how the arrows "flow" like water around obstacles.

### A* (A-Star)
Uses heuristic search ($f = g + h$) to find the shortest path.
-   **Insight:** Efficient but brittle. It generates a single path (highlighted) rather than a global policy.

## 📂 Project Structure

-   `src/GridSystem.ts`: The raw data layer (Walls, Wind, Empty).
-   `src/MdpSolver.ts`: Implements Value Iteration.
-   `src/AStarSolver.ts`: Implements A* Pathfinding.
-   `src/FlowRenderer.ts`: Visualizes the policy using Babylon.js Thin Instances (rendering 2500+ arrows efficiently).
-   `src/Agent.ts`: The rover that obeys the current policy.

## 🎨 Visual Style
"Cyberpunk Lab" aesthetic:
-   Dark background.
-   Neon Cyan for Policy.
-   Neon Green for High Value / Goals.
-   Neon Red for Low Value / Wind.
