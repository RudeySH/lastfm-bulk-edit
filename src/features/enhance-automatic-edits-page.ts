import he from 'he';
import asyncPool from 'tiny-async-pool';
import { ns } from '../constants';
import { encodeURIComponent2, fetchAndRetry } from '../utils/utils';

const toolbarTemplate = document.createElement('template');
toolbarTemplate.innerHTML = `
    <div>
        <span></span> <select></select>
    </div>`;

const domParser = new DOMParser();

// the table's display and sort options
interface ListOptions {
    displayPreference: string;
    sort: string;
    sortDirection: string;
}

// the field to navigate by for a sort option, and whether the table is sorted by its edited or original values
interface SortField {
    key: string;
    label: string;
    edited: boolean;
}

const sortFieldsBySuffix: Record<string, Omit<SortField, 'edited'> | undefined> = {
    track: { key: 'track_name', label: 'track' },
    album: { key: 'album_name', label: 'album' },
    artist: { key: 'artist_name', label: 'artist' },
    track_artist: { key: 'artist_name', label: 'artist' },
    album_artist: { key: 'album_artist_name', label: 'album artist' },
};

// Last.fm sorts by original values with "from_" options (e.g. from_album), and by edited values with "to_" options (e.g. to_album),
// sorting by modification date has no field to navigate by
function getSortField(sort: string): SortField | undefined {
    const match = /^(from|to)_(.+)$/.exec(sort);
    const sortField = match ? sortFieldsBySuffix[match[2]] : undefined;

    return sortField ? { ...sortField, edited: match![1] === 'to' } : undefined;
}

// the page number and row index store where the item first appears in Last.fm's table, which determines its order
interface Item {
    key: string;
    name: string;
    pageNumber: number,
    rowIndex: number;
}

interface Page {
    pageNumber: number;
    rows: HTMLTableRowElement[];
}

// the items depend on the list options, and are reset when those change
let itemsOptionsKey: string | undefined = undefined;
const itemMap = new Map<string, Item>();
let scrollItemIntoView = false;

let loadPagesPromise: Promise<Page[]> | undefined = undefined;
let loadPagesProgressText = '';

export async function enhanceAutomaticEditsPage(element: Element) {
    if (!document.URL.includes('/settings/subscription/automatic-edits')) {
        return;
    }

    const section = element.closest('#subscription-corrections') ?? element.querySelector('#subscription-corrections');

    if (!section) {
        return;
    }

    observeSection(section);
    enhanceSection(section);
}

const observedSections = new WeakSet<Element>();

// Last.fm loads and replaces the contents of the section itself when paginating or sorting,
// which doesn't necessarily add new elements, so watch the section for any change
function observeSection(section: Element) {
    if (observedSections.has(section)) {
        return;
    }

    observedSections.add(section);

    const observer = new MutationObserver(() => enhanceSection(section));

    observer.observe(section, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['data-enhanced'],
    });

    // Last.fm can replace the toolbar with a copy of its HTML, which loses event listeners,
    // so listen on the section instead, which also receives change events from copies
    section.addEventListener('change', (event) => {
        const itemSelect = event.target;
        const toolbar = itemSelect instanceof HTMLSelectElement ? itemSelect.closest<HTMLElement>(`.${ns}-toolbar`) : null;

        if (toolbar) {
            goToItem(itemSelect as HTMLSelectElement, toolbar);
        }
    });
}

function goToItem(itemSelect: HTMLSelectElement, toolbar: HTMLElement) {
    const selectedItem = itemMap.get(itemSelect.value);

    if (!selectedItem) {
        return;
    }

    const anchor = document.createElement('a');
    anchor.href = `?${toolbar.dataset['options']}&page=${selectedItem.pageNumber}&go-to=${encodeURIComponent2(selectedItem.name)}`;
    document.body.appendChild(anchor);
    scrollItemIntoView = true;
    anchor.click();
    document.body.removeChild(anchor);
}

// safe to call repeatedly, rows and the toolbar are only enhanced or added when needed
function enhanceSection(section: Element) {
    const table = section.querySelector<HTMLTableElement>('.edits-list table.chart-table');

    if (!table) {
        return;
    }

    const options = getListOptions(section);
    const sortField = getSortField(options.sort);

    const keys = table.classList.contains('automatic-album-edits')
        ? ['album_name', 'album_artist_name']
        : ['track_name', 'artist_name', 'album_name', 'album_artist_name'];

    enhanceTable(table, keys, sortField);

    // TODO: revive "Go to" select feature
    const toolbar = section.querySelector<HTMLElement>(`.${ns}-toolbar`);

    if (!sortField) {
        toolbar?.remove();
    } else if (toolbar?.dataset['options'] !== getOptionsKey(options)) {
        toolbar?.remove();
        addToolbar(section, table, options, sortField);
    } else {
        syncToolbar();
    }
}

