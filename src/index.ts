import { ns } from './constants';
import { appendBulkEditScrobblesHeaderLinkAndMenuItems } from './features/advanced-bulk-edit';
import { createTimestampLinks } from './features/create-timestamp-links';
import { displayAlbumName } from './features/display-album-name';
import { enhanceAutomaticEditsPage } from './features/enhance-automatic-edits-page';

initialize();

function initialize() {
    appendStyle();
    appendBulkEditScrobblesHeaderLinkAndMenuItems(document.body);
    createTimestampLinks(document.body);
    displayAlbumName(document.body);
    enhanceAutomaticEditsPage(document.body);

    // use MutationObserver because Last.fm is a single-page application

    const observer = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
            for (const node of mutation.addedNodes) {
                if (node instanceof Element) {
                    if (node.hasAttribute('data-processed')) {
                        continue;
                    }

                    node.setAttribute('data-processed', 'true');
                    appendBulkEditScrobblesHeaderLinkAndMenuItems(node);
                    createTimestampLinks(node);
                    displayAlbumName(node);
                    enhanceAutomaticEditsPage(node);
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
        .${ns}-title[title] {
            cursor: help !important;
        }

        @media (pointer: coarse), (hover: none) {
            .${ns}-title[title]:focus {
                position: relative;
                display: inline-flex;
                justify-content: center;
            }

            .${ns}-title[title]:focus::after {
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

        .${ns}-collapse-list {
            margin-top: 0;
            padding: 6px 0;
            border: 2px solid #eee;
            border-radius: 3px;
        }

        .${ns}-collapse-list-item {
            display: flex;
        }

        .${ns}-collapse-original-field {
            padding: 0 12px;
            width: 100%;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }

        .${ns}-collapse-list-item input {
            margin: 0 !important;
            padding: 0 12px !important;
            height: 24px !important;
            border: none !important;
            box-shadow: none !important;
        }

        .${ns}-ellipsis {
            display: block;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }

        .${ns}-form-group-controls {
            margin-left: 0 !important;
        }

        .${ns}-list {
            column-count: 2;
        }

        .${ns}-loading {
            background: url("/static/images/loading_dark_light_64.gif") 50% 50% no-repeat;
            height: 64px;
            display: flex;
            justify-content: center;
            align-items: center;
        }

        .${ns}-text-danger {
            color: #d92323;
        }

        .${ns}-text-info {
            color: #2b65d9;
        }

        @media (min-width: 768px) {
            .${ns}-chartlist-scrobbles .chartlist-name {
                margin-top: -2px;
                margin-bottom: 13px;
            }

            .${ns}-chartlist-scrobbles .chartlist-album {
                margin-top: 13px;
                margin-bottom: -2px;
                position: absolute;
                left: 133.5px;
                width: 182.41px;
            }

            .${ns}-chartlist-scrobbles .chartlist-album::before {
                width: 0 !important;
            }
        }

        @media (min-width: 1260px) {
            .${ns}-chartlist-scrobbles .chartlist-album {
                width: 272.41px;
            }
        }

        .${ns}-highlight {
            background-color: #fff9e5;
        }

        .${ns}-highlight:hover {
            background-color: #fcf2cf !important;
        }`;

    document.head.appendChild(style);
}
