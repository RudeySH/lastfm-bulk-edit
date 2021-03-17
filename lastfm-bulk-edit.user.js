// ==UserScript==
// @name        Last.fm Bulk Edit
// @namespace   https://github.com/RudeySH/lastfm-bulk-edit
// @version     0.2.3
// @author      Rudey
// @description Bulk edit your scrobbles for any artist or album on Last.fm at once.
// @license     GPL-3.0-or-later
// @homepageURL https://github.com/RudeySH/lastfm-bulk-edit
// @icon        https://www.last.fm/static/images/lastfm_avatar_twitter.png
// @updateURL   https://raw.githubusercontent.com/RudeySH/lastfm-bulk-edit/master/lastfm-bulk-edit.user.js
// @downloadURL https://raw.githubusercontent.com/RudeySH/lastfm-bulk-edit/master/lastfm-bulk-edit.user.js
// @supportURL  https://github.com/RudeySH/lastfm-bulk-edit/issues
// @match       https://www.last.fm/*
// @require     https://cdnjs.cloudflare.com/ajax/libs/he/1.2.0/he.min.js
// ==/UserScript==

'use strict';

const namespace = 'lastfm-bulk-edit';

// use the top-right link to determine the current user
const authLink = document.querySelector('a.auth-link');

if (!authLink) {
    return; // not logged in
}

const libraryURL = `${authLink.href}/library`;

// https://regex101.com/r/KwEMRx/1
const albumRegExp  = new RegExp(`^${libraryURL}/music(\\+[^/]*)*(/[^+][^/]*){2}$`);
const artistRegExp = new RegExp(`^${libraryURL}/music(\\+[^/]*)*(/[^+][^/]*){1}$`);

const domParser = new DOMParser();

const editScrobbleMenuItemTemplate = document.createElement('template');
editScrobbleMenuItemTemplate.innerHTML = `
    <li>
        <form method="POST" action="${libraryURL}/edit?edited-variation=library-track-scrobble" data-edit-scrobble="">
            <input type="hidden" name="csrfmiddlewaretoken" value="">
            <input type="hidden" name="artist_name" value="">
            <input type="hidden" name="track_name" value="">
            <input type="hidden" name="album_name" value="">
            <input type="hidden" name="album_artist_name" value="">
            <input type="hidden" name="timestamp" value="">
            <button type="button" class="mimic-link dropdown-menu-clickable-item more-item--edit">
                Edit scrobbles
            </button>
            <button type="submit" class="hidden"></button>
        </form>
    </li>`;

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

initialize();

function initialize() {
    appendStyle();
    appendEditScrobbleMenuItems(document);

    // use MutationObserver because Last.fm is a single-page application

    const observer = new MutationObserver(mutations => {
        for (const mutation of mutations) {
            for (const node of mutation.addedNodes) {
                if (node instanceof Element) {
                    appendEditScrobbleMenuItems(node);
                }
            }
        }
    });

    observer.observe(document.body, {
        childList: true,
        subtree: true
    });
}

function appendStyle() {
    const style = document.createElement('style');

    style.innerHTML = `
        .${namespace}-abbr {
            cursor: pointer;
        }

        .${namespace}-ellipsis {
            display: block;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
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

        .${namespace}-text-info {
            color: #2b65d9;
        }`;

    document.head.appendChild(style);
}

function appendEditScrobbleMenuItems(element) {
    if (!document.URL.startsWith(libraryURL)) {
        return; // current page is not the user's library
    }

    const tables = element.querySelectorAll('table.chartlist');

    for (const table of tables) {
        for (const row of table.tBodies[0].rows) {
            appendEditScrobbleMenuItem(row);
        }
    }
}

