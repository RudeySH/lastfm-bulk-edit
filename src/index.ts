import he from 'he';
import { namespace } from './constants';
import { createTimestampLinks } from './features/create-timestamp-links';
import { displayAlbumName } from './features/display-album-name';
import { enhanceAutomaticEditsPage } from './features/enhance-automatic-edits-page';
import { LoadingModal } from './modals/LoadingModal';
import { LoadingModalOptions } from './modals/LoadingModalOptions';
import { Modal } from './modals/Modal';
import { Step } from './modals/Step';
import { delay, fetchAndRetry } from './utils/utils';

// use the top-right link to determine the current user
const authLink = document.querySelector<HTMLAnchorElement>('a.auth-link')!;

// https://regex101.com/r/UCmC8f/1
const albumRegExp = new RegExp(`^${authLink?.href}/library/music(/\\+[^/]*)*(/[^+][^/]*){2}$`);
const artistRegExp = new RegExp(`^${authLink?.href}/library/music(/\\+[^/]*)*(/[^+][^/]*){1}(/\\+[^/]*)?$`);

const domParser = new DOMParser();

const editScrobbleFormTemplate = document.createElement('template');
editScrobbleFormTemplate.innerHTML = `
    <form method="POST" action="${authLink?.getAttribute('href')}/library/edit?edited-variation=library-track-scrobble" data-edit-scrobble data-edit-scrobbles>
        <input type="hidden" name="csrfmiddlewaretoken" value="">
        <input type="hidden" name="artist_name" value="">
        <input type="hidden" name="track_name" value="">
        <input type="hidden" name="album_name" value="">
        <input type="hidden" name="album_artist_name" value="">
        <input type="hidden" name="timestamp" value="">
        <button type="submit" class="mimic-link dropdown-menu-clickable-item more-item--edit-old" data-analytics-action="EditScrobblesOpen">
            Edit scrobbles
        </button>
    </form>`;

if (authLink) {
    initialize();
}

function initialize() {
    appendStyle();
    appendEditScrobbleHeaderLinkAndMenuItems(document.body);
    createTimestampLinks(document.body);
    displayAlbumName(document.body);
    enhanceAutomaticEditsPage(document.body);

    // use MutationObserver because Last.fm is a single-page application

    const observer = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
            for (const node of mutation.addedNodes) {
                if (node instanceof Element) {
                    if (node.hasAttribute('data-processed')) {
                        continue;
                    }

                    node.setAttribute('data-processed', 'true');
                    appendEditScrobbleHeaderLinkAndMenuItems(node);
                    createTimestampLinks(document.body);
                    displayAlbumName(node);
                    enhanceAutomaticEditsPage(node);
                }
            }
        }
    });

    observer.observe(document.body, {
        childList: true,
        subtree: true,
    });
}

function appendStyle() {
    const style = document.createElement('style');

    style.innerHTML = `
        .${namespace}-title[title] {
            cursor: help !important;
        }

        @media (pointer: coarse), (hover: none) {
            .${namespace}-title[title]:focus {
                position: relative;
                display: inline-flex;
                justify-content: center;
            }

            .${namespace}-title[title]:focus::after {
                content: attr(title);
                position: absolute;
                top: 100%;
                left: 0%;
                color: #fff;
                background-color: #2b2a32;
                border: 1px solid #fff;
                width: fit-content;
                padding: 4px 7px;
                font-size: small;
                line-height: normal;
                white-space: pre;
                z-index: 1;
            }
        }

        .${namespace}-ellipsis {
            display: block;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }

        .${namespace}-form-group-controls {
            margin-left: 0 !important;
        }

        .${namespace}-list {
            column-count: 2;
        }

        .${namespace}-loading {
            background: url("/static/images/loading_dark_light_64.gif") 50% 50% no-repeat;
            height: 64px;
            display: flex;
            justify-content: center;
            align-items: center;
        }

        .${namespace}-text-danger {
            color: #d92323;
        }

        .${namespace}-text-info {
            color: #2b65d9;
        }

        @media (min-width: 768px) {
            .${namespace}-chartlist-scrobbles .chartlist-name {
                margin-top: -2px;
                margin-bottom: 13px;
            }

            .${namespace}-chartlist-scrobbles .chartlist-album {
                margin-top: 13px;
                margin-bottom: -2px;
                position: absolute;
                left: 133.5px;
                width: 182.41px;
            }

            .${namespace}-chartlist-scrobbles .chartlist-album::before {
                width: 0 !important;
            }
        }

        @media (min-width: 1260px) {
            .${namespace}-chartlist-scrobbles .chartlist-album {
                width: 272.41px;
            }
        }

        .${namespace}-highlight {
            background-color: #fff9e5;
        }

        .${namespace}-highlight:hover {
            background-color: #fcf2cf !important;
        }`;

    document.head.appendChild(style);
}

