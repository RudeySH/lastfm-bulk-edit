const buttonContainerTemplate = document.createElement('template');
buttonContainerTemplate.innerHTML = `
    <span>
        ·
        <a href="javascript:void(0)" role="button">Load All</a>
    </span>`;

const loadingSpinnerTemplate = document.createElement('template');
loadingSpinnerTemplate.innerHTML = `
    <img src="/static/images/loading_dark_light_64.gif" height="22" style="margin-left: 5px;" alt="Loading..." />`

export function enhanceAutomaticEditsPage(element: Element) {
    if (!document.URL.startsWith('https://www.last.fm/settings/subscription/automatic-edits')) {
        return;
    }

    const section = element.querySelector('#subscription-corrections');
    const chartTable = section?.querySelector<HTMLTableElement>('.chart-table')!;
    const chartTableBody = chartTable?.tBodies[0];
    const paginationList = section?.querySelector('.pagination-list');

    if (!section || !chartTable || !chartTableBody || !paginationList) {
        return;
    }

    chartTable.style.minWidth = '100%';
    chartTable.style.width = 'initial';

    const headerRow = chartTable.tHead!.rows[0];
    let sortedCellIndex = 1;

    for (let i = 0; i < headerRow.cells.length; i++) {
        const cell = headerRow.cells[i];

        cell.innerHTML = `<a href="#" role="button">${cell.textContent}</a>`;

        cell.addEventListener('click', () => {
            const dir = sortedCellIndex === i ? -1 : 1;
            sortedCellIndex = sortedCellIndex === i ? -1 : i;

            const rows = [...chartTableBody.rows];
            rows.sort((a, b) => a.cells[i].textContent!.trim().localeCompare(b.cells[i].textContent!.trim()) * dir);

            for (const row of rows) {
                chartTableBody.appendChild(row);
            }
        });
    }

    for (const row of chartTableBody.rows) {
        enhanceTrackEditRow(row);
    }

    const urlParams = new URLSearchParams(window.location.search);
    const page = urlParams.get('page');

    if (page !== null && parseInt(page, 10) >= 2) {
        return;
    }

    const h4 = section.querySelector('h4, .buffer-standard')!;

    const buttonContainer = buttonContainerTemplate.content.firstElementChild!.cloneNode(true) as HTMLAnchorElement;
    h4.appendChild(buttonContainer);

    const loadAllButton = buttonContainer.querySelector('a')!;

    loadAllButton.addEventListener('click', async () => {
        loadAllButton.style.pointerEvents = 'none';

        const loadingSpinner = loadingSpinnerTemplate.content.firstElementChild!.cloneNode(true) as HTMLImageElement;
        loadAllButton.insertAdjacentElement('afterend', loadingSpinner);

        const pages = paginationList.querySelectorAll('.pagination-page');
        const lastPage = parseInt(pages[pages.length - 1].textContent!, 10);

        paginationList.parentNode!.removeChild(paginationList);

        const domParser = new DOMParser();

        for (let i = 2; i <= lastPage; i++) {
            const response = await fetch(`/settings/subscription/automatic-edits?page=${i}&_pjax=%23content`, {
                credentials: 'include',
                headers: {
                    'X-Pjax': 'true',
                    'X-Pjax-Container': '#content',
                },
            });

            const text = await response.text();

            const doc = domParser.parseFromString(text, 'text/html');

            const chartTable2 = doc.querySelector<HTMLTableElement>('.chart-table')!;

            for (const row of chartTable2.tBodies[0].rows) {
                enhanceTrackEditRow(row);
                chartTableBody.appendChild(row);
            }
        }

        buttonContainer.parentNode!.removeChild(buttonContainer);
    });
}

function enhanceTrackEditRow(row: HTMLTableRowElement) {
    const form = row.querySelector('form')!;

    const formData = new FormData(form);

    const trackName = formData.get('track_name')!.toString();
    const artistName = formData.get('artist_name')!.toString();
    const albumName = formData.get('album_name')!.toString();
    const albumArtistName = formData.get('album_artist_name')!.toString();

    function rebuild(cell: HTMLTableCellElement, content: string) {
        cell.style.lineHeight = '1';
        cell.innerHTML = `
            <div>
                <b>${content}</b>
            </div>
            <small>
                Originally "${cell.textContent}"
            </small>`
    }

    if (trackName !== formData.get('track_name_original')) {
        rebuild(row.cells[0], trackName);
    } else {
        // remove bold
        row.cells[0].innerHTML = row.cells[0].textContent!;
    }

    if (artistName !== formData.get('artist_name_original')) {
        rebuild(row.cells[1], artistName);
    }

    if (albumName !== formData.get('album_name_original')) {
        rebuild(row.cells[2], albumName);
    }

    if (albumArtistName !== formData.get('album_artist_name_original')) {
        rebuild(row.cells[3], albumArtistName);
    }
}