function appendEditScrobbleMenuItem(row) {
    const link = row.querySelector('a.chartlist-count-bar-link');

    if (!link) {
        return; // this is not an artist, album or track
    }

    const linkUrlType = getUrlType(link.href);

    // re-use template from outer scope
    const editScrobbleMenuItem = editScrobbleMenuItemTemplate.content.cloneNode(true);

    const form = editScrobbleMenuItem.querySelector('form');
    const button = form.querySelector('button[type="button"]');
    const submitButton = form.querySelector('button[type="submit"]');

    let allScrobbleData;
    let scrobbleData;

    button.addEventListener('click', async () => {
        if (!allScrobbleData) {
            const loadingModal = createLoadingModal('Loading Scrobbles...', { display: 'percentage' });
            allScrobbleData = await fetchScrobbleData(link.href, loadingModal);
            loadingModal.hide();
        }

        scrobbleData = allScrobbleData;

        // use JSON strings as album keys to uniquely identify combinations of album + album artists
        // group scrobbles by album key
        let scrobbleDataGroups = [...groupBy(allScrobbleData, s => JSON.stringify({
            album_name: s.get('album_name') || '',
            album_artist_name: s.get('album_artist_name') || ''
        }))];

        // sort groups by the amount of scrobbles
        scrobbleDataGroups = scrobbleDataGroups.sort(([_key1, values1], [_key2, values2]) => values2.length - values1.length);

        // when editing multiple albums album, show an album selection dialog first
        if (scrobbleDataGroups.length >= 2) {
            let defaultSelection = 'all';

            // when the edit dialog was initiated from an album or album track, put that album first in the list
            if (linkUrlType === 'album' || getUrlType(document.URL) === 'album') {
                // grab the current album name and artist name from the DOM
                const album_name = (linkUrlType === 'album'
                    ? row.querySelector('.chartlist-name')
                    : document.querySelector('.library-header-title')).textContent.trim();
                const album_artist_name = (linkUrlType === 'album'
                    ? row.querySelector('.chartlist-artist') || document.querySelector('.library-header-title, .library-header-crumb')
                    : document.querySelector('.text-colour-link')).textContent.trim();
                const currentAlbumKey = JSON.stringify({ album_name, album_artist_name });

                // put the current album first
                scrobbleDataGroups = scrobbleDataGroups.sort(([key1], [key2]) => {
                    if (key1 === currentAlbumKey) return -1;
                    if (key2 === currentAlbumKey) return +1;
                    return 0;
                });

                defaultSelection = 'first';
            }

            const disclaimer = `
                <div class="alert alert-info">
                    Scrobbles from this ${linkUrlType} are spread out across multiple albums.
                    Select which albums you would like to edit.
                    Deselect albums you would like to skip.
                </div>`;

            const elements = scrobbleDataGroups.map(([key, scrobbleData], index) => {
                const firstScrobbleData = scrobbleData[0];
                const album_name = firstScrobbleData.get('album_name');
                const artist_name = firstScrobbleData.get('album_artist_name') || firstScrobbleData.get('artist_name');
                const selectFirst = index === 0 && defaultSelection === 'first';

                return `
                    <div class="checkbox">
                        <label>
                            <input type="checkbox" name="key" value="${he.escape(key)}" ${selectFirst || defaultSelection === 'all' ? 'checked' : ''} />
                            <strong title="${he.escape(album_name || '')}" class="${namespace}-ellipsis ${selectFirst ? `${namespace}-text-info` : ''}">
                                ${album_name ? he.escape(album_name) : '<em>No Album</em>'}
                            </strong>
                            <div title="${he.escape(artist_name)}" class="${namespace}-ellipsis">
                                ${he.escape(artist_name)}
                            </div>
                            <small>
                                ${scrobbleData.length} scrobble${scrobbleData.length !== 1 ? 's' : ''}
                            </small>
                        </label>
                    </div>`;
            });

            let formData;
            try {
                formData = await prompt('Select Albums To Edit', disclaimer, elements);
            } catch (error) {
                console.log(error);
                return; // user canceled the album selection dialog
            }

            const selectedAlbumKeys = formData.getAll('key');

            scrobbleData = flatten(scrobbleDataGroups
                .filter(([key]) => selectedAlbumKeys.includes(key))
                .map(([_, values]) => values));
        }

        if (scrobbleData.length === 0) {
            alert(`Last.fm reports you haven't listened to this ${linkUrlType}.`);
            return;
        }

        // use the first scrobble to trick Last.fm into fetching the Edit Scrobble modal
        applyFormData(form, scrobbleData[0]);
        submitButton.click();
    });

    submitButton.addEventListener('click', async () => {
        const loadingModal = createLoadingModal('Waiting for Last.fm...');
        await augmentEditScrobbleForm(linkUrlType, scrobbleData);
        loadingModal.hide();
    });

    // append new menu item to the DOM
    const menu = row.querySelector('.chartlist-more-menu');
    menu.insertBefore(editScrobbleMenuItem, menu.firstElementChild);
}