function appendEditScrobbleHeaderLinkAndMenuItems(element: Element) {
    if (!document.URL.startsWith(authLink.href)) {
        return; // current page is not the user's profile
    }

    appendEditScrobbleHeaderLink(element);
    appendEditScrobbleMenuItems(element);
}

function appendEditScrobbleHeaderLink(element: Element) {
    const header = element.querySelector('.library-header');

    if (header === null) {
        return; // current page does not contain the header we're looking for
    }

    const form = getEditScrobbleForm(document.URL);
    const button = form.querySelector('button')!;

    // replace submit button with a link

    form.style.display = 'inline';
    button.style.display = 'none';

    const link = form.appendChild(document.createElement('a'));
    link.href = 'javascript:void(0)';
    link.textContent = 'Edit scrobbles';
    link.addEventListener('click', () => button.click());

    if (header.lastElementChild?.tagName !== 'H2') {
        header.insertAdjacentText('beforeend', ' · ');
    }

    header.insertAdjacentElement('beforeend', form);
}

function appendEditScrobbleMenuItems(element: Element) {
    const rows = element instanceof HTMLTableRowElement ? [element] : element.querySelectorAll('tr');

    for (const row of rows) {
        const link = row.querySelector<HTMLAnchorElement>('a.chartlist-count-bar-link,a.more-item--track[href^="/user/"]');

        if (!link) {
            continue; // this is not an artist, album or track
        }

        const form = getEditScrobbleForm(link.href, row);

        const editScrobbleMenuItem = document.createElement('li');
        editScrobbleMenuItem.appendChild(form);
        editScrobbleMenuItem.setAttribute('data-processed', 'true');

        // append new menu item to the DOM
        const menu = row.querySelector('.chartlist-more-menu')!;
        if (menu.firstElementChild?.hasAttribute('data-processed')) {
            menu.removeChild(menu.firstElementChild);
        }
        menu.insertBefore(editScrobbleMenuItem, menu.firstElementChild);
    }
}

