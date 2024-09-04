export async function createTimestampLinks(element: Element) {
    const libraryHref = document.querySelector<HTMLAnchorElement>('.secondary-nav-item--library a')?.href;

    if (!libraryHref) {
        return;
    }

    const cells = element.querySelectorAll('.chartlist-timestamp');

    for (const cell of cells) {
        const span = cell.querySelector<HTMLSpanElement>('span[title]');

        if (span === null || span.parentNode !== cell) {
            continue;
        }

        let date: Date;

        if (cell.classList.contains('chartlist-timestamp--lang-en')) {
            date = new Date(Date.parse(span.title.split(',')[0]));
        } else {
            // Languages other than English are not supported.
            continue;
        }

        const dateString = getDateString(date);

        const link = document.createElement('a');
        link.href = `${libraryHref}?from=${dateString}&to=${dateString}`

        cell.insertBefore(link, span);
        link.appendChild(span);
    }
}

function getDateString(date: Date) {
    let s = date.getFullYear() + '-';

    const month = date.getMonth() + 1;
    if (month < 10) s += '0';
    s += month + '-';

    const day = date.getDate();
    if (day < 10) s += '0';
    s += day;

    return s;
}