// shows a form dialog and resolves it's promise on submit
function prompt(title, disclaimer, elements) {
    return new Promise((resolve, reject) => {
        const form = document.createElement('form');
        form.className = 'form-horizontal';

        const element = form.appendChild(document.createElement('div'));
        element.className = 'form-disclaimer';

        if (disclaimer instanceof Node) {
            element.appendChild(disclaimer);
        } else {
            element.innerHTML += disclaimer;
        }

        const list = form.appendChild(document.createElement('ul'));
        list.className = `${namespace}-list`;

        for (const element of elements) {
            const listItem = list.appendChild(document.createElement('li'));

            if (element instanceof Node) {
                listItem.appendChild(element);
            } else {
                listItem.innerHTML += element;
            }
        }

        form.innerHTML += `
            <div class="form-group form-group--submit">
                <div class="form-submit">
                    <button type="reset" class="btn-secondary">Cancel</button>
                    <button type="submit" class="btn-primary">
                        <span class="btn-inner">
                            OK
                        </span>
                    </button>
                </div>
            </div>`;

        const content = document.createElement('div');
        content.className = 'content-form';
        content.appendChild(form);

        const modal = createModal(title, content, {
            dismissible: true,
            events: {
                hide: reject
            }
        });

        form.addEventListener('reset', modal.hide);
        form.addEventListener('submit', (event) => {
            event.preventDefault();
            resolve(new FormData(form));
            modal.hide();
        });

        modal.show();
    });
}

function createModal(title, body, options) {
    // re-use template from outer scope
    const fragment = modalTemplate.content.cloneNode(true);

    const modalTitle = fragment.querySelector('.modal-title');
    if (title instanceof Node) {
        modalTitle.appendChild(title);
    } else {
        modalTitle.innerHTML += title;
    }

    const modalBody = fragment.querySelector('.modal-body');
    if (body instanceof Node) {
        modalBody.appendChild(body);
    } else {
        modalBody.innerHTML += body;
    }

    const element = document.createElement('div');

    if (options && options.dismissible) {
        // create X button that closes the modal
        const closeButton = document.createElement('button');
        closeButton.className = 'modal-dismiss';
        closeButton.textContent = 'Close';
        closeButton.addEventListener('click', hide);

        // append X button to DOM
        const modalContent = fragment.querySelector('.modal-content');
        modalContent.insertBefore(closeButton, modalContent.firstElementChild);

        // close modal when user clicks outside modal
        const popupWrapper = fragment.querySelector('.popup_wrapper');
        popupWrapper.addEventListener('click', event => {
            if (!modalContent.contains(event.target)) {
                hide();
            }
        });
    }

    element.appendChild(fragment);

    let addedClass = false;

    function show() {
        if (element.parentNode) return;
        document.body.appendChild(element);

        if (!document.documentElement.classList.contains('popup_visible')) {
            document.documentElement.classList.add('popup_visible');
            addedClass = true;
        }
    }

    function hide() {
        if (!element.parentNode) return;
        element.parentNode.removeChild(element);

        if (addedClass) {
            document.documentElement.classList.remove('popup_visible');
            addedClass = false;
        }

        if (options && options.events && options.events.hide) {
            options.events.hide();
        }
    }

    return { element, show, hide };
}

