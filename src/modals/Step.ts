export interface Step {
    completed: boolean;
    steps: Step[];
    weight: number;
}
