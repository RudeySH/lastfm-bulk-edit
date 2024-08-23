// ==UserScript==
// @name Last.fm Bulk Edit
// @description Bulk edit your scrobbles for any artist or album on Last.fm at once.
// @version 1.5.6
// @author Rudey
// @homepage https://github.com/RudeySH/lastfm-bulk-edit
// @supportURL https://github.com/RudeySH/lastfm-bulk-edit/issues
// @match https://www.last.fm/*
// @downloadURL https://raw.githubusercontent.com/RudeySH/lastfm-bulk-edit/main/dist/lastfm-bulk-edit.user.js
// @icon https://raw.githubusercontent.com/RudeySH/lastfm-bulk-edit/main/img/icon.png
// @license AGPL-3.0-or-later
// @namespace https://github.com/RudeySH/lastfm-bulk-edit
// @require https://cdnjs.cloudflare.com/ajax/libs/he/1.2.0/he.min.js
// @updateURL https://raw.githubusercontent.com/RudeySH/lastfm-bulk-edit/main/dist/lastfm-bulk-edit.meta.js
// ==/UserScript==

/******/ (() => { // webpackBootstrap
/******/ 	var __webpack_modules__ = ({

/***/ 406:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";

Object.defineProperty(exports, "__esModule", ({ value: true }));
var tslib_1 = __webpack_require__(653);
var Semaphore_1 = __webpack_require__(919);
var Mutex = /** @class */ (function () {
    function Mutex(cancelError) {
        this._semaphore = new Semaphore_1.default(1, cancelError);
    }
    Mutex.prototype.acquire = function () {
        return tslib_1.__awaiter(this, arguments, void 0, function (priority) {
            var _a, releaser;
            if (priority === void 0) { priority = 0; }
            return tslib_1.__generator(this, function (_b) {
                switch (_b.label) {
                    case 0: return [4 /*yield*/, this._semaphore.acquire(1, priority)];
                    case 1:
                        _a = _b.sent(), releaser = _a[1];
                        return [2 /*return*/, releaser];
                }
            });
        });
    };
    Mutex.prototype.runExclusive = function (callback, priority) {
        if (priority === void 0) { priority = 0; }
        return this._semaphore.runExclusive(function () { return callback(); }, 1, priority);
    };
    Mutex.prototype.isLocked = function () {
        return this._semaphore.isLocked();
    };
    Mutex.prototype.waitForUnlock = function (priority) {
        if (priority === void 0) { priority = 0; }
        return this._semaphore.waitForUnlock(1, priority);
    };
    Mutex.prototype.release = function () {
        if (this._semaphore.isLocked())
            this._semaphore.release();
    };
    Mutex.prototype.cancel = function () {
        return this._semaphore.cancel();
    };
    return Mutex;
}());
exports["default"] = Mutex;


/***/ }),

/***/ 919:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";

Object.defineProperty(exports, "__esModule", ({ value: true }));
var tslib_1 = __webpack_require__(653);
var errors_1 = __webpack_require__(586);
var Semaphore = /** @class */ (function () {
    function Semaphore(_value, _cancelError) {
        if (_cancelError === void 0) { _cancelError = errors_1.E_CANCELED; }
        this._value = _value;
        this._cancelError = _cancelError;
        this._queue = [];
        this._weightedWaiters = [];
    }
    Semaphore.prototype.acquire = function (weight, priority) {
        var _this = this;
        if (weight === void 0) { weight = 1; }
        if (priority === void 0) { priority = 0; }
        if (weight <= 0)
            throw new Error("invalid weight ".concat(weight, ": must be positive"));
        return new Promise(function (resolve, reject) {
            var task = { resolve: resolve, reject: reject, weight: weight, priority: priority };
            var i = findIndexFromEnd(_this._queue, function (other) { return priority <= other.priority; });
            if (i === -1 && weight <= _this._value) {
                // Needs immediate dispatch, skip the queue
                _this._dispatchItem(task);
            }
            else {
                _this._queue.splice(i + 1, 0, task);
            }
        });
    };
    Semaphore.prototype.runExclusive = function (callback_1) {
        return tslib_1.__awaiter(this, arguments, void 0, function (callback, weight, priority) {
            var _a, value, release;
            if (weight === void 0) { weight = 1; }
            if (priority === void 0) { priority = 0; }
            return tslib_1.__generator(this, function (_b) {
                switch (_b.label) {
                    case 0: return [4 /*yield*/, this.acquire(weight, priority)];
                    case 1:
                        _a = _b.sent(), value = _a[0], release = _a[1];
                        _b.label = 2;
                    case 2:
                        _b.trys.push([2, , 4, 5]);
                        return [4 /*yield*/, callback(value)];
                    case 3: return [2 /*return*/, _b.sent()];
                    case 4:
                        release();
                        return [7 /*endfinally*/];
                    case 5: return [2 /*return*/];
                }
            });
        });
    };
    Semaphore.prototype.waitForUnlock = function (weight, priority) {
        var _this = this;
        if (weight === void 0) { weight = 1; }
        if (priority === void 0) { priority = 0; }
        if (weight <= 0)
            throw new Error("invalid weight ".concat(weight, ": must be positive"));
        if (this._couldLockImmediately(weight, priority)) {
            return Promise.resolve();
        }
        else {
            return new Promise(function (resolve) {
                if (!_this._weightedWaiters[weight - 1])
                    _this._weightedWaiters[weight - 1] = [];
                insertSorted(_this._weightedWaiters[weight - 1], { resolve: resolve, priority: priority });
            });
        }
    };
    Semaphore.prototype.isLocked = function () {
        return this._value <= 0;
    };
    Semaphore.prototype.getValue = function () {
        return this._value;
    };
    Semaphore.prototype.setValue = function (value) {
        this._value = value;
        this._dispatchQueue();
    };
    Semaphore.prototype.release = function (weight) {
        if (weight === void 0) { weight = 1; }
        if (weight <= 0)
            throw new Error("invalid weight ".concat(weight, ": must be positive"));
        this._value += weight;
        this._dispatchQueue();
    };
    Semaphore.prototype.cancel = function () {
        var _this = this;
        this._queue.forEach(function (entry) { return entry.reject(_this._cancelError); });
        this._queue = [];
    };
    Semaphore.prototype._dispatchQueue = function () {
        this._drainUnlockWaiters();
        while (this._queue.length > 0 && this._queue[0].weight <= this._value) {
            this._dispatchItem(this._queue.shift());
            this._drainUnlockWaiters();
        }
    };
    Semaphore.prototype._dispatchItem = function (item) {
        var previousValue = this._value;
        this._value -= item.weight;
        item.resolve([previousValue, this._newReleaser(item.weight)]);
    };
    Semaphore.prototype._newReleaser = function (weight) {
        var _this = this;
        var called = false;
        return function () {
            if (called)
                return;
            called = true;
            _this.release(weight);
        };
    };
    Semaphore.prototype._drainUnlockWaiters = function () {
        if (this._queue.length === 0) {
            for (var weight = this._value; weight > 0; weight--) {
                var waiters = this._weightedWaiters[weight - 1];
                if (!waiters)
                    continue;
                waiters.forEach(function (waiter) { return waiter.resolve(); });
                this._weightedWaiters[weight - 1] = [];
            }
        }
        else {
            var queuedPriority_1 = this._queue[0].priority;
            for (var weight = this._value; weight > 0; weight--) {
                var waiters = this._weightedWaiters[weight - 1];
                if (!waiters)
                    continue;
                var i = waiters.findIndex(function (waiter) { return waiter.priority <= queuedPriority_1; });
                (i === -1 ? waiters : waiters.splice(0, i))
                    .forEach((function (waiter) { return waiter.resolve(); }));
            }
        }
    };
    Semaphore.prototype._couldLockImmediately = function (weight, priority) {
        return (this._queue.length === 0 || this._queue[0].priority < priority) &&
            weight <= this._value;
    };
    return Semaphore;
}());
function insertSorted(a, v) {
    var i = findIndexFromEnd(a, function (other) { return v.priority <= other.priority; });
    a.splice(i + 1, 0, v);
}
function findIndexFromEnd(a, predicate) {
    for (var i = a.length - 1; i >= 0; i--) {
        if (predicate(a[i])) {
            return i;
        }
    }
    return -1;
}
exports["default"] = Semaphore;


/***/ }),

/***/ 586:
/***/ ((__unused_webpack_module, exports) => {

"use strict";

Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.E_CANCELED = exports.E_ALREADY_LOCKED = exports.E_TIMEOUT = void 0;
exports.E_TIMEOUT = new Error('timeout while waiting for mutex to become available');
exports.E_ALREADY_LOCKED = new Error('mutex already locked');
exports.E_CANCELED = new Error('request for lock canceled');


/***/ }),

/***/ 693:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";

Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.tryAcquire = exports.withTimeout = exports.Semaphore = exports.Mutex = void 0;
var tslib_1 = __webpack_require__(653);
var Mutex_1 = __webpack_require__(406);
Object.defineProperty(exports, "Mutex", ({ enumerable: true, get: function () { return Mutex_1.default; } }));
var Semaphore_1 = __webpack_require__(919);
Object.defineProperty(exports, "Semaphore", ({ enumerable: true, get: function () { return Semaphore_1.default; } }));
var withTimeout_1 = __webpack_require__(646);
Object.defineProperty(exports, "withTimeout", ({ enumerable: true, get: function () { return withTimeout_1.withTimeout; } }));
var tryAcquire_1 = __webpack_require__(746);
Object.defineProperty(exports, "tryAcquire", ({ enumerable: true, get: function () { return tryAcquire_1.tryAcquire; } }));
tslib_1.__exportStar(__webpack_require__(586), exports);


