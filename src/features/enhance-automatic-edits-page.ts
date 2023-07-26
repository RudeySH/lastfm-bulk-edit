import asyncPool from 'tiny-async-pool';

const viewAllButtonTemplate = document.createElement('template');
viewAllButtonTemplate.innerHTML = `
    <button type="button" class="btn-primary" disabled>
        View All At Once
    </button>`;

const domParser = new DOMParser();
let loadPagesPromise: Promise<Page[]> | undefined = undefined;
let loadPagesProgressElement: HTMLElement | undefined = undefined;

interface Page {
    pageNumber: number;
    rows: HTMLTableRowElement[];
}

export async function enhanceAutomaticEditsPage(element: Element) {
    if (!document.URL.startsWith('https://www.last.fm/settings/subscription/automatic-edits')) {
        return;
    }

    const section = element.querySelector('#subscription-corrections');
    const table = section?.querySelector('table');

    if (!section || !table) {
        return;
    }

    const viewAllButton = viewAllButtonTemplate.content.firstElementChild!.cloneNode(true) as HTMLButtonElement;
    section.insertBefore(viewAllButton, section.firstElementChild);

    enhanceTable(table);

    const paginationList = section?.querySelector('.pagination-list');

    if (!paginationList) {
        return;
    }

    const paginationListItems = [...paginationList.querySelectorAll('.pagination-page')];
    const currentPageNumber = parseInt(paginationListItems.find(x => x.getAttribute('aria-current') === 'page')!.textContent!, 10);
    const pageCount = parseInt(paginationListItems[paginationListItems.length - 1].textContent!, 10);

    if (pageCount === 1) {
        return;
    }

    loadPagesProgressElement = document.createElement('div');
    loadPagesProgressElement.style.lineHeight = '32px';
    loadPagesProgressElement.style.textAlign = 'center';
    table.insertAdjacentElement('beforebegin', loadPagesProgressElement);

    loadPagesPromise ??= loadPages(table, currentPageNumber, pageCount);
    const pages = await loadPagesPromise;

    section.removeChild(loadPagesProgressElement);

    const alphabeticalPaginationList = document.createElement('ul');
    alphabeticalPaginationList.className = 'pagination-list';
    table.insertAdjacentElement('beforebegin', alphabeticalPaginationList);

    let previousLetter: string | undefined = undefined;

    for (const page of pages) {
        for (const row of page.rows) {
            const formData = getFormData(row);

            let letter = formData.get('artist_name_original')!.toString()[0].toUpperCase();

            if (letter < 'A' || letter > 'Z') {
                letter = '#';
            }

            if (letter !== previousLetter) {
                const anchor = document.createElement('a');
                anchor.href = '?page=' + page.pageNumber;
                anchor.textContent = letter;

                const listItem = document.createElement('li');
                listItem.className = 'pagination-page';
                if (page.pageNumber === currentPageNumber) {
                    listItem.setAttribute('aria-current', 'page');
                }
                listItem.appendChild(anchor);

                alphabeticalPaginationList.appendChild(listItem);
                alphabeticalPaginationList.appendChild(document.createTextNode(' '));
                previousLetter = letter;
            }
        }
    }

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

        section.removeChild(viewAllButton);
    });
}

function enhanceTable(table: HTMLTableElement) {
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
                Originally "${cell.textContent}"
            </small>`
    }

    if (trackName !== formData.get('track_name_original')) {
        emphasize(row.cells[0], trackName);
    } else {
        // remove bold
        row.cells[0].innerHTML = row.cells[0].textContent!;
    }

    if (artistName !== formData.get('artist_name_original')) {
        emphasize(row.cells[1], artistName);
    }

    if (albumName !== formData.get('album_name_original')) {
        emphasize(row.cells[2], albumName);
    }

    if (albumArtistName !== formData.get('album_artist_name_original')) {
        emphasize(row.cells[3], albumArtistName);
    }
}

function getFormData(row: HTMLTableRowElement) {
    return new FormData(row.querySelector('form')!);
}

async function loadPages(table: HTMLTableElement, currentPageNumber: number, pageCount: number) {
    const pages: Page[] = [{ pageNumber: currentPageNumber, rows: [...table.tBodies[0].rows] }];
    const pageNumbersToLoad = [...Array(pageCount).keys()].map(i => i + 1).filter(i => i !== currentPageNumber);

    updateProgress(1, pageCount);

    for await (const page of asyncPool(6, pageNumbersToLoad, loadPage)) {
        pages.push(page);

        updateProgress(pages.length, pageCount);
    }

    pages.sort((a, b) => a.pageNumber < b.pageNumber ? -1 : 1);

    return pages;
}

async function loadPage(pageNumber: number) {
    const response = await fetch(`/settings/subscription/automatic-edits?page=${pageNumber}&_pjax=%23content`, {
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

function updateProgress(current: number, total: number) {
    loadPagesProgressElement!.textContent = `${current} / ${total} (${(current * 100 / total).toFixed(0)}%)`;
}

function delay(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