function createLoadingModal(title, options) {
    const body = `
        <div class="${namespace}-loading">
            <div class="${namespace}-progress"></div>
        </div>`;

    const modal = createModal(title, body);
    const progress = modal.element.querySelector(`.${namespace}-progress`);

    // extend modal with custom properties
    modal.steps = [];
    modal.refreshProgress = () => {
        switch (options && options.display) {
            case 'count':
                progress.textContent = `${modal.steps.filter(s => s.completed).length} / ${modal.steps.length}`;
                break;

            case 'percentage':
                const completionRatio = getCompletionRatio(modal.steps);
                progress.textContent = Math.floor(completionRatio * 100) + '%';
                break;
        }
    };

    modal.refreshProgress();
    modal.show();

    return modal;
}

// calculates the completion ratio from a tree of steps with weights and child steps
function getCompletionRatio(steps) {
    const totalWeight = steps.map(s => s.weight).reduce((a, b) => a + b, 0);
    if (totalWeight === 0) return 0;
    const completedWeight = steps.map(s => s.weight * (s.completed ? 1 : getCompletionRatio(s.steps))).reduce((a, b) => a + b, 0);
    return completedWeight / totalWeight;
}

// this is a recursive function that browses pages of artists, albums and tracks to gather scrobbles
async function fetchScrobbleData(url, loadingModal, parentStep) {
    if (!parentStep) parentStep = loadingModal;

    // remove "?date_preset=LAST_365_DAYS", etc.
    const indexOfQuery = url.indexOf('?');
    if (indexOfQuery !== -1) {
        url = url.substr(0, indexOfQuery);
    }

    if (getUrlType(url) === 'artist') {
        url += '/+tracks'; // skip artist overview and go straight to the tracks
    }

    const documentsToFetch = [fetchHTMLDocument(url)];
    const firstDocument = await documentsToFetch[0];
    const paginationList = firstDocument.querySelector('.pagination-list');

    if (paginationList) {
        const pageCount = parseInt(paginationList.children[paginationList.children.length - 2].textContent.trim(), 10);
        const pageNumbersToFetch = [...Array(pageCount - 1).keys()].map(i => i + 2);
        documentsToFetch.push(...pageNumbersToFetch.map(n => fetchHTMLDocument(`${url}?page=${n}`)));
    }

    let scrobbleData = await forEachParallel(loadingModal, parentStep, documentsToFetch, async (documentToFetch, step) => {
        const fetchedDocument = await documentToFetch;

        const table = fetchedDocument.querySelector('table.chartlist');
        if (!table) {
            // sometimes a missing chartlist is expected, other times it indicates a failure
            if (fetchedDocument.body.textContent.includes('There was a problem loading your')) {
                abort();
            }
            return [];
        }

        const rows = [...table.tBodies[0].rows];

        // to display accurate loading percentages, tracks with more scrobbles will have more weight
        const weightFunc = row => {
            const barValue = row.querySelector('.chartlist-count-bar-value');
            if (barValue === null) return 1;
            const scrobbleCount = parseInt(barValue.firstChild.textContent.trim().replace(/,/g, ''), 10);
            return Math.ceil(scrobbleCount / 50); // 50 = items per page on Last.fm
        };

        return await forEachParallel(loadingModal, step, rows, async (row, step) => {
            const link = row.querySelector('.chartlist-count-bar-link');
            if (link) {
                // recursive call to the current function
                return await fetchScrobbleData(link.href, loadingModal, step);
            }

            // no link indicates we're at the scrobble overview
            const form = row.querySelector('form[data-edit-scrobble]');
            return new FormData(form);
        }, weightFunc);
    });

    return scrobbleData;
}

function getUrlType(url) {
    // regular expressions are re-used from the outer scope
    if (albumRegExp.test(url)) {
        return 'album';
    } else if (artistRegExp.test(url)) {
        return 'artist';
    } else {
        return 'track';
    }
}