/***/ }),

/***/ 746:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";

Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.tryAcquire = void 0;
var errors_1 = __webpack_require__(586);
var withTimeout_1 = __webpack_require__(646);
// eslint-disable-next-lisne @typescript-eslint/explicit-module-boundary-types
function tryAcquire(sync, alreadyAcquiredError) {
    if (alreadyAcquiredError === void 0) { alreadyAcquiredError = errors_1.E_ALREADY_LOCKED; }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (0, withTimeout_1.withTimeout)(sync, 0, alreadyAcquiredError);
}
exports.tryAcquire = tryAcquire;


/***/ }),

/***/ 646:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";

Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.withTimeout = void 0;
var tslib_1 = __webpack_require__(653);
/* eslint-disable @typescript-eslint/no-explicit-any */
var errors_1 = __webpack_require__(586);
function withTimeout(sync, timeout, timeoutError) {
    var _this = this;
    if (timeoutError === void 0) { timeoutError = errors_1.E_TIMEOUT; }
    return {
        acquire: function (weightOrPriority, priority) {
            var weight;
            if (isSemaphore(sync)) {
                weight = weightOrPriority;
            }
            else {
                weight = undefined;
                priority = weightOrPriority;
            }
            if (weight !== undefined && weight <= 0) {
                throw new Error("invalid weight ".concat(weight, ": must be positive"));
            }
            return new Promise(function (resolve, reject) { return tslib_1.__awaiter(_this, void 0, void 0, function () {
                var isTimeout, handle, ticket, release, e_1;
                return tslib_1.__generator(this, function (_a) {
                    switch (_a.label) {
                        case 0:
                            isTimeout = false;
                            handle = setTimeout(function () {
                                isTimeout = true;
                                reject(timeoutError);
                            }, timeout);
                            _a.label = 1;
                        case 1:
                            _a.trys.push([1, 3, , 4]);
                            return [4 /*yield*/, (isSemaphore(sync)
                                    ? sync.acquire(weight, priority)
                                    : sync.acquire(priority))];
                        case 2:
                            ticket = _a.sent();
                            if (isTimeout) {
                                release = Array.isArray(ticket) ? ticket[1] : ticket;
                                release();
                            }
                            else {
                                clearTimeout(handle);
                                resolve(ticket);
                            }
                            return [3 /*break*/, 4];
                        case 3:
                            e_1 = _a.sent();
                            if (!isTimeout) {
                                clearTimeout(handle);
                                reject(e_1);
                            }
                            return [3 /*break*/, 4];
                        case 4: return [2 /*return*/];
                    }
                });
            }); });
        },
        runExclusive: function (callback, weight, priority) {
            return tslib_1.__awaiter(this, void 0, void 0, function () {
                var release, ticket;
                return tslib_1.__generator(this, function (_a) {
                    switch (_a.label) {
                        case 0:
                            release = function () { return undefined; };
                            _a.label = 1;
                        case 1:
                            _a.trys.push([1, , 7, 8]);
                            return [4 /*yield*/, this.acquire(weight, priority)];
                        case 2:
                            ticket = _a.sent();
                            if (!Array.isArray(ticket)) return [3 /*break*/, 4];
                            release = ticket[1];
                            return [4 /*yield*/, callback(ticket[0])];
                        case 3: return [2 /*return*/, _a.sent()];
                        case 4:
                            release = ticket;
                            return [4 /*yield*/, callback()];
                        case 5: return [2 /*return*/, _a.sent()];
                        case 6: return [3 /*break*/, 8];
                        case 7:
                            release();
                            return [7 /*endfinally*/];
                        case 8: return [2 /*return*/];
                    }
                });
            });
        },
        release: function (weight) {
            sync.release(weight);
        },
        cancel: function () {
            return sync.cancel();
        },
        waitForUnlock: function (weightOrPriority, priority) {
            var weight;
            if (isSemaphore(sync)) {
                weight = weightOrPriority;
            }
            else {
                weight = undefined;
                priority = weightOrPriority;
            }
            if (weight !== undefined && weight <= 0) {
                throw new Error("invalid weight ".concat(weight, ": must be positive"));
            }
            return new Promise(function (resolve, reject) {
                var handle = setTimeout(function () { return reject(timeoutError); }, timeout);
                (isSemaphore(sync)
                    ? sync.waitForUnlock(weight, priority)
                    : sync.waitForUnlock(priority)).then(function () {
                    clearTimeout(handle);
                    resolve();
                });
            });
        },
        isLocked: function () { return sync.isLocked(); },
        getValue: function () { return sync.getValue(); },
        setValue: function (value) { return sync.setValue(value); },
    };
}
exports.withTimeout = withTimeout;
function isSemaphore(sync) {
    return sync.getValue !== undefined;
}


/***/ }),

/***/ 692:
/***/ ((module) => {

async function* asyncPool(concurrency, iterable, iteratorFn) {
  const executing = new Set();
  async function consume() {
    const [promise, value] = await Promise.race(executing);
    executing.delete(promise);
    return value;
  }
  for (const item of iterable) {
    // Wrap iteratorFn() in an async fn to ensure we get a promise.
    // Then expose such promise, so it's possible to later reference and
    // remove it from the executing pool.
    const promise = (async () => await iteratorFn(item, iterable))().then(
      value => [promise, value]
    );
    executing.add(promise);
    if (executing.size >= concurrency) {
      yield await consume();
    }
  }
  while (executing.size) {
    yield await consume();
  }
}

module.exports = asyncPool;


/***/ }),

/***/ 921:
/***/ ((__unused_webpack_module, exports) => {

"use strict";

Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.namespace = void 0;
exports.namespace = 'lastfm-bulk-edit';


/***/ }),

/***/ 308:
/***/ ((__unused_webpack_module, exports) => {

"use strict";

Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.displayAlbumName = displayAlbumName;
async function displayAlbumName(element) {
    var _a, _b;
    const rows = element instanceof HTMLTableRowElement ? [element] : [...element.querySelectorAll('tr')];
    if (rows.length === 0) {
        return;
    }
    const baseHref = (_a = document.querySelector('.secondary-nav-item--overview a')) === null || _a === void 0 ? void 0 : _a.getAttribute('href');
    for (const row of rows) {
        if (row.getAttribute('data-edit-scrobble-id') === null || row.querySelector('.chartlist-album') !== null) {
            continue;
        }
        const coverArtAnchor = row.querySelector('.cover-art');
        const albumHref = coverArtAnchor.getAttribute('href');
        const form = row.querySelector('form[data-edit-scrobble]:not([data-edit-scrobbles])');
        let albumName;
        if (form !== null) {
            const formData = new FormData(form);
            albumName = (_b = formData.get('album_name')) === null || _b === void 0 ? void 0 : _b.toString();
        }
        else {
            albumName = coverArtAnchor.querySelector('img').alt;
        }
        // Create and insert th element.
        const table = row.closest('table');
        if (!table.classList.contains('lastfm-bulk-edit-chartlist-scrobbles')) {
            table.classList.add('lastfm-bulk-edit-chartlist-scrobbles');
            const albumHeaderCell = document.createElement('th');
            albumHeaderCell.textContent = 'Album';
            const headerRow = table.tHead.rows[0];
            headerRow.insertBefore(albumHeaderCell, headerRow.children[4]);
        }
        // Create and insert td element.
        const albumCell = document.createElement('td');
        albumCell.className = 'chartlist-album';
        if (albumHref && albumName) {
            const albumAnchor = document.createElement('a');
            albumAnchor.href = albumHref;
            albumAnchor.title = albumName;
            albumAnchor.textContent = albumName;
            albumCell.appendChild(albumAnchor);
        }
        else {
            const noAlbumText = document.createElement('em');
            noAlbumText.className = 'lastfm-bulk-edit-text-danger';
            noAlbumText.textContent = 'No Album';
            albumCell.appendChild(noAlbumText);
        }
        const nameCell = row.querySelector('.chartlist-name');
        row.insertBefore(albumCell, nameCell.nextElementSibling);
        // Add menu items.
        if (albumHref && albumName) {
            const menu = row.querySelector('.chartlist-more-menu');
            const albumMenuItem1 = document.createElement('li');
            const menuItemAnchor1 = document.createElement('a');
            menuItemAnchor1.href = albumHref;
            menuItemAnchor1.className = 'dropdown-menu-clickable-item more-item--album';
            menuItemAnchor1.textContent = 'Go to album';
            albumMenuItem1.appendChild(menuItemAnchor1);
            const albumMenuItem2 = document.createElement('li');
            const menuItemAnchor2 = document.createElement('a');
            menuItemAnchor2.href = baseHref + '/library' + albumHref;
            menuItemAnchor2.className = 'dropdown-menu-clickable-item more-item--album';
            menuItemAnchor2.textContent = 'Go to album in library';
            albumMenuItem2.appendChild(menuItemAnchor2);
            const artistMenuItem = menu.querySelector('.more-item--artist').parentNode;
            menu.insertBefore(albumMenuItem1, artistMenuItem);
            menu.insertBefore(albumMenuItem2, artistMenuItem);
        }
    }
}


/***/ }),

