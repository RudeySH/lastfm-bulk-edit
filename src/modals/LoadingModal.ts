import { Step } from './Step';
import { namespace } from '../constants';
import { LoadingModalOptions } from './LoadingModalOptions';
import { Modal } from './Modal';

export class LoadingModal extends Modal<LoadingModalOptions> implements Step {
    public completed = false;
    public steps: Step[] = [];
    public weight = 0;

    private progress: Element;

    constructor(title: Element | string, options?: LoadingModalOptions) {
        const body = `
            <div class="${namespace}-loading">
                <div class="${namespace}-progress"></div>
            </div>`;

        super(title, body, options);

        this.progress = this.element.querySelector(`.${namespace}-progress`)!;
    }

    public refreshProgress() {
        switch (this.options && this.options.display) {
            case 'count':
                this.progress.textContent = `${this.steps.filter((s) => s.completed).length} / ${this.steps.length}`;
                break;

            case 'percentage':
                this.progress.textContent = Math.floor(getCompletionRatio(this.steps) * 100) + '%';
                break;
        }
    }
}

// calculates the completion ratio from a tree of steps with weights and child steps
function getCompletionRatio(steps: Step[]): number {
    const totalWeight = steps.map((s) => s.weight).reduce((a, b) => a + b, 0);
    if (totalWeight === 0) return 0;
    const completedWeight = steps.map((s) => s.weight * (s.completed ? 1 : getCompletionRatio(s.steps))).reduce((a, b) => a + b, 0);
    return completedWeight / totalWeight;
}