async function fetchHTMLDocument(url) {
    // retry 5 times with exponential timeout
    for (let i = 0; i < 5; i++) {
        if (i !== 0) {
            // wait 2 seconds, then 4 seconds, then 8, finally 16 (30 seconds total)
            await new Promise(resolve => setTimeout(resolve, Math.pow(2, i)));
        }

        const response = await fetch(url);

        if (response.ok) {
            const html = await response.text();
            const doc = domParser.parseFromString(html, 'text/html');

            if (doc.querySelector('table.chartlist') || i === 4) {
                return doc;
            }
        }
    }

    abort();
}

let aborting = false;

function abort() {
    if (aborting) return;
    aborting = true;
    alert('There was a problem loading your scrobbles, please try again later.');
    window.location.reload();
}

// series for loop that updates the loading percentage
async function forEach(loadingModal, parentStep, array, callback, weightFunc) {
    const tuples = array.map(item => ({ item, step: { weight: weightFunc ? weightFunc(item) : 1, steps: [] } }));
    parentStep.steps.push(...tuples.map(tuple => tuple.step));
    loadingModal.refreshProgress();

    const result = [];
    for (const tuple of tuples) {
        result.push(await callback(tuple.item, tuple.step));
        tuple.step.completed = true;
        loadingModal.refreshProgress();
    }

    return flatten(result);
}

// parallel for loop that updates the loading percentage
async function forEachParallel(loadingModal, parentStep, array, callback, weightFunc) {
    const tuples = array.map(item => ({ item, step: { weight: weightFunc ? weightFunc(item) : 1, steps: [] } }));
    parentStep.steps.push(...tuples.map(tuple => tuple.step));
    loadingModal.refreshProgress();

    const result = await Promise.all(tuples.map(async tuple => {
        const result = await callback(tuple.item, tuple.step);
        tuple.step.completed = true;
        loadingModal.refreshProgress();
        return result;
    }));

    return flatten(result);
}

// because Edge does not support Array.prototype.flat()
function flatten(array) {
    return array.reduce((flat, toFlatten) => {
        return flat.concat(Array.isArray(toFlatten) ? flatten(toFlatten) : toFlatten);
    }, []);
}

function applyFormData(form, formData) {
    for (const [name, value] of formData) {
        const input = form.elements[name];
        input.value = value;
    }
}

