import './style.css'
import { Engine } from '@babylonjs/core/Engines/engine';
import { Scene } from '@babylonjs/core/scene';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight';
import { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { PointerEventTypes } from '@babylonjs/core/Events/pointerEvents';
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
    scene.clearColor = Color3.FromHexString("#0a0a12").toColor4(); // Deep Void Black

    // --- FX ---

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
    let initialAgentStartPos = { x: 0, y: 0 }; // The "True" Home position (Placement/Scenario)
    let agentStartPos = { x: 0, y: 0 };        // The start position of the most recent run

    // --- Simulation Controllers ---

    const startSimulation = () => {
        if (isSimulationRunning) return;

        if (agent.isStopped) {
            // Automatically reset to the start of the current RUN
            resetAgent(false);
        } else {
            // Fresh start or resume: capture current location as the run's start point
            agentStartPos = { x: Math.floor(agent.position.x), y: Math.floor(agent.position.z) };
            
            // Ensure solver has a valid plan for the current start
            currentSolver.iterate(currentSolverType === 'astar' ? agent.virtualPosition : agent.position);
        }

        isSimulationRunning = true;
        agent.isStopped = false;
        agent.stopReason = 'none';
        agent.setMode(currentSolverType);

        // UI Update
        const playBtn = document.getElementById('btn-play-simulation');
        if (playBtn) {
            playBtn.textContent = '⏹ STOP';
            playBtn.style.borderColor = 'var(--jay-color-neon-pink)';
            playBtn.style.color = 'var(--jay-color-neon-pink)';
        }
    };

    const stopSimulation = () => {
        isSimulationRunning = false;
        
        // UI Update
        const playBtn = document.getElementById('btn-play-simulation');
        if (playBtn) {
            playBtn.textContent = '▶ RUN';
            playBtn.style.borderColor = 'var(--jay-color-neon-green)';
            playBtn.style.color = 'var(--jay-color-neon-green)';
        }
    };

    const resetAgent = (toInitial: boolean = true) => {
        stopSimulation();
        
        // Determine target (Home vs Start of Run)
        const target = toInitial ? initialAgentStartPos : agentStartPos;
        
        // Reset Agent state
        agent.setPosition(target.x, target.y);
        agent.isStopped = false;
        agent.stopReason = 'none';
        
        if (toInitial) {
            agentStartPos = { ...initialAgentStartPos };
        }

        // Reset Solver state and force immediate re-plan
        currentSolver.reset();
        agent.setMode(currentSolverType);
        currentSolver.iterate(currentSolverType === 'astar' ? agent.virtualPosition : agent.position);
        
        // Refresh visual renderers immediately so the path update is visible
        const values = currentSolver.getValues();
        flowRenderer.updatePolicy(currentSolver.policy, values, currentSolverType);
        gridRenderer.updateVisuals(values, currentSolverType);
    };

    // --- Game Lifecycle ---

    const disposeGame = () => {
        if (gridRenderer) gridRenderer.dispose();
        if (flowRenderer) flowRenderer.dispose();
        if (windRenderer) windRenderer.dispose();
        if (agent) agent.dispose();
    };

    const initializeGame = (width: number, height: number) => {
        disposeGame();

        // 1. Grid & Math
        gridSystem = new GridSystem(width, height);
        
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

        if (!explosionRenderer) 
            explosionRenderer = new ExplosionRenderer(scene);

        agent = new Agent(gridSystem, scene, 0, 0);
        agent.setMode(currentSolverType);
        
        initialAgentStartPos = { x: 0, y: 0 };
        agentStartPos = { x: 0, y: 0 };

        // 3. Camera & Picking Ground
        const centerX = width / 2;
        const centerZ = height / 2;
        camera.setTarget(new Vector3(centerX, 0, centerZ));
        
        if (ground) ground.dispose();
        ground = MeshBuilder.CreateGround("ground", { width: width, height: height }, scene);
        ground.position = new Vector3(centerX, 0, centerZ);
        ground.visibility = 0; 
        ground.isPickable = true;
    };

    // Initial Setup
    initializeGame(15, 15);

    // --- Render Loop Logic ---
    scene.onBeforeRenderObservable.add(() => {
        if (!isSimulationRunning || currentSolverType === 'mdp') {
            currentSolver.iterate(currentSolverType === 'astar' ? agent.virtualPosition : agent.position);
            
            const values = currentSolver.getValues();
            flowRenderer.updatePolicy(currentSolver.policy, values, currentSolverType);
            gridRenderer.updateVisuals(values, currentSolverType);
        }
        
        const dt = engine.getDeltaTime() / 1000;
        agent.update(dt, currentSolver, isSimulationRunning);

        if (isSimulationRunning) {
            if (agent.isStopped) {
                if (agent.stopReason === 'wall') {
                    explosionRenderer.trigger(agent.position);
                    agent.stopReason = 'none';
                }

                const stopBtn = document.getElementById('btn-play-simulation');
                if (stopBtn && isSimulationRunning) {
                    stopBtn.click();
                }
            }
        }
        
        explosionRenderer.update(engine.getDeltaTime() / 1000);

        // Update Altitude
        const altNeedle = document.getElementById('alt-needle');
        if (altNeedle) {
             const deg = (camera.beta * 180 / Math.PI) - 90;
             altNeedle.style.transform = `rotate(${deg}deg)`;
        }
        
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
    if (canvasContainer) new ResizeObserver(updateCameraProjection).observe(canvasContainer);
    window.addEventListener('resize', updateCameraProjection);


    // --- UI Construction ---
    const setupUI = () => {
        const mainLayout = document.getElementById('main-layout');
        const toolsSection = document.getElementById('tools-section');
        
        if (!toolsSection || !mainLayout) return;

        toolsSection.innerHTML = ''; 
        
        // --- 1. Tab Bar ---
        const tabBar = document.createElement('div');
        tabBar.style.display = 'flex';
        tabBar.style.borderBottom = '1px solid var(--jay-text-muted)';
        tabBar.style.marginBottom = '15px';
        
        type UIMode = 'simulate' | 'build' | 'inspect';

        const tabs: {id: UIMode, label: string}[] = [
            { id: 'simulate', label: 'Simulate' },
            { id: 'build', label: 'Build' },
            { id: 'inspect', label: 'Inspect' }
        ];

        const tabBtns: HTMLButtonElement[] = [];

        tabs.forEach(t => {
            const btn = document.createElement('button');
            btn.textContent = t.label;
            btn.style.flex = '1';
            btn.style.background = 'transparent';
            btn.style.border = 'none';
            btn.style.color = 'var(--jay-text-muted)';
            btn.style.padding = '8px';
            btn.style.cursor = 'pointer';
            btn.style.fontWeight = 'bold';
            btn.style.borderBottom = '2px solid transparent';
            btn.onclick = () => setUIMode(t.id);
            tabBtns.push(btn);
            tabBar.appendChild(btn);
        });
        toolsSection.appendChild(tabBar);

        // --- Container Groups ---
        const grpSimulate = document.createElement('div');
        const grpBuild = document.createElement('div');
        const grpInspect = document.createElement('div');
        
        toolsSection.appendChild(grpSimulate);
        toolsSection.appendChild(grpBuild);
        toolsSection.appendChild(grpInspect);

        // --- 2. Controls (Simulate) ---
        const selectorsRow = document.createElement('div');
        selectorsRow.style.display = 'flex';
        selectorsRow.style.gap = '10px';
        selectorsRow.style.marginBottom = '10px';
        
        const scenarioDiv = document.createElement('div');
        scenarioDiv.style.flex = '1';
        scenarioDiv.style.display = 'flex';
        scenarioDiv.style.flexDirection = 'column';
        scenarioDiv.style.gap = '4px';
        scenarioDiv.innerHTML = `
             <label style="color: var(--jay-text-muted); font-family: monospace; font-size: 11px; text-transform: uppercase;">Scenario</label>
             <select id="scenario-select" style="background: var(--jay-panel-bg); color: var(--jay-accent-primary); border: 1px solid var(--jay-accent-primary); padding: 8px; width: 100%; border-radius: 4px; font-size: 14px; cursor: pointer;">
                 <option value="" selected disabled>Select...</option>
             </select>
        `;

        const knownScenarios = [
            "01_20_straight_no_wall_no_fan",
            "02_20_straight_wall_no_fan",
            "03_20_straight_wall_fan"
        ];
        
        const scenarioSel = scenarioDiv.querySelector('#scenario-select') as HTMLSelectElement;
        
        knownScenarios.forEach(async (filename) => {
            try {
                const res = await fetch(`scenarios/${filename}.txt`);
                if (res.ok) {
                    const txt = await res.text();
                    const match = txt.match(/^#NAME:(.*)$/m);
                    const displayName = match ? match[1].trim() : filename;
                    
                    const opt = document.createElement('option');
                    opt.value = filename;
                    opt.textContent = displayName;
                    scenarioSel.appendChild(opt);
                }
            } catch (e) { console.error("Error loading scenario name:", e); }
        });
        
        const solverDiv = document.createElement('div');
        solverDiv.style.flex = '1';
        solverDiv.style.display = 'flex';
        solverDiv.style.flexDirection = 'column';
        solverDiv.style.gap = '4px';
        solverDiv.innerHTML = `
            <label style="color: var(--jay-text-muted); font-family: monospace; font-size: 11px; text-transform: uppercase;">Algorithm</label>
            <select id="solver-select" style="background: var(--jay-panel-bg); color: var(--jay-accent-primary); border: 1px solid var(--jay-accent-primary); padding: 8px; width: 100%; border-radius: 4px; font-size: 14px; cursor: pointer;">
                <option value="astar" selected>A* (Deterministic)</option>
                <option value="mdp">MDP (Probabilistic)</option>
            </select>
        `;

        selectorsRow.appendChild(scenarioDiv);
        selectorsRow.appendChild(solverDiv);

        const viewDiv = document.createElement('div');
        viewDiv.style.display = 'flex';
        viewDiv.style.justifyContent = 'space-between';
        viewDiv.style.alignItems = 'center';
        viewDiv.style.marginBottom = '15px';
        viewDiv.innerHTML = `
            <label style="color: white; font-family: monospace;">View Camera:</label>
            <div style="display: flex; gap: 5px;">
                <button id="btn-view-iso" style="background: var(--jay-panel-bg); color: var(--jay-accent-primary); border: 1px solid var(--jay-accent-primary); cursor: pointer; padding: 6px 12px; border-radius: 4px;">Angled</button>
                <button id="btn-view-top" style="background: var(--jay-panel-bg); color: var(--jay-accent-primary); border: 1px solid var(--jay-accent-primary); cursor: pointer; padding: 6px 12px; border-radius: 4px;">Top</button>
            </div>
        `;

        const runControls = document.createElement('div');

        runControls.style.display = 'flex';
        runControls.style.gap = '10px';
        runControls.style.marginTop = '15px';
        runControls.style.borderTop = '1px solid #333';
        runControls.style.paddingTop = '15px';
        
        const playBtn = document.createElement('button');
        playBtn.id = 'btn-play-simulation';
        playBtn.textContent = '▶ RUN';
        playBtn.className = 'mode-btn';
        playBtn.style.flex = '1';
        playBtn.style.borderColor = 'var(--jay-color-neon-green)';
        playBtn.style.color = 'var(--jay-color-neon-green)';
        
        const resetBtn = document.createElement('button');
        resetBtn.textContent = '↺ RESET AGENT';
        resetBtn.className = 'mode-btn';
        resetBtn.style.flex = '1';
        resetBtn.style.borderColor = 'var(--jay-accent-primary)';
        resetBtn.style.color = 'var(--jay-accent-primary)';

        runControls.appendChild(playBtn);
        runControls.appendChild(resetBtn);

        // --- 3. Controls (Build) ---
        
        const gridSizeDiv = document.createElement('div');
        gridSizeDiv.className = 'solver-switch';
        gridSizeDiv.style.marginBottom = '10px';
        gridSizeDiv.style.display = 'flex';
        gridSizeDiv.style.justifyContent = 'space-between';
        gridSizeDiv.style.alignItems = 'center';
        gridSizeDiv.innerHTML = `
             <label style="color: white; font-family: monospace;">Grid Size:</label>
             <select id="grid-size-select" style="background: var(--jay-panel-bg); color: var(--jay-accent-primary); border: 1px solid var(--jay-accent-primary); padding: 2px;">
                 <option value="" disabled hidden>Custom</option>
                 <option value="10x10">10 x 10</option>
                 <option value="15x15" selected>15 x 15</option>
                 <option value="20x20">20 x 20</option>
                 <option value="30x30">30 x 30</option>
                 <option value="40x40">40 x 40</option>
                 <option value="50x50">50 x 50</option>
             </select>
        `;

        const ioDiv = document.createElement('div');
        ioDiv.style.display = 'flex';
        ioDiv.style.gap = '5px';
        ioDiv.style.marginBottom = '10px';
        
        const saveBtn = document.createElement('button');
        saveBtn.textContent = '💾 Save';
        saveBtn.className = 'mode-btn';
        saveBtn.style.flex = '1';
        
        const loadBtn = document.createElement('button');
        loadBtn.textContent = '📂 Load';
        loadBtn.className = 'mode-btn';
        loadBtn.style.flex = '1';

        ioDiv.appendChild(saveBtn);
        ioDiv.appendChild(loadBtn);

        const windControls = document.createElement('div');
        windControls.id = 'wind-controls';
        windControls.style.display = 'none';
        windControls.style.marginBottom = '10px';
        windControls.style.padding = '5px';
        windControls.style.border = '1px dashed var(--jay-color-blue-energy)';
        windControls.innerHTML = `
            <div style="color: var(--jay-color-blue-energy); margin-bottom: 5px;">Wind Settings:</div>
            <div style="display: flex; gap: 5px; flex-wrap: wrap;">
                <select id="wind-dir" style="background: var(--jay-bg-dark); color: var(--jay-color-blue-energy); border: 1px solid var(--jay-color-blue-energy);">
                    <option value="0,1">North</option>
                    <option value="1,0">East</option>
                    <option value="0,-1">South</option>
                    <option value="-1,0">West</option>
                </select>
                <input id="wind-force" type="number" min="1" max="10" value="2" style="width: 50px; background: var(--jay-bg-dark); color: var(--jay-color-blue-energy); border: 1px solid var(--jay-color-blue-energy);">
                <span style="color: var(--jay-color-blue-energy); font-size: 12px;">blocks</span>
            </div>
        `;

        const buildToolsContainer = document.createElement('div');
        buildToolsContainer.id = 'tool-buttons';
        buildToolsContainer.className = 'mode-buttons';

        // --- Legend ---
        const legendDiv = document.createElement('div');
        legendDiv.className = 'legend';
        legendDiv.style.marginTop = '15px';
        legendDiv.innerHTML = `
            <div class="legend-item"><div class="color-box" style="background: #4cc9f0; border-color:white;"></div>Policy / Value</div>
            <div class="legend-item"><div class="color-box" style="background: #4895ef; border-color:white;"></div>Wind</div>
            <div class="legend-item"><div class="color-box" style="background: #b5179e; border-color:white;"></div>Low Value</div>
        `;

        // --- 4. Controls (Inspect) ---
        grpInspect.innerHTML = `
            <div class="panel-header" style="border-bottom-color: var(--jay-accent-primary); color: white;">Cell Inspector</div>
            <div id="cell-info" style="font-family: 'Consolas', monospace; margin-top: 10px;">
                <p>Hover over grid to inspect.</p>
            </div>
        `;

        // --- Logic Implementation ---
        
        const setUIMode = (mode: UIMode) => {
            
            tabBtns.forEach((btn, i) => {
                if (tabs[i].id === mode) {
                    btn.style.color = 'var(--jay-accent-primary)';
                    btn.style.borderBottomColor = 'var(--jay-accent-primary)';
                } else {
                    btn.style.color = 'var(--jay-text-muted)';
                    btn.style.borderBottomColor = 'transparent';
                }
            });

            grpSimulate.style.display = 'none';
            grpBuild.style.display = 'none';
            grpInspect.style.display = 'none';

            if (mode === 'simulate') {
                grpSimulate.style.display = 'block';
                grpSimulate.appendChild(selectorsRow);
                grpSimulate.appendChild(viewDiv);
                grpSimulate.appendChild(runControls);
                grpSimulate.appendChild(legendDiv);
                setActiveTool('inspect');
            } else if (mode === 'build') {
                grpBuild.style.display = 'block';
                grpBuild.appendChild(selectorsRow);
                grpBuild.appendChild(viewDiv);
                grpBuild.appendChild(gridSizeDiv);
                grpBuild.appendChild(ioDiv);
                grpBuild.appendChild(windControls);
                grpBuild.appendChild(buildToolsContainer);
                grpBuild.appendChild(runControls);
                grpBuild.appendChild(legendDiv);
                setActiveTool('inspect');
            } else if (mode === 'inspect') {
                grpInspect.style.display = 'block';
                setActiveTool('inspect');
            }
        };

        const setActiveTool = (modeId: string) => {
            activeMode = modeId as any;
            document.querySelectorAll('.mode-btn').forEach(b => {
                 if ((b as HTMLElement).dataset.mode === activeMode) b.classList.add('active');
                 else if ((b as HTMLElement).dataset.mode) b.classList.remove('active');
            });
            const wc = document.getElementById('wind-controls');
            if (wc) wc.style.display = activeMode === 'wind' ? 'block' : 'none';
        };

        // --- Event Wiring ---
        const scenarioSelect = selectorsRow.querySelector('#scenario-select') as HTMLSelectElement;
        scenarioSelect.onchange = async (e) => {
            const filename = (e.target as HTMLSelectElement).value;
            if (filename) {
                try {
                    const response = await fetch(`scenarios/${filename}.txt`);
                    if (!response.ok) throw new Error("Failed to load scenario");
                    const text = await response.text();
                    const lines = text.trim().split('\n');
                    const h = lines.length;
                    const w = lines[0].split('|').length - 2;
                    if (w > 0 && h > 0) {
                         if (isSimulationRunning) playBtn.click();
                         initializeGame(w, h);
                         const gs = document.getElementById('grid-size-select') as HTMLSelectElement;
                         if (gs) {
                             const sizeStr = `${w}x${h}`;
                             const opt = Array.from(gs.options).find(o => o.value === sizeStr);
                             gs.value = opt ? sizeStr : "";
                         }
                         const startPos = gridSystem.deserialize(text);
                         gridRenderer.update();
                         windRenderer.updateWindData(); 
                         if (startPos) {
                             agent.setPosition(startPos.agentX, startPos.agentY);
                             initialAgentStartPos = { x: startPos.agentX, y: startPos.agentY };
                             agentStartPos = { x: startPos.agentX, y: startPos.agentY };
                             
                             if (startPos.cameraState) {
                                 const cs = startPos.cameraState;
                                 camera.alpha = cs.alpha;
                                 camera.beta = cs.beta;
                                 camera.radius = cs.radius;
                                 camera.setTarget(new Vector3(cs.target.x, cs.target.y, cs.target.z));
                             }
                         }
                    }
                } catch (err) { console.error(err); }
            }
        };

        const algoSelect = selectorsRow.querySelector('#solver-select') as HTMLSelectElement;
        algoSelect.onchange = (e) => {
            const val = (e.target as HTMLSelectElement).value;
            if (val === 'mdp') { currentSolver = mdpSolver; currentSolverType = 'mdp'; currentSolver.reset(); } 
            else { currentSolver = aStarSolver; currentSolverType = 'astar'; currentSolver.reset(); }
            agent.setMode(currentSolverType);
        };
                (viewDiv.querySelector('#btn-view-iso') as HTMLButtonElement).onclick = () => setCameraView('iso');
                (viewDiv.querySelector('#btn-view-top') as HTMLButtonElement).onclick = () => setCameraView('top');
        
                playBtn.onclick = () => {
                    if (!isSimulationRunning) 
                        startSimulation();
                    else stopSimulation();
                };
        
                resetBtn.onclick = () => {
                    resetAgent();
                };
        
                const gridSizeSelect = gridSizeDiv.querySelector('#grid-size-select') as HTMLSelectElement;
        gridSizeSelect.onchange = (e) => {
            const val = (e.target as HTMLSelectElement).value;
            if (val) {
                 const [w, h] = val.split('x').map(Number);
                 if (isSimulationRunning) playBtn.click();
                 initializeGame(w, h);
            }
        };

        saveBtn.onclick = () => {
            const name = prompt("Enter scenario name:", "Custom Scenario");
            if (name === null) return;

            const cameraState = {
                alpha: camera.alpha,
                beta: camera.beta,
                radius: camera.radius,
                target: { x: camera.target.x, y: camera.target.y, z: camera.target.z }
            };
            const data = gridSystem.serialize(Math.floor(agent.position.x), Math.floor(agent.position.z), cameraState, name);
            const blob = new Blob([data], { type: 'text/plain' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url; a.download = 'grid_scenario.txt'; a.click();
            URL.revokeObjectURL(url);
        };
        loadBtn.onclick = () => {
            const input = document.createElement('input');
            input.type = 'file'; input.accept = '.txt';
            input.onchange = (e) => {
                const file = (e.target as HTMLInputElement).files?.[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onload = (evt) => {
                    const text = evt.target?.result as string;
                    if (text) {
                        const lines = text.trim().split('\n').filter(l => !l.startsWith('#'));
                        const h = lines.length;
                        const w = lines[0].split('|').length - 2;
                        if (w > 0 && h > 0) {
                             initializeGame(w, h);
                             const startPos = gridSystem.deserialize(text);
                             gridRenderer.update(); windRenderer.updateWindData(); 
                             if (startPos) {
                                 agent.setPosition(startPos.agentX, startPos.agentY);
                                 agentStartPos = { x: startPos.agentX, y: startPos.agentY };
                                 
                                 if (startPos.cameraState) {
                                     const cs = startPos.cameraState;
                                     camera.alpha = cs.alpha;
                                     camera.beta = cs.beta;
                                     camera.radius = cs.radius;
                                     camera.setTarget(new Vector3(cs.target.x, cs.target.y, cs.target.z));
                                 }
                             }
                             if (isSimulationRunning) playBtn.click();
                        }
                    }
                };
                reader.readAsText(file);
            };
            input.click();
        };

        const tools = [
            { id: 'goal', label: 'Goal', type: CellType.Goal },
            { id: 'wall', label: 'Wall', type: CellType.Wall },
            { id: 'wind', label: 'Wind', type: CellType.Wind },
            { id: 'erase', label: 'Erase', type: CellType.Empty },
            { id: 'agent', label: 'Place Drone', type: null },
            { id: 'reset', label: 'Reset Grid', type: null }
        ];

        tools.forEach(tool => {
            const btn = document.createElement('button');
            btn.className = 'mode-btn';
            btn.textContent = tool.label;
            btn.dataset.mode = tool.id;
            if (tool.id === 'reset') {
                btn.style.borderColor = 'var(--jay-color-neon-pink)';
                btn.style.color = 'var(--jay-color-neon-pink)';
                btn.onclick = () => {
                     if (confirm('Reset the entire grid?')) {
                         gridSystem.reset(); gridRenderer.update(); windRenderer.updateWindData();
                         mdpSolver.reset(); aStarSolver.reset();
                     }
                };
            } else {
                btn.onclick = () => setActiveTool(tool.id);
            }
            buildToolsContainer.appendChild(btn);
        });

        // Compass (Overlay)
        const topBar = document.createElement('div');
        topBar.style.position = 'absolute';
        topBar.style.top = '0'; topBar.style.left = '0';
        topBar.style.width = '100%'; topBar.style.height = '60px';
        topBar.style.pointerEvents = 'none'; 
        
        const labelStyle = 'position: absolute; color: var(--jay-accent-primary); font-family: monospace; font-weight: bold; font-size: 12px;';
        
        // Altitude Indicator
        const altitude = document.createElement('div');
        altitude.id = 'altitude-container';
        altitude.style.width = '80px'; altitude.style.height = '80px';
        altitude.style.position = 'absolute';
        altitude.style.right = '110px'; altitude.style.top = '20px';
        altitude.style.borderRadius = '50%';
        altitude.style.border = '2px solid var(--jay-accent-primary)';
        altitude.style.background = 'rgba(0, 20, 40, 0.8)';
        altitude.style.boxShadow = '0 0 10px var(--jay-accent-primary)';
        
        altitude.innerHTML = `
            <div style="${labelStyle} top: 5px; left: 50%; transform: translateX(-50%);">TOP</div>
            <div style="${labelStyle} right: 5px; top: 50%; transform: translateY(-50%);">SIDE</div>
            <div id="alt-needle" style="position: absolute; top: 50%; left: 50%; width: 35px; height: 2px; background: var(--jay-accent-primary); transform-origin: 0% 50%;"></div>
            <div style="position: absolute; top: 50%; left: 50%; width: 4px; height: 4px; background: var(--jay-accent-primary); transform: translate(-50%, -50%); border-radius: 50%;"></div>
        `;
        topBar.appendChild(altitude);

        const compass = document.createElement('div');
        compass.id = 'compass-container';
        compass.style.width = '80px'; compass.style.height = '80px';
        compass.style.position = 'absolute';
        compass.style.right = '20px'; compass.style.top = '20px';
        compass.style.borderRadius = '50%';
        compass.style.border = '2px solid var(--jay-accent-primary)';
        compass.style.background = 'rgba(0, 20, 40, 0.8)';
        compass.style.boxShadow = '0 0 10px var(--jay-accent-primary)';

        compass.innerHTML = `
            <div style="${labelStyle} top: 5px; left: 50%; transform: translateX(-50%);">N</div>
            <div style="${labelStyle} bottom: 5px; left: 50%; transform: translateX(-50%);">S</div>
            <div style="${labelStyle} left: 5px; top: 50%; transform: translateY(-50%);">W</div>
            <div style="${labelStyle} right: 5px; top: 50%; transform: translateY(-50%);">E</div>
            <div style="position: absolute; top: 50%; left: 50%; width: 4px; height: 4px; background: var(--jay-accent-primary); transform: translate(-50%, -50%); border-radius: 50%;"></div>
        `;
        topBar.appendChild(compass);
        mainLayout.appendChild(topBar);

        setUIMode('simulate');
    };
    setupUI();
    
    // --- Console/Inspector Logic ---
    const updateConsole = (x: number, y: number) => {
        const infoEl = document.getElementById('cell-info');
        if (!infoEl) return;
        
        if (!gridSystem.isValid(x, y)) {
            infoEl.innerHTML = '<p>Hover over grid to inspect.</p>';
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

        infoEl.innerHTML = `
            <div class="info-row"><span>Coordinates:</span> <span class="value">(${x}, ${y})</span></div>
            <div class="info-row"><span>Type:</span> <span class="value">${typeStr}</span></div>
            ${extraInfo ? `<div class="info-row" style="color:var(--jay-color-blue-energy); font-size:0.8em;">${extraInfo}</div>` : ''}
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
                    if (pointerInfo.event instanceof MouseEvent && pointerInfo.event.buttons === 0) isPainting = false;
                    else paintTile(point);
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
                gridRenderer.update(); windRenderer.updateWindData(); 
            }
        }
    };

    const teleportAgent = (point: Vector3 | null | undefined) => {
        if (!point) return;
        const x = Math.floor(point.x); const y = Math.floor(point.z);
        if (gridSystem.isValid(x, y)) {
            agent.setPosition(x, y);
            initialAgentStartPos = { x, y };
            agentStartPos = { x, y };
        }
    }

    return scene;
};

const scene = createScene();
engine.runRenderLoop(() => scene.render());
