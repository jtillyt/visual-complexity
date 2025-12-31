export const CellType = {
    Empty: 0,
    Wall: 1,
    Wind: 2,
    Goal: 3
} as const;

export type CellType = typeof CellType[keyof typeof CellType];

export interface WindConfig {
    dx: number;
    dy: number;
    force: number;
}

/**
 * GridSystem holds the state of the world grid.
 * It is a pure data structure optimized for flat array access.
 */
export class GridSystem {
    public readonly width: number;
    public readonly height: number;
    private readonly cells: Uint8Array;
    private readonly windConfigs: Map<number, WindConfig>;
    private readonly windField: Float32Array; // Stores accumulated dx, dy for every cell

    constructor(width: number = 50, height: number = 50) {
        this.width = width;
        this.height = height;
        this.cells = new Uint8Array(width * height);
        this.windConfigs = new Map();
        this.windField = new Float32Array(width * height * 2);
        this.reset();
    }

    /**
     * Resets the entire grid to Empty state.
     */
    public reset(): void {
        this.cells.fill(CellType.Empty);
        this.windConfigs.clear();
        this.recalculateWindField();
    }

    /**
     * Gets the cell type at coordinates (x, y).
     * Returns CellType.Wall if out of bounds.
     */
    public getCell(x: number, y: number): CellType {
        if (!this.isValid(x, y)) return CellType.Wall; // Treat out of bounds as wall
        return this.cells[y * this.width + x] as CellType;
    }

    /**
     * Sets the cell type at coordinates (x, y).
     * Ignored if out of bounds.
     */
    public setCell(x: number, y: number, type: CellType): void {
        if (!this.isValid(x, y)) return;
        const index = y * this.width + x;
        this.cells[index] = type;
        
        // Clear wind config if overwriting with non-wind
        if (type !== CellType.Wind) {
            this.windConfigs.delete(index);
        }
        
        this.recalculateWindField();
    }

    public setWindConfig(x: number, y: number, dx: number, dy: number, force: number): void {
        if (!this.isValid(x, y)) return;
        const index = y * this.width + x;
        this.windConfigs.set(index, { dx, dy, force });
        this.recalculateWindField();
    }

    public getWindConfig(x: number, y: number): WindConfig | undefined {
        if (!this.isValid(x, y)) return undefined;
        return this.windConfigs.get(y * this.width + x);
    }

    /**
     * Identifies if a cell is influenced by a wind source (either as the source or in the stream).
     * Returns the source configuration and location if found.
     */
    public getWindSourceForCell(x: number, y: number): { sourceX: number, sourceY: number, config: WindConfig } | undefined {
        for (const [index, config] of this.windConfigs) {
            const sx = index % this.width;
            const sy = Math.floor(index / this.width);

            // Check if (x,y) is the source
            if (x === sx && y === sy) {
                return { sourceX: sx, sourceY: sy, config };
            }

            // Check if (x,y) is in the stream
            // The stream extends 'force' blocks in direction (dx, dy)
            const dx = x - sx;
            const dy = y - sy;
            
            // Check alignment
            if (config.dx !== 0) {
                if (dy !== 0) continue; // Not on the same row
                const dist = dx / config.dx; // Calculate distance in units of dx
                if (dist >= 1 && dist <= config.force) {
                     return { sourceX: sx, sourceY: sy, config };
                }
            } else if (config.dy !== 0) {
                if (dx !== 0) continue; // Not on the same col
                const dist = dy / config.dy;
                if (dist >= 1 && dist <= config.force) {
                     return { sourceX: sx, sourceY: sy, config };
                }
            }
        }
        return undefined;
    }
    
    /**
     * Returns the effective wind vector at the given cell.
     * Calculated from all active wind sources.
     */
    public getWindVector(x: number, y: number): { x: number, y: number } {
        if (!this.isValid(x, y)) return { x: 0, y: 0 };
        const index = y * this.width + x;
        return {
            x: this.windField[index * 2],
            y: this.windField[index * 2 + 1]
        };
    }

    private recalculateWindField(): void {
        this.windField.fill(0);
        
        for (const [index, config] of this.windConfigs) {
            const sx = index % this.width;
            const sy = Math.floor(index / this.width);
            
            // Project wind field
            // Start from k=1 (next block) up to force
            for (let k = 1; k <= config.force; k++) {
                const tx = sx + config.dx * k;
                const ty = sy + config.dy * k;
                
                if (this.isValid(tx, ty)) {
                    // Linear falloff
                    const magnitude = Math.max(0, config.force - k + 1);
                    const tIdx = ty * this.width + tx;
                    this.windField[tIdx * 2] += config.dx * magnitude;
                    this.windField[tIdx * 2 + 1] += config.dy * magnitude;
                }
            }
        }
    }

