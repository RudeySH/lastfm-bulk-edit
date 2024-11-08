import { ModalOptions } from './ModalOptions';

export class Modal<TOptions extends ModalOptions = ModalOptions> {
    public element: Element;
    protected options?: TOptions;
    private addedClass = false;

    constructor(title: Element | string, body: Element | string, options?: TOptions) {
        this.element = document.createElement('div');
        this.options = options;

        const fragment = modalTemplate.content.cloneNode(true) as DocumentFragment;

        const modalTitle = fragment.querySelector('.modal-title')!;
        if (title instanceof Element) {
            modalTitle.insertAdjacentElement('beforeend', title);
        } else {
            modalTitle.insertAdjacentHTML('beforeend', title);
        }

        const modalBody = fragment.querySelector('.modal-body')!;
        if (body instanceof Element) {
            modalBody.insertAdjacentElement('beforeend', body);
        } else {
            modalBody.insertAdjacentHTML('beforeend', body);
        }

        if (options && options.dismissible) {
            // create X button that closes the modal
            const closeButton = document.createElement('button');
            closeButton.className = 'modal-dismiss sr-only';
            closeButton.textContent = 'Close';
            closeButton.addEventListener('click', () => this.hide());

            // create modal actions div
            const modalActions = document.createElement('div');
            modalActions.className = 'modal-actions';
            modalActions.appendChild(closeButton);

            // append modal actions to modal content
            const modalContent = fragment.querySelector('.modal-content')!;
            modalContent.insertBefore(modalActions, modalContent.firstElementChild);

            // close modal when user clicks outside modal
            const popupWrapper = fragment.querySelector('.popup_wrapper')!;
            popupWrapper.addEventListener('click', (event) => {
                if (event.target instanceof Node && !modalContent.contains(event.target)) {
                    this.hide();
                }
            });
        }

        this.element.appendChild(fragment);
    }

    public get isAttached() {
        return !!this.element.parentNode;
    }

    public show() {
        if (this.element.parentNode) return;
        document.body.appendChild(this.element);

        if (!document.documentElement.classList.contains('popup_visible')) {
            document.documentElement.classList.add('popup_visible');
            this.addedClass = true;
        }
    }

    public hide() {
        if (!this.element.parentNode) return;
        this.element.parentNode.removeChild(this.element);

        if (this.addedClass) {
            document.documentElement.classList.remove('popup_visible');
            this.addedClass = false;
        }

        if (this.options && this.options.events && this.options.events.hide) {
            this.options.events.hide();
        }
    }
}

const modalTemplate = document.createElement('template');
modalTemplate.innerHTML = `
    <div class="popup_background"
        style="opacity: 0.8; visibility: visible; background-color: rgb(0, 0, 0); position: fixed; top: 0px; right: 0px; bottom: 0px; left: 0px;">
    </div>
    <div class="popup_wrapper popup_wrapper_visible" style="opacity: 1; visibility: visible; position: fixed; overflow: auto; width: 100%; height: 100%; top: 0px; left: 0px; text-align: center;">
        <div class="modal-dialog popup_content" role="dialog" aria-labelledby="modal-label" data-popup-initialized="true" aria-hidden="false" style="opacity: 1; visibility: visible; pointer-events: auto; display: inline-block; outline: none; text-align: left; position: relative; vertical-align: middle;" tabindex="-1">
            <div class="modal-content">
                <div class="modal-body">
                    <h2 class="modal-title"></h2>
                </div>
            </div>
        </div>
        <div class="popup_align" style="display: inline-block; vertical-align: middle; height: 100%;"></div>
    </div>`;
