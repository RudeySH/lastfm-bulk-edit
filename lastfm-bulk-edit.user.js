// ==UserScript==
// @name        Last.fm Bulk Edit
// @namespace   https://github.com/RudeySH/lastfm-bulk-edit
// @version     0.1.2
// @author      Rudey
// @description Bulk edit your scrobbles for any artist or album on Last.fm at once.
// @license     GPL-3.0-or-later
// @homepageURL https://github.com/RudeySH/lastfm-bulk-edit
// @icon        https://www.last.fm/static/images/lastfm_avatar_twitter.png
// @updateURL   https://raw.githubusercontent.com/RudeySH/lastfm-bulk-edit/master/lastfm-bulk-edit.user.js
// @downloadURL https://raw.githubusercontent.com/RudeySH/lastfm-bulk-edit/master/lastfm-bulk-edit.user.js
// @supportURL  https://github.com/RudeySH/lastfm-bulk-edit/issues
// @match       https://www.last.fm/*
// ==/UserScript==

'use strict';

const namespace = 'lastfm-bulk-edit';

// use the top-right link to determine the current user
const authLink = document.querySelector('a.auth-link');

if (!authLink) {
    return; // not logged in
}

const libraryURL = `${authLink.href}/library`;
const albumRegExp = new RegExp(`^${libraryURL}/music/[^/]+/[^+][^/]*$`);
const artistRegExp = new RegExp(`^${libraryURL}/music/[^/]+$`);
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
            <button type="submit" class="mimic-link dropdown-menu-clickable-item more-item--edit">
                Edit scrobbles
            </button>
        </form>
    </li>`;

const loadingModalTemplate = document.createElement('template');
loadingModalTemplate.innerHTML = `
    <div class="popup_background"
        style="opacity: 0.8; visibility: visible; background-color: rgb(0, 0, 0); position: fixed; top: 0px; right: 0px; bottom: 0px; left: 0px;">
    </div>
    <div class="popup_wrapper popup_wrapper_visible"
        style="opacity: 1; visibility: visible; position: fixed; overflow: auto; width: 100%; height: 100%; top: 0px; left: 0px; text-align: center;">
        <div class="modal-dialog popup_content" role="dialog" aria-labelledby="modal-label" data-popup-initialized="true"
            aria-hidden="false"
            style="opacity: 1; visibility: visible; pointer-events: auto; display: inline-block; outline: none; text-align: left; position: relative; vertical-align: middle;"
            tabindex="-1">
            <div class="modal-content">
                <h2 class="modal-title">
                    Loading...
                </h2>
                <div class="modal-body">
                    <div class="${namespace}-loading">
                        <div class="${namespace}-progress">0%</div>
                    </div>
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

        .${namespace}-loading {
            background: url("/static/images/loading_dark_light_64.gif") 50% 50% no-repeat;
            height: 64px;
            display: flex;
            justify-content: center;
            align-items: center;
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

    // re-use template from outer scope
    const editScrobbleMenuItem = editScrobbleMenuItemTemplate.content.cloneNode(true);

    const form = editScrobbleMenuItem.querySelector('form');
    const button = form.querySelector('button');

    let loadingModal;
    let scrobbleData;

    button.addEventListener('click', onFirstClick);

    async function onFirstClick(event) {
        event.preventDefault();

        loadingModal = createLoadingModal();
        scrobbleData = await fetchScrobbleData(link.href, loadingModal);

        // Last.fm expects form fields populated with a single scrobble
        applyFormData(form, scrobbleData[0]);

        // done loading, click to open the Edit Scrobble dialog
        this.removeEventListener('click', onFirstClick);
        this.addEventListener('click', onClick);
        this.click();
    }

    async function onClick() {
        await augmentEditScrobbleForm(link.href, scrobbleData);
        loadingModal.close();
    }

    // append new menu item to the DOM
    const menu = row.querySelector('.chartlist-more-menu');
    menu.insertBefore(editScrobbleMenuItem, menu.firstElementChild);
}

function createLoadingModal() {
    // re-use template from outer scope
    const loadingModal = loadingModalTemplate.content.cloneNode(true);

    const progress = loadingModal.querySelector(`.${namespace}-progress`);
    const steps = [];

    // append new loading modal to the DOM
    const container = document.createElement('div');
    container.appendChild(loadingModal);
    document.body.appendChild(container);

    // expose API for completing steps and closing the modal
    return {
        steps,
        completeStep: step => {
            step.completed = true;
            const completionRatio = getCompletionRatio(steps);
            progress.textContent = Math.floor(completionRatio * 100) + '%';
        },
        close: () => {
            if (container.parentNode) {
                container.parentNode.removeChild(container);
            }
        }
    }
}

// calculates the completion ratio from a tree of steps with weights and child steps
function getCompletionRatio(steps) {
    const totalWeight = steps.map(s => s.weight).reduce((a, b) => a + b, 0);
    if (totalWeight === 0) return 0;
    const completedWeight = steps.map(s => s.weight * (s.completed ? 1 : getCompletionRatio(s.steps))).reduce((a, b) => a + b, 0);
    return completedWeight / totalWeight;
}