    public serialize(agentX: number, agentY: number, cameraState?: { alpha: number, beta: number, radius: number, target: {x: number, y: number, z: number} }, displayName?: string): string {
        let output = "";
        
        if (displayName) {
            output += `#NAME:${displayName}\n`;
        }
        
        if (cameraState) {
            output += `#CAMERA:${cameraState.alpha.toFixed(4)},${cameraState.beta.toFixed(4)},${cameraState.radius.toFixed(4)},${cameraState.target.x.toFixed(4)},${cameraState.target.y.toFixed(4)},${cameraState.target.z.toFixed(4)}\n`;
        }

        // Iterate Top-Down (Visual Layout)
        for (let y = this.height - 1; y >= 0; y--) {
            output += "|";
            for (let x = 0; x < this.width; x++) {
                const cell = this.getCell(x, y);
                let symbol = " . "; // Default Empty

                if (x === agentX && y === agentY) {
                    symbol = " C ";
                } else if (cell === CellType.Wall) {
                    symbol = " B ";
                } else if (cell === CellType.Goal) {
                    symbol = " G ";
                } else if (cell === CellType.Wind) {
                    const w = this.getWindConfig(x, y);
                    if (w) {
                        let dir = "N";
                        if (w.dx === 1) dir = "E";
                        else if (w.dx === -1) dir = "W";
                        else if (w.dy === -1) dir = "S";
                        symbol = `W${dir}${w.force}`;
                    } else {
                        symbol = " W? "; // Error state
                    }
                }
                
                // Pad to 3 chars if length < 3
                if (symbol.length < 3) symbol = " " + symbol + " ";
                
                output += symbol + "|";
            }
            output += "\n";
        }

        return output;
    }

    public deserialize(data: string): { agentX: number, agentY: number, cameraState?: { alpha: number, beta: number, radius: number, target: {x: number, y: number, z: number} }, displayName?: string } | null {
        this.reset();
        let agentPos = null;
        let cameraState = undefined;
        let displayName = undefined;

        const lines = data.trim().split('\n');
        
        // Extract metadata first
        const gridLines = lines.filter(l => {
            if (l.startsWith('#NAME:')) {
                displayName = l.substring(6).trim();
                return false;
            }
            if (l.startsWith('#CAMERA:')) {
                const parts = l.substring(8).split(',').map(parseFloat);
                if (parts.length >= 6) {
                    cameraState = {
                        alpha: parts[0],
                        beta: parts[1],
                        radius: parts[2],
                        target: { x: parts[3], y: parts[4], z: parts[5] }
                    };
                }
                return false;
            }
            return true;
        });

        // Parse Top-Down
        // Expected height lines
        
        let y = this.height - 1;
        for (const line of gridLines) {
            if (y < 0) break;
            
            // Split by '|' and remove empty first/last
            const tokens = line.split('|').map(t => t.trim()).filter(t => t !== "");
            
            for (let x = 0; x < this.width; x++) {
                if (x >= tokens.length) break;
                
                const token = tokens[x];
                
                if (token === "C") {
                    agentPos = { agentX: x, agentY: y };
                    this.setCell(x, y, CellType.Empty); // Agent sits on empty
                } else if (token === "B") {
                    this.setCell(x, y, CellType.Wall);
                } else if (token === "G") {
                    this.setCell(x, y, CellType.Goal);
                } else if (token === ".") {
                    this.setCell(x, y, CellType.Empty);
                } else if (token.startsWith("W")) {
                    // Parse W[Dir][Force] e.g. WN2
                    const dirChar = token.charAt(1);
                    const forceChar = token.substring(2);
                    const force = parseInt(forceChar) || 2;
                    
                    let dx = 0, dy = 0;
                    if (dirChar === 'N') dy = 1;
                    else if (dirChar === 'S') dy = -1;
                    else if (dirChar === 'W') dx = -1;
                    else if (dirChar === 'E') dx = 1;
                    
                    this.setCell(x, y, CellType.Wind);
                    this.setWindConfig(x, y, dx, dy, force);
                }
            }
            y--;
        }
        
        // Return object with optional metadata
        if (agentPos) {
            return { ...agentPos, cameraState, displayName };
        }
        return null;
    }

    /**
     * Checks if the coordinates are within the grid bounds.
     */
    public isValid(x: number, y: number): boolean {
        return x >= 0 && x < this.width && y >= 0 && y < this.height;
    }

    /**
     * Converts 2D coordinates to a flat array index.
     * Use with caution, does not check bounds.
     */
    public getFlatIndex(x: number, y: number): number {
        return y * this.width + x;
    }
}