function getEditScrobbleForm(url: string, row?: HTMLTableRowElement) {
    const urlType = getUrlType(url);

    const form = editScrobbleFormTemplate.content.firstElementChild!.cloneNode(true) as HTMLFormElement;
    const button = form.querySelector('button')!;

    let allScrobbleData: FormData[];
    let scrobbleData: FormData[];
    let submit = false;

    button.addEventListener('click', async (event: Event) => {
        if (!document.querySelector('.header--user .label')) {
            alert('Last.fm pro subscription is required to edit scrobbles.')
        }

        if (!submit) {
            event.stopImmediatePropagation();
            return;
        }

        const loadingModal = createLoadingModal('Waiting for Last.fm...', { dismissible: true });

        try {
            await augmentEditScrobbleForm(scrobbleData);
        } finally {
            loadingModal.hide();
        }

        submit = false;
    });

    form.addEventListener('submit', async (event: Event) => {
        if (submit) {
            return;
        }

        event.preventDefault();
        event.stopImmediatePropagation();

        if (!allScrobbleData) {
            const loadingModal = createLoadingModal('Loading Scrobbles...', { dismissible: true, display: 'percentage' });

            try {
                allScrobbleData = await fetchScrobbleData(url, loadingModal, loadingModal);

                if (!loadingModal.isAttached) {
                    return;
                }
            } finally {
                loadingModal.hide();
            }
        }

        scrobbleData = allScrobbleData;

        // use JSON strings as album keys to uniquely identify combinations of album + album artists
        // group scrobbles by album key
        let scrobbleDataGroups = [...groupBy(allScrobbleData, (s) => JSON.stringify({
            album_name: s.get('album_name') ?? '',
            album_artist_name: s.get('album_artist_name') ?? '',
        }))];

        // sort groups by the amount of scrobbles
        scrobbleDataGroups = scrobbleDataGroups.sort(([_key1, values1], [_key2, values2]) => values2.length - values1.length);

        // when editing multiple albums album, show an album selection dialog first
        if (scrobbleDataGroups.length >= 2) {
            const noAlbumKey = JSON.stringify({ album_name: '', album_artist_name: '' });
            let currentAlbumKey: string | undefined = undefined;

            // put the "No Album" album first
            scrobbleDataGroups = scrobbleDataGroups.sort(([key1], [key2]) => {
                if (key1 === noAlbumKey) return -1;
                if (key2 === noAlbumKey) return +1;
                return 0;
            });

            // when the edit dialog was initiated from an album or album track, put that album first in the list
            if (urlType === 'album' || getUrlType(document.URL) === 'album') {
                // grab the current album name and artist name from the DOM
                const album_name = (urlType === 'album' && row
                    ? row.querySelector('.chartlist-name')
                    : document.querySelector('.library-header-title'))!.textContent!.trim();
                const album_artist_name = (urlType === 'album' && row
                    ? row.querySelector('.chartlist-artist') || document.querySelector('.library-header-title, .library-header-crumb')
                    : document.querySelector('.text-colour-link'))!.textContent!.trim();
                currentAlbumKey = JSON.stringify({ album_name, album_artist_name });

                // put the current album first
                scrobbleDataGroups = scrobbleDataGroups.sort(([key1], [key2]) => {
                    if (key1 === currentAlbumKey) return -1;
                    if (key2 === currentAlbumKey) return +1;
                    if (key1 === noAlbumKey) return -1;
                    if (key2 === noAlbumKey) return +1;
                    return 0;
                });
            }

            const body = document.createElement('div');
            body.innerHTML = `
                <div class="form-disclaimer">
                    <div class="alert alert-info">
                        Scrobbles from this ${urlType} are spread out across multiple albums.
                        Select which albums you would like to edit.
                        Deselect albums you would like to skip.
                    </div>
                </div>
                <div class="form-group">
                    <div class="form-group-controls ${namespace}-form-group-controls">
                        <button type="button" class="btn-secondary" id="${namespace}-select-all">Select all</button>
                        <button type="button" class="btn-secondary" id="${namespace}-deselect-all">Deselect all</button>
                    </div>
                </div>
                <ul class="${namespace}-list">
                    ${scrobbleDataGroups.map(([key, scrobbleData]) => {
                const firstScrobbleData = scrobbleData[0];
                const album_name = firstScrobbleData.get('album_name') as string;
                const artist_name = (firstScrobbleData.get('album_artist_name') ?? firstScrobbleData.get('artist_name')!) as string;

                return `
                    <li>
                        <div class="checkbox">
                            <label>
                                <input type="checkbox" name="key" value="${he.escape(key)}" ${currentAlbumKey === undefined || currentAlbumKey === key ? 'checked' : ''} />
                                <strong title="${he.escape(album_name ?? '')}" class="${namespace}-ellipsis ${currentAlbumKey === key ? `${namespace}-text-info` : !album_name ? `${namespace}-text-danger` : ''}">
                                    ${album_name ? he.escape(album_name) : '<em>No Album</em>'}
                                </strong>
                                <div title="${he.escape(artist_name)}" class="${namespace}-ellipsis">
                                    ${he.escape(artist_name)}
                                </div>
                                <small>
                                    ${scrobbleData.length} scrobble${scrobbleData.length !== 1 ? 's' : ''}
                                </small>
                            </label>
                        </div>
                    </li>`;
            }).join('')}
                </ul>`;

            const checkboxes = body.querySelectorAll<HTMLInputElement>('input[type="checkbox"]');

            body.querySelector(`#${namespace}-select-all`)!.addEventListener('click', () => {
                for (const checkbox of checkboxes) {
                    checkbox.checked = true;
                }
            });

            body.querySelector(`#${namespace}-deselect-all`)!.addEventListener('click', () => {
                for (const checkbox of checkboxes) {
                    checkbox.checked = false;
                }
            });

            let formData: FormData;
            try {
                formData = await prompt('Select Albums To Edit', body);
            } catch (error) {
                return; // user canceled the album selection dialog
            }

            const selectedAlbumKeys = formData.getAll('key');

            scrobbleData = scrobbleDataGroups
                .filter(([key]) => selectedAlbumKeys.includes(key))
                .map(([_, values]) => values)
                .flat();
        }

        if (scrobbleData.length === 0) {
            alert(`Last.fm reports you haven't listened to this ${urlType}.`);
            return;
        }

        // use the first scrobble to trick Last.fm into fetching the Edit Scrobble modal
        applyFormData(form, scrobbleData[0]);
        submit = true;
        button.click();
    });

    return form;
}

