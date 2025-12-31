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
import { ExplosionRenderer } from './ExplosionRenderer';
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
    scene.clearColor = Color3.FromHexString("#0a0a12").toColor4(); // Deep Void Black/Blue

    // --- FX ---
    const glow = new GlowLayer("glow", scene);
    glow.intensity = 0.2;

    // --- Camera Setup ---
    const center = new Vector3(15, -5, 15);
    
    // Single Orbit Camera
    const camera = new ArcRotateCamera("camera", -Math.PI / 4, Math.PI / 4, 30, center, scene);
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

    // --- Lighting & Environment ---
    const light = new HemisphericLight("light", new Vector3(0, 1, 0), scene);
    light.intensity = 0.3;

    // Invisible Ground for Picking (resized dynamically)
    let ground = MeshBuilder.CreateGround("ground", { width: 15, height: 15 }, scene);
    ground.position = new Vector3(15, 0, 15);
    ground.visibility = 0; 
    ground.isPickable = true;

    // --- Core Systems State ---
    let gridSystem: GridSystem;
    let gridRenderer: GridRenderer;
    let flowRenderer: FlowRenderer;
    let windRenderer: WindRenderer;
    let explosionRenderer: ExplosionRenderer;
    let agent: Agent;
    let mdpSolver: MdpSolver;
    let aStarSolver: AStarSolver;
    let currentSolver: Solver;
    
    // --- Interaction State ---
    let currentSolverType: 'mdp' | 'astar' = 'astar';
    let isPainting = false;
    let activeMode: 'wall' | 'wind' | 'goal' | 'erase' | 'agent' | 'inspect' = 'inspect';
    let isSimulationRunning = false;
    let agentStartPos = { x: 0, y: 0 };

    // --- Game Lifecycle ---

    const disposeGame = () => {
        if (gridRenderer) gridRenderer.dispose();
        if (flowRenderer) flowRenderer.dispose();
        if (windRenderer) windRenderer.dispose();
        if (agent) agent.dispose();
        // Solvers and GridSystem are pure data, just let GC handle them.
        // ExplosionRenderer is global FX, but we can clear it.
    };

    const initializeGame = (width: number, height: number) => {
        disposeGame();

        // 1. Grid & Math
        gridSystem = new GridSystem(width, height);
        (window as any).gridSystem = gridSystem; // Debug
        
        mdpSolver = new MdpSolver(gridSystem);
        aStarSolver = new AStarSolver(gridSystem);
        
        // Restore solver selection
        if (currentSolverType === 'mdp') 
            currentSolver = mdpSolver;
        else 
            currentSolver = aStarSolver;

        // 2. Renderers
        gridRenderer = new GridRenderer(gridSystem, scene);
        flowRenderer = new FlowRenderer(gridSystem, scene);
        windRenderer = new WindRenderer(gridSystem, scene);

        // explosionRenderer is persistent (scene-based), but we init it once below if needed.
        if (!explosionRenderer) 
            explosionRenderer = new ExplosionRenderer(scene);

        agent = new Agent(gridSystem, scene, 0, 0);
        agent.setMode(currentSolverType);

        // 3. Camera & Picking Ground
        const centerX = width / 2;
        const centerZ = height / 2;
        camera.setTarget(new Vector3(centerX, 0, centerZ));
        
        if (ground) 
            ground.dispose();

        ground = MeshBuilder.CreateGround("ground", { width: width, height: height }, scene);
        ground.position = new Vector3(centerX, 0, centerZ);
        ground.visibility = 0; 
        ground.isPickable = true;
    };

    // Initial Setup
    initializeGame(15, 15);

    // --- Render Loop Logic ---
    scene.onBeforeRenderObservable.add(() => {
        // Only recalculate path/visuals if stopped (Create Mode) OR if using MDP (Probabilistic)
        if (!isSimulationRunning || currentSolverType === 'mdp') {
            currentSolver.iterate(currentSolverType === 'astar' ? agent.virtualPosition : agent.position);
            
            const values = currentSolver.getValues();
            flowRenderer.updatePolicy(currentSolver.policy, values, currentSolverType);
            gridRenderer.updateVisuals(values, currentSolverType);
        }
        
        const dt = engine.getDeltaTime() / 1000;
        agent.update(dt, currentSolver, isSimulationRunning);

        if (isSimulationRunning) {
            // Check if agent stopped (Collision/Goal/Edge)
            if (agent.isStopped) {
                if (agent.stopReason === 'wall') {
                    explosionRenderer.trigger(agent.position);
                    agent.stopReason = 'none'; // Prevent re-trigger
                }

                const stopBtn = document.getElementById('btn-play-simulation');
                if (stopBtn && isSimulationRunning) {
                    stopBtn.click(); // Trigger the stop logic
                }
            }
        }
        
        explosionRenderer.update(engine.getDeltaTime() / 1000);
        
        // Update Compass
        const compass = document.getElementById('compass-container');
        if (compass) {
            const deg = (camera.alpha * 180 / Math.PI) + 90;
            compass.style.transform = `rotate(${deg}deg)`;
        }
    });

    // --- Resize Handling ---
    const updateCameraProjection = () => {
        engine.resize();
    };
    
    if (canvasContainer) {
        new ResizeObserver(updateCameraProjection).observe(canvasContainer);
    }
    window.addEventListener('resize', updateCameraProjection);


    // --- UI Construction ---
    const setupUI = () => {
        const mainLayout = document.getElementById('main-layout');
        const toolsSection = document.getElementById('tools-section');
        const buttonsContainer = document.getElementById('tool-buttons');
        
        if (!toolsSection || !buttonsContainer || !mainLayout) return;

        // --- Top Bar (Play/Stop & Compass) ---
        // The Top Bar hosts the simulation controls.
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
        playBtn.textContent = '▶ RUN';
        playBtn.style.pointerEvents = 'auto';
        playBtn.style.background = 'rgba(0, 20, 40, 0.8)';
        playBtn.style.border = '2px solid #0f0';
        playBtn.style.color = '#0f0';
        playBtn.style.padding = '10px 20px';
        playBtn.style.fontFamily = 'monospace';
        playBtn.style.fontSize = '16px';
        playBtn.style.cursor = 'pointer';
        playBtn.style.fontWeight = 'bold';
        playBtn.style.marginRight = '10px';
        
        playBtn.onclick = () => {
            isSimulationRunning = !isSimulationRunning;
            if (isSimulationRunning) {
                playBtn.textContent = '⏹ STOP';
                playBtn.style.borderColor = '#f72585';
                playBtn.style.color = '#f72585';
                
                // Ensure agent is free to move
                agent.isStopped = false;
                agent.stopReason = 'none';

                // Store start pos for Reset button
                agentStartPos = { x: Math.floor(agent.position.x), y: Math.floor(agent.position.z) };
                
                agent.setMode(currentSolverType);
            } else {
                playBtn.textContent = '▶ RUN';
                playBtn.style.borderColor = '#0f0';
                playBtn.style.color = '#0f0';
                // Do NOT reset agent position here.
            }
        };
        
        // Reset Button:
        const resetBtn = document.createElement('button');
        resetBtn.textContent = '↺ RESET AGENT';
        resetBtn.style.pointerEvents = 'auto';
        resetBtn.style.background = 'rgba(0, 20, 40, 0.8)';
        resetBtn.style.borderColor = '#4cc9f0';
        resetBtn.style.color = '#4cc9f0';
        resetBtn.style.padding = '10px 20px';
        resetBtn.style.fontFamily = 'monospace';
        resetBtn.style.fontSize = '16px';
        resetBtn.style.cursor = 'pointer';
        resetBtn.style.fontWeight = 'bold';
        
        resetBtn.onclick = () => {
             // Stop if running
             if (isSimulationRunning) {
                 playBtn.click();
             }
             // Reset to last start pos
             agent.setPosition(agentStartPos.x, agentStartPos.y);
             currentSolver.reset();
        };

        const btnGroup = document.createElement('div');
        btnGroup.style.display = 'flex';
        btnGroup.appendChild(playBtn);
        btnGroup.appendChild(resetBtn);
        
        topBar.appendChild(btnGroup);

        // Compass
        const compass = document.createElement('div');
        compass.id = 'compass-container';
        compass.style.width = '80px';
        compass.style.height = '80px';
        compass.style.position = 'relative';
        compass.style.borderRadius = '50%';
        compass.style.border = '2px solid #4cc9f0';
        compass.style.background = 'rgba(0, 20, 40, 0.8)';
        compass.style.boxShadow = '0 0 10px #4cc9f0';
        compass.style.marginRight = '0px'; // Offset from edge
        compass.style.marginTop= '60px'; // Offset from top 

        const labelStyle = 'position: absolute; color: #4cc9f0; font-family: monospace; font-weight: bold; font-size: 12px;';
        compass.innerHTML = `
            <div style="${labelStyle} top: 5px; left: 50%; transform: translateX(-50%);">N</div>
            <div style="${labelStyle} bottom: 5px; left: 50%; transform: translateX(-50%);">S</div>
            <div style="${labelStyle} left: 5px; top: 50%; transform: translateY(-50%);">W</div>
            <div style="${labelStyle} right: 5px; top: 50%; transform: translateY(-50%);">E</div>
            <div style="position: absolute; top: 50%; left: 50%; width: 4px; height: 4px; background: #4cc9f0; transform: translate(-50%, -50%); border-radius: 50%;"></div>
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
                        // Detect Dimension
                        const lines = text.trim().split('\n');
                        const h = lines.length;
                        // Assuming square or rectangular, check first line
                        // Line format: | . | . | . |
                        // Split by | gives ["", " . ", " . ", " . ", ""] (length 5 for w=3)
                        const firstLine = lines[0];
                        const w = firstLine.split('|').length - 2;

                        if (w > 0 && h > 0) {
                             // Initialize new grid
                             initializeGame(w, h);
                             
                             // Update Dropdown
                             const gridSizeSelect = document.getElementById('grid-size-select') as HTMLSelectElement;
                             if (gridSizeSelect) {
                                 const sizeStr = `${w}x${h}`;
                                 const option = Array.from(gridSizeSelect.options).find(o => o.value === sizeStr);
                                 if (option) {
                                     gridSizeSelect.value = sizeStr;
                                 } else {
                                     // Create custom option if not exists? Or set to blank/custom
                                     // Prompt says: "show a blank in the drop-down"
                                     gridSizeSelect.value = ""; 
                                 }
                             }

                             // Deserialize
                             const startPos = gridSystem.deserialize(text);
                             
                             // Refresh Visuals
                             gridRenderer.update();
                             windRenderer.updateWindData(); 
                             
                             if (startPos) {
                                 agent.setPosition(startPos.agentX, startPos.agentY);
                                 agentStartPos = { x: startPos.agentX, y: startPos.agentY };
                             }
                             
                             // Stop simulation if running
                             if (isSimulationRunning) {
                                 playBtn.click(); // Toggle off
                             }
                        } else {
                            alert("Invalid file format.");
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

        // --- Grid Size Switcher ---
        const gridSizeDiv = document.createElement('div');
        gridSizeDiv.className = 'solver-switch';
        gridSizeDiv.style.marginBottom = '5px';
        gridSizeDiv.style.marginTop = '15px';
        gridSizeDiv.style.display = 'flex';
        gridSizeDiv.style.justifyContent = 'space-between';
        gridSizeDiv.style.alignItems = 'center';
        gridSizeDiv.innerHTML = `
             <label style="color: white; font-family: monospace;">Grid Size:</label>
             <select id="grid-size-select" style="background: #141420; color: #4cc9f0; border: 1px solid #4cc9f0; padding: 2px;">
                 <option value="" disabled hidden>Custom</option>
                 <option value="10x10">10 x 10</option>
                 <option value="15x15" selected>15 x 15</option>
                 <option value="20x20">20 x 20</option>
                 <option value="30x30">30 x 30</option>
                 <option value="40x40">40 x 40</option>
                 <option value="50x50">50 x 50</option>
             </select>
        `;
        toolsSection.insertBefore(gridSizeDiv, buttonsContainer);

        const gridSizeSelect = document.getElementById('grid-size-select') as HTMLSelectElement;
        gridSizeSelect.onchange = (e) => {
            const val = (e.target as HTMLSelectElement).value;
            if (val) {
                 const [w, h] = val.split('x').map(Number);
                 if (isSimulationRunning) playBtn.click(); // Stop
                 initializeGame(w, h);
            }
        };

        // --- Scenario Switcher ---
        const scenarioDiv = document.createElement('div');
        scenarioDiv.className = 'solver-switch';
        scenarioDiv.style.marginBottom = '5px';
        scenarioDiv.style.display = 'flex';
        scenarioDiv.style.justifyContent = 'space-between';
        scenarioDiv.style.alignItems = 'center';
        scenarioDiv.innerHTML = `
             <label style="color: white; font-family: monospace;">Scenario:</label>
             <select id="scenario-select" style="background: #141420; color: #4cc9f0; border: 1px solid #4cc9f0; padding: 2px;">
                 <option value="" selected disabled>Select...</option>
                 <option value="01_20_straight_no_wall_no_fan">Straight (Empty)</option>
                 <option value="02_20_straight_wall_no_fan">Straight (Wall)</option>
                 <option value="03_20_straight_wall_fan">Straight (Wind)</option>
             </select>
        `;
        toolsSection.insertBefore(scenarioDiv, buttonsContainer);

        const scenarioSelect = document.getElementById('scenario-select') as HTMLSelectElement;
        scenarioSelect.onchange = async (e) => {
            const filename = (e.target as HTMLSelectElement).value;
            if (filename) {
                try {
                    const response = await fetch(`scenarios/${filename}.txt`);
                    if (!response.ok) throw new Error("Failed to load scenario");
                    const text = await response.text();
                    
                    // Logic reused from Load Button (Deduplicate later if strict)
                    const lines = text.trim().split('\n');
                    const h = lines.length;
                    const firstLine = lines[0];
                    const w = firstLine.split('|').length - 2;

                    if (w > 0 && h > 0) {
                         if (isSimulationRunning) playBtn.click();
                         initializeGame(w, h);
                         
                         // Update Grid Size Dropdown
                         if (gridSizeSelect) {
                             const sizeStr = `${w}x${h}`;
                             const option = Array.from(gridSizeSelect.options).find(o => o.value === sizeStr);
                             gridSizeSelect.value = option ? sizeStr : "";
                         }

                         const startPos = gridSystem.deserialize(text);
                         gridRenderer.update();
                         windRenderer.updateWindData(); 
                         
                         if (startPos) {
                             agent.setPosition(startPos.agentX, startPos.agentY);
                             agentStartPos = { x: startPos.agentX, y: startPos.agentY };
                         }
                    }
                } catch (err) {
                    console.error(err);
                    alert("Could not load scenario file.");
                }
            }
        };

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
                <select id="solver-select" style="background: #141420; color: #4cc9f0; border: 1px solid #4cc9f0; padding: 2px;">
                    <option value="astar" selected>A* (Deterministic)</option>
                    <option value="mdp">MDP (Probabilistic)</option>
                </select>
            </div>
            <div style="display: flex; justify-content: space-between; align-items: center;">
                <label style="color: white; font-family: monospace;">View:</label>
                <div style="display: flex; gap: 5px;">
                    <button id="btn-view-iso" style="background: #141420; color: #4cc9f0; border: 1px solid #4cc9f0; cursor: pointer; padding: 2px 6px;">Angled</button>
                    <button id="btn-view-top" style="background: #141420; color: #4cc9f0; border: 1px solid #4cc9f0; cursor: pointer; padding: 2px 6px;">Top</button>
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
        windControls.style.border = '1px dashed #b5179e';
        windControls.innerHTML = `
            <div style="color: #b5179e; margin-bottom: 5px;">Wind Settings:</div>
            <div style="display: flex; gap: 5px; flex-wrap: wrap;">
                <select id="wind-dir" style="background: #0a0a12; color: #b5179e; border: 1px solid #b5179e;">
                    <option value="0,1">North</option>
                    <option value="1,0">East</option>
                    <option value="0,-1">South</option>
                    <option value="-1,0">West</option>
                </select>
                <input id="wind-force" type="number" min="1" max="10" value="2" style="width: 50px; background: #0a0a12; color: #b5179e; border: 1px solid #b5179e;">
                <span style="color: #b5179e; font-size: 12px;">blocks</span>
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
                btn.style.borderColor = '#f72585';
                btn.style.color = '#f72585';
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
            ${extraInfo ? `<div class="info-row" style="color:#b5179e; font-size:0.8em;">${extraInfo}</div>` : ''}
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
