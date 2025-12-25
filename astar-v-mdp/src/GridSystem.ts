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

    constructor(width: number = 50, height: number = 50) {
        this.width = width;
        this.height = height;
        this.cells = new Uint8Array(width * height);
        this.windConfigs = new Map();
        this.reset();
    }

    /**
     * Resets the entire grid to Empty state.
     */
    public reset(): void {
        this.cells.fill(CellType.Empty);
        this.windConfigs.clear();
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
    }

    public setWindConfig(x: number, y: number, dx: number, dy: number, force: number): void {
        if (!this.isValid(x, y)) return;
        const index = y * this.width + x;
        this.windConfigs.set(index, { dx, dy, force });
    }

    public getWindConfig(x: number, y: number): WindConfig | undefined {
        if (!this.isValid(x, y)) return undefined;
        return this.windConfigs.get(y * this.width + x);
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