/***/ 252:
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {

"use strict";

var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.enhanceAutomaticEditsPage = enhanceAutomaticEditsPage;
const tiny_async_pool_1 = __importDefault(__webpack_require__(692));
const constants_1 = __webpack_require__(921);
const utils_1 = __webpack_require__(135);
const toolbarTemplate = document.createElement('template');
toolbarTemplate.innerHTML = `
    <div>
        <button type="button" class="btn-primary" disabled>
            View All At Once
        </button>
        Go to artist: <select></select>
    </div>`;
const domParser = new DOMParser();
const artistMap = new Map();
let artistSelect = undefined;
let loadPagesPromise = undefined;
let loadPagesProgressElement = undefined;
async function enhanceAutomaticEditsPage(element) {
    if (!document.URL.includes('/settings/subscription/automatic-edits')) {
        return;
    }
    const section = element.querySelector('#subscription-corrections');
    const table = section === null || section === void 0 ? void 0 : section.querySelector('table');
    if (!section || !table) {
        return;
    }
    enhanceTable(table);
    const paginationList = section.querySelector('.pagination-list');
    if (!paginationList) {
        return;
    }
    const paginationListItems = [...paginationList.querySelectorAll('.pagination-page')];
    const currentPageNumber = parseInt(paginationListItems.find(x => x.getAttribute('aria-current') === 'page').textContent, 10);
    const pageCount = parseInt(paginationListItems[paginationListItems.length - 1].textContent, 10);
    if (pageCount === 1) {
        return;
    }
    const toolbar = toolbarTemplate.content.firstElementChild.cloneNode(true);
    section.insertBefore(toolbar, section.firstElementChild);
    artistSelect = toolbar.querySelector('select');
    const selectedArtistKey = getSelectedArtistKey();
    for (const artist of [...artistMap.values()].sort((a, b) => a.sortName.localeCompare(b.sortName))) {
        const option = document.createElement('option');
        option.value = artist.key;
        option.selected = artist.key === selectedArtistKey;
        option.text = artist.name;
        const keepNothingSelected = !option.selected && artistSelect.selectedIndex === -1;
        artistSelect.appendChild(option);
        if (keepNothingSelected) {
            artistSelect.selectedIndex = -1;
        }
    }
    artistSelect.addEventListener('change', function () {
        const selectedArtist = artistMap.get(this.value);
        const anchor = document.createElement('a');
        anchor.href = `?page=${selectedArtist.pageNumber}&artist=${(0, utils_1.encodeURIComponent2)(selectedArtist.name)}`;
        document.body.appendChild(anchor);
        anchor.click();
        document.body.removeChild(anchor);
    });
    loadPagesProgressElement = document.createElement('span');
    toolbar.insertAdjacentText('beforeend', ' ');
    toolbar.insertAdjacentElement('beforeend', loadPagesProgressElement);
    loadPagesPromise !== null && loadPagesPromise !== void 0 ? loadPagesPromise : (loadPagesPromise = loadPages(table, currentPageNumber, pageCount));
    const pages = await loadPagesPromise;
    toolbar.removeChild(loadPagesProgressElement);
    const viewAllButton = toolbar.querySelector('button');
    viewAllButton.disabled = false;
    viewAllButton.addEventListener('click', async () => {
        if (pages.length >= 100 && !window.confirm(`You are about to view ${pages.length} pages at once. This might take a long time to load. Are you sure?`)) {
            return;
        }
        viewAllButton.disabled = true;
        table.style.tableLayout = 'fixed';
        const tableBody = table.tBodies[0];
        const firstRow = tableBody.rows[0];
        for (const page of pages) {
            if (page.pageNumber === currentPageNumber) {
                continue;
            }
            for (const row of page.rows) {
                enhanceRow(row);
                if (page.pageNumber < currentPageNumber) {
                    firstRow.insertAdjacentElement('beforebegin', row);
                }
                else {
                    tableBody.appendChild(row);
                }
            }
            if (page.pageNumber % 10 === 0) {
                await (0, utils_1.delay)(1);
            }
        }
    });
}
function enhanceTable(table) {
    document.body.style.backgroundColor = '#fff';
    table.style.tableLayout = 'auto';
    const headerRow = table.tHead.rows[0];
    const body = table.tBodies[0];
    let sortedCellIndex = 1;
    const keys = [
        'track_name_original',
        'artist_name_original',
        'album_name_original',
        'album_artist_name_original',
    ];
    for (let i = 0; i < 4; i++) {
        const key = keys[i];
        const cell = headerRow.cells[i];
        cell.innerHTML = `<a href="javascript:void(0)" role="button">${cell.textContent}</a>`;
        cell.addEventListener('click', () => {
            const dir = sortedCellIndex === i ? -1 : 1;
            sortedCellIndex = sortedCellIndex === i ? -1 : i;
            const rows = [...body.rows].map(row => {
                let value = row.dataset[key];
                if (!value) {
                    value = row.querySelector(`input[name="${key}"]`).value;
                    row.dataset[key] = value;
                }
                return { row, value };
            });
            rows.sort((a, b) => a.value.localeCompare(b.value) * dir);
            for (const row of rows) {
                body.appendChild(row.row);
            }
        });
    }
    for (const row of body.rows) {
        enhanceRow(row);
    }
}
function enhanceRow(row) {
    if (row.dataset['enhanced'] === 'true') {
        return;
    }
    row.dataset['enhanced'] = 'true';
    const formData = getFormData(row);
    const trackName = formData.get('track_name').toString();
    const artistName = formData.get('artist_name').toString();
    const albumName = formData.get('album_name').toString();
    const albumArtistName = formData.get('album_artist_name').toString();
    const originalTrackName = formData.get('track_name_original').toString();
    const originalArtistName = formData.get('artist_name_original').toString();
    const originalAlbumName = formData.get('album_name_original').toString();
    const originalAlbumArtistName = formData.get('album_artist_name_original').toString();
    function emphasize(cell, content) {
        var _a;
        cell.style.lineHeight = '1';
        cell.innerHTML = `
            <div>
                <span class="sr-only">
                    ${cell.textContent}
                </span>
                <b>
                    ${content}
                </b>
            </div>
            <small>
                Originally "${(_a = cell.textContent) === null || _a === void 0 ? void 0 : _a.trim()}"
            </small>`;
    }
    if (trackName !== originalTrackName) {
        emphasize(row.cells[0], trackName);
    }
    else {
        // remove bold
        row.cells[0].innerHTML = row.cells[0].textContent;
    }
    if (artistName !== originalArtistName) {
        emphasize(row.cells[1], artistName);
    }
    if (albumName !== originalAlbumName) {
        emphasize(row.cells[2], albumName);
    }
    if (albumArtistName !== originalAlbumArtistName) {
        emphasize(row.cells[3], albumArtistName);
    }
    if (originalArtistName.toLowerCase() === getSelectedArtistKey()) {
        row.classList.add(`${constants_1.namespace}-highlight`);
    }
}
function getFormData(row) {
    return new FormData(row.querySelector('form'));
}
function getSelectedArtistKey() {
    var _a;
    return (_a = new URLSearchParams(location.search).get('artist')) === null || _a === void 0 ? void 0 : _a.toLowerCase();
}
async function loadPages(table, currentPageNumber, pageCount) {
    const currentPage = { pageNumber: currentPageNumber, rows: [...table.tBodies[0].rows] };
    const pages = [currentPage];
    const pageNumbersToLoad = [...Array(pageCount).keys()].map(i => i + 1).filter(i => i !== currentPageNumber);
    addArtistsToSelect(currentPage);
    updateProgressText(1, pageCount);
    for await (const page of (0, tiny_async_pool_1.default)(6, pageNumbersToLoad, loadPage)) {
        pages.push(page);
        addArtistsToSelect(page);
        updateProgressText(pages.length, pageCount);
    }
    pages.sort((a, b) => a.pageNumber < b.pageNumber ? -1 : 1);
    return pages;
}
async function loadPage(pageNumber) {
    const response = await (0, utils_1.fetchAndRetry)(`?page=${pageNumber}&_pjax=%23content`, {
        credentials: 'include',
        headers: {
            'X-Pjax': 'true',
            'X-Pjax-Container': '#content',
        },
    });
    const text = await response.text();
    const doc = domParser.parseFromString(text, 'text/html');
    const table = doc.querySelector('.chart-table');
    return {
        pageNumber,
        rows: [...table.tBodies[0].rows],
    };
}
function addArtistsToSelect(page) {
    const selectedArtistKey = getSelectedArtistKey();
    for (const row of page.rows) {
        const formData = getFormData(row);
        const name = formData.get('artist_name_original').toString();
        const sortName = name.replace(/\s+/g, '');
        const key = name.toLowerCase();
        const artist = artistMap.get(key);
        if (!artist) {
            artistMap.set(key, { key, name, sortName, pageNumber: page.pageNumber });
            const option = document.createElement('option');
            option.value = key;
            option.selected = key === selectedArtistKey;
            option.text = name;
            const keepNothingSelected = !option.selected && artistSelect.selectedIndex === -1;
            const insertAtIndex = [...artistMap.values()].sort((a, b) => a.sortName.localeCompare(b.sortName)).findIndex(x => x.key === key);
            artistSelect.insertBefore(option, artistSelect.children[insertAtIndex]);
            if (keepNothingSelected) {
                artistSelect.selectedIndex = -1;
            }
        }
        else if (artist.pageNumber > page.pageNumber) {
            artist.pageNumber = page.pageNumber;
        }
    }
}
function updateProgressText(current, total) {
    loadPagesProgressElement.textContent = `${current} / ${total} (${(current * 100 / total).toFixed(0)}%)`;
}


/***/ }),

/***/ 156:
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {

"use strict";

var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
const he_1 = __importDefault(__webpack_require__(488));
const display_album_name_1 = __webpack_require__(308);
const enhance_automatic_edits_page_1 = __webpack_require__(252);
const utils_1 = __webpack_require__(135);
const constants_1 = __webpack_require__(921);
// use the top-right link to determine the current user
const authLink = document.querySelector('a.auth-link');
// https://regex101.com/r/UCmC8f/1
const albumRegExp = new RegExp(`^${authLink === null || authLink === void 0 ? void 0 : authLink.href}/library/music(/\\+[^/]*)*(/[^+][^/]*){2}$`);
const artistRegExp = new RegExp(`^${authLink === null || authLink === void 0 ? void 0 : authLink.href}/library/music(/\\+[^/]*)*(/[^+][^/]*){1}(/\\+[^/]*)?$`);
const domParser = new DOMParser();
const editScrobbleFormTemplate = document.createElement('template');
editScrobbleFormTemplate.innerHTML = `
    <form method="POST" action="${authLink === null || authLink === void 0 ? void 0 : authLink.href}/library/edit?edited-variation=library-track-scrobble" data-edit-scrobble data-edit-scrobbles>
        <input type="hidden" name="csrfmiddlewaretoken" value="">
        <input type="hidden" name="artist_name" value="">
        <input type="hidden" name="track_name" value="">
        <input type="hidden" name="album_name" value="">
        <input type="hidden" name="album_artist_name" value="">
        <input type="hidden" name="timestamp" value="">
        <button type="submit" class="mimic-link dropdown-menu-clickable-item more-item--edit-old" data-analytics-action="EditScrobbleOpen">
            Edit scrobbles
        </button>
    </form>`;
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
if (authLink) {
    initialize();
}
function initialize() {
    appendStyle();
    appendEditScrobbleHeaderLinkAndMenuItems(document.body);
    (0, display_album_name_1.displayAlbumName)(document.body);
    (0, enhance_automatic_edits_page_1.enhanceAutomaticEditsPage)(document.body);
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
                    (0, display_album_name_1.displayAlbumName)(node);
                    (0, enhance_automatic_edits_page_1.enhanceAutomaticEditsPage)(node);
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
        .${constants_1.namespace}-abbr {
            cursor: help;
        }

        @media (pointer: coarse), (hover: none) {
            .${constants_1.namespace}-abbr[title]:focus {
                position: relative;
                display: inline-flex;
                justify-content: center;
            }

            .${constants_1.namespace}-abbr[title]:focus::after {
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

        .${constants_1.namespace}-ellipsis {
            display: block;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }

        .${constants_1.namespace}-form-group-controls {
            margin-left: 0 !important;
        }

        .${constants_1.namespace}-list {
            column-count: 2;
        }

        .${constants_1.namespace}-loading {
            background: url("/static/images/loading_dark_light_64.gif") 50% 50% no-repeat;
            height: 64px;
            display: flex;
            justify-content: center;
            align-items: center;
        }

        .${constants_1.namespace}-text-danger {
            color: #d92323;
        }

        .${constants_1.namespace}-text-info {
            color: #2b65d9;
        }

        @media (min-width: 768px) {
            .${constants_1.namespace}-chartlist-scrobbles .chartlist-name {
                margin-top: -2px;
                margin-bottom: 13px;
            }

            .${constants_1.namespace}-chartlist-scrobbles .chartlist-album {
                margin-top: 13px;
                margin-bottom: -2px;
                position: absolute;
                left: 133.5px;
                width: 182.41px;
            }

            .${constants_1.namespace}-chartlist-scrobbles .chartlist-album::before {
                width: 0 !important;
            }
        }

        @media (min-width: 1260px) {
            .${constants_1.namespace}-chartlist-scrobbles .chartlist-album {
                width: 272.41px;
            }
        }

        .${constants_1.namespace}-highlight {
            background-color: #fff9e5;
        }

        .${constants_1.namespace}-highlight:hover {
            background-color: #fcf2cf !important;
        }`;
    document.head.appendChild(style);
}
function appendEditScrobbleHeaderLinkAndMenuItems(element) {
    if (!document.URL.startsWith(authLink.href)) {
        return; // current page is not the user's profile
    }
    appendEditScrobbleHeaderLink(element);
    appendEditScrobbleMenuItems(element);
}
function appendEditScrobbleHeaderLink(element) {
    var _a;
    const header = element.querySelector('.library-header');
    if (header === null) {
        return; // current page does not contain the header we're looking for
    }
    const form = getEditScrobbleForm(document.URL);
    const button = form.querySelector('button');
    // replace submit button with a link
    form.style.display = 'inline';
    button.style.display = 'none';
    const link = form.appendChild(document.createElement('a'));
    link.href = 'javascript:void(0)';
    link.textContent = 'Edit scrobbles';
    link.addEventListener('click', () => button.click());
    if (((_a = header.lastElementChild) === null || _a === void 0 ? void 0 : _a.tagName) === 'A') {
        header.insertAdjacentText('beforeend', ' · ');
    }
    header.insertAdjacentElement('beforeend', form);
}
function appendEditScrobbleMenuItems(element) {
    var _a;
    const rows = element instanceof HTMLTableRowElement ? [element] : [...element.querySelectorAll('tr')];
    for (const row of rows) {
        const link = row.querySelector('a.chartlist-count-bar-link,a.more-item--track[href^="/user/"]');
        if (!link) {
            continue; // this is not an artist, album or track
        }
        const form = getEditScrobbleForm(link.href, row);
        const editScrobbleMenuItem = document.createElement('li');
        editScrobbleMenuItem.appendChild(form);
        editScrobbleMenuItem.setAttribute('data-processed', 'true');
        // append new menu item to the DOM
        const menu = row.querySelector('.chartlist-more-menu');
        if ((_a = menu.firstElementChild) === null || _a === void 0 ? void 0 : _a.hasAttribute('data-processed')) {
            menu.removeChild(menu.firstElementChild);
        }
        menu.insertBefore(editScrobbleMenuItem, menu.firstElementChild);
    }
}
function getEditScrobbleForm(url, row) {
    const urlType = getUrlType(url);
    const form = editScrobbleFormTemplate.content.firstElementChild.cloneNode(true);
    const button = form.querySelector('button');
    let allScrobbleData;
    let scrobbleData;
    let submit = false;
    button.addEventListener('click', async (event) => {
        if (!document.querySelector('.header--user .label')) {
            alert('Last.fm pro subscription is required to edit scrobbles.');
        }
        if (!submit) {
            event.stopImmediatePropagation();
            return;
        }
        const loadingModal = createLoadingModal('Waiting for Last.fm...');
        await augmentEditScrobbleForm(urlType, scrobbleData);
        loadingModal.hide();
        submit = false;
    });
    form.addEventListener('submit', async (event) => {
        if (submit) {
            return;
        }
        event.preventDefault();
        event.stopImmediatePropagation();
        if (!allScrobbleData) {
            const loadingModal = createLoadingModal('Loading Scrobbles...', { display: 'percentage' });
            allScrobbleData = await fetchScrobbleData(url, loadingModal, loadingModal);
            loadingModal.hide();
        }
        scrobbleData = allScrobbleData;
        // use JSON strings as album keys to uniquely identify combinations of album + album artists
        // group scrobbles by album key
        let scrobbleDataGroups = [...groupBy(allScrobbleData, (s) => {
                var _a, _b;
                return JSON.stringify({
                    album_name: (_a = s.get('album_name')) !== null && _a !== void 0 ? _a : '',
                    album_artist_name: (_b = s.get('album_artist_name')) !== null && _b !== void 0 ? _b : '',
                });
            })];
        // sort groups by the amount of scrobbles
        scrobbleDataGroups = scrobbleDataGroups.sort(([_key1, values1], [_key2, values2]) => values2.length - values1.length);
        // when editing multiple albums album, show an album selection dialog first
        if (scrobbleDataGroups.length >= 2) {
            const noAlbumKey = JSON.stringify({ album_name: '', album_artist_name: '' });
            let currentAlbumKey = undefined;
            // put the "No Album" album first
            scrobbleDataGroups = scrobbleDataGroups.sort(([key1], [key2]) => {
                if (key1 === noAlbumKey)
                    return -1;
                if (key2 === noAlbumKey)
                    return +1;
                return 0;
            });
            // when the edit dialog was initiated from an album or album track, put that album first in the list
            if (urlType === 'album' || getUrlType(document.URL) === 'album') {
                // grab the current album name and artist name from the DOM
                const album_name = (urlType === 'album' && row
                    ? row.querySelector('.chartlist-name')
                    : document.querySelector('.library-header-title')).textContent.trim();
                const album_artist_name = (urlType === 'album' && row
                    ? row.querySelector('.chartlist-artist') || document.querySelector('.library-header-title, .library-header-crumb')
                    : document.querySelector('.text-colour-link')).textContent.trim();
                currentAlbumKey = JSON.stringify({ album_name, album_artist_name });
                // put the current album first
                scrobbleDataGroups = scrobbleDataGroups.sort(([key1], [key2]) => {
                    if (key1 === currentAlbumKey)
                        return -1;
                    if (key2 === currentAlbumKey)
                        return +1;
                    if (key1 === noAlbumKey)
                        return -1;
                    if (key2 === noAlbumKey)
                        return +1;
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
                    <div class="form-group-controls ${constants_1.namespace}-form-group-controls">
                        <button type="button" class="btn-secondary" id="${constants_1.namespace}-select-all">Select all</button>
                        <button type="button" class="btn-secondary" id="${constants_1.namespace}-deselect-all">Deselect all</button>
                    </div>
                </div>
                <ul class="${constants_1.namespace}-list">
                    ${scrobbleDataGroups.map(([key, scrobbleData]) => {
                var _a;
                const firstScrobbleData = scrobbleData[0];
                const album_name = firstScrobbleData.get('album_name');
                const artist_name = ((_a = firstScrobbleData.get('album_artist_name')) !== null && _a !== void 0 ? _a : firstScrobbleData.get('artist_name'));
                return `
                    <li>
                        <div class="checkbox">
                            <label>
                                <input type="checkbox" name="key" value="${he_1.default.escape(key)}" ${currentAlbumKey === undefined || currentAlbumKey === key ? 'checked' : ''} />
                                <strong title="${he_1.default.escape(album_name !== null && album_name !== void 0 ? album_name : '')}" class="${constants_1.namespace}-ellipsis ${currentAlbumKey === key ? `${constants_1.namespace}-text-info` : !album_name ? `${constants_1.namespace}-text-danger` : ''}">
                                    ${album_name ? he_1.default.escape(album_name) : '<em>No Album</em>'}
                                </strong>
                                <div title="${he_1.default.escape(artist_name)}" class="${constants_1.namespace}-ellipsis">
                                    ${he_1.default.escape(artist_name)}
                                </div>
                                <small>
                                    ${scrobbleData.length} scrobble${scrobbleData.length !== 1 ? 's' : ''}
                                </small>
                            </label>
                        </div>
                    </li>`;
            }).join('')}
                </ul>`;
            const checkboxes = body.querySelectorAll('input[type="checkbox"]');
            body.querySelector(`#${constants_1.namespace}-select-all`).addEventListener('click', () => {
                for (const checkbox of checkboxes) {
                    checkbox.checked = true;
                }
            });
            body.querySelector(`#${constants_1.namespace}-deselect-all`).addEventListener('click', () => {
                for (const checkbox of checkboxes) {
                    checkbox.checked = false;
                }
            });
            let formData;
            try {
                formData = await prompt('Select Albums To Edit', body);
            }
            catch (error) {
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
function prompt(title, body) {
    return new Promise((resolve, reject) => {
        const form = document.createElement('form');
        form.className = 'form-horizontal';
        if (body instanceof Element) {
            form.insertAdjacentElement('beforeend', body);
        }
        else {
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
class Modal {
    constructor(title, body, options) {
        this.addedClass = false;
        this.element = document.createElement('div');
        this.options = options;
        const fragment = modalTemplate.content.cloneNode(true);
        const modalTitle = fragment.querySelector('.modal-title');
        if (title instanceof Element) {
            modalTitle.insertAdjacentElement('beforeend', title);
        }
        else {
            modalTitle.insertAdjacentHTML('beforeend', title);
        }
        const modalBody = fragment.querySelector('.modal-body');
        if (body instanceof Element) {
            modalBody.insertAdjacentElement('beforeend', body);
        }
        else {
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
            const modalContent = fragment.querySelector('.modal-content');
            modalContent.insertBefore(modalActions, modalContent.firstElementChild);
            // close modal when user clicks outside modal
            const popupWrapper = fragment.querySelector('.popup_wrapper');
            popupWrapper.addEventListener('click', (event) => {
                if (event.target instanceof Node && !modalContent.contains(event.target)) {
                    this.hide();
                }
            });
        }
        this.element.appendChild(fragment);
    }
    show() {
        if (this.element.parentNode)
            return;
        document.body.appendChild(this.element);
        if (!document.documentElement.classList.contains('popup_visible')) {
            document.documentElement.classList.add('popup_visible');
            this.addedClass = true;
        }
    }
    hide() {
        if (!this.element.parentNode)
            return;
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
class LoadingModal extends Modal {
    constructor(title, options) {
        const body = `
            <div class="${constants_1.namespace}-loading">
                <div class="${constants_1.namespace}-progress"></div>
            </div>`;
        super(title, body, options);
        this.completed = false;
        this.steps = [];
        this.weight = 0;
        this.progress = this.element.querySelector(`.${constants_1.namespace}-progress`);
    }
    refreshProgress() {
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
function createLoadingModal(title, options) {
    const modal = new LoadingModal(title, options);
    modal.show();
    return modal;
}
// calculates the completion ratio from a tree of steps with weights and child steps
function getCompletionRatio(steps) {
    const totalWeight = steps.map((s) => s.weight).reduce((a, b) => a + b, 0);
    if (totalWeight === 0)
        return 0;
    const completedWeight = steps.map((s) => s.weight * (s.completed ? 1 : getCompletionRatio(s.steps))).reduce((a, b) => a + b, 0);
    return completedWeight / totalWeight;
}
// this is a recursive function that browses pages of artists, albums and tracks to gather scrobbles
async function fetchScrobbleData(url, loadingModal, parentStep) {
    // remove "?date_preset=LAST_365_DAYS", etc.
    const indexOfQuery = url.indexOf('?');
    if (indexOfQuery !== -1) {
        url = url.substring(0, indexOfQuery);
    }
    if (getUrlType(url) === 'artist' && !url.endsWith('/+tracks')) {
        url += '/+tracks'; // skip artist overview and go straight to the tracks
    }
    const documentsToFetch = [fetchHTMLDocument(url)];
    const firstDocument = await documentsToFetch[0];
    const paginationList = firstDocument.querySelector('.pagination-list');
    if (paginationList) {
        const pageCount = parseInt(paginationList.children[paginationList.children.length - 2].textContent.trim(), 10);
        const pageNumbersToFetch = [...Array(pageCount - 1).keys()].map((i) => i + 2);
        documentsToFetch.push(...pageNumbersToFetch.map((n) => fetchHTMLDocument(`${url}?page=${n}`)));
    }
    const scrobbleData = await forEachParallel(loadingModal, parentStep, documentsToFetch, async (documentToFetch, step) => {
        const fetchedDocument = await documentToFetch;
        const table = fetchedDocument.querySelector('table.chartlist:not(.chartlist__placeholder)');
        if (!table) {
            // sometimes a missing chartlist is expected, other times it indicates a failure
            if (fetchedDocument.body.textContent.includes('There was a problem loading your')) {
                abort('There was a problem loading your scrobbles, please try again later.');
            }
            return [];
        }
        const rows = [...table.tBodies[0].rows];
        // to display accurate loading percentages, tracks with more scrobbles will have more weight
        const weightFunc = (row) => {
            const barValue = row.querySelector('.chartlist-count-bar-value');
            if (barValue === null)
                return 1;
            const scrobbleCount = parseInt(barValue.firstChild.textContent.trim().replace(/,/g, ''), 10);
            return Math.ceil(scrobbleCount / 50); // 50 = items per page on Last.fm
        };
        const scrobbleData = await forEachParallel(loadingModal, step, rows, async (row, step) => {
            const link = row.querySelector('.chartlist-count-bar-link');
            if (link) {
                // recursive call to the current function
                return await fetchScrobbleData(link.href, loadingModal, step);
            }
            // no link indicates we're at the scrobble overview
            const form = row.querySelector('form[data-edit-scrobble]');
            return [new FormData(form)];
        }, weightFunc);
        return scrobbleData.flat();
    });
    return scrobbleData.flat();
}
function getUrlType(url) {
    if (albumRegExp.test(url)) {
        return 'album';
    }
    else if (artistRegExp.test(url)) {
        if (url.endsWith('/+albums')) {
            return 'album artist';
        }
        else {
            return 'artist';
        }
    }
    else {
        return 'track';
    }
}
async function fetchHTMLDocument(url) {
    try {
        return await (0, utils_1.fetchAndRetry)(url, undefined, async (response, i) => {
            const html = await response.text();
            const doc = domParser.parseFromString(html, 'text/html');
            if (doc.querySelector('table.chartlist:not(.chartlist__placeholder)') || i >= 5) {
                return doc;
            }
        });
    }
    catch (error) {
        const message = `There was a problem loading your scrobbles, please try again later. (${error})`;
        abort(message);
        throw message;
    }
}
let aborting = false;
function abort(message) {
    if (aborting)
        return;
    aborting = true;
    alert(message);
    window.location.reload();
}
// series for loop that updates the loading percentage
async function forEach(loadingModal, parentStep, array, callback, weightFunc) {
    const tuples = array.map((item) => ({ item, step: { completed: false, steps: [], weight: weightFunc ? weightFunc(item) : 1 } }));
    parentStep.steps.push(...tuples.map((tuple) => tuple.step));
    loadingModal.refreshProgress();
    const result = [];
    for (const tuple of tuples) {
        result.push(await callback(tuple.item, tuple.step));
        tuple.step.completed = true;
        loadingModal.refreshProgress();
    }
    return result.flat();
}
// parallel for loop that updates the loading percentage
function forEachParallel(loadingModal, parentStep, array, callback, weightFunc) {
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
function applyFormData(form, formData) {
    for (const [name, value] of formData) {
        const input = form.querySelector(`input[name="${name}"]`);
        input.value = value;
    }
}
// augments the default Edit Scrobble form to include new features
async function augmentEditScrobbleForm(urlType, scrobbleData) {
    const wrapper = await observeChildList(document.body, '.popup_wrapper');
    // wait 1 frame
    await new Promise((resolve) => setTimeout(() => { resolve(); }));
    const popup = wrapper.querySelector('.popup_content');
    const title = popup.querySelector('.modal-title');
    const form = popup.querySelector('form[action$="/library/edit?edited-variation=library-track-scrobble"]');
    const elements = form.elements;
    title.textContent = `Edit ${urlType} Scrobbles`;
    title.style.textTransform = 'capitalize';
    // remove traces of the first scrobble that was used to initialize the form
    form.removeChild(form.querySelector('.form-group--timestamp'));
    form.removeChild(elements.track_name_original);
    form.removeChild(elements.artist_name_original);
    form.removeChild(elements.album_name_original);
    form.removeChild(elements.album_artist_name_original);
    const track_name_input = elements.track_name;
    const artist_name_input = elements.artist_name;
    const album_name_input = elements.album_name;
    const album_artist_name_input = elements.album_artist_name;
    const tracks = augmentInput(scrobbleData, popup, elements, track_name_input, 'tracks');
    augmentInput(scrobbleData, popup, elements, artist_name_input, 'artists');
    augmentInput(scrobbleData, popup, elements, album_name_input, 'albums');
    augmentInput(scrobbleData, popup, elements, album_artist_name_input, 'album artists');
    // add information alert about album artists being kept in sync
    if (album_artist_name_input.placeholder === 'Mixed' && scrobbleData.some((s) => s.get('album_artist_name') === artist_name_input.value)) {
        const messageTemplate = document.createElement('template');
        messageTemplate.innerHTML = `
            <div class="form-group-success">
                <div class="alert alert-info">
                    <p>Matching album artists will be kept in sync.</p>
                </div>
            </div>`;
        const message = messageTemplate.content.firstElementChild.cloneNode(true);
        album_artist_name_input.parentNode.insertBefore(message, album_artist_name_input.nextElementSibling);
        const removeMessage = () => {
            message.parentNode.removeChild(message);
            album_artist_name_input.removeEventListener('input', removeMessage);
            album_artist_name_input.removeEventListener('keydown', removeMessage);
        };
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
    // update the "Automatic edit" checkbox label
    const automaticEditFormGroup = form.querySelector('.form-group--create_automatic_edit_rule');
    if (automaticEditFormGroup && urlType !== 'track') {
        const label = automaticEditFormGroup.querySelector('.checkbox label').lastChild;
        label.textContent = label.textContent.replace('of this track', `for ${tracks} track${tracks !== 1 ? 's' : ''} of this ${urlType}`);
    }
    // replace the "Bulk edit" checkbox with one that cannot be disabled
    let bulkEditFormGroup = form.querySelector('.form-group--edit_all');
    if (bulkEditFormGroup)
        form.removeChild(bulkEditFormGroup);
    const types = ['artist', 'track', 'album', 'album artist'];
    types.splice(types.indexOf(urlType), 1);
    const summary = `${types[0]}, ${types[1]} and ${types[2]}`;
    const bulkEditFormGroupTemplate = document.createElement('template');
    bulkEditFormGroupTemplate.innerHTML = `
        <div class="form-group form-group--edit_all js-form-group">
            <label for="id_edit_all" class="control-label">Bulk edit</label>
            <div class="js-form-group-controls form-group-controls">
                <div class="checkbox">
                    <label for="id_edit_all">
                        <input id="id_edit_all" type="checkbox" checked disabled>
                        <input name="edit_all" type="hidden" value="true">
                        Edit all
                        <span class="abbr ${constants_1.namespace}-abbr" tabindex="-1" title="You have scrobbled any combination of ${summary} ${scrobbleData.length} times">
                            ${scrobbleData.length} scrobbles
                        </span>
                        of this ${urlType}
                    </label>
                </div>
            </div>
        </div>`;
    bulkEditFormGroup = bulkEditFormGroupTemplate.content.firstElementChild.cloneNode(true);
    form.insertBefore(bulkEditFormGroup, automaticEditFormGroup !== null && automaticEditFormGroup !== void 0 ? automaticEditFormGroup : form.lastElementChild);
    // each exact track, artist, album and album artist combination is considered a distinct scrobble
    const distinctGroups = groupBy(scrobbleData, (s) => {
        var _a, _b;
        return JSON.stringify({
            track_name: s.get('track_name'),
            artist_name: s.get('artist_name'),
            album_name: (_a = s.get('album_name')) !== null && _a !== void 0 ? _a : '',
            album_artist_name: (_b = s.get('album_artist_name')) !== null && _b !== void 0 ? _b : '',
        });
    });
    const distinctScrobbleData = [...distinctGroups].map(([_name, values]) => values[0]);
    // disable the submit button when the form has validation errors
    const submitButton = form.querySelector('button[type="submit"]');
    form.addEventListener('input', () => {
        submitButton.disabled = form.querySelector('.has-error') !== null;
    });
    // set up the form submit event listener
    submitButton.addEventListener('click', async (event) => {
        var _a, _b;
        event.preventDefault();
        for (const element of form.elements) {
            if (element instanceof HTMLInputElement && element.dataset['confirm'] && element.placeholder !== 'Mixed') {
                if (confirm(element.dataset['confirm'])) {
                    delete element.dataset['confirm']; // don't confirm again when resubmitting
                }
                else {
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
            const album_name_original = (_a = originalData.get('album_name')) !== null && _a !== void 0 ? _a : '';
            const album_artist_name_original = (_b = originalData.get('album_artist_name')) !== null && _b !== void 0 ? _b : '';
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
                }
                else {
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
        await forEach(loadingModal, parentStep, formDataToSubmit, async (formData) => {
            // Edge does not support passing formData into URLSearchParams() constructor
            const body = new URLSearchParams();
            for (const [name, value] of formData) {
                body.append(name, value);
            }
            const response = await (0, utils_1.fetchAndRetry)(form.action, { method: 'POST', body: body });
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
    return new Promise((resolve) => {
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
function augmentInput(scrobbleData, popup, inputs, input, plural) {
    var _a;
    const groups = [...groupBy(scrobbleData, (s) => s.get(input.name))].sort((a, b) => b[1].length - a[1].length);
    if (groups.length >= 2) {
        // display the "Mixed" placeholder when there are two or more possible values
        input.value = '';
        input.placeholder = 'Mixed';
        const tab = '\xa0'.repeat(8); // 8 non-breaking spaces
        const abbr = document.createElement('span');
        abbr.className = `abbr ${constants_1.namespace}-abbr`;
        abbr.tabIndex = -1;
        abbr.textContent = `${groups.length} ${plural}`;
        abbr.title = groups.map(([key, values]) => `${values.length}x${tab}${key !== null && key !== void 0 ? key : ''}`).join('\n');
        input.parentNode.insertBefore(abbr, input.nextElementSibling);
        input.dataset['confirm'] = `You are about to merge scrobbles for ${groups.length} ${plural}. This cannot be undone. Would you like to continue?`;
        // datalist: a native HTML5 autocomplete feature
        const datalist = document.createElement('datalist');
        datalist.id = `${constants_1.namespace}-${popup.id}-${input.name}-datalist`;
        for (const [value] of groups) {
            const option = document.createElement('option');
            option.value = (_a = value) !== null && _a !== void 0 ? _a : '';
            datalist.appendChild(option);
        }
        input.autocomplete = 'off';
        input.setAttribute('list', datalist.id);
        input.parentNode.insertBefore(datalist, input.nextElementSibling);
    }
    // display green color when field was edited, red if it's not allowed to be empty
    const formGroup = input.closest('.form-group');
    const defaultValue = input.value;
    input.addEventListener('input', () => {
        input.placeholder = ''; // removes "Mixed" state
        refreshFormGroupState();
    });
    input.addEventListener('keydown', (event) => {
        if (event.keyCode === 8 || event.keyCode === 46) { // backspace or delete
            input.placeholder = ''; // removes "Mixed" state
            refreshFormGroupState();
        }
    });
    if (input.name === 'album_name') {
        inputs.album_artist_name.addEventListener('input', () => {
            refreshFormGroupState();
        });
    }
    else if (input.name === 'album_artist_name') {
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
                || input.name === 'album_artist_name' && (inputs.album_name.value !== '' || inputs.album_name.placeholder === 'Mixed'))) {
            formGroup.classList.add('has-error');
        }
        else if (input.value !== defaultValue || groups.length >= 2 && input.placeholder === '') {
            formGroup.classList.add('has-success');
        }
    }
    return groups.length;
}
function groupBy(array, keyFunc) {
    const map = new Map();
    for (const item of array) {
        const key = keyFunc(item);
        const value = map.get(key);
        if (!value) {
            map.set(key, [item]);
        }
        else {
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


/***/ }),

/***/ 135:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";

Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.delay = delay;
exports.encodeURIComponent2 = encodeURIComponent2;
exports.fetchAndRetry = fetchAndRetry;
const async_mutex_1 = __webpack_require__(693);
function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
function encodeURIComponent2(uriComponent) {
    return encodeURIComponent(uriComponent).replace(/%20/g, '+');
}
const semaphore = new async_mutex_1.Semaphore(6);
let delayPromise = undefined;
let delayTooManyRequestsMs = 10000;
async function fetchAndRetry(url, init, callback) {
    callback !== null && callback !== void 0 ? callback : (callback = async (response) => response);
    return await semaphore.runExclusive(async () => {
        var _a;
        let delayResolver;
        let delayRejecter;
        try {
            // eslint-disable-next-line no-constant-condition
            for (let i = 0; true; i++) {
                const response = await fetch(url, init);
                if (response.ok) {
                    const result = await callback(response, i);
                    if (result !== undefined) {
                        if (delayResolver !== undefined) {
                            delayPromise = undefined;
                            delayResolver();
                        }
                        return result;
                    }
                }
                if (delayPromise === undefined) {
                    delayPromise = new Promise((resolve, reject) => {
                        delayResolver = resolve;
                        delayRejecter = reject;
                    });
                    if (response.status === 429) { // Too Many Requests
                        await delay(delayTooManyRequestsMs);
                    }
                    else {
                        await delay(1000);
                    }
                }
                else if (delayResolver !== undefined) {
                    if (response.status === 429) { // Too Many Requests
                        // retry after 10 seconds, then another 10 seconds, etc. up to 60 seconds, finally retry after every second.
                        const additionalDelayMs = delayTooManyRequestsMs < 60000 ? 10000 : 1000;
                        delayTooManyRequestsMs += additionalDelayMs;
                        await delay(additionalDelayMs);
                    }
                    else if (i < 5) {
                        // retry after 2 seconds, then 4 seconds, then 8, finally 16 (30 seconds total)
                        await delay(Math.pow(2, i) * 1000);
                    }
                    else {
                        throw (_a = response.statusText) !== null && _a !== void 0 ? _a : response.status.toString();
                    }
                }
                else {
                    await delayPromise;
                }
            }
        }
        catch (reason) {
            if (delayRejecter !== undefined) {
                delayRejecter(reason);
            }
            throw reason;
        }
    });
}


/***/ }),

/***/ 488:
/***/ ((module) => {

"use strict";
module.exports = he;

/***/ }),

/***/ 653:
/***/ ((__unused_webpack___webpack_module__, __webpack_exports__, __webpack_require__) => {

"use strict";
__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   __addDisposableResource: () => (/* binding */ __addDisposableResource),
/* harmony export */   __assign: () => (/* binding */ __assign),
/* harmony export */   __asyncDelegator: () => (/* binding */ __asyncDelegator),
/* harmony export */   __asyncGenerator: () => (/* binding */ __asyncGenerator),
/* harmony export */   __asyncValues: () => (/* binding */ __asyncValues),
/* harmony export */   __await: () => (/* binding */ __await),
/* harmony export */   __awaiter: () => (/* binding */ __awaiter),
/* harmony export */   __classPrivateFieldGet: () => (/* binding */ __classPrivateFieldGet),
/* harmony export */   __classPrivateFieldIn: () => (/* binding */ __classPrivateFieldIn),
/* harmony export */   __classPrivateFieldSet: () => (/* binding */ __classPrivateFieldSet),
/* harmony export */   __createBinding: () => (/* binding */ __createBinding),
/* harmony export */   __decorate: () => (/* binding */ __decorate),
/* harmony export */   __disposeResources: () => (/* binding */ __disposeResources),
/* harmony export */   __esDecorate: () => (/* binding */ __esDecorate),
/* harmony export */   __exportStar: () => (/* binding */ __exportStar),
/* harmony export */   __extends: () => (/* binding */ __extends),
/* harmony export */   __generator: () => (/* binding */ __generator),
/* harmony export */   __importDefault: () => (/* binding */ __importDefault),
/* harmony export */   __importStar: () => (/* binding */ __importStar),
/* harmony export */   __makeTemplateObject: () => (/* binding */ __makeTemplateObject),
/* harmony export */   __metadata: () => (/* binding */ __metadata),
/* harmony export */   __param: () => (/* binding */ __param),
/* harmony export */   __propKey: () => (/* binding */ __propKey),
/* harmony export */   __read: () => (/* binding */ __read),
/* harmony export */   __rest: () => (/* binding */ __rest),
/* harmony export */   __runInitializers: () => (/* binding */ __runInitializers),
/* harmony export */   __setFunctionName: () => (/* binding */ __setFunctionName),
/* harmony export */   __spread: () => (/* binding */ __spread),
/* harmony export */   __spreadArray: () => (/* binding */ __spreadArray),
/* harmony export */   __spreadArrays: () => (/* binding */ __spreadArrays),
/* harmony export */   __values: () => (/* binding */ __values),
/* harmony export */   "default": () => (__WEBPACK_DEFAULT_EXPORT__)
/* harmony export */ });
/******************************************************************************
Copyright (c) Microsoft Corporation.

Permission to use, copy, modify, and/or distribute this software for any
purpose with or without fee is hereby granted.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH
REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY
AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT,
INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM
LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR
OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR
PERFORMANCE OF THIS SOFTWARE.
***************************************************************************** */
/* global Reflect, Promise, SuppressedError, Symbol */

var extendStatics = function(d, b) {
  extendStatics = Object.setPrototypeOf ||
      ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
      function (d, b) { for (var p in b) if (Object.prototype.hasOwnProperty.call(b, p)) d[p] = b[p]; };
  return extendStatics(d, b);
};

function __extends(d, b) {
  if (typeof b !== "function" && b !== null)
      throw new TypeError("Class extends value " + String(b) + " is not a constructor or null");
  extendStatics(d, b);
  function __() { this.constructor = d; }
  d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
}

var __assign = function() {
  __assign = Object.assign || function __assign(t) {
      for (var s, i = 1, n = arguments.length; i < n; i++) {
          s = arguments[i];
          for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p)) t[p] = s[p];
      }
      return t;
  }
  return __assign.apply(this, arguments);
}

function __rest(s, e) {
  var t = {};
  for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p) && e.indexOf(p) < 0)
      t[p] = s[p];
  if (s != null && typeof Object.getOwnPropertySymbols === "function")
      for (var i = 0, p = Object.getOwnPropertySymbols(s); i < p.length; i++) {
          if (e.indexOf(p[i]) < 0 && Object.prototype.propertyIsEnumerable.call(s, p[i]))
              t[p[i]] = s[p[i]];
      }
  return t;
}

function __decorate(decorators, target, key, desc) {
  var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
  if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
  else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
  return c > 3 && r && Object.defineProperty(target, key, r), r;
}

function __param(paramIndex, decorator) {
  return function (target, key) { decorator(target, key, paramIndex); }
}

function __esDecorate(ctor, descriptorIn, decorators, contextIn, initializers, extraInitializers) {
  function accept(f) { if (f !== void 0 && typeof f !== "function") throw new TypeError("Function expected"); return f; }
  var kind = contextIn.kind, key = kind === "getter" ? "get" : kind === "setter" ? "set" : "value";
  var target = !descriptorIn && ctor ? contextIn["static"] ? ctor : ctor.prototype : null;
  var descriptor = descriptorIn || (target ? Object.getOwnPropertyDescriptor(target, contextIn.name) : {});
  var _, done = false;
  for (var i = decorators.length - 1; i >= 0; i--) {
      var context = {};
      for (var p in contextIn) context[p] = p === "access" ? {} : contextIn[p];
      for (var p in contextIn.access) context.access[p] = contextIn.access[p];
      context.addInitializer = function (f) { if (done) throw new TypeError("Cannot add initializers after decoration has completed"); extraInitializers.push(accept(f || null)); };
      var result = (0, decorators[i])(kind === "accessor" ? { get: descriptor.get, set: descriptor.set } : descriptor[key], context);
      if (kind === "accessor") {
          if (result === void 0) continue;
          if (result === null || typeof result !== "object") throw new TypeError("Object expected");
          if (_ = accept(result.get)) descriptor.get = _;
          if (_ = accept(result.set)) descriptor.set = _;
          if (_ = accept(result.init)) initializers.unshift(_);
      }
      else if (_ = accept(result)) {
          if (kind === "field") initializers.unshift(_);
          else descriptor[key] = _;
      }
  }
  if (target) Object.defineProperty(target, contextIn.name, descriptor);
  done = true;
};

function __runInitializers(thisArg, initializers, value) {
  var useValue = arguments.length > 2;
  for (var i = 0; i < initializers.length; i++) {
      value = useValue ? initializers[i].call(thisArg, value) : initializers[i].call(thisArg);
  }
  return useValue ? value : void 0;
};

function __propKey(x) {
  return typeof x === "symbol" ? x : "".concat(x);
};

function __setFunctionName(f, name, prefix) {
  if (typeof name === "symbol") name = name.description ? "[".concat(name.description, "]") : "";
  return Object.defineProperty(f, "name", { configurable: true, value: prefix ? "".concat(prefix, " ", name) : name });
};

function __metadata(metadataKey, metadataValue) {
  if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(metadataKey, metadataValue);
}

function __awaiter(thisArg, _arguments, P, generator) {
  function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
  return new (P || (P = Promise))(function (resolve, reject) {
      function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
      function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
      function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
      step((generator = generator.apply(thisArg, _arguments || [])).next());
  });
}

function __generator(thisArg, body) {
  var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g;
  return g = { next: verb(0), "throw": verb(1), "return": verb(2) }, typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
  function verb(n) { return function (v) { return step([n, v]); }; }
  function step(op) {
      if (f) throw new TypeError("Generator is already executing.");
      while (g && (g = 0, op[0] && (_ = 0)), _) try {
          if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
          if (y = 0, t) op = [op[0] & 2, t.value];
          switch (op[0]) {
              case 0: case 1: t = op; break;
              case 4: _.label++; return { value: op[1], done: false };
              case 5: _.label++; y = op[1]; op = [0]; continue;
              case 7: op = _.ops.pop(); _.trys.pop(); continue;
              default:
                  if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                  if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                  if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                  if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                  if (t[2]) _.ops.pop();
                  _.trys.pop(); continue;
          }
          op = body.call(thisArg, _);
      } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
      if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
  }
}

var __createBinding = Object.create ? (function(o, m, k, k2) {
  if (k2 === undefined) k2 = k;
  var desc = Object.getOwnPropertyDescriptor(m, k);
  if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
  }
  Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
  if (k2 === undefined) k2 = k;
  o[k2] = m[k];
});

function __exportStar(m, o) {
  for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(o, p)) __createBinding(o, m, p);
}

function __values(o) {
  var s = typeof Symbol === "function" && Symbol.iterator, m = s && o[s], i = 0;
  if (m) return m.call(o);
  if (o && typeof o.length === "number") return {
      next: function () {
          if (o && i >= o.length) o = void 0;
          return { value: o && o[i++], done: !o };
      }
  };
  throw new TypeError(s ? "Object is not iterable." : "Symbol.iterator is not defined.");
}

function __read(o, n) {
  var m = typeof Symbol === "function" && o[Symbol.iterator];
  if (!m) return o;
  var i = m.call(o), r, ar = [], e;
  try {
      while ((n === void 0 || n-- > 0) && !(r = i.next()).done) ar.push(r.value);
  }
  catch (error) { e = { error: error }; }
  finally {
      try {
          if (r && !r.done && (m = i["return"])) m.call(i);
      }
      finally { if (e) throw e.error; }
  }
  return ar;
}

/** @deprecated */
function __spread() {
  for (var ar = [], i = 0; i < arguments.length; i++)
      ar = ar.concat(__read(arguments[i]));
  return ar;
}

/** @deprecated */
function __spreadArrays() {
  for (var s = 0, i = 0, il = arguments.length; i < il; i++) s += arguments[i].length;
  for (var r = Array(s), k = 0, i = 0; i < il; i++)
      for (var a = arguments[i], j = 0, jl = a.length; j < jl; j++, k++)
          r[k] = a[j];
  return r;
}

function __spreadArray(to, from, pack) {
  if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
      if (ar || !(i in from)) {
          if (!ar) ar = Array.prototype.slice.call(from, 0, i);
          ar[i] = from[i];
      }
  }
  return to.concat(ar || Array.prototype.slice.call(from));
}

function __await(v) {
  return this instanceof __await ? (this.v = v, this) : new __await(v);
}

function __asyncGenerator(thisArg, _arguments, generator) {
  if (!Symbol.asyncIterator) throw new TypeError("Symbol.asyncIterator is not defined.");
  var g = generator.apply(thisArg, _arguments || []), i, q = [];
  return i = {}, verb("next"), verb("throw"), verb("return", awaitReturn), i[Symbol.asyncIterator] = function () { return this; }, i;
  function awaitReturn(f) { return function (v) { return Promise.resolve(v).then(f, reject); }; }
  function verb(n, f) { if (g[n]) { i[n] = function (v) { return new Promise(function (a, b) { q.push([n, v, a, b]) > 1 || resume(n, v); }); }; if (f) i[n] = f(i[n]); } }
  function resume(n, v) { try { step(g[n](v)); } catch (e) { settle(q[0][3], e); } }
  function step(r) { r.value instanceof __await ? Promise.resolve(r.value.v).then(fulfill, reject) : settle(q[0][2], r); }
  function fulfill(value) { resume("next", value); }
  function reject(value) { resume("throw", value); }
  function settle(f, v) { if (f(v), q.shift(), q.length) resume(q[0][0], q[0][1]); }
}

function __asyncDelegator(o) {
  var i, p;
  return i = {}, verb("next"), verb("throw", function (e) { throw e; }), verb("return"), i[Symbol.iterator] = function () { return this; }, i;
  function verb(n, f) { i[n] = o[n] ? function (v) { return (p = !p) ? { value: __await(o[n](v)), done: false } : f ? f(v) : v; } : f; }
}

function __asyncValues(o) {
  if (!Symbol.asyncIterator) throw new TypeError("Symbol.asyncIterator is not defined.");
  var m = o[Symbol.asyncIterator], i;
  return m ? m.call(o) : (o = typeof __values === "function" ? __values(o) : o[Symbol.iterator](), i = {}, verb("next"), verb("throw"), verb("return"), i[Symbol.asyncIterator] = function () { return this; }, i);
  function verb(n) { i[n] = o[n] && function (v) { return new Promise(function (resolve, reject) { v = o[n](v), settle(resolve, reject, v.done, v.value); }); }; }
  function settle(resolve, reject, d, v) { Promise.resolve(v).then(function(v) { resolve({ value: v, done: d }); }, reject); }
}

function __makeTemplateObject(cooked, raw) {
  if (Object.defineProperty) { Object.defineProperty(cooked, "raw", { value: raw }); } else { cooked.raw = raw; }
  return cooked;
};

var __setModuleDefault = Object.create ? (function(o, v) {
  Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
  o["default"] = v;
};

function __importStar(mod) {
  if (mod && mod.__esModule) return mod;
  var result = {};
  if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
  __setModuleDefault(result, mod);
  return result;
}

function __importDefault(mod) {
  return (mod && mod.__esModule) ? mod : { default: mod };
}

function __classPrivateFieldGet(receiver, state, kind, f) {
  if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a getter");
  if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot read private member from an object whose class did not declare it");
  return kind === "m" ? f : kind === "a" ? f.call(receiver) : f ? f.value : state.get(receiver);
}

function __classPrivateFieldSet(receiver, state, value, kind, f) {
  if (kind === "m") throw new TypeError("Private method is not writable");
  if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a setter");
  if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot write private member to an object whose class did not declare it");
  return (kind === "a" ? f.call(receiver, value) : f ? f.value = value : state.set(receiver, value)), value;
}

function __classPrivateFieldIn(state, receiver) {
  if (receiver === null || (typeof receiver !== "object" && typeof receiver !== "function")) throw new TypeError("Cannot use 'in' operator on non-object");
  return typeof state === "function" ? receiver === state : state.has(receiver);
}

function __addDisposableResource(env, value, async) {
  if (value !== null && value !== void 0) {
    if (typeof value !== "object" && typeof value !== "function") throw new TypeError("Object expected.");
    var dispose, inner;
    if (async) {
      if (!Symbol.asyncDispose) throw new TypeError("Symbol.asyncDispose is not defined.");
      dispose = value[Symbol.asyncDispose];
    }
    if (dispose === void 0) {
      if (!Symbol.dispose) throw new TypeError("Symbol.dispose is not defined.");
      dispose = value[Symbol.dispose];
      if (async) inner = dispose;
    }
    if (typeof dispose !== "function") throw new TypeError("Object not disposable.");
    if (inner) dispose = function() { try { inner.call(this); } catch (e) { return Promise.reject(e); } };
    env.stack.push({ value: value, dispose: dispose, async: async });
  }
  else if (async) {
    env.stack.push({ async: true });
  }
  return value;
}

var _SuppressedError = typeof SuppressedError === "function" ? SuppressedError : function (error, suppressed, message) {
  var e = new Error(message);
  return e.name = "SuppressedError", e.error = error, e.suppressed = suppressed, e;
};

function __disposeResources(env) {
  function fail(e) {
    env.error = env.hasError ? new _SuppressedError(e, env.error, "An error was suppressed during disposal.") : e;
    env.hasError = true;
  }
  function next() {
    while (env.stack.length) {
      var rec = env.stack.pop();
      try {
        var result = rec.dispose && rec.dispose.call(rec.value);
        if (rec.async) return Promise.resolve(result).then(next, function(e) { fail(e); return next(); });
      }
      catch (e) {
          fail(e);
      }
    }
    if (env.hasError) throw env.error;
  }
  return next();
}

/* harmony default export */ const __WEBPACK_DEFAULT_EXPORT__ = ({
  __extends,
  __assign,
  __rest,
  __decorate,
  __param,
  __metadata,
  __awaiter,
  __generator,
  __createBinding,
  __exportStar,
  __values,
  __read,
  __spread,
  __spreadArrays,
  __spreadArray,
  __await,
  __asyncGenerator,
  __asyncDelegator,
  __asyncValues,
  __makeTemplateObject,
  __importStar,
  __importDefault,
  __classPrivateFieldGet,
  __classPrivateFieldSet,
  __classPrivateFieldIn,
  __addDisposableResource,
  __disposeResources,
});


/***/ })

/******/ 	});
/************************************************************************/
/******/ 	// The module cache
/******/ 	var __webpack_module_cache__ = {};
/******/ 	
/******/ 	// The require function
/******/ 	function __webpack_require__(moduleId) {
/******/ 		// Check if module is in cache
/******/ 		var cachedModule = __webpack_module_cache__[moduleId];
/******/ 		if (cachedModule !== undefined) {
/******/ 			return cachedModule.exports;
/******/ 		}
/******/ 		// Create a new module (and put it into the cache)
/******/ 		var module = __webpack_module_cache__[moduleId] = {
/******/ 			// no module.id needed
/******/ 			// no module.loaded needed
/******/ 			exports: {}
/******/ 		};
/******/ 	
/******/ 		// Execute the module function
/******/ 		__webpack_modules__[moduleId].call(module.exports, module, module.exports, __webpack_require__);
/******/ 	
/******/ 		// Return the exports of the module
/******/ 		return module.exports;
/******/ 	}
/******/ 	
/************************************************************************/
/******/ 	/* webpack/runtime/define property getters */
/******/ 	(() => {
/******/ 		// define getter functions for harmony exports
/******/ 		__webpack_require__.d = (exports, definition) => {
/******/ 			for(var key in definition) {
/******/ 				if(__webpack_require__.o(definition, key) && !__webpack_require__.o(exports, key)) {
/******/ 					Object.defineProperty(exports, key, { enumerable: true, get: definition[key] });
/******/ 				}
/******/ 			}
/******/ 		};
/******/ 	})();
/******/ 	
/******/ 	/* webpack/runtime/hasOwnProperty shorthand */
/******/ 	(() => {
/******/ 		__webpack_require__.o = (obj, prop) => (Object.prototype.hasOwnProperty.call(obj, prop))
/******/ 	})();
/******/ 	
/******/ 	/* webpack/runtime/make namespace object */
/******/ 	(() => {
/******/ 		// define __esModule on exports
/******/ 		__webpack_require__.r = (exports) => {
/******/ 			if(typeof Symbol !== 'undefined' && Symbol.toStringTag) {
/******/ 				Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });
/******/ 			}
/******/ 			Object.defineProperty(exports, '__esModule', { value: true });
/******/ 		};
/******/ 	})();
/******/ 	
/************************************************************************/
/******/ 	
/******/ 	// startup
/******/ 	// Load entry module and return exports
/******/ 	// This entry module is referenced by other modules so it can't be inlined
/******/ 	var __webpack_exports__ = __webpack_require__(156);
/******/ 	
/******/ })()
;