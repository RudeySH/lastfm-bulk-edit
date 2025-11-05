import asyncPool from 'tiny-async-pool';
import { namespace } from '../constants';
import { encodeURIComponent2, fetchAndRetry } from '../utils/utils';

const toolbarTemplate = document.createElement('template');
toolbarTemplate.innerHTML = `
    <div>
        Go to album artist: <select></select>
    </div>`;

const domParser = new DOMParser();

const artistMap = new Map<string, Artist>();
let artistSelect: HTMLSelectElement | undefined = undefined;
let scrollArtistIntoView = false;

let loadPagesPromise: Promise<Page[]> | undefined = undefined;
let loadPagesProgressElement: HTMLElement | undefined = undefined;

interface Artist {
    key: string;
    name: string;
    sortName: string;
    pageNumber: number,
}

interface Page {
    pageNumber: number;
    rows: HTMLTableRowElement[];
}

export async function enhanceAutomaticEditsPage(element: Element) {
    if (!document.URL.includes('/settings/subscription/automatic-edits')) {
        return;
    }

    const section = element.querySelector('#subscription-corrections');
    const table = section?.querySelector<HTMLTableElement>('.edits-list table.chart-table');

    if (!section || !table) {
        return;
    }

    const keys = table.classList.contains('automatic-album-edits')
        ? ['album_name', 'album_artist_name']
        : ['track_name', 'artist_name', 'album_name', 'album_artist_name'];

    enhanceTable(table, keys);

    // TODO: revive "Go to" select feature
    //addToolbar(section, table);
}

async function addToolbar(section: Element, table: HTMLTableElement) {
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

    const toolbar = toolbarTemplate.content.firstElementChild!.cloneNode(true) as HTMLDivElement;
    section.insertBefore(toolbar, section.firstElementChild);

    artistSelect = toolbar.querySelector('select')!;

    const selectedArtistKey = getSelectedArtistKey();

    for (const artist of [...artistMap.values()].sort((a, b) => a.sortName.localeCompare(b.sortName))) {
        const option = document.createElement('option');
        option.value = artist.key;
        option.selected = artist.key === selectedArtistKey;
        option.text = artist.name;

        const keepNothingSelected = !option.selected && artistSelect!.selectedIndex === -1;
        artistSelect.appendChild(option);

        if (keepNothingSelected) {
            artistSelect!.selectedIndex = -1;
        }
    }

    artistSelect.addEventListener('change', function () {
        const selectedArtist = artistMap.get(this.value)!;
        const anchor = document.createElement('a');
        anchor.href = `?page=${selectedArtist.pageNumber}&album-artist=${encodeURIComponent2(selectedArtist.name)}`;
        document.body.appendChild(anchor);
        scrollArtistIntoView = true;
        anchor.click();
        document.body.removeChild(anchor);
    });

    loadPagesProgressElement = document.createElement('span');
    toolbar.insertAdjacentText('beforeend', ' ');
    toolbar.insertAdjacentElement('beforeend', loadPagesProgressElement);

    loadPagesPromise ??= loadPages(table, currentPageNumber, pageCount);
    await loadPagesPromise;

    toolbar.removeChild(loadPagesProgressElement);
}

function enhanceTable(table: HTMLTableElement, keys: string[]) {
    document.body.style.backgroundColor = '#fff';
    table.style.tableLayout = 'auto';

    // TODO: revive clickable headers feature
    // for (const cell of table.tHead!.rows[0].cells) {
    //     cell.innerHTML = `<a href="javascript:void(0)" role="button">${cell.textContent}</a>`;
    // }

    for (const row of table.tBodies[0].rows) {
        enhanceRow(row, keys);
    }
}

function enhanceRow(row: HTMLTableRowElement, keys: string[]) {
    if (row.dataset['enhanced'] === 'true') {
        return;
    }

    row.dataset['enhanced'] = 'true';

    const formData = getFormData(row);

    function emphasize(cell: HTMLTableCellElement, content: string) {
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
                Originally "${cell.textContent?.trim()}"
            </small>`
    }

    for (let i = 0; i < keys.length; i++) {
        const key = keys[i];
        const currentValue = formData.get(key)!.toString();
        const originalValue = formData.get(`${key}_original`)!.toString();

        if (currentValue !== originalValue) {
            emphasize(row.cells[i], currentValue);
        } else if (i === 0) {
            // remove bold
            row.cells[0].innerHTML = row.cells[0].textContent!;
        }
    }

    const originalAlbumArtistName = formData.get('album_artist_name_original')!.toString();

    if (originalAlbumArtistName.toLowerCase() === getSelectedArtistKey()) {
        row.classList.add(`${namespace}-highlight`);

        if (scrollArtistIntoView) {
            scrollArtistIntoView = false;
            row.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    }
}

function getFormData(row: HTMLTableRowElement) {
    return new FormData(row.querySelector('form')!);
}

function getSelectedArtistKey() {
    return new URLSearchParams(location.search).get('album-artist')?.toLowerCase();
}

async function loadPages(table: HTMLTableElement, currentPageNumber: number, pageCount: number) {
    const currentPage: Page = { pageNumber: currentPageNumber, rows: [...table.tBodies[0].rows] };
    const pages = [currentPage];
    const pageNumbersToLoad = [...Array(pageCount).keys()].map(i => i + 1).filter(i => i !== currentPageNumber);

    addArtistsToSelect(currentPage);
    updateProgressText(1, pageCount);

    for await (const page of asyncPool(6, pageNumbersToLoad, loadPage)) {
        pages.push(page);

        addArtistsToSelect(page);
        updateProgressText(pages.length, pageCount);
    }

    pages.sort((a, b) => a.pageNumber < b.pageNumber ? -1 : 1);

    return pages;
}

async function loadPage(pageNumber: number) {
    const response = await fetchAndRetry(`?page=${pageNumber}&_pjax=%23content`, {
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

function addArtistsToSelect(page: Page) {
    const selectedArtistKey = getSelectedArtistKey();

    for (const row of page.rows) {
        const formData = getFormData(row);
        const name = formData.get('album_artist_name_original')!.toString();
        const sortName = name.replace(/\s+/g, '');

        const key = name.toLowerCase();
        const artist = artistMap.get(key)!;

        if (!artist) {
            artistMap.set(key, { key, name, sortName, pageNumber: page.pageNumber });

            const option = document.createElement('option');
            option.value = key;
            option.selected = key === selectedArtistKey;
            option.text = name;

            const keepNothingSelected = !option.selected && artistSelect!.selectedIndex === -1;
            const insertAtIndex = [...artistMap.values()].sort((a, b) => a.sortName.localeCompare(b.sortName)).findIndex(x => x.key === key);
            artistSelect!.insertBefore(option, artistSelect!.children[insertAtIndex]);

            if (keepNothingSelected) {
                artistSelect!.selectedIndex = -1;
            }
        } else if (artist.pageNumber > page.pageNumber) {
            artist.pageNumber = page.pageNumber;
        }
    }
}

function updateProgressText(current: number, total: number) {
    loadPagesProgressElement!.textContent = `${current} / ${total} (${(current * 100 / total).toFixed(0)}%)`;
}
