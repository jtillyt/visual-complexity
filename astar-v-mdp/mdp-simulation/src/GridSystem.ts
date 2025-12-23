export const CellType = {
    Empty: 0,
    Wall: 1,
    Wind: 2,
    Goal: 3
} as const;

export type CellType = typeof CellType[keyof typeof CellType];

export class GridSystem {
    public readonly width: number;
    public readonly height: number;
    private readonly cells: Uint8Array;

    constructor(width: number = 50, height: number = 50) {
        this.width = width;
        this.height = height;
        this.cells = new Uint8Array(width * height);
        this.reset();
    }

    public reset(): void {
        this.cells.fill(CellType.Empty);
    }

    public getCell(x: number, y: number): CellType {
        if (!this.isValid(x, y)) return CellType.Wall; // Treat out of bounds as wall
        return this.cells[y * this.width + x] as CellType;
    }

    public setCell(x: number, y: number, type: CellType): void {
        if (!this.isValid(x, y)) return;
        this.cells[y * this.width + x] = type;
    }

    public isValid(x: number, y: number): boolean {
        return x >= 0 && x < this.width && y >= 0 && y < this.height;
    }

    public getFlatIndex(x: number, y: number): number {
        return y * this.width + x;
    }
}