// a toolbar that Last.fm put back can be outdated, only touch it when it is, to avoid triggering the observer endlessly
function syncToolbar() {
    const itemSelect = document.querySelector<HTMLSelectElement>(`.${ns}-toolbar select`);

    if (itemSelect && itemSelect.options.length !== itemMap.size) {
        renderItemSelect();
    }

    const progressElement = document.querySelector(`.${ns}-toolbar-progress`);

    if (progressElement && loadPagesProgressText === '') {
        progressElement.remove();
    } else if (progressElement && progressElement.textContent !== loadPagesProgressText) {
        progressElement.textContent = loadPagesProgressText;
    }
}

// the URL doesn't always contain every option, e.g. switching the display preference drops the sort parameters,
// so read the options from the selected items in Last.fm's "Original name" and "Sort by" menus, and fall back to the URL
function getListOptions(section: Element): ListOptions {
    const params = new URLSearchParams(location.search);
    const selectedDisplay = section.querySelector<HTMLElement>('#automatic-edit-view-options .display-options-clickable-item--selected');
    const selectedSort = section.querySelector<HTMLElement>('#automatic-edit-sort-options .display-options-clickable-item--selected');

    let sortDirection = params.get('sort-direction') ?? 'asc';

    if (selectedSort?.classList.contains('display-options-clickable-item--asc')) {
        sortDirection = 'asc';
    } else if (selectedSort?.classList.contains('display-options-clickable-item--desc')) {
        sortDirection = 'desc';
    }

    return {
        displayPreference: selectedDisplay?.dataset['display'] ?? params.get('display-preference') ?? 'original',
        sort: selectedSort?.dataset['sort'] ?? params.get('sort') ?? 'modification_date',
        sortDirection,
    };
}

function getOptionsKey(options: ListOptions) {
    return new URLSearchParams({
        'display-preference': options.displayPreference,
        'sort': options.sort,
        'sort-direction': options.sortDirection,
    }).toString();
}

// the value of the sort field that the table is sorted by, which is either the original or the edited value
function getItemName(formData: FormData, sortField: SortField) {
    const name = sortField.edited
        ? formData.get(sortField.key)
        : formData.get(`${sortField.key}_original`);

    return name!.toString();
}

async function addToolbar(section: Element, table: HTMLTableElement, options: ListOptions, sortField: SortField) {
    const paginationList = section.querySelector('.pagination-list');

    if (!paginationList) {
        return;
    }

    const paginationListItems = [...paginationList.querySelectorAll('.pagination-page')];
    const currentPageNumber = parseInt(paginationListItems.find(x => x.getAttribute('aria-current') === 'page')!.textContent!, 10);
    const pageCount = parseInt(paginationListItems[paginationListItems.length - 1].textContent!, 10);

    if (pageCount === 1) {
        return;
    }

    const optionsKey = getOptionsKey(options);

    if (itemsOptionsKey !== optionsKey) {
        itemsOptionsKey = optionsKey;
        itemMap.clear();
        loadPagesPromise = undefined;
    }

    const toolbar = toolbarTemplate.content.firstElementChild!.cloneNode(true) as HTMLDivElement;
    toolbar.className = `${ns}-toolbar`;
    toolbar.dataset['options'] = optionsKey;
    toolbar.querySelector('span')!.textContent = `Go to ${sortField.label}:`;
    // place the toolbar below the heading and table options, or at the top if Last.fm's layout changed
    const tableContainer = section.querySelector(':scope > .automatic-edits-table-container');

    if (tableContainer) {
        tableContainer.after(toolbar);
    } else {
        section.prepend(toolbar);
    }

    const progressElement = document.createElement('span');
    progressElement.className = `${ns}-toolbar-progress`;
    progressElement.textContent = loadPagesProgressText;
    toolbar.insertAdjacentText('beforeend', ' ');
    toolbar.insertAdjacentElement('beforeend', progressElement);

    renderItemSelect();

    loadPagesPromise ??= loadPages(table, currentPageNumber, pageCount, options, sortField);
    await loadPagesPromise;

    // an empty progress text means loading is done, unless loading restarted for other list options in the meantime
    if (itemsOptionsKey === optionsKey) {
        loadPagesProgressText = '';
        document.querySelector(`.${ns}-toolbar-progress`)?.remove();
    }
}

// Last.fm can take the toolbar out of the page and put it back later, while another toolbar was added in the meantime,
// so never hold on to toolbar elements, but always look up the toolbar that is currently on the page
function renderItemSelect() {
    const itemSelect = document.querySelector<HTMLSelectElement>(`.${ns}-toolbar select`);

    if (!itemSelect) {
        return;
    }

    const selectedItemKey = getSelectedItemKey();
    itemSelect.replaceChildren();

    // respect the order in which Last.fm sorts the table, pages can finish loading in any order
    for (const item of [...itemMap.values()].sort((a, b) => a.pageNumber - b.pageNumber || a.rowIndex - b.rowIndex)) {
        const option = document.createElement('option');
        option.value = item.key;
        option.text = item.name;
        itemSelect.appendChild(option);
    }

    // keep nothing selected, unless an item was navigated to
    itemSelect.value = selectedItemKey ?? '';

    if (itemSelect.value !== selectedItemKey) {
        itemSelect.selectedIndex = -1;
    }
}

function enhanceTable(table: HTMLTableElement, keys: string[], sortField: SortField | undefined) {
    document.body.style.backgroundColor = '#fff';
    table.style.tableLayout = 'auto';

    // TODO: revive clickable headers feature
    // for (const cell of table.tHead!.rows[0].cells) {
    //     cell.innerHTML = `<a href="javascript:void(0)" role="button">${cell.textContent}</a>`;
    // }

    for (const row of table.tBodies[0].rows) {
        enhanceRow(row, keys, sortField);
    }
}

function enhanceRow(row: HTMLTableRowElement, keys: string[], sortField: SortField | undefined) {
    if (row.dataset['enhanced'] === 'true') {
        return;
    }

    row.dataset['enhanced'] = 'true';

    const formData = getFormData(row);

    function emphasize(cell: HTMLTableCellElement, editedValue: string, originalValue: string) {
        cell.style.lineHeight = '1';
        cell.innerHTML = `
            <div>
                <span class="sr-only">
                    ${he.escape(originalValue)}
                </span>
                <b>
                    ${he.escape(editedValue)}
                </b>
            </div>
            <small>
                Originally "${he.escape(originalValue)}"
            </small>`
    }

    for (let i = 0; i < keys.length; i++) {
        const key = keys[i];
        const editedValue = formData.get(key)!.toString();
        const originalValue = formData.get(`${key}_original`)!.toString();

        if (editedValue !== originalValue) {
            emphasize(row.cells[i], editedValue, originalValue);
        } else if (i === 0) {
            // remove bold
            row.cells[0].innerHTML = row.cells[0].textContent!;
        }
    }

    if (sortField && getItemName(formData, sortField).toLowerCase() === getSelectedItemKey()) {
        row.classList.add(`${ns}-highlight`);

        if (scrollItemIntoView) {
            scrollItemIntoView = false;
            row.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    }
}

function getFormData(row: HTMLTableRowElement) {
    return new FormData(row.querySelector('form')!);
}

function getSelectedItemKey() {
    return new URLSearchParams(location.search).get('go-to')?.toLowerCase();
}

async function loadPages(table: HTMLTableElement, currentPageNumber: number, pageCount: number, options: ListOptions, sortField: SortField) {
    const optionsKey = getOptionsKey(options);
    const currentPage: Page = { pageNumber: currentPageNumber, rows: [...table.tBodies[0].rows] };
    const pages = [currentPage];
    const pageNumbersToLoad = [...Array(pageCount).keys()].map(i => i + 1).filter(i => i !== currentPageNumber);

    addItems(currentPage, sortField);
    updateProgressText(1, pageCount);

    for await (const page of asyncPool(6, pageNumbersToLoad, (pageNumber) => loadPage(pageNumber, optionsKey))) {
        // stop when the list options changed in the meantime
        if (itemsOptionsKey !== optionsKey) {
            break;
        }

        pages.push(page);

        addItems(page, sortField);
        updateProgressText(pages.length, pageCount);
    }

    pages.sort((a, b) => a.pageNumber < b.pageNumber ? -1 : 1);

    return pages;
}

async function loadPage(pageNumber: number, optionsKey: string) {
    const response = await fetchAndRetry(`?${optionsKey}&page=${pageNumber}&_pjax=%23content`, {
        credentials: 'include',
        headers: {
            'X-Pjax': 'true',
            'X-Pjax-Container': '#content',
        },
    })

    const text = await response.text();

    const doc = domParser.parseFromString(text, 'text/html');

    const table = doc.querySelector<HTMLTableElement>('.edits-list table.chart-table')!;

    return {
        pageNumber,
        rows: [...table.tBodies[0].rows],
    };
}

function addItems(page: Page, sortField: SortField) {
    for (const [rowIndex, row] of page.rows.entries()) {
        const formData = getFormData(row);
        const name = getItemName(formData, sortField);

        const key = name.toLowerCase();
        const item = itemMap.get(key);

        if (!item) {
            itemMap.set(key, { key, name, pageNumber: page.pageNumber, rowIndex });
        } else if (item.pageNumber > page.pageNumber) {
            item.pageNumber = page.pageNumber;
            item.rowIndex = rowIndex;
        }
    }

    renderItemSelect();
}

function updateProgressText(current: number, total: number) {
    loadPagesProgressText = `${current} / ${total} (${(current * 100 / total).toFixed(0)}%)`;

    const progressElement = document.querySelector(`.${ns}-toolbar-progress`);

    if (progressElement) {
        progressElement.textContent = loadPagesProgressText;
    }
}