// this is a recursive function that browses pages of artists, albums and tracks to gather scrobbles
async function fetchScrobbleData(url, loadingModal, parentStep, parentDocument, parentURL) {
    if (!parentStep) parentStep = loadingModal;
    if (!parentDocument) parentDocument = document;
    if (!parentURL) parentURL = parentDocument.URL;

    // remove "?date_preset=LAST_365_DAYS", etc.
    const indexOfQuery = url.indexOf('?');
    if (indexOfQuery !== -1) {
        url = url.substr(0, indexOfQuery);
    }

    const type = getUrlType(url);

    if (type === 'artist') {
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
                return await fetchScrobbleData(link.href, loadingModal, step, fetchedDocument, url);
            }

            // no link indicates we're at the scrobble overview
            const form = row.querySelector('form[data-edit-scrobble]');
            return new FormData(form);
        }, weightFunc);
    });

    if (getUrlType(parentURL) === 'album') {
        // fetching scrobbles of an album yields scrobbles from other albums as well, so apply a filter
        const album_name = parentDocument.querySelector('.library-header-title').textContent.trim();
        scrobbleData = scrobbleData.filter(s => s.get('album_name') === album_name);
    }

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

    const result = [];
    for (const tuple of tuples) {
        result.push(await callback(tuple.item, tuple.step));
        loadingModal.completeStep(tuple.step);
    }

    return flatten(result);
}

// parallel for loop that updates the loading percentage
async function forEachParallel(loadingModal, parentStep, array, callback, weightFunc) {
    const tuples = array.map(item => ({ item, step: { weight: weightFunc ? weightFunc(item) : 1, steps: [] } }));
    parentStep.steps.push(...tuples.map(tuple => tuple.step));

    const result = await Promise.all(tuples.map(async tuple => {
        const result = await callback(tuple.item, tuple.step);
        loadingModal.completeStep(tuple.step);
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
async function augmentEditScrobbleForm(url, scrobbleData) {
    const wrapper = await observeChildList(document.body, '.popup_wrapper');
    const popup = wrapper.querySelector('.popup_content');
    const title = popup.querySelector('.modal-title');
    const form = popup.querySelector('form[action$="/library/edit?edited-variation=library-track-scrobble"]');
    const urlType = getUrlType(url);

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
    if (!album_artist_name_input.disabled) {
        let previousValue = artist_name_input.value;
        artist_name_input.addEventListener('input', () => {
            if (album_artist_name_input.value === previousValue) {
                album_artist_name_input.value = artist_name_input.value;
                album_artist_name_input.dispatchEvent(new Event('input'));
            }
            previousValue = artist_name_input.value;
        });
    } else {
        const template = document.createElement('template');
        template.innerHTML = `
            <div class="form-group-success">
                <div class="alert alert-info">
                    <p>Matching album artists will be kept in sync.</p>
                </div>
            </div>`
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
        </div>`

    editAllFormGroup = editAllFormGroupTemplate.content.cloneNode(true);
    form.insertBefore(editAllFormGroup, form.lastElementChild);

    // each exact track, artist, album and album artist combination is considered a distinct scrobble
    const scrobbleMap = groupBy(scrobbleData, s => JSON.stringify({
        track_name: s.get('track_name'),
        artist_name: s.get('artist_name'),
        album_name: s.get('album_name') || '',
        album_artist_name: s.get('album_artist_name') || ''
    }));

    const distinctScrobbleData = [...scrobbleMap].map(([name, values]) => values[0]);

    const submitButton = form.querySelector('button[type="submit"]');
    submitButton.addEventListener('click', async event => {
        event.preventDefault();

        const formData = new FormData(form);
        const formDataToSubmit = [];

        const track_name = getMixedInputValue(form.elements['track_name']);
        const artist_name = getMixedInputValue(form.elements['artist_name']);
        const album_name = getMixedInputValue(form.elements['album_name']);
        const album_artist_name = getMixedInputValue(form.elements['album_artist_name']);

        for (const originalData of distinctScrobbleData) {
            const track_name_original = originalData.get('track_name');
            const artist_name_original = originalData.get('artist_name');
            const album_name_original = originalData.get('album_name') || '';
            const album_artist_name_original = originalData.get('album_artist_name') || '';

            // if the album artist field is disabled, use the old and new artist names to keep the album artist in sync
            const album_artist_name_sync = album_artist_name_input.disabled && distinctScrobbleData.some(s => s.get('artist_name') === album_artist_name_original)
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

        const loadingModal = createLoadingModal();
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

        // Last.fm sometimes displays old data when reloading too fast, so wait 3 seconds
        setTimeout(() => { window.location.reload(); }, 3000);
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

        switch (input.name) {
            case 'track_name':
                // disable track field when editing an artist's or album's scrobbles
                if (urlType !== 'track') {
                    input.disabled = true;
                    return;
                }
                break;

            case 'album_name':
            case 'album_artist_name':
                // disable album and album artist fields when editing an artist's scrobbles and there are two or more scrobbled albums
                if (urlType === 'artist' && new Set(scrobbleData.map(s => s.get('album_name')).filter(n => n !== null)).size >= 2) {    
                    input.disabled = true;
                    return;
                }
                break;
        }
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
    return !input.disabled && input.placeholder !== 'Mixed' ? input.value : null;
}

function cloneFormData(formData) {
    const clonedFormData = new FormData();

    for (const [name, value] of formData) {
        clonedFormData.append(name, value);
    }

    return clonedFormData;
}
