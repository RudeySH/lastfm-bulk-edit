import he from 'he';
import { ns } from '../constants';
import { LoadingModal } from '../modals/LoadingModal';
import { LoadingModalOptions } from '../modals/LoadingModalOptions';
import { Modal } from '../modals/Modal';
import { Step } from '../modals/Step';
import { fetchAndRetry } from '../utils/utils';

// use the top-right link to determine the current user
const authLink = document.querySelector<HTMLAnchorElement>('a.auth-link')!;

// https://regex101.com/r/gGv1X0/1
const albumRegExp = new RegExp(`^${authLink?.href}/library/music(/\\+[^/]*)*(/[^+][^/]*){2}$`);
const artistRegExp = new RegExp(`^${authLink?.href}/library/music(/\\+[^/]*)*(/[^+][^/]*){1}(/\\+[^/]*)?$`);

const domParser = new DOMParser();

const bulkEditScrobbleFormTemplate = document.createElement('template');
bulkEditScrobbleFormTemplate.innerHTML = `
    <form method="POST" action="${authLink?.getAttribute('href')}/library/edit-track?edited-variation=library-track-scrobble"
          data-edit-scrobble data-bulk-edit-scrobbles>
        <input type="hidden" name="csrfmiddlewaretoken" value="">
        <input type="hidden" name="artist_name" value="">
        <input type="hidden" name="track_name" value="">
        <input type="hidden" name="album_name" value="">
        <input type="hidden" name="album_artist_name" value="">
        <input type="hidden" name="timestamp" value="">
        <button type="submit" style="display: none;"></button>
    </form>`;

const bulkEditSectionTemplate = document.createElement('template');
bulkEditSectionTemplate.innerHTML = `
    <div>
        <p class="edit-scrobble-label">Bulk edit</p>
        <div>
            <div class="checkbox">
                <label><input type="checkbox">Apply to all past scrobbles</label>
            </div>
        </div>
    </div>`;

const editRangeRadioTemplate = document.createElement('template');
editRangeRadioTemplate.innerHTML = `
    <div class="radio">
        <label for="id_edit_range">
            <input id="id_edit_range" type="radio" name="edit_all" value="" checked>
        </label>
    </div>`;

function createCollapseListItem(value: string) {
    const template = document.createElement('template');

    template.innerHTML = `
        <div class="${ns}-collapse-list-item">
            <div class="hidden-xs ${ns}-collapse-original-field">${he.escape(value)}</div>
            <div class="hidden-xs form-arrow"></div>
            <input type="text" class="${ns}-collapse-field" value="${he.escape(value)}" />
        </div>`;

    return template.content.firstElementChild!.cloneNode(true) as HTMLDivElement;
}

export function appendBulkEditScrobblesHeaderLinkAndMenuItems(element: Element) {
    if (!authLink || !document.URL.startsWith(authLink.href)) {
        return; // current page is not the user's profile
    }

    appendBulkEditScrobblesHeaderLink(element);
    appendBulkEditScrobblesMenuItems(element);
}

function appendBulkEditScrobblesHeaderLink(element: Element) {
    const header = element.querySelector('.library-header');

    if (header === null) {
        return; // current page does not contain the header we're looking for
    }

    const { form, click } = getBulkEditScrobbleMenuItem(document.URL);

    const link = document.createElement('a');
    link.href = 'javascript:void(0)';
    link.textContent = 'Edit scrobbles (Advanced)';
    link.addEventListener('click', click);

    if (header.lastElementChild?.tagName !== 'H2') {
        header.insertAdjacentText('beforeend', ' · ');
    }

    header.insertAdjacentElement('beforeend', link);
    header.insertAdjacentElement('beforeend', form);
}

