export async function displayAlbumName(element: Element) {
    const rows = element instanceof HTMLTableRowElement ? [element] : [...element.querySelectorAll('tr')];

    const baseHref = document.querySelector('.secondary-nav-item--overview a')!.getAttribute('href')!;

    for (const row of rows) {
        if (row.getAttribute('data-edit-scrobble-id') === null || row.querySelector('.chartlist-album') !== null) {
            continue;
        }

        const coverArtAnchor = row.querySelector<HTMLAnchorElement>('.cover-art')!;
        const albumHref = coverArtAnchor.getAttribute('href');
        const form = row.querySelector<HTMLFormElement>('form[data-edit-scrobble]:not([data-edit-scrobbles])');
        let albumName: string | undefined;

        if (form !== null) {
            const formData = new FormData(form);
            albumName = formData.get('album_name')?.toString();
        } else {
            albumName = coverArtAnchor.querySelector('img')!.alt;
        }

        // Create and insert th element.
        const table = row.closest('table')!
        if (!table.classList.contains('lastfm-bulk-edit-chartlist-scrobbles')) {
            table.classList.add('lastfm-bulk-edit-chartlist-scrobbles');

            const albumHeaderCell = document.createElement('th');
            albumHeaderCell.textContent = 'Album';

            const headerRow = table.tHead!.rows[0];
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
        } else {
            const noAlbumText = document.createElement('em');
            noAlbumText.className = 'lastfm-bulk-edit-text-danger';
            noAlbumText.textContent = 'No Album';
            albumCell.appendChild(noAlbumText);
        }

        const nameCell = row.querySelector('.chartlist-name')!;
        row.insertBefore(albumCell, nameCell.nextElementSibling);

        // Add menu items.
        if (albumHref && albumName) {
            const menu = row.querySelector('.chartlist-more-menu')!;

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

            const artistMenuItem = menu.querySelector('.more-item--artist')!.parentNode;
            menu.insertBefore(albumMenuItem1, artistMenuItem);
            menu.insertBefore(albumMenuItem2, artistMenuItem);
        }
    }
}
