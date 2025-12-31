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
-   **A* (Deterministic):** Finds the absolute shortest path. It assumes perfect movement and ignores environmental risks like wind during the planning phase.
-   **MDP (Probabilistic):** The agent assumes the world is slippery (noise). It generates a global "Policy Field" that guides the agent safely.

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

### 4. Simulation Controls
-   **▶ RUN / ⏹ STOP:** Toggles the simulation state (Pause/Resume). This allows you to pause and inspect the state without resetting.
-   **↺ RESET AGENT:** Returns the agent to its starting position for the current run. Useful for retrying the same scenario multiple times.

## 🧠 The "Rigid vs Fluid" Insight

This visualization demonstrates the core difference between pathfinding and policy-based planning:

### The Invisible Trap (Wind)
Unlike Walls, **Wind is ignored during the pre-planning phase** for both algorithms (Cost = 1, same as empty). This creates a "Trap" scenario:
-   The **A* Solver** calculates a direct line without consideration of any wind. Once it hits the wind, it is blown off course and continues on its preprogrammed route without a way to recover.
-   The **MDP Solver** (in its current configuration) also plans through the wind but demonstrates how a global policy field allows for immediate correction even when pushed far from the "optimal" path.

### Visual Representation
-   **Policy Field (Cyan Arrows):** The "Brain" of the agent. Shows the intended direction for every cell.
-   **Wind Vectors (Light Blue Pulsating Arrows):** The "Fluid" world. Shows the direction and force of physical displacement.
-   **Heatmap:** Red to Green gradients represent the "Value" (proximity to goal/safety) of each cell.

## 🎨 Renderers & Visualization
To maintain 60FPS with thousands of dynamic objects, this project utilizes **Babylon.js Thin Instances** for almost all grid-based visuals. This allows for a single draw call per mesh type.

-   **`GridRenderer` (Environment):**
    -   Renders the 30x30 floor grid with a holographic border texture.
    -   Visualizes the "Value Map" (Heatmap) by updating vertex colors of the floor tiles.
    -   Renders the 3D Wall blocks and the pulsating Neon Green Goal arrows.
-   **`FlowRenderer` (The Policy):**
    -   Visualizes the solver's output as a field of instanced arrows.
    -   **Smooth Lerping:** Arrows smoothly rotate to their new target angles when the policy updates, creating a "liquid flow" effect.
    -   Filters visibility based on the active solver (e.g., only showing the A* path).
-   **`WindRenderer` (Environmental Physics):**
    -   Renders "Fan" source models with spinning blades (speed tied to wind force).
    -   Simulates "Particle Streams" (small dots) that flow through the wind field to show the direction and magnitude of displacement.
-   **`ExplosionRenderer` (Visual Feedback):**
    -   Triggers a burst of neon orange line shards when the agent collides with a wall or grid edge.
    -   Uses procedural animation to fade and scale particles over time.

## 📂 Project Structure

-   `src/GridSystem.ts`: The raw data layer. Stores cell types (Wall, Empty, Goal, Wind) and specific Wind configurations (Direction/Force).
-   `src/MdpSolver.ts`: Implements Value Iteration (Bellman Equation) to generate a global policy.
-   `src/AStarSolver.ts`: Implements A* Pathfinding to generate a single optimal path (visualized as a policy along that path).
-   `src/Solver.ts`: Interface defining the common structure for both solvers.
-   `src/FlowRenderer.ts`: Visualizes the Policy (Solver output) using 2500+ instanced arrows.
-   `src/WindRenderer.ts`: Visualizes the Wind (Environment) using pulsating instanced arrows.
-   `src/ExplosionRenderer.ts`: Handles visual effects (orange sparks) for collisions.
-   `src/GridRenderer.ts`: Renders the base grid tiles.
-   `src/Agent.ts`: The "Rover" that interacts with both the policy (for intended direction) and the physics of the world (Wind force).
-   `src/main.ts`: The entry point. Sets up the Babylon.js Scene, Camera, Light, UI, and Render Loop.

## 🎨 Visual Style
"Cyberpunk Lab" / "Neon" aesthetic:
-   Dark background for high contrast.
-   Sky Aqua for Policy / Intelligence.
-   Blue Energy (Pulsating) for Environmental Forces.
-   Neon Green for Goals and High-Value zones.

### Color Palette

| Variable | Hex | Usage |
| :--- | :--- | :--- |
| **`--jay-bg-dark`** | `#0a0a12` | **Main Background.** Deep space black. |
| **`--jay-panel-bg`** | `#141420` | **Panels/Cards.** Slightly lighter than background. |
| **`--jay-accent-primary`** | `#4cc9f0` | **Sky Aqua.** Primary actions, active states, highlights. |
| **`--jay-accent-secondary`** | `#b5179e` | **Raspberry Plum.** Secondary accents, data visualization. |
| **`--jay-text-body`** | `#cfcfd1` | **Body Text.** Off-white for high readability on dark backgrounds. |
| **`--jay-text-muted`** | `#6b6b7b` | **Meta Data.** Labels, footnotes, inactive states. |

### Extended Palette

These variables provide access to the full color palette for use in component-specific styles.
- Found at https://coolors.co/f72585-b5179e-7209b7-560bad-480ca8-3a0ca3-3f37c9-4361ee-4895ef-4cc9f0

| Variable | Hex | Name |
| :--- | :--- | :--- |
| `--jay-color-neon-pink` | `#f72585` | Neon Pink |
| `--jay-color-raspberry-plum` | `#b5179e` | Raspberry Plum |
| `--jay-color-indigo-bloom` | `#7209b7` | Indigo Bloom |
| `--jay-color-ultrasonic-blue` | `#560bad` | Ultrasonic Blue |
| `--jay-color-true-azure` | `#480ca8` | True Azure |
| `--jay-color-vivid-royal` | `#3a0ca3` | Vivid Royal |
| `--jay-color-bright-indigo` | `#3f37c9` | Bright Indigo |
| `--jay-color-electric-sapphire` | `#4361ee` | Electric Sapphire |
| `--jay-color-blue-energy` | `#4895ef` | Blue Energy |
| `--jay-color-sky-aqua` | `#4cc9f0` | Sky Aqua |
| `--jay-color-muted-yellow` | `#F4CB38` | Muted Yellow | 
- Yellow added from color calculator using existing palette