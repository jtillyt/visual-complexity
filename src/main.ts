import './style.css'
import { Engine } from '@babylonjs/core/Engines/engine';
import { Scene } from '@babylonjs/core/scene';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight';
import { FreeCamera } from '@babylonjs/core/Cameras/freeCamera';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { GridSystem, CellType } from './GridSystem';
import { GridRenderer } from './GridRenderer';
import { FlowRenderer } from './FlowRenderer';
import { MdpSolver } from './MdpSolver';
import { Agent } from './Agent';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { PointerEventTypes } from '@babylonjs/core/Events/pointerEvents';
import "@babylonjs/core/Culling/ray"; // Fix side-effect warning for picking

// Get the canvas element
const canvas = document.getElementById('renderCanvas') as HTMLCanvasElement;
const canvasContainer = document.getElementById('canvas-container');

// Initialize Babylon Engine
const engine = new Engine(canvas, true);

// Create Scene
const createScene = () => {
    const scene = new Scene(engine);
    scene.clearColor = new Color3(0.05, 0.05, 0.1).toColor4(); // Darker blue

    // Grid System
    const gridSystem = new GridSystem(50, 50);
    // Expose for debugging
    (window as any).gridSystem = gridSystem;

    // Grid Renderer
    const gridRenderer = new GridRenderer(gridSystem, scene);

    // Mdp Solver
    const solver = new MdpSolver(gridSystem);

    // Flow Renderer
    const flowRenderer = new FlowRenderer(gridSystem, scene);

    // Agent
    const agent = new Agent(gridSystem, scene, 0, 0);
    
    // Expose MdpSolver values to flowRenderer
    scene.onBeforeRenderObservable.add(() => {
        solver.iterate();
        flowRenderer.updatePolicy(solver.policy, solver.getValues());
        agent.update(engine.getDeltaTime() / 1000, solver);
    });

    // Camera - Orthographic Top-Down
    // Center of grid is roughly (25, 0, 25)
    const cameraPosition = new Vector3(25, 50, 25);
    const camera = new FreeCamera("camera1", cameraPosition, scene);
    camera.mode = FreeCamera.ORTHOGRAPHIC_CAMERA;
    camera.upVector = new Vector3(0, 0, 1); // Fix gimbal lock for top-down view
    camera.setTarget(new Vector3(25, 0, 25));
    
    // Orthographic settings
    const viewSize = 30; // Half-size of vertical view
    
    // Initial aspect ratio
    const updateCameraProjection = () => {
        // Force engine resize to match container
        engine.resize();
        
        // Use container size if possible, otherwise engine size
        const width = canvasContainer ? canvasContainer.clientWidth : engine.getRenderWidth();
        const height = canvasContainer ? canvasContainer.clientHeight : engine.getRenderHeight();
        
        // Prevent divide by zero
        if (height === 0) return;
        
        const aspectRatio = width / height;
        
        camera.orthoTop = viewSize;
        camera.orthoBottom = -viewSize;
        camera.orthoLeft = -viewSize * aspectRatio;
        camera.orthoRight = viewSize * aspectRatio;
    };
    
    // Robust Resize Handling using ResizeObserver
    if (canvasContainer) {
        const resizeObserver = new ResizeObserver(() => {
            updateCameraProjection();
        });
        resizeObserver.observe(canvasContainer);
    }
    
    // Defer initial resize to ensure DOM layout is complete
    setTimeout(updateCameraProjection, 100);

    // Light
    const light = new HemisphericLight("light", new Vector3(0, 1, 0), scene);
    light.intensity = 0.7;

    // Ground for picking (Invisible)
    const ground = MeshBuilder.CreateGround("ground", { width: 50, height: 50 }, scene);
    ground.position = new Vector3(25, 0, 25); // Center it
    ground.visibility = 0; // Transparent but pickable

        // Input Handling
        let isPainting = false;
        let activeMode: 'wall' | 'wind' | 'goal' | 'erase' | 'agent' | 'inspect' = 'inspect';
        
        // UI Setup
        const setupUI = () => {
            const tools = [
                { id: 'inspect', label: 'Inspect (4)', type: null },
                { id: 'wall', label: 'Wall (1)', type: CellType.Wall },
                { id: 'wind', label: 'Wind (2)', type: CellType.Wind },
                { id: 'goal', label: 'Goal (3)', type: CellType.Goal },
                { id: 'erase', label: 'Erase (0)', type: CellType.Empty },
                { id: 'agent', label: 'Place Agent', type: null }
            ];
    
            const container = document.getElementById('tool-buttons');
            if (!container) return;
    
            tools.forEach(tool => {
                const btn = document.createElement('button');
                btn.className = 'mode-btn';
                btn.textContent = tool.label;
                btn.dataset.mode = tool.id;
                if (tool.id === activeMode) btn.classList.add('active');
                
                btn.onclick = () => {
                    activeMode = tool.id as any;
                    document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');
                };
                
                container.appendChild(btn);
            });
        };
        setupUI();
        
        // Console Update Logic
        const cellInfoEl = document.getElementById('cell-info');
        const updateConsole = (x: number, y: number) => {
            if (!cellInfoEl) return;
            
            if (!gridSystem.isValid(x, y)) {
                cellInfoEl.innerHTML = '<p>Hover over grid to inspect.</p>';
                return;
            }
    
            const index = gridSystem.getFlatIndex(x, y);
            const cellType = gridSystem.getCell(x, y);
            const value = solver.getValues()[index].toFixed(4);
            const policyAngle = solver.policy[index].toFixed(2);
            
            let typeStr = 'Empty';
            if (cellType === CellType.Wall) typeStr = 'Wall';
            if (cellType === CellType.Wind) typeStr = 'Wind';
            if (cellType === CellType.Goal) typeStr = 'Goal';
    
            cellInfoEl.innerHTML = `
                <div class="info-row"><span>Coordinates:</span> <span class="value">(${x}, ${y})</span></div>
                <div class="info-row"><span>Type:</span> <span class="value">${typeStr}</span></div>
                <div class="info-row"><span>Value (V):</span> <span class="value">${value}</span></div>
                <div class="info-row"><span>Policy (rad):</span> <span class="value">${policyAngle}</span></div>
            `;
        };
    
        // Toggle Paint Type with keys (1: Wall, 2: Wind, 3: Goal, 0: Erase, 4: Inspect)
        window.addEventListener("keydown", (ev) => {
            let newMode: typeof activeMode | null = null;
            if (ev.key === "1") newMode = 'wall';
            if (ev.key === "2") newMode = 'wind';
            if (ev.key === "3") newMode = 'goal';
            if (ev.key === "0") newMode = 'erase';
            if (ev.key === "4") newMode = 'inspect';
            
            if (newMode) {
                activeMode = newMode;
                // Update UI
                document.querySelectorAll('.mode-btn').forEach(b => {
                    if ((b as HTMLElement).dataset.mode === activeMode) b.classList.add('active');
                    else b.classList.remove('active');
                });
            }
        });
    
        scene.onPointerObservable.add((pointerInfo) => {
            // Inspect cell under cursor
            const point = pointerInfo.pickInfo?.pickedPoint;
            if (point) {
                updateConsole(Math.floor(point.x), Math.floor(point.z));
            }
    
            switch (pointerInfo.type) {
                case PointerEventTypes.POINTERDOWN:
                    if (pointerInfo.event.button === 0) { // Left Click
                        if (activeMode === 'agent') {
                            teleportAgent(point);
                        } else if (activeMode !== 'inspect') {
                            isPainting = true;
                            paintTile(point);
                        }
                    } else if (pointerInfo.event.button === 2) { // Right Click
                        teleportAgent(point);
                    }
                    break;            case PointerEventTypes.POINTERUP:
                isPainting = false;
                break;
            case PointerEventTypes.POINTERMOVE:
                if (isPainting && activeMode !== 'agent') {
                    paintTile(point);
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
            if (current !== type) {
                gridSystem.setCell(x, y, type);
                gridRenderer.update();
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
    
    // Resize handler within closure to access camera
    window.addEventListener('resize', () => {
        updateCameraProjection();
    });

    return scene;
};


const scene = createScene();

// Render Loop
engine.runRenderLoop(() => {
    scene.render();
});