// augments the default Edit Scrobble form to include new features
async function augmentEditScrobbleForm(urlType, scrobbleData) {
    const wrapper = await observeChildList(document.body, '.popup_wrapper');

    // wait 1 frame
    await new Promise(resolve => setTimeout(() => { resolve(); }));

    const popup = wrapper.querySelector('.popup_content');
    const title = popup.querySelector('.modal-title');
    const form = popup.querySelector('form[action$="/library/edit?edited-variation=library-track-scrobble"]');

    title.textContent = `Edit ${urlType[0].toUpperCase() + urlType.slice(1)} Scrobbles`;

    // remove traces of the first scrobble that was used to initialize the form
    form.removeChild(form.querySelector('.form-group--timestamp'));
    form.removeChild(form.elements['track_name_original']);
    form.removeChild(form.elements['artist_name_original']);
    form.removeChild(form.elements['album_name_original']);
    form.removeChild(form.elements['album_artist_name_original']);

    const track_name_input = form.elements['track_name'];
    const artist_name_input = form.elements['artist_name'];
    const album_name_input = form.elements['album_name'];
    const album_artist_name_input = form.elements['album_artist_name'];

    augmentInput(urlType, scrobbleData, popup, track_name_input, 'tracks');
    augmentInput(urlType, scrobbleData, popup, artist_name_input, 'artists');
    augmentInput(urlType, scrobbleData, popup, album_name_input, 'albums');
    augmentInput(urlType, scrobbleData, popup, album_artist_name_input, 'album artists');

    // keep album artist name in sync
    let previousValue = artist_name_input.value;
    artist_name_input.addEventListener('input', () => {
        if (album_artist_name_input.value === previousValue) {
            album_artist_name_input.value = artist_name_input.value;
            album_artist_name_input.dispatchEvent(new Event('input'));
        }
        previousValue = artist_name_input.value;
    });

    if (album_artist_name_input.placeholder === 'Mixed') {
        const template = document.createElement('template');
        template.innerHTML = `
            <div class="form-group-success">
                <div class="alert alert-info">
                    <p>Matching album artists will be kept in sync.</p>
                </div>
            </div>`;
        artist_name_input.parentNode.insertBefore(template.content, artist_name_input.nextElementChild);
    }

    // replace the "Edit all" checkbox with one that cannot be disabled
    let editAllFormGroup = form.querySelector('.form-group--edit_all');
    if (editAllFormGroup) form.removeChild(editAllFormGroup);

    const summary = `${urlType !== 'artist' ? 'artist, ' : ''}${urlType !== 'track' ? 'track, ' : ''}${urlType !== 'album' ? 'album, ' : ''}and album artist`;
    const editAllFormGroupTemplate = document.createElement('template');
    editAllFormGroupTemplate.innerHTML = `
        <div class="form-group form-group--edit_all js-form-group">
            <label for="id_edit_all" class="control-label">Bulk edit</label>
            <div class="js-form-group-controls form-group-controls">
                <div class="checkbox">
                    <label for="id_edit_all">
                        <input id="id_edit_all" type="checkbox" checked disabled>
                        <input name="edit_all" type="hidden" value="true">
                        Edit all
                        <span class="abbr" title="You have scrobbled any combination of ${summary} ${scrobbleData.length} times">
                            ${scrobbleData.length} scrobbles
                        </span>
                        of this ${urlType}
                    </label>
                </div>
            </div>
        </div>`;

    editAllFormGroup = editAllFormGroupTemplate.content.cloneNode(true);
    form.insertBefore(editAllFormGroup, form.lastElementChild);

    // each exact track, artist, album and album artist combination is considered a distinct scrobble
    const distinctGroups = groupBy(scrobbleData, s => JSON.stringify({
        track_name: s.get('track_name'),
        artist_name: s.get('artist_name'),
        album_name: s.get('album_name') || '',
        album_artist_name: s.get('album_artist_name') || ''
    }));

    const distinctScrobbleData = [...distinctGroups].map(([name, values]) => values[0]);

    const submitButton = form.querySelector('button[type="submit"]');
    submitButton.addEventListener('click', async event => {
        event.preventDefault();

        for (const element of form.elements) {
            if (element.dataset.confirm && element.placeholder !== 'Mixed') {
                if (confirm(element.dataset.confirm)) {
                    delete element.dataset.confirm; // don't confirm again when resubmitting
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
            const track_name_original = originalData.get('track_name');
            const artist_name_original = originalData.get('artist_name');
            const album_name_original = originalData.get('album_name') || '';
            const album_artist_name_original = originalData.get('album_artist_name') || '';

            // if the album artist field is Mixed, use the old and new artist names to keep the album artist in sync
            const album_artist_name_sync = album_artist_name_input.placeholder === 'Mixed' && distinctScrobbleData.some(s => s.get('artist_name') === album_artist_name_original)
                ? artist_name
                : album_artist_name;

            // check if anything changed compared to the original track, artist, album and album artist combination
            if (track_name             !== null && track_name             !== track_name_original  ||
                artist_name            !== null && artist_name            !== artist_name_original ||
                album_name             !== null && album_name             !== album_name_original  ||
                album_artist_name_sync !== null && album_artist_name_sync !== album_artist_name_original) {

                const clonedFormData = cloneFormData(formData);

                // Last.fm expects a timestamp
                clonedFormData.set('timestamp', originalData.get('timestamp'));

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

                formDataToSubmit.push(clonedFormData);
            }
        }

        if (formDataToSubmit.length === 0) {
            alert('Your edit doesn\'t contain any real changes.'); // TODO: pretty validation messages
            return;
        }

        // hide the Edit Scrobble form
        const cancelButton = form.querySelector('button.js-close');
        cancelButton.click();

        const loadingModal = createLoadingModal('Saving Edits...', { display: 'count' });
        const parentStep = loadingModal;

        // run edits in series, inconsistencies will arise if you use a parallel loop
        await forEach(loadingModal, parentStep, formDataToSubmit, async formData => {
            // Edge does not support passing formData into URLSearchParams() constructor
            const body = new URLSearchParams();
            for (const [name, value] of formData) {
                body.append(name, value);
            }

            const response = await fetch(form.action, { method: 'POST', body: body });
            const html = await response.text();

            // use DOMParser to check the response for alerts
            const placeholder = domParser.parseFromString(html, 'text/html');

            for (const message of placeholder.querySelectorAll('.alert-danger')) {
                alert(message.textContent.trim()); // TODO: pretty validation messages
            }
        });

        // Last.fm sometimes displays old data when reloading too fast, so wait 1 second
        setTimeout(() => { window.location.reload(); }, 1000);
    });
}

// helper function that completes when a matching element gets appended
function observeChildList(target, selector) {
    return new Promise(resolve => {
        const observer = new MutationObserver(mutations => {
            for (const mutation of mutations) {
                for (const node of mutation.addedNodes) {
                    if (node.matches(selector)) {
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
function augmentInput(urlType, scrobbleData, popup, input, plural) {
    const groups = [...groupBy(scrobbleData, s => s.get(input.name))].sort((a, b) => b[1].length - a[1].length);

    if (groups.length >= 2) {
        // display the "Mixed" placeholder when there are two or more possible values
        input.value = '';
        input.placeholder = 'Mixed';

        const tab = '\xa0'.repeat(8); // 8 non-breaking spaces

        const abbr = document.createElement('span');
        abbr.className = `abbr ${namespace}-abbr`;
        abbr.textContent = `${groups.length} ${plural}`;
        abbr.title = groups.map(([key, values]) => `${values.length}x${tab}${key || ''}`).join('\n');
        input.parentNode.insertBefore(abbr, input.nextElementChild);

        input.dataset.confirm = `You are about to merge scrobbles for ${groups.length} ${plural}. This cannot be undone. Would you like to continue?`;
    }

    // datalist: a native HTML5 autocomplete feature
    const datalist = document.createElement('datalist');
    datalist.id = `${namespace}-${popup.id}-${input.name}-datalist`;

    for (const [key] of groups) {
        const option = document.createElement('option');
        option.value = key || '';
        datalist.appendChild(option);
    }

    input.autocomplete = 'off';
    input.setAttribute('list', datalist.id);
    input.parentNode.insertBefore(datalist, input.nextElementChild);

    // display green color when field was edited, red if it's not allowed to be empty
    const formGroup = input.closest('.form-group');
    const defaultValue = input.value;

    input.addEventListener('input', () => {
        input.placeholder = ''; // removes "Mixed" state
        refreshFormGroupState();
    });

    input.addEventListener('keydown', event => {
        if (event.keyCode === 8 || event.keyCode === 46) { // backspace or delete
            input.placeholder = ''; // removes "Mixed" state
            refreshFormGroupState();
        }
    });

    function refreshFormGroupState() {
        formGroup.classList.remove('has-error');
        formGroup.classList.remove('has-success');

        if (input.value !== defaultValue || groups.length >= 2 && input.placeholder === '') {
            if (input.value === '' && (input.name === 'track_name' || input.name === 'artist_name')) {
                formGroup.classList.add('has-error');
            } else {
                formGroup.classList.add('has-success');
            }
        }
    }
}

function groupBy(array, keyFunc) {
    const map = new Map();

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

function getMixedInputValue(input) {
    return input.placeholder !== 'Mixed' ? input.value : null;
}

function cloneFormData(formData) {
    const clonedFormData = new FormData();

    for (const [name, value] of formData) {
        clonedFormData.append(name, value);
    }

    return clonedFormData;
}