// shows a form dialog and resolves its promise on submit
function prompt(title: Element | string, body: Element | string) {
    return new Promise<FormData>((resolve, reject) => {
        const form = document.createElement('form');
        form.className = 'form-horizontal';

        if (body instanceof Element) {
            form.insertAdjacentElement('beforeend', body);
        } else {
            form.insertAdjacentHTML('beforeend', body);
        }

        form.insertAdjacentHTML('beforeend', `
            <div class="form-group form-group--submit">
                <div class="form-submit">
                    <button type="reset" class="btn-secondary">Cancel</button>
                    <button type="submit" class="btn-primary">
                        <span class="btn-inner">
                            OK
                        </span>
                    </button>
                </div>
            </div>`);

        const content = document.createElement('div');
        content.className = 'content-form';
        content.appendChild(form);

        const modal = new Modal(title, content, {
            dismissible: true,
            events: {
                hide: reject,
            },
        });

        form.addEventListener('reset', () => modal.hide());
        form.addEventListener('submit', (event) => {
            event.preventDefault();
            resolve(new FormData(form));
            modal.hide();
        });

        modal.show();
    });
}

function createLoadingModal(title: Element | string, options: LoadingModalOptions) {
    const modal = new LoadingModal(title, options);
    modal.show();

    return modal;
}

// this is a recursive function that browses pages of artists, albums and tracks to gather scrobbles
async function fetchScrobbleData(url: string, loadingModal: LoadingModal, parentStep: Step): Promise<FormData[]> {
    // remove "?date_preset=LAST_365_DAYS", etc.
    const indexOfQuery = url.indexOf('?');
    if (indexOfQuery !== -1) {
        url = url.substring(0, indexOfQuery);
    }

    switch (getUrlType(url)) {
        case 'artist':
            if (!url.endsWith('/+tracks')) {
                url += '/+tracks'; // skip artist overview and go straight to the tracks
            }
            break;

        case 'track':
            if (!url.includes('/library/music/+noredirect/')) {
                url = url.replace('/library/music/', '/library/music/+noredirect/'); // avoid redirects
            }
            break;
    }


    const documentsToFetch = [fetchHTMLDocument(url)];
    const firstDocument = await documentsToFetch[0];
    const paginationList = firstDocument.querySelector('.pagination-list');

    if (paginationList) {
        const pageCount = parseInt(paginationList.children[paginationList.children.length - 2].textContent!.trim(), 10);
        const pageNumbersToFetch = [...Array(pageCount - 1).keys()].map((i) => i + 2);
        documentsToFetch.push(...pageNumbersToFetch.map((n) => fetchHTMLDocument(`${url}?page=${n}`)));
    }

    const scrobbleData = await forEachParallel(loadingModal, parentStep, documentsToFetch, async (documentToFetch, step) => {
        const fetchedDocument = await documentToFetch;

        const table = fetchedDocument.querySelector<HTMLTableElement>('table.chartlist:not(.chartlist__placeholder)');
        if (!table) {
            // sometimes a missing chartlist is expected, other times it indicates a failure
            if (fetchedDocument.body.textContent!.includes('There was a problem loading your')) {
                abort('There was a problem loading your scrobbles, please try again later.');
            }
            return [];
        }

        const rows = [...table.tBodies[0].rows];

        // to display accurate loading percentages, tracks with more scrobbles will have more weight
        const weightFunc = (row: HTMLTableRowElement) => {
            const barValue = row.querySelector('.chartlist-count-bar-value');
            if (barValue === null) return 1;
            const scrobbleCount = parseInt(barValue.firstChild!.textContent!.trim().replace(/,/g, ''), 10);
            return Math.ceil(scrobbleCount / 50); // 50 = items per page on Last.fm
        };

        const scrobbleData = await forEachParallel(loadingModal, step, rows, async (row, step) => {
            const link = row.querySelector<HTMLAnchorElement>('.chartlist-count-bar-link');
            if (link) {
                // recursive call to the current function
                return await fetchScrobbleData(link.href, loadingModal, step);
            }

            // no link indicates we're at the scrobble overview
            const form = row.querySelector<HTMLFormElement>('form[data-edit-scrobble]')!;
            return [new FormData(form)];
        }, weightFunc);

        return scrobbleData.flat();
    });

    return scrobbleData.flat();
}

function getUrlType(url: string) {
    if (albumRegExp.test(url)) {
        return 'album';
    } else if (artistRegExp.test(url)) {
        if (url.endsWith('/+albums')) {
            return 'album artist';
        } else {
            return 'artist';
        }
    } else {
        return 'track';
    }
}

async function fetchHTMLDocument(url: string) {
    try {
        return await fetchAndRetry(url, undefined, async (response, i) => {
            const html = await response.text();
            const doc = domParser.parseFromString(html, 'text/html');

            if (doc.querySelector('table.chartlist:not(.chartlist__placeholder)') || i >= 5) {
                return doc;
            }
        });
    } catch (error) {
        const message = `There was a problem loading your scrobbles, please try again later. (${error})`;
        abort(message);
        throw message;
    }
}

let aborting = false;

function abort(message: string) {
    if (aborting) return;
    aborting = true;
    alert(message);
    window.location.reload();
}

// series for loop that updates the loading percentage
async function forEach<T, U>(loadingModal: LoadingModal, parentStep: Step, array: T[], callback: (item: T, step: Step) => Promise<U>, weightFunc?: (item: T) => number) {
    const tuples = array.map((item) => ({ item, step: { completed: false, steps: [], weight: weightFunc ? weightFunc(item) : 1 } }));
    parentStep.steps.push(...tuples.map((tuple) => tuple.step));
    loadingModal.refreshProgress();

    const result: U[] = [];
    for (const tuple of tuples) {
        result.push(await callback(tuple.item, tuple.step));
        tuple.step.completed = true;
        loadingModal.refreshProgress();
    }

    return result.flat();
}

// parallel for loop that updates the loading percentage
function forEachParallel<T, U>(loadingModal: LoadingModal, parentStep: Step, array: T[], callback: (item: T, step: Step) => Promise<U>, weightFunc?: (item: T) => number): Promise<U[]> {
    const tuples = array.map((item) => ({ item, step: { completed: false, steps: [], weight: weightFunc ? weightFunc(item) : 1 } }));
    parentStep.steps.push(...tuples.map((tuple) => tuple.step));
    loadingModal.refreshProgress();

    return Promise.all(tuples.map(async (tuple) => {
        const result = await callback(tuple.item, tuple.step);
        tuple.step.completed = true;
        loadingModal.refreshProgress();
        return result;
    }));
}

function applyFormData(form: HTMLFormElement, formData: FormData) {
    for (const [name, value] of formData) {
        const input = form.querySelector<HTMLInputElement>(`input[name="${name}"]`)!;
        input.value = value as string;
    }
}

interface ScrobbleFormControlsCollection extends HTMLFormControlsCollection {
    track_name: HTMLInputElement;
    artist_name: HTMLInputElement;
    album_name: HTMLInputElement;
    album_artist_name: HTMLInputElement;
    track_name_original: HTMLInputElement;
    artist_name_original: HTMLInputElement;
    album_name_original: HTMLInputElement;
    album_artist_name_original: HTMLInputElement;
    edit_all?: HTMLInputElement;
    create_automatic_edit_rule: HTMLInputElement;
}

// augments the default Edit Scrobble form to include new features
async function augmentEditScrobbleForm(scrobbleData: FormData[]) {
    const wrapper = await observeChildList(document.body, '.popup_wrapper');

    // wait 1 frame
    await delay(1);

    const popup = wrapper.querySelector('.popup_content')!;
    const title = popup.querySelector<HTMLElement>('.modal-title')!;
    const form = popup.querySelector<HTMLFormElement>('form[action$="/library/edit?edited-variation=library-track-scrobble"]')!;
    const elements = form.elements as ScrobbleFormControlsCollection;

    title.textContent = `Edit Scrobbles`;

    // remove traces of the first scrobble that was used to initialize the form
    const topBox = form.querySelector('.edit-scrobble-top-box');
    if (topBox) {
        form.removeChild(topBox);
    }

    const track_name_input = elements.track_name;
    const artist_name_input = elements.artist_name;
    const album_name_input = elements.album_name;
    const album_artist_name_input = elements.album_artist_name;

    const tracks = augmentInput(scrobbleData, popup, elements, elements.track_name_original, track_name_input, 'tracks');
    augmentInput(scrobbleData, popup, elements, elements.artist_name_original, artist_name_input, 'artists');
    augmentInput(scrobbleData, popup, elements, elements.album_name_original, album_name_input, 'albums');
    augmentInput(scrobbleData, popup, elements, elements.album_artist_name_original, album_artist_name_input, 'album artists');

    // add information alert about album artists being kept in sync
    if (album_artist_name_input.placeholder === 'Mixed' && scrobbleData.some((s) => s.get('album_artist_name') === artist_name_input.value)) {
        const messageTemplate = document.createElement('template');
        messageTemplate.innerHTML = `
            <div class="form-group-success">
                <div class="alert alert-info">
                    <p>Matching album artists will be kept in sync.</p>
                </div>
            </div>`;

        const message = messageTemplate.content.firstElementChild!.cloneNode(true);
        const formGroup = album_artist_name_input.parentElement!;
        formGroup.parentElement!.insertBefore(message, formGroup.nextElementSibling!.nextElementSibling);

        const removeMessage = () => {
            message.parentElement!.removeChild(message);
            album_artist_name_input.removeEventListener('input', removeMessage);
            album_artist_name_input.removeEventListener('keydown', removeMessage);
        }

        album_artist_name_input.addEventListener('input', removeMessage);
        album_artist_name_input.addEventListener('keydown', removeMessage);
    }

    // keep album artist name in sync
    let previousValue = artist_name_input.value;
    artist_name_input.addEventListener('input', () => {
        if (album_artist_name_input.value === previousValue && album_artist_name_input.placeholder !== 'Mixed') {
            album_artist_name_input.value = artist_name_input.value;
            album_artist_name_input.dispatchEvent(new Event('input'));
        }
        previousValue = artist_name_input.value;
    });

    // update the "Bulk edit" checkbox
    if (elements.edit_all) {
        elements.edit_all.checked = true;
        elements.edit_all.disabled = true;
        elements.edit_all.parentElement!.style.cursor = 'auto';
        elements.edit_all.nextSibling!.textContent =
            `Apply to all (${scrobbleData.length}) past scrobbles of ${tracks} tracks`;

        const hiddenInput = document.createElement('input');
        hiddenInput.type = 'hidden';
        hiddenInput.name = elements.edit_all.name;
        hiddenInput.value = elements.edit_all.value;
        elements.edit_all.parentElement!.insertBefore(hiddenInput, elements.edit_all.nextElementSibling);
    }

    // update the "Automatic edit" checkbox
    if (tracks > 1) {
        elements.create_automatic_edit_rule.nextSibling!.textContent =
            `Apply to all future scrobbles of ${tracks} tracks`;
    }

    // update the "Automatic scrobble" checkbox

    // each exact track, artist, album and album artist combination is considered a distinct scrobble
    const distinctGroups = groupBy(scrobbleData, (s) => JSON.stringify({
        track_name: s.get('track_name'),
        artist_name: s.get('artist_name'),
        album_name: s.get('album_name') ?? '',
        album_artist_name: s.get('album_artist_name') ?? '',
    }));

    const distinctScrobbleData = [...distinctGroups].map(([_name, values]) => values[0]);

    // disable the submit button when the form has validation errors
    const submitButton = form.querySelector<HTMLButtonElement>('button[type="submit"]')!;
    form.addEventListener('input', () => {
        submitButton.disabled = form.querySelector('.has-error') !== null;
    });

    // set up the form submit event listener
    submitButton.addEventListener('click', async (event: Event) => {
        event.preventDefault();

        for (const element of form.elements) {
            if (element instanceof HTMLInputElement && element.dataset['confirm'] && element.placeholder !== 'Mixed') {
                if (confirm(element.dataset['confirm'])) {
                    delete element.dataset['confirm']; // don't confirm again when resubmitting
                } else {
                    return; // stop submit
                }
            }
        }

        const formData = new FormData(form);
        const formDataToSubmit = [];

        const track_name = getMixedInputValue(track_name_input);
        const artist_name = getMixedInputValue(artist_name_input);
        const album_name = getMixedInputValue(album_name_input);
        const album_artist_name = getMixedInputValue(album_artist_name_input);

        for (const originalData of distinctScrobbleData) {
            const track_name_original = originalData.get('track_name')!;
            const artist_name_original = originalData.get('artist_name')!;
            const album_name_original = originalData.get('album_name') ?? '';
            const album_artist_name_original = originalData.get('album_artist_name') ?? '';

            // if the album artist field is Mixed, use the old and new artist names to keep the album artist in sync
            const album_artist_name_sync = album_artist_name_input.placeholder === 'Mixed' && distinctScrobbleData.some((s) => s.get('artist_name') === album_artist_name_original)
                ? artist_name
                : album_artist_name;

            // check if anything changed compared to the original track, artist, album and album artist combination
            if (track_name !== null && track_name !== track_name_original ||
                artist_name !== null && artist_name !== artist_name_original ||
                album_name !== null && album_name !== album_name_original ||
                album_artist_name_sync !== null && album_artist_name_sync !== album_artist_name_original) {

                const clonedFormData = cloneFormData(formData);

                // Last.fm expects a timestamp
                clonedFormData.set('timestamp', originalData.get('timestamp')!);

                // populate the *_original fields to instruct Last.fm which scrobbles need to be edited

                clonedFormData.set('track_name_original', track_name_original);
                if (track_name === null) {
                    clonedFormData.set('track_name', track_name_original);
                }

                clonedFormData.set('artist_name_original', artist_name_original);
                if (artist_name === null) {
                    clonedFormData.set('artist_name', artist_name_original);
                }

                clonedFormData.set('album_name_original', album_name_original);
                if (album_name === null) {
                    clonedFormData.set('album_name', album_name_original);
                }

                clonedFormData.set('album_artist_name_original', album_artist_name_original);
                if (album_artist_name_sync === null) {
                    clonedFormData.set('album_artist_name', album_artist_name_original);
                } else {
                    clonedFormData.set('album_artist_name', album_artist_name_sync);
                }

                clonedFormData.set('ajax', '1');

                formDataToSubmit.push(clonedFormData);
            }
        }

        if (formDataToSubmit.length === 0) {
            alert('Your edit doesn\'t contain any real changes.'); // TODO: pretty validation messages
            return;
        }

        // hide the Edit Scrobble form
        const cancelButton = form.querySelector<HTMLButtonElement>('button.js-close')!;
        cancelButton.click();

        const loadingModal = createLoadingModal('Saving Edits...', { dismissible: false, display: 'count' });
        const parentStep = loadingModal;

        // run edits in series, inconsistencies will arise if you use a parallel loop
        await forEach(loadingModal, parentStep, formDataToSubmit, async (formData) => {
            // Edge does not support passing formData into URLSearchParams() constructor
            const body = new URLSearchParams();
            for (const [name, value] of formData) {
                body.append(name, value as string);
            }

            const response = await fetchAndRetry(form.action, { method: 'POST', body: body });
            const html = await response.text();

            // use DOMParser to check the response for alerts
            const placeholder = domParser.parseFromString(html, 'text/html');

            for (const message of placeholder.querySelectorAll('.alert-danger')) {
                alert(message.textContent!.trim()); // TODO: pretty validation messages
            }
        });

        // Last.fm sometimes displays old data when reloading too fast, so wait 1 second
        setTimeout(() => { window.location.reload(); }, 1000);
    });
}

// helper function that completes when a matching element gets appended
function observeChildList(target: Node, selector: string) {
    return new Promise<Element>((resolve) => {
        const observer = new MutationObserver((mutations) => {
            for (const mutation of mutations) {
                for (const node of mutation.addedNodes) {
                    if (node instanceof Element && node.matches(selector)) {
                        observer.disconnect();
                        resolve(node);
                        return;
                    }
                }
            }
        });

        observer.observe(target, { childList: true });
    });
}

// turns a normal input into an input that supports the "Mixed" state
function augmentInput(scrobbleData: FormData[], popup: Element, inputs: ScrobbleFormControlsCollection, originalInput: HTMLInputElement, input: HTMLInputElement, plural: string) {
    const formGroup = input.closest('.form-group')!;

    const groups = [...groupBy(scrobbleData, (s) => s.get(input.name))].sort((a, b) => b[1].length - a[1].length);

    if (groups.length >= 2) {
        // display the "Mixed" placeholder when there are two or more possible values
        originalInput.value = '';
        originalInput.placeholder = 'Mixed';
        input.value = '';
        input.placeholder = 'Mixed';

        // remove the "Originally" text that only shows on small screens
        let elementToRemove = formGroup.previousElementSibling;
        while (elementToRemove !== null) {
            if (elementToRemove.classList.contains('edit-scrobble-label--originally')) {
                elementToRemove.parentElement!.removeChild(elementToRemove);
                break;
            }
            elementToRemove = elementToRemove.previousElementSibling;
        }

        // display informational element
        const maxFigureLength = groups[0][1].length.toString().length;
        const abbr = document.createElement('span');
        abbr.className = `abbr ${namespace}-title`;
        abbr.tabIndex = -1;
        abbr.textContent = `${groups.length} ${plural}`;
        abbr.title = groups
            .map(([key, values]) => {
                const figureLength = values.length.toString().length;
                const figureSpaces = '\u2007'.repeat(maxFigureLength - figureLength);
                return `${figureSpaces}${values.length}x ${key ?? ''}`;
            })
            .join('\n');
        formGroup.parentElement!.insertBefore(abbr, formGroup.nextElementSibling);

        input.dataset['confirm'] = `You are about to merge scrobbles for ${groups.length} ${plural}. This cannot be undone. Would you like to continue?`;

        // datalist: a native HTML5 autocomplete feature
        const datalist = document.createElement('datalist');
        datalist.id = `${namespace}-${popup.id}-${input.name}-datalist`;

        for (const [value] of groups) {
            const option = document.createElement('option');
            option.value = (value as string | null) ?? '';
            datalist.appendChild(option);
        }

        input.autocomplete = 'off';
        input.setAttribute('list', datalist.id);
        formGroup.insertBefore(datalist, input.nextElementSibling);
    }

    // display green color when field was edited, red if it's not allowed to be empty
    const defaultValue = input.value;

    input.addEventListener('input', () => {
        input.placeholder = ''; // removes "Mixed" state
        refreshFormGroupState();
    });

    input.addEventListener('keydown', (event: KeyboardEvent) => {
        if (event.keyCode === 8 || event.keyCode === 46) { // backspace or delete
            input.placeholder = ''; // removes "Mixed" state
            refreshFormGroupState();
        }
    });

    if (input.name === 'album_name') {
        inputs.album_artist_name.addEventListener('input', () => {
            refreshFormGroupState();
        });
    } else if (input.name === 'album_artist_name') {
        inputs.album_name.addEventListener('input', () => {
            if (input.value === '' && inputs.album_name.value !== '') {
                input.value = inputs.artist_name.value;
                input.placeholder = '';
            }
            refreshFormGroupState();
        });
    }

    function refreshFormGroupState() {
        formGroup.classList.remove('has-error');
        formGroup.classList.remove('has-success');

        if (input.value === '' && input.placeholder === ''
            && (input.name === 'track_name'
                || input.name === 'artist_name'
                || input.name === 'album_name' && (inputs.album_artist_name.value !== '' || inputs.album_artist_name.placeholder === 'Mixed')
                || input.name === 'album_artist_name' && (inputs.album_name.value !== '' || inputs.album_name.placeholder === 'Mixed'))
        ) {
            formGroup.classList.add('has-error');
        } else if (input.value !== defaultValue || groups.length >= 2 && input.placeholder === '') {
            formGroup.classList.add('has-success');
        }
    }

    return groups.length;
}

function groupBy<K, V>(array: V[], keyFunc: (item: V) => K) {
    const map = new Map<K, V[]>();

    for (const item of array) {
        const key = keyFunc(item);
        const value = map.get(key);
        if (!value) {
            map.set(key, [item]);
        } else {
            value.push(item);
        }
    }

    return map;
}

function getMixedInputValue(input: HTMLInputElement) {
    return input.placeholder !== 'Mixed' ? input.value : null;
}

function cloneFormData(formData: FormData) {
    const clonedFormData = new FormData();

    for (const [name, value] of formData) {
        clonedFormData.append(name, value);
    }

    return clonedFormData;
}