function appendBulkEditScrobblesMenuItems(element: Element) {
    const rows = element instanceof HTMLTableRowElement ? [element] : element.querySelectorAll('tr');

    for (const row of rows) {
        const link = row.querySelector<HTMLAnchorElement>('a.chartlist-count-bar-link,a.more-item--track[href*="/user/"]');

        if (!link) {
            continue; // this is not an artist, album or track
        }

        const { form, click } = getBulkEditScrobbleMenuItem(link.href, row);

        const button = document.createElement('button');
        button.className = 'mimic-link dropdown-menu-clickable-item more-item--edit-old';
        button.textContent = 'Edit scrobbles (Advanced)';
        button.setAttribute('data-analytics-action', 'BulkEditScrobblesOpen');
        button.addEventListener('click', click);

        form.style.marginTop = '0';

        const bulkEditScrobbleMenuItem = document.createElement('li');
        bulkEditScrobbleMenuItem.appendChild(button);
        bulkEditScrobbleMenuItem.appendChild(form);
        bulkEditScrobbleMenuItem.setAttribute('data-processed', 'true');

        // insert/replace "Edit scrobbles (Advanced)" menu item so it comes after "Edit scrobble"
        const menu = row.querySelector('.chartlist-more-menu')!;

        let editScrobbleMenuItem: Element | undefined = undefined;
        for (const menuItem of menu.children) {
            if (menuItem.hasAttribute('data-processed')) {
                menu.removeChild(menuItem);
            } else if (menuItem.querySelector('button.more-item--edit-old') !== null) {
                editScrobbleMenuItem = menuItem;
            }
        }

        if (editScrobbleMenuItem) {
            menu.insertBefore(bulkEditScrobbleMenuItem, editScrobbleMenuItem.nextElementSibling);
        } else {
            menu.insertBefore(bulkEditScrobbleMenuItem, menu.firstElementChild);
        }
    }
}

function getBulkEditScrobbleMenuItem(url: string, row?: HTMLTableRowElement) {
    const urlType = getUrlType(url);

    // extract date filters from URL
    const indexOfQuery = url.indexOf('?');
    const dateFilters = new URLSearchParams();

    if (indexOfQuery !== -1) {
        const urlParams = new URLSearchParams(url.substring(indexOfQuery));
        const datePreset = urlParams.get('date_preset') ?? '';

        if (['LAST_7_DAYS', 'LAST_30_DAYS', 'LAST_90_DAYS', 'LAST_180_DAYS', 'LAST_365_DAYS'].includes(datePreset)) {
            dateFilters.set('date_preset', datePreset);
        } else {
            const dateRegExp = /^\d{4}-\d{2}-\d{2}/;
            const from = urlParams.get('from');
            const to = urlParams.get('to');

            if (from && dateRegExp.test(from) && from >= '2002-01-01') {
                dateFilters.set('from', from);
            }

            if (to && dateRegExp.test(to) && to < new Date().toISOString()) {
                dateFilters.set('to', urlParams.get('to')!);
            }
        }

        // remove all query params from URL
        url = url.substring(0, indexOfQuery);
    }


    const form = bulkEditScrobbleFormTemplate.content.firstElementChild!.cloneNode(true) as HTMLFormElement;
    const submitButton = form.querySelector<HTMLButtonElement>('button')!;

    let allScrobbleData: FormData[];
    let scrobbleData: FormData[];

    const click = async () => {
        if (!allScrobbleData) {
            const loadingModal = createLoadingModal('Loading Scrobbles...', { dismissible: true, display: 'percentage' });

            try {
                allScrobbleData = await fetchScrobbleData(url, dateFilters, loadingModal, loadingModal);

                if (!loadingModal.isAttached) {
                    return;
                }
            } finally {
                loadingModal.hide();
            }
        }

        scrobbleData = allScrobbleData;

        // use JSON strings as album keys to uniquely identify combinations of album + album artists
        // group scrobbles by album key, case-insensitively because Last.fm doesn't distinguish casings
        let scrobbleDataGroups = [...groupBy(allScrobbleData, (s) => JSON.stringify({
            album_name: s.get('album_name') ?? '',
            album_artist_name: s.get('album_artist_name') ?? '',
        }).toLowerCase())];

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
                currentAlbumKey = JSON.stringify({ album_name, album_artist_name }).toLowerCase();

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
                        ${urlType === 'track' ? 'This track is' : `Tracks from this ${urlType} are`} scrobbled under multiple albums.
                        Select which albums you would like to edit.
                        Deselect albums you would like to skip.
                    </div>
                </div>
                <div class="form-group">
                    <div class="form-group-controls ${ns}-form-group-controls">
                        <button type="button" class="btn-secondary" id="${ns}-select-all">Select all</button>
                        <button type="button" class="btn-secondary" id="${ns}-deselect-all">Deselect all</button>
                    </div>
                </div>
                <ul class="${ns}-list">
                    ${scrobbleDataGroups.map(([key, scrobbleData]) => {
                const firstScrobbleData = scrobbleData[0];
                const album_name = firstScrobbleData.get('album_name') as string;
                const artist_name = (firstScrobbleData.get('album_artist_name') ?? firstScrobbleData.get('artist_name')!) as string;

                return `
                    <li>
                        <div class="checkbox">
                            <label>
                                <input type="checkbox" name="key" value="${he.escape(key)}" ${currentAlbumKey === undefined || currentAlbumKey === key ? 'checked' : ''} />
                                <strong title="${he.escape(album_name ?? '')}" class="${ns}-ellipsis ${currentAlbumKey === key ? `${ns}-text-info` : !album_name ? `${ns}-text-danger` : ''}">
                                    ${album_name ? he.escape(album_name) : '<em>No Album</em>'}
                                </strong>
                                <div title="${he.escape(artist_name)}" class="${ns}-ellipsis">
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

            body.querySelector(`#${ns}-select-all`)!.addEventListener('click', () => {
                for (const checkbox of checkboxes) {
                    checkbox.checked = true;
                }
            });

            body.querySelector(`#${ns}-deselect-all`)!.addEventListener('click', () => {
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

        // use a scrobble of the most-played track to trick Last.fm into fetching the Edit Scrobble modal
        const trackGroups = [...groupBy(scrobbleData, (s) => JSON.stringify({
            track_name: s.get('track_name'),
            artist_name: s.get('artist_name'),
        }).toLowerCase()).values()];
        const mostPlayedTrackScrobbleData = trackGroups.reduce((a, b) => b.length > a.length ? b : a);
        applyFormData(form, mostPlayedTrackScrobbleData[0]);

        submitButton.click();
    };

    submitButton.addEventListener('click', async () => {
        await augmentEditScrobbleForm(scrobbleData, dateFilters);
    });

    return { form, click };
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
async function fetchScrobbleData(url: string, dateFilters: URLSearchParams, loadingModal: LoadingModal, parentStep: Step): Promise<FormData[]> {
        // remove all query params from URL
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

    const documentsToFetch = [fetchHTMLDocument(`${url}?${dateFilters.toString()}`)];
    const firstDocument = await documentsToFetch[0];
    const paginationList = firstDocument.querySelector('.pagination-list');

    if (paginationList) {
        const pageCount = parseInt(paginationList.children[paginationList.children.length - 2].textContent!.trim(), 10);
        const pageNumbersToFetch = [...Array(pageCount - 1).keys()].map((i) => i + 2);
        documentsToFetch.push(...pageNumbersToFetch.map((n) => fetchHTMLDocument(`${url}?page=${n}&${dateFilters.toString()}`)));
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
                return await fetchScrobbleData(link.href, dateFilters, loadingModal, step);
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
    edit_range?: HTMLInputElement;
    create_automatic_edit_rule: HTMLInputElement;
}

interface ScrobbleFormElement extends HTMLFormElement {
    elements: ScrobbleFormControlsCollection;
}

// augments the default Edit Scrobble form to include new features
async function augmentEditScrobbleForm(scrobbleData: FormData[], dateFilters: URLSearchParams) {
    const loadingModal = createLoadingModal('Waiting for Last.fm...', { dismissible: true });
    let popup: Element;

    try {
        popup = await observeChildList(document.body, '.popup_content');
    } finally {
        loadingModal.hide();
    }

    const title = popup.querySelector<HTMLElement>('.modal-title')!;
    const form = popup.querySelector<ScrobbleFormElement>('form[action$="/library/edit-track?edited-variation=library-track-scrobble"]')!;

    title.textContent = `Advanced bulk edit`;

    // remove traces of the first scrobble that was used to initialize the form
    const topBox = form.querySelector('.edit-scrobble-top-box');
    if (topBox) {
        form.removeChild(topBox);
    }

    // prepare scrobble form inputs
    const track_name_input = form.elements.track_name;
    const artist_name_input = form.elements.artist_name;
    const album_name_input = form.elements.album_name;
    const album_artist_name_input = form.elements.album_artist_name;

    augmentInput(scrobbleData, popup, form, form.elements.track_name_original, track_name_input, 'tracks');
    augmentInput(scrobbleData, popup, form, form.elements.artist_name_original, artist_name_input, 'artists');
    augmentInput(scrobbleData, popup, form, form.elements.album_name_original, album_name_input, 'albums');
    augmentInput(scrobbleData, popup, form, form.elements.album_artist_name_original, album_artist_name_input, 'album artists');

    // keep album artist names in sync with the artist names they're equal to
    const originalArtistNames = [...new Set(scrobbleData.map((s) => s.get('artist_name') as string))];

    const getArtistNames = () => {
        const mapArtistName = createValueMapper(form, artist_name_input);
        return new Map(originalArtistNames.map((name) => [name, mapArtistName(name) ?? name]));
    };

    let previousArtistNames = getArtistNames();

    const syncAlbumArtistNames = () => {
        const artistNames = getArtistNames();

        for (const [originalName, name] of artistNames) {
            const previousName = previousArtistNames.get(originalName)!;

            if (name.toLowerCase() === previousName.toLowerCase()) {
                continue;
            }

            if (album_artist_name_input.placeholder.startsWith('Mixed')) {
                for (const subInput of getSubInputs(form, album_artist_name_input)) {
                    if (subInput.value.toLowerCase() === previousName.toLowerCase()) {
                        subInput.value = name;
                        subInput.dispatchEvent(new Event('input'));
                    }
                }
            } else if (album_artist_name_input.value.toLowerCase() === previousName.toLowerCase()) {
                album_artist_name_input.value = name;
                album_artist_name_input.dispatchEvent(new Event('input'));
            }
        }

        previousArtistNames = artistNames;
    };

    artist_name_input.addEventListener('input', syncAlbumArtistNames);

    for (const subInput of getSubInputs(form, artist_name_input)) {
        subInput.addEventListener('input', syncAlbumArtistNames);
    }

    // update the "Bulk edit" checkbox, which Last.fm doesn't always render
    const edit_all_input = form.elements.edit_all ?? createBulkEditCheckbox(form);
    let edit_range_input: HTMLInputElement | null = null;

    if (dateFilters.size === 0) {
        edit_all_input.checked = true;
        edit_all_input.disabled = true;
        edit_all_input.parentElement!.style.cursor = 'auto';

        if (edit_all_input.name) {
            const hiddenInput = document.createElement('input');
            hiddenInput.type = 'hidden';
            hiddenInput.name = edit_all_input.name;
            hiddenInput.value = edit_all_input.value;
            edit_all_input.parentElement!.insertBefore(hiddenInput, edit_all_input.nextElementSibling);
        }
    } else {
        edit_all_input.name = 'edit_all';
        edit_all_input.type = 'radio';

        const container = edit_all_input.closest('.checkbox')!;
        container.classList.remove('checkbox');
        container.classList.add('radio');

        const newRadio = editRangeRadioTemplate.content.firstElementChild!.cloneNode(true);
        container.parentElement!.insertBefore(newRadio, container);

        edit_range_input = form.querySelector('#id_edit_range');
    }

    // each exact track, artist, album and album artist combination is considered a distinct scrobble
    const distinctGroups = groupBy(scrobbleData, (s) => JSON.stringify({
        track_name: s.get('track_name'),
        artist_name: s.get('artist_name'),
        album_name: s.get('album_name'),
        album_artist_name: s.get('album_artist_name'),
    }).toLowerCase());

    // set up the form
    const submitButton = form.querySelector<HTMLButtonElement>('button[type="submit"]')!;
    let formDataToSubmit: FormData[] = [];

    refreshFormState();

    form.addEventListener('input', () => {
        console.log('input');
        refreshFormState();
    });

    function refreshFormState() {
        formDataToSubmit = [];
        let changedScrobbleCount = 0;

        if (form.querySelector('.has-error') === null && form.querySelector('.has-success') !== null) {
            const editScrobble = createScrobbleEditor(form);

            for (const values of distinctGroups.values()) {
                const formData = editScrobble(values[0]);

                if (formData !== null) {
                    formDataToSubmit.push(formData);
                    changedScrobbleCount += values.length;
                }
            }
        }

        // refresh the "Bulk edit" checkbox
        const trackCountText = distinctGroups.size === 1 ? 'this track' : `${formDataToSubmit.length} tracks`;
        const scrobbleCount = distinctGroups.size === 1
            ? scrobbleData.length
            : changedScrobbleCount;

        const scrobblesText = dateFilters.size === 0
            ? `Apply to all (${scrobbleCount}) past scrobbles of ${trackCountText}`
            : `Apply to ${scrobbleCount === 1 ? '1 scrobble' : `${scrobbleCount} scrobbles`} of ${trackCountText} (${document.querySelector('.date-range-picker-button-inner')?.textContent?.trim()})`;

        if (edit_range_input) {
            edit_range_input.nextSibling!.textContent = scrobblesText;
            edit_all_input.nextSibling!.textContent =
                `Apply to all scrobbles of ${trackCountText} (All time)`;
        } else {
            edit_all_input.nextSibling!.textContent = scrobblesText;
        }

        // refresh the "Automatic edit" checkbox
        form.elements.create_automatic_edit_rule.nextSibling!.textContent =
            `Apply to all future scrobbles of ${trackCountText}`;

        // disable the submit button when there is nothing to submit
        submitButton.disabled = formDataToSubmit.length === 0;
    }

    // set up the form submit event listener
    submitButton.addEventListener('click', async (event: Event) => {
        event.preventDefault();

        if (formDataToSubmit.length === 0 || submitButton.disabled) {
            return;
        }

        // formDataToSubmit is based on one scrobble per distinct group by default
        // use all scrobbleData if Bulk edit is not checked
        if (!new FormData(form).get('edit_all')) {
            formDataToSubmit = determineFormDataToSubmit(form, scrobbleData);
        }

        if (formDataToSubmit.length > 1) {
            for (const element of form.elements) {
                if (element instanceof HTMLInputElement && element.dataset['confirm'] && isMerging(form, element)) {
                    if (!confirm(element.dataset['confirm'])) {
                        return; // stop submit
                    }
                }
            }
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

// creates a "Bulk edit" section like the one Last.fm renders, placed above the "Automatic edit" section
function createBulkEditCheckbox(form: ScrobbleFormElement) {
    const automaticEditSection = form.elements.create_automatic_edit_rule.closest('.edit-scrobble-form > div')!;

    const section = bulkEditSectionTemplate.content.firstElementChild!.cloneNode(true) as HTMLElement;
    automaticEditSection.parentElement!.insertBefore(section, automaticEditSection);

    return section.querySelector('input')!;
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
function augmentInput(scrobbleData: FormData[], popup: Element, form: ScrobbleFormElement, originalInput: HTMLInputElement, input: HTMLInputElement, plural: string) {
    const formGroup = input.closest('.form-group')!;
    const inputContainer = document.createElement('div');
    inputContainer.style.width = '100%';
    input.insertAdjacentElement('afterend', inputContainer);
    inputContainer.appendChild(input);

    // group values case-insensitively because Last.fm doesn't distinguish casings, and display each group's most common casing
    const groups = [...groupBy(scrobbleData, (s) => (s.get(input.name) as string | null)?.toLowerCase() ?? null).values()]
        .map((values) => [getMostCommonValue(values.map((s) => s.get(input.name) as string | null)), values] as const)
        .sort((a, b) => b[1].length - a[1].length);
    const subInputs: HTMLInputElement[] = [];

    if (groups.length >= 2) {
        // display the "Mixed" placeholder when there are two or more possible values
        originalInput.value = '';
        originalInput.placeholder = 'Mixed';
        input.value = '';
        input.placeholder = 'Mixed';
        input.required = false;

        // remove the "Originally" text that only shows on small screens
        let elementToRemove = formGroup.previousElementSibling;
        while (elementToRemove !== null) {
            if (elementToRemove.classList.contains('edit-scrobble-label--originally')) {
                elementToRemove.parentElement!.removeChild(elementToRemove);
                break;
            }
            elementToRemove = elementToRemove.previousElementSibling;
        }

        // add collapse elements
        const collapseButton = document.createElement('button');
        collapseButton.type = 'button';
        collapseButton.className = `${ns}-title`;

        const maxFigureLength = groups[0][1].length.toString().length;
        const collapseInfo = document.createElement('span');
        collapseInfo.className = `${ns}-title`;
        collapseInfo.textContent = '…';
        collapseInfo.tabIndex = -1;
        collapseInfo.title = groups
            .map(([key, values]) => {
                const figureLength = values.length.toString().length;
                const figureSpaces = '\u2007'.repeat(maxFigureLength - figureLength);
                return `${figureSpaces}${values.length}x ${key ?? ''}`;
            })
            .join('\n');

        const collapseContainer = document.createElement('div');
        collapseContainer.className = `${ns}-collapse-list`
        collapseContainer.style.marginTop = '0';
        for (const [key] of groups) {
            const listItem = createCollapseListItem(key?.toString() ?? '');
            collapseContainer.appendChild(listItem);

            const subInput = listItem.querySelector('input')!;
            subInput.dataset['mixedFor'] = input.name;
            subInput.dataset['original'] = key?.toString() ?? '';
            subInputs.push(subInput);
        }

        collapseButton.addEventListener('click', () => {
            collapseButton.textContent = `${collapseContainer.style.display === 'none' ? '⯆' : '⯈'} ${groups.length} ${plural}`;
            collapseInfo.style.display = collapseContainer.style.display === 'none' ? 'none' : '';
            collapseContainer.style.display = collapseContainer.style.display === 'none' ? '' : 'none';
        });

        collapseButton.click();

        formGroup.insertAdjacentElement('afterend', collapseButton);
        collapseButton.insertAdjacentElement('afterend', collapseInfo);
        collapseButton.insertAdjacentText('afterend', ' ');
        collapseInfo.insertAdjacentElement('afterend', collapseContainer);

        input.dataset['confirm'] = `You are about to merge scrobbles for ${groups.length} ${plural}. This cannot be undone. Would you like to continue?`;

        // datalist: a native HTML5 autocomplete feature
        const datalist = document.createElement('datalist');
        datalist.id = `${ns}-${popup.id}-${input.name}-datalist`;

        for (const [value] of groups) {
            const option = document.createElement('option');
            option.value = (value as string | null) ?? '';
            datalist.appendChild(option);
        }

        input.autocomplete = 'off';
        input.setAttribute('list', datalist.id);
        formGroup.insertBefore(datalist, input.nextElementSibling);

        // event listeners
        const onInput = () => {
            input.placeholder = '';

            for (const subInput of subInputs) {
                subInput.value = input.value;
            }

            refreshInputState();
        }

        input.addEventListener('input', onInput);

        input.addEventListener('keydown', (event: KeyboardEvent) => {
            if (input.value === ''
                && input.placeholder !== ''
                && (event.keyCode === 8 || event.keyCode === 46)) { // backspace or delete
                onInput();
            }
        });

        for (const subInput of subInputs) {
            subInput.addEventListener('input', () => {
                // go back to the untouched "Mixed" state when every sub-input is reverted to its original value
                const isChanged = subInputs.some((x) => x.value.toLowerCase() !== x.dataset['original']!.toLowerCase());

                input.value = '';
                input.placeholder = isChanged ? 'Mixed (changed)' : 'Mixed';
                refreshInputState();
            });
        }
    } else {
        input.addEventListener('input', () => {
            refreshInputState();
        });
    }

    // display green color when field was edited, red if it's not allowed to be empty
    const defaultValue = input.value;

    if (input.name === 'album_name') {
        form.elements.album_artist_name.addEventListener('input', () => {
            refreshInputState();
        });
    } else if (input.name === 'album_artist_name') {
        form.elements.album_name.addEventListener('input', () => {
            if (input.placeholder !== 'Mixed' && input.value.trim() === '' && form.elements.album_name.value.trim() !== '') {
                input.value = form.elements.artist_name.value;
                input.placeholder = '';
            }
            refreshInputState();
        });
    }

    function refreshInputState() {
        inputContainer.classList.remove('has-error');
        inputContainer.classList.remove('has-success');

        const isEmpty = input.value.trim() === '' && input.placeholder === '';

        if ((isEmpty || subInputs.some(x => x.value.trim() === ''))
            && (input.name === 'track_name'
                || input.name === 'album_name' && (subInputs.length === 0 || isEmpty) && (form.elements.album_artist_name.value.trim() !== '' || form.elements.album_artist_name.placeholder !== '')
                || input.name === 'artist_name'
                || input.name === 'album_artist_name' && (form.elements.album_name.value.trim() !== '' || form.elements.album_name.placeholder !== ''))
        ) {
            inputContainer.classList.add('has-error');
        } else if (input.value.toLowerCase() !== defaultValue.toLowerCase() || groups.length >= 2 && input.placeholder !== 'Mixed') {
            inputContainer.classList.add('has-success');
        }
    }
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

function getMostCommonValue<T>(values: T[]) {
    return [...groupBy(values, (value) => value)].sort((a, b) => b[1].length - a[1].length)[0][0];
}

function determineFormDataToSubmit(form: ScrobbleFormElement, scrobbleData: FormData[]) {
    const editScrobble = createScrobbleEditor(form);

    return scrobbleData
        .map(editScrobble)
        .filter((formData): formData is FormData => formData !== null);
}

// returns a function that creates the form data to submit for a scrobble, or null if the scrobble wouldn't change
function createScrobbleEditor(form: ScrobbleFormElement) {
    const formData = new FormData(form);

    const mapTrackName = createValueMapper(form, form.elements.track_name);
    const mapArtistName = createValueMapper(form, form.elements.artist_name);
    const mapAlbumName = createValueMapper(form, form.elements.album_name);
    const mapAlbumArtistName = createValueMapper(form, form.elements.album_artist_name);

    return (originalData: FormData) => {
        const track_name_original = originalData.get('track_name') as string;
        const artist_name_original = originalData.get('artist_name') as string;
        const album_name_original = (originalData.get('album_name') ?? '') as string;
        const album_artist_name_original = (originalData.get('album_artist_name') ?? '') as string;

        const track_name = mapTrackName(track_name_original) ?? track_name_original;
        const artist_name = mapArtistName(artist_name_original) ?? artist_name_original;
        const album_name = mapAlbumName(album_name_original) ?? album_name_original;
        const album_artist_name = mapAlbumArtistName(album_artist_name_original) ?? album_artist_name_original;

        // check if anything changed compared to the original track, artist, album and album artist combination
        // Last.fm doesn't accept case-only changes, so those don't count, but the entered casing is still submitted
        if (track_name.toLowerCase() === track_name_original.toLowerCase() &&
            artist_name.toLowerCase() === artist_name_original.toLowerCase() &&
            album_name.toLowerCase() === album_name_original.toLowerCase() &&
            album_artist_name.toLowerCase() === album_artist_name_original.toLowerCase()) {
            return null;
        }

        const clonedFormData = cloneFormData(formData);

        // Last.fm expects a timestamp
        clonedFormData.set('timestamp', originalData.get('timestamp')!);

        // populate the *_original fields to instruct Last.fm which scrobbles need to be edited
        clonedFormData.set('track_name_original', track_name_original);
        clonedFormData.set('track_name', track_name);
        clonedFormData.set('artist_name_original', artist_name_original);
        clonedFormData.set('artist_name', artist_name);
        clonedFormData.set('album_name_original', album_name_original);
        clonedFormData.set('album_name', album_name);
        clonedFormData.set('album_artist_name_original', album_artist_name_original);
        clonedFormData.set('album_artist_name', album_artist_name);

        clonedFormData.set('ajax', '1');

        return clonedFormData;
    };
}

// returns a function that maps an original value to its new value, or to null if the input was left untouched
// untouched inputs keep each scrobble's original casing, instead of the casing the input happens to display
function createValueMapper(form: ScrobbleFormElement, input: HTMLInputElement): (originalValue: string) => string | null {
    if (input.placeholder === 'Mixed') {
        return () => null;
    }

    const subInputs = getSubInputs(form, input);

    if (input.placeholder === 'Mixed (changed)') {
        // each edited sub-input holds the new value for one of the original values
        const newValues = new Map(subInputs
            .filter((subInput) => subInput.value !== subInput.dataset['original'])
            .map((subInput) => [subInput.dataset['original']!.toLowerCase(), subInput.value]));
        return (originalValue) => newValues.get(originalValue.toLowerCase()) ?? null;
    }

    if (subInputs.length === 0 && input.value === input.defaultValue) {
        return () => null;
    }

    const value = input.value;
    return () => value;
}

// sub-inputs are the inputs listed under a Mixed input, one per original value
function getSubInputs(form: ScrobbleFormElement, input: HTMLInputElement) {
    return [...form.querySelectorAll<HTMLInputElement>(`input[data-mixed-for="${input.name}"]`)];
}

// a Mixed input merges scrobbles when it maps two or more original values to the same new value
function isMerging(form: ScrobbleFormElement, input: HTMLInputElement) {
    if (input.placeholder === 'Mixed') {
        return false;
    }

    if (input.placeholder === 'Mixed (changed)') {
        const newValues = getSubInputs(form, input).map((subInput) => subInput.value);
        return new Set(newValues.map((value) => value.toLowerCase())).size < newValues.length;
    }

    return true;
}

function cloneFormData(formData: FormData) {
    const clonedFormData = new FormData();

    for (const [name, value] of formData) {
        clonedFormData.append(name, value);
    }

    return clonedFormData;
}
