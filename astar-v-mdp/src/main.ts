import './style.css'
import { Engine } from '@babylonjs/core/Engines/engine';
import { Scene } from '@babylonjs/core/scene';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight';
import { FreeCamera } from '@babylonjs/core/Cameras/freeCamera';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { PointerEventTypes } from '@babylonjs/core/Events/pointerEvents';
import "@babylonjs/core/Culling/ray"; // Fix side-effect warning for picking

import { GridSystem, CellType } from './GridSystem';
import { GridRenderer } from './GridRenderer';
import { FlowRenderer } from './FlowRenderer';
import { WindRenderer } from './WindRenderer';
import { Agent } from './Agent';
import type { Solver } from './Solver';
import { MdpSolver } from './MdpSolver';
import { AStarSolver } from './AStarSolver';

// Get the canvas element
const canvas = document.getElementById('renderCanvas') as HTMLCanvasElement;
const canvasContainer = document.getElementById('canvas-container');

// Initialize Babylon Engine
const engine = new Engine(canvas, true);

// Create Scene
const createScene = () => {
    const scene = new Scene(engine);
    scene.clearColor = new Color3(0.05, 0.05, 0.1).toColor4(); // Darker blue

    // --- Core Systems ---
    const gridSystem = new GridSystem(30, 30);
    // Expose for debugging
    (window as any).gridSystem = gridSystem;

    const gridRenderer = new GridRenderer(gridSystem, scene);
    const flowRenderer = new FlowRenderer(gridSystem, scene);
    const windRenderer = new WindRenderer(gridSystem, scene);
    const agent = new Agent(gridSystem, scene, 0, 0);

    // --- Solvers ---
    const mdpSolver = new MdpSolver(gridSystem);
    const aStarSolver = new AStarSolver(gridSystem);
    let currentSolver: Solver = mdpSolver; // Default to MDP

    // --- Render Loop Logic ---
    scene.onBeforeRenderObservable.add(() => {
        // Run solver iteration
        // MDP needs continuous iteration to converge.
        // A* technically only needs to run when grid/agent changes, but running it every frame 
        // ensures immediate response to moving obstacles/agent and is cheap for this grid size.
        currentSolver.iterate(agent.position);
        
        // Update Visuals
        flowRenderer.updatePolicy(currentSolver.policy, currentSolver.getValues());
        agent.update(engine.getDeltaTime() / 1000, currentSolver);
    });

    // --- Camera Setup ---
    // Center of grid is roughly (15, 0, 15)
    const cameraPosition = new Vector3(15, 50, 15);
    const camera = new FreeCamera("camera1", cameraPosition, scene);
    camera.mode = FreeCamera.ORTHOGRAPHIC_CAMERA;
    camera.upVector = new Vector3(0, 0, 1); // Fix gimbal lock for top-down view
    camera.setTarget(new Vector3(15, 0, 15));
    
    // --- Resize Handling ---
    const updateCameraProjection = () => {
        engine.resize();
        
        let width = canvasContainer ? canvasContainer.clientWidth : engine.getRenderWidth();
        let height = canvasContainer ? canvasContainer.clientHeight : engine.getRenderHeight();
        
        if (width === 0) width = window.innerWidth;
        if (height === 0) height = window.innerHeight - 180;
        if (height === 0) height = 1;
        
        const aspectRatio = width / height;
        const targetRadius = 18; 

        if (aspectRatio >= 1) {
            camera.orthoTop = targetRadius;
            camera.orthoBottom = -targetRadius;
            camera.orthoLeft = -targetRadius * aspectRatio;
            camera.orthoRight = targetRadius * aspectRatio;
        } else {
            camera.orthoLeft = -targetRadius;
            camera.orthoRight = targetRadius;
            camera.orthoTop = targetRadius / aspectRatio;
            camera.orthoBottom = -targetRadius / aspectRatio;
        }
    };
    
    if (canvasContainer) {
        new ResizeObserver(updateCameraProjection).observe(canvasContainer);
    }
    setTimeout(updateCameraProjection, 100);

    // --- Lighting & Environment ---
    const light = new HemisphericLight("light", new Vector3(0, 1, 0), scene);
    light.intensity = 0.7;

    const ground = MeshBuilder.CreateGround("ground", { width: 30, height: 30 }, scene);
    ground.position = new Vector3(15, 0, 15);
    ground.visibility = 0; 

    // --- Interaction State ---
    let isPainting = false;
    let activeMode: 'wall' | 'wind' | 'goal' | 'erase' | 'agent' | 'inspect' = 'inspect';

    // --- UI Construction ---
    const setupUI = () => {
        const toolsSection = document.getElementById('tools-section');
        const buttonsContainer = document.getElementById('tool-buttons');
        
        if (!toolsSection || !buttonsContainer) return;

        // 1. Solver Switcher
        const solverDiv = document.createElement('div');
        solverDiv.className = 'solver-switch';
        solverDiv.style.marginBottom = '15px';
        solverDiv.style.display = 'flex';
        solverDiv.style.gap = '10px';
        solverDiv.innerHTML = `
            <label style="color: white; font-family: monospace;">Algorithm:</label>
            <select id="solver-select" style="background: #333; color: cyan; border: 1px solid cyan; padding: 2px;">
                <option value="mdp">MDP (Probabilistic)</option>
                <option value="astar">A* (Deterministic)</option>
            </select>
        `;
        
        // Insert before buttons
        toolsSection.insertBefore(solverDiv, buttonsContainer);
        
        const select = document.getElementById('solver-select') as HTMLSelectElement;
        select.onchange = (e) => {
            const val = (e.target as HTMLSelectElement).value;
            if (val === 'mdp') {
                currentSolver = mdpSolver;
                currentSolver.reset(); // clear old state
            } else {
                currentSolver = aStarSolver;
                currentSolver.reset();
            }
        };

        // 1.5 Wind Controls (Hidden by default, shown when Wind tool active)
        const windControls = document.createElement('div');
        windControls.id = 'wind-controls';
        windControls.style.display = 'none';
        windControls.style.marginTop = '10px';
        windControls.style.marginBottom = '10px';
        windControls.style.padding = '5px';
        windControls.style.border = '1px dashed red';
        windControls.innerHTML = `
            <div style="color: #faa; margin-bottom: 5px;">Wind Settings:</div>
            <div style="display: flex; gap: 5px; flex-wrap: wrap;">
                <select id="wind-dir" style="background: #300; color: #faa; border: 1px solid #faa;">
                    <option value="0,1">Up</option>
                    <option value="1,0">Right</option>
                    <option value="0,-1">Down</option>
                    <option value="-1,0">Left</option>
                </select>
                <input id="wind-force" type="number" min="1" max="10" value="2" style="width: 50px; background: #300; color: #faa; border: 1px solid #faa;">
                <span style="color: #faa; font-size: 12px;">blocks/s</span>
            </div>
        `;
        toolsSection.insertBefore(windControls, buttonsContainer);

        // 2. Tool Buttons
        const tools = [
            { id: 'goal', label: 'Goal', type: CellType.Goal },
            { id: 'wall', label: 'Wall', type: CellType.Wall },
            { id: 'wind', label: 'Wind', type: CellType.Wind },
            { id: 'erase', label: 'Erase', type: CellType.Empty },
            { id: 'inspect', label: 'Inspect', type: null },
            { id: 'agent', label: 'Place Agent', type: null },
            { id: 'reset', label: 'Reset Grid', type: null }
        ];

        tools.forEach(tool => {
            const btn = document.createElement('button');
            btn.className = 'mode-btn';
            btn.textContent = tool.label;
            btn.dataset.mode = tool.id;
            
            if (tool.id === 'reset') {
                btn.style.borderColor = '#d55';
                btn.style.color = '#eaa';
                btn.onclick = () => {
                     if (confirm('Reset the entire grid?')) {
                         gridSystem.reset();
                         gridRenderer.update();
                         windRenderer.updateWindData();
                         mdpSolver.reset();
                         aStarSolver.reset();
                     }
                };
            } else {
                if (tool.id === activeMode) btn.classList.add('active');
                btn.onclick = () => {
                    activeMode = tool.id as any;
                    document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');
                    
                    // Show/Hide Wind Controls
                    const wc = document.getElementById('wind-controls');
                    if (wc) wc.style.display = activeMode === 'wind' ? 'block' : 'none';
                };
            }
            
            buttonsContainer.appendChild(btn);
        });
    };
    setupUI();
    
    // --- Console/Inspector Logic ---
    const cellInfoEl = document.getElementById('cell-info');
    const updateConsole = (x: number, y: number) => {
        if (!cellInfoEl) return;
        
        if (!gridSystem.isValid(x, y)) {
            cellInfoEl.innerHTML = '<p>Hover over grid to inspect.</p>';
            return;
        }

        const index = gridSystem.getFlatIndex(x, y);
        const cellType = gridSystem.getCell(x, y);
        const value = currentSolver.getValues()[index].toFixed(4);
        const policyAngle = currentSolver.policy[index].toFixed(2);
        
        let typeStr = 'Empty';
        let extraInfo = '';
        if (cellType === CellType.Wall) typeStr = 'Wall';
        if (cellType === CellType.Wind) {
            typeStr = 'Wind';
            const w = gridSystem.getWindConfig(x, y);
            if (w) extraInfo = `Dir: (${w.dx}, ${w.dy}) Force: ${w.force}`;
        }
        if (cellType === CellType.Goal) typeStr = 'Goal';

        cellInfoEl.innerHTML = `
            <div class="info-row"><span>Coordinates:</span> <span class="value">(${x}, ${y})</span></div>
            <div class="info-row"><span>Type:</span> <span class="value">${typeStr}</span></div>
            ${extraInfo ? `<div class="info-row" style="color:#faa; font-size:0.8em;">${extraInfo}</div>` : ''}
            <div class="info-row"><span>Value:</span> <span class="value">${value}</span></div>
            <div class="info-row"><span>Policy (rad):</span> <span class="value">${policyAngle}</span></div>
        `;
    };

    // --- Input Handling ---
    window.addEventListener("keydown", (ev) => {
        let newMode: typeof activeMode | null = null;
        if (ev.key === "1") newMode = 'wall';
        if (ev.key === "2") newMode = 'wind';
        if (ev.key === "3") newMode = 'goal';
        if (ev.key === "0") newMode = 'erase';
        if (ev.key === "4") newMode = 'inspect';
        
        if (newMode) {
            activeMode = newMode;
            document.querySelectorAll('.mode-btn').forEach(b => {
                if ((b as HTMLElement).dataset.mode === activeMode) b.classList.add('active');
                else b.classList.remove('active');
            });
            const wc = document.getElementById('wind-controls');
            if (wc) wc.style.display = activeMode === 'wind' ? 'block' : 'none';
        }
    });

    scene.onPointerObservable.add((pointerInfo) => {
        const point = pointerInfo.pickInfo?.pickedPoint;
        if (point) {
            updateConsole(Math.floor(point.x), Math.floor(point.z));
        }

        switch (pointerInfo.type) {
            case PointerEventTypes.POINTERDOWN:
                if (pointerInfo.event.button === 2) { 
                    teleportAgent(point);
                } else if (pointerInfo.event.button === 0 || pointerInfo.event.button === -1 || pointerInfo.event.button === undefined) { 
                    if (activeMode === 'agent') {
                        teleportAgent(point);
                    } else if (activeMode !== 'inspect') {
                        isPainting = true;
                        paintTile(point);
                    }
                }
                break;
            
            case PointerEventTypes.POINTERUP:
                isPainting = false;
                break;
            
            case PointerEventTypes.POINTERMOVE:
                if (isPainting && activeMode !== 'agent') {
                    if (pointerInfo.event instanceof MouseEvent && pointerInfo.event.buttons === 0) {
                        isPainting = false;
                    }
                    else {
                        paintTile(point);
                    }
                }
                break;
        }
    });

    const getCellTypeFromMode = (mode: string): CellType => {
        switch (mode) {
            case 'wall': return CellType.Wall;
            case 'wind': return CellType.Wind;
            case 'goal': return CellType.Goal;
            case 'erase':
            default: return CellType.Empty;
        }
    };

    const paintTile = (point: Vector3 | null | undefined) => {
        if (!point) return;
        
        const x = Math.floor(point.x);
        const y = Math.floor(point.z);

        if (gridSystem.isValid(x, y)) {
            const type = getCellTypeFromMode(activeMode);
            const current = gridSystem.getCell(x, y);
            
            // Allow painting Wind over Wind to update settings
            if (current !== type || type === CellType.Wind) {
                gridSystem.setCell(x, y, type);
                
                if (type === CellType.Wind) {
                    const dirSelect = document.getElementById('wind-dir') as HTMLSelectElement;
                    const forceInput = document.getElementById('wind-force') as HTMLInputElement;
                    const [dx, dy] = dirSelect.value.split(',').map(Number);
                    const force = parseFloat(forceInput.value);
                    gridSystem.setWindConfig(x, y, dx, dy, force);
                }
                
                gridRenderer.update();
                windRenderer.updateWindData(); // Update wind visuals
                // Reset solvers to ensure they react to new map
                // (Though iterate runs every frame, resetting value map helps visualization flow)
                // mdpSolver.reset(); // Optional, keeps momentum if commented out
            }
        }
    };

    const teleportAgent = (point: Vector3 | null | undefined) => {
        if (!point) return;
        const x = Math.floor(point.x);
        const y = Math.floor(point.z);
        if (gridSystem.isValid(x, y)) {
            agent.setPosition(x, y);
        }
    }

    return scene;
};

const scene = createScene();

engine.runRenderLoop(() => {
    scene.render();
});