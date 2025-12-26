import './style.css'
import { Engine } from '@babylonjs/core/Engines/engine';
import { Scene } from '@babylonjs/core/scene';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight';
import { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { PointerEventTypes } from '@babylonjs/core/Events/pointerEvents';
import { GlowLayer } from '@babylonjs/core/Layers/glowLayer';
import "@babylonjs/core/Culling/ray"; 

import { GridSystem, CellType } from './GridSystem';
import { GridRenderer } from './GridRenderer';
import { FlowRenderer } from './FlowRenderer';
import { WindRenderer } from './WindRenderer';
import { Agent } from './Agent';
import type { Solver } from './Solver';
import { MdpSolver } from './MdpSolver';
import { AStarSolver } from './AStarSolver';

/**
 * Main Entry Point
 * Sets up the Babylon.js scene, camera, and render loop.
 * Initializes the Grid, Solvers, Renderers, and Agent.
 * Handles user input (painting, tool selection) and UI integration.
 */

// Get the canvas element
const canvas = document.getElementById('renderCanvas') as HTMLCanvasElement;
const canvasContainer = document.getElementById('canvas-container');

// Initialize Babylon Engine
const engine = new Engine(canvas, true);

// Create Scene
const createScene = () => {
    const scene = new Scene(engine);
    scene.clearColor = new Color3(0.02, 0.02, 0.05).toColor4(); // Deep Void Black/Blue

    // --- FX ---
    const glow = new GlowLayer("glow", scene);
    glow.intensity = 0.3;

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
    let currentSolver: Solver = aStarSolver; // Default to A*
    let currentSolverType: 'mdp' | 'astar' = 'astar';

    // --- Render Loop Logic ---
    scene.onBeforeRenderObservable.add(() => {
        // Only recalculate path if stopped (Create Mode) OR if using MDP (Probabilistic)
        if (!isSimulationRunning || currentSolverType === 'mdp') {
            currentSolver.iterate(currentSolverType === 'astar' ? agent.virtualPosition : agent.position);
        }
        
        const values = currentSolver.getValues();
        flowRenderer.updatePolicy(currentSolver.policy, values, currentSolverType);
        gridRenderer.updateVisuals(values, currentSolverType);
        
        if (isSimulationRunning) {
            agent.update(engine.getDeltaTime() / 1000, currentSolver);
            
            // Check if agent stopped (Collision/Goal/Edge)
            if (agent.isStopped) {
                const stopBtn = document.getElementById('btn-play-simulation');
                if (stopBtn && isSimulationRunning) {
                    stopBtn.click(); // Trigger the stop logic
                }
            }
        }
        
        // Update Compass
        const compass = document.getElementById('compass-container');
        if (compass) {
            const deg = (camera.alpha * 180 / Math.PI) + 90;
            compass.style.transform = `rotate(${deg}deg)`;
        }
    });

    // --- Camera Setup ---
    const center = new Vector3(15, 0, 15);
    
    // Single Orbit Camera
    const camera = new ArcRotateCamera("camera", -Math.PI / 4, Math.PI / 4, 40, center, scene);
    camera.lowerRadiusLimit = 10;
    camera.upperRadiusLimit = 100;
    camera.attachControl(canvas, true);

    const setCameraView = (mode: 'top' | 'iso') => {
        if (mode === 'top') {
            // Top-down view
            camera.beta = 0.01; 
            camera.alpha = -Math.PI / 2;
        } else {
            // Isometric view (Corner 45 deg)
            camera.beta = Math.PI / 4;
            camera.alpha = -Math.PI / 4;
        }
    };
    
    // Initialize Iso (Camera is already init to this, but consistent fn call)
    // setCameraView('iso'); 

    // --- Resize Handling ---
    const updateCameraProjection = () => {
        engine.resize();
    };
    
    if (canvasContainer) {
        new ResizeObserver(updateCameraProjection).observe(canvasContainer);
    }
    window.addEventListener('resize', updateCameraProjection);

    // --- Lighting & Environment ---
    const light = new HemisphericLight("light", new Vector3(0, 1, 0), scene);
    light.intensity = 0.7;

    // Invisible Ground for Picking
    const ground = MeshBuilder.CreateGround("ground", { width: 30, height: 30 }, scene);
    ground.position = new Vector3(15, 0, 15);
    ground.visibility = 0; 
    ground.isPickable = true;

    // --- Interaction State ---
    let isPainting = false;
    let activeMode: 'wall' | 'wind' | 'goal' | 'erase' | 'agent' | 'inspect' = 'inspect';
    let isSimulationRunning = false;
    let agentStartPos = { x: 0, y: 0 };

    // --- UI Construction ---
    const setupUI = () => {
        const mainLayout = document.getElementById('main-layout');
        const toolsSection = document.getElementById('tools-section');
        const buttonsContainer = document.getElementById('tool-buttons');
        
        if (!toolsSection || !buttonsContainer || !mainLayout) return;

        // --- Top Bar (Play/Stop & Compass) ---
        const topBar = document.createElement('div');
        topBar.style.position = 'absolute';
        topBar.style.top = '0';
        topBar.style.left = '0';
        topBar.style.width = '100%';
        topBar.style.height = '60px';
        topBar.style.display = 'flex';
        topBar.style.justifyContent = 'space-between';
        topBar.style.alignItems = 'center';
        topBar.style.padding = '0 20px';
        topBar.style.boxSizing = 'border-box';
        topBar.style.pointerEvents = 'none'; // Let clicks pass through to canvas
        topBar.style.zIndex = '10';
        
        // Play Button
        const playBtn = document.createElement('button');
        playBtn.id = 'btn-play-simulation';
        playBtn.textContent = '▶ RUN SIMULATION';
        playBtn.style.pointerEvents = 'auto';
        playBtn.style.background = 'rgba(0, 20, 40, 0.8)';
        playBtn.style.border = '2px solid #0f0';
        playBtn.style.color = '#0f0';
        playBtn.style.padding = '10px 20px';
        playBtn.style.fontFamily = 'monospace';
        playBtn.style.fontSize = '16px';
        playBtn.style.cursor = 'pointer';
        playBtn.style.fontWeight = 'bold';
        
        playBtn.onclick = () => {
            isSimulationRunning = !isSimulationRunning;
            if (isSimulationRunning) {
                playBtn.textContent = '⏹ STOP / RESET';
                playBtn.style.borderColor = '#f00';
                playBtn.style.color = '#f00';
                // Store start pos
                agentStartPos = { x: Math.floor(agent.position.x), y: Math.floor(agent.position.z) };
                agent.setMode(currentSolverType);
            } else {
                playBtn.textContent = '▶ RUN SIMULATION';
                playBtn.style.borderColor = '#0f0';
                playBtn.style.color = '#0f0';
                // Reset Agent
                agent.setPosition(agentStartPos.x, agentStartPos.y);
                currentSolver.reset(); // Reset solver state (visited nodes etc)
            }
        };
        topBar.appendChild(playBtn);

        // Compass
        const compass = document.createElement('div');
        compass.id = 'compass-container';
        compass.style.width = '80px';
        compass.style.height = '80px';
        compass.style.position = 'relative';
        compass.style.borderRadius = '50%';
        compass.style.border = '2px solid cyan';
        compass.style.background = 'rgba(0, 20, 40, 0.8)';
        compass.style.boxShadow = '0 0 10px cyan';
        compass.style.marginRight = '20px'; // Offset from edge

        const labelStyle = 'position: absolute; color: cyan; font-family: monospace; font-weight: bold; font-size: 12px;';
        compass.innerHTML = `
            <div style="${labelStyle} top: 5px; left: 50%; transform: translateX(-50%);">N</div>
            <div style="${labelStyle} bottom: 5px; left: 50%; transform: translateX(-50%);">S</div>
            <div style="${labelStyle} left: 5px; top: 50%; transform: translateY(-50%);">W</div>
            <div style="${labelStyle} right: 5px; top: 50%; transform: translateY(-50%);">E</div>
            <div style="position: absolute; top: 50%; left: 50%; width: 4px; height: 4px; background: cyan; transform: translate(-50%, -50%); border-radius: 50%;"></div>
        `;
        topBar.appendChild(compass);

        mainLayout.appendChild(topBar);

        // --- Save / Load Buttons ---
        const ioDiv = document.createElement('div');
        ioDiv.style.display = 'flex';
        ioDiv.style.gap = '5px';
        ioDiv.style.marginTop = '10px';
        
        const saveBtn = document.createElement('button');
        saveBtn.textContent = '💾 Save';
        saveBtn.className = 'mode-btn';
        saveBtn.onclick = () => {
            const ax = Math.floor(agent.position.x);
            const ay = Math.floor(agent.position.z);
            const data = gridSystem.serialize(ax, ay);
            const blob = new Blob([data], { type: 'text/plain' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'grid_scenario.txt';
            a.click();
            URL.revokeObjectURL(url);
        };
        
        const loadBtn = document.createElement('button');
        loadBtn.textContent = '📂 Load';
        loadBtn.className = 'mode-btn';
        loadBtn.onclick = () => {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = '.txt';
            input.onchange = (e) => {
                const file = (e.target as HTMLInputElement).files?.[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onload = (evt) => {
                    const text = evt.target?.result as string;
                    if (text) {
                        const startPos = gridSystem.deserialize(text);
                        // Refresh Visuals
                        gridRenderer.update();
                        windRenderer.updateWindData(); // Re-read grid
                        // Technically WindRenderer reads live in animate, but if it optimized? 
                        // It reads live.
                        
                        if (startPos) {
                            agent.setPosition(startPos.agentX, startPos.agentY);
                            agentStartPos = { x: startPos.agentX, y: startPos.agentY };
                        }
                        
                        // Stop simulation if running
                        if (isSimulationRunning) {
                            playBtn.click(); // Toggle off
                        }
                    }
                };
                reader.readAsText(file);
            };
            input.click();
        };
        
        ioDiv.appendChild(saveBtn);
        ioDiv.appendChild(loadBtn);
        toolsSection.appendChild(ioDiv);

        // 1. Solver Switcher
        const solverDiv = document.createElement('div');
        solverDiv.className = 'solver-switch';
        solverDiv.style.marginBottom = '15px';
        solverDiv.style.display = 'flex';
        solverDiv.style.flexDirection = 'column';
        solverDiv.style.gap = '10px';
        solverDiv.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center;">
                <label style="color: white; font-family: monospace;">Algorithm:</label>
                <select id="solver-select" style="background: #333; color: cyan; border: 1px solid cyan; padding: 2px;">
                    <option value="astar" selected>A* (Deterministic)</option>
                    <option value="mdp">MDP (Probabilistic)</option>
                </select>
            </div>
            <div style="display: flex; justify-content: space-between; align-items: center;">
                <label style="color: white; font-family: monospace;">View:</label>
                <div style="display: flex; gap: 5px;">
                    <button id="btn-view-iso" style="background: #333; color: lime; border: 1px solid lime; cursor: pointer; padding: 2px 6px;">Angled</button>
                    <button id="btn-view-top" style="background: #333; color: lime; border: 1px solid lime; cursor: pointer; padding: 2px 6px;">Top</button>
                </div>
            </div>
        `;
        
        // Insert before buttons
        toolsSection.insertBefore(solverDiv, buttonsContainer);
        
        const select = document.getElementById('solver-select') as HTMLSelectElement;
        select.onchange = (e) => {
            const val = (e.target as HTMLSelectElement).value;
            if (val === 'mdp') {
                currentSolver = mdpSolver;
                currentSolverType = 'mdp';
                currentSolver.reset(); 
            } else {
                currentSolver = aStarSolver;
                currentSolverType = 'astar';
                currentSolver.reset();
            }
            agent.setMode(currentSolverType);
        };

        const btnIso = document.getElementById('btn-view-iso') as HTMLButtonElement;
        const btnTop = document.getElementById('btn-view-top') as HTMLButtonElement;
        
        btnIso.onclick = () => setCameraView('iso');
        btnTop.onclick = () => setCameraView('top');

        // 1.5 Wind Controls
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
                    <option value="0,1">North</option>
                    <option value="1,0">East</option>
                    <option value="0,-1">South</option>
                    <option value="-1,0">West</option>
                </select>
                <input id="wind-force" type="number" min="1" max="10" value="2" style="width: 50px; background: #300; color: #faa; border: 1px solid #faa;">
                <span style="color: #faa; font-size: 12px;">blocks</span>
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
            { id: 'agent', label: 'Place Cycle', type: null },
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
                windRenderer.updateWindData(); 
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