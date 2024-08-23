import asyncPool from 'tiny-async-pool';
import { namespace } from '../constants';
import { delay, encodeURIComponent2, fetchAndRetry } from '../utils/utils';

const toolbarTemplate = document.createElement('template');
toolbarTemplate.innerHTML = `
    <div>
        <button type="button" class="btn-primary" disabled>
            View All At Once
        </button>
        Go to artist: <select></select>
    </div>`;

const domParser = new DOMParser();

const artistMap = new Map<string, Artist>();
let artistSelect: HTMLSelectElement | undefined = undefined;

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
    const table = section?.querySelector('table');

    if (!section || !table) {
        return;
    }

    enhanceTable(table);

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
        anchor.href = `?page=${selectedArtist.pageNumber}&artist=${encodeURIComponent2(selectedArtist.name)}`;
        document.body.appendChild(anchor);
        anchor.click();
        document.body.removeChild(anchor);
    });

    loadPagesProgressElement = document.createElement('span');
    toolbar.insertAdjacentText('beforeend', ' ');
    toolbar.insertAdjacentElement('beforeend', loadPagesProgressElement);

    loadPagesPromise ??= loadPages(table, currentPageNumber, pageCount);
    const pages = await loadPagesPromise;

    toolbar.removeChild(loadPagesProgressElement);

    const viewAllButton = toolbar.querySelector('button')!;
    viewAllButton.disabled = false;

    viewAllButton.addEventListener('click', async () => {
        if (pages.length >= 100 && !window.confirm(`You are about to view ${pages.length} pages at once. This might take a long time to load. Are you sure?`)) {
            return;
        }

        viewAllButton.disabled = true;

        table.style.tableLayout = 'fixed';

        const tableBody = table.tBodies[0];
        const firstRow: HTMLTableRowElement = tableBody.rows[0];

        for (const page of pages) {
            if (page.pageNumber === currentPageNumber) {
                continue;
            }

            for (const row of page.rows) {
                enhanceRow(row);

                if (page.pageNumber < currentPageNumber) {
                    firstRow.insertAdjacentElement('beforebegin', row);
                } else {
                    tableBody.appendChild(row);
                }
            }

            if (page.pageNumber % 10 === 0) {
                await delay(1);
            }
        }
    });
}

function enhanceTable(table: HTMLTableElement) {
    document.body.style.backgroundColor = '#fff';
    table.style.tableLayout = 'auto';

    const headerRow = table.tHead!.rows[0];
    const body = table.tBodies[0];

    let sortedCellIndex = 1;

    const keys = [
        'track_name_original',
        'artist_name_original',
        'album_name_original',
        'album_artist_name_original',
    ]

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
                    value = row.querySelector<HTMLInputElement>(`input[name="${key}"]`)!.value;
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

function enhanceRow(row: HTMLTableRowElement) {
    if (row.dataset['enhanced'] === 'true') {
        return;
    }

    row.dataset['enhanced'] = 'true';

    const formData = getFormData(row);

    const trackName = formData.get('track_name')!.toString();
    const artistName = formData.get('artist_name')!.toString();
    const albumName = formData.get('album_name')!.toString();
    const albumArtistName = formData.get('album_artist_name')!.toString();

    const originalTrackName = formData.get('track_name_original')!.toString();
    const originalArtistName = formData.get('artist_name_original')!.toString();
    const originalAlbumName = formData.get('album_name_original')!.toString();
    const originalAlbumArtistName = formData.get('album_artist_name_original')!.toString();

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

    if (trackName !== originalTrackName) {
        emphasize(row.cells[0], trackName);
    } else {
        // remove bold
        row.cells[0].innerHTML = row.cells[0].textContent!;
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
        row.classList.add(`${namespace}-highlight`);
    }
}

function getFormData(row: HTMLTableRowElement) {
    return new FormData(row.querySelector('form')!);
}

function getSelectedArtistKey() {
    return new URLSearchParams(location.search).get('artist')?.toLowerCase();
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

    const table = doc.querySelector<HTMLTableElement>('.chart-table')!;

    return {
        pageNumber,
        rows: [...table.tBodies[0].rows],
    };
}

function addArtistsToSelect(page: Page) {
    const selectedArtistKey = getSelectedArtistKey();

    for (const row of page.rows) {
        const formData = getFormData(row);
        const name = formData.get('artist_name_original')!.toString();
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
