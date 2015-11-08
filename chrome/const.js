/** @license
 *
 * This file is part of DocGraph Batea Chrome extension
 *
 * @copyright 2014-2015, The DocGraph Journal.
 * All rights reserved.
 * http://batea.docgraph.org
 *
 * @author Fred Trotter <fred.trotter@gmail.com>
 * @author Andrey Ivanov <andrey.v.ivanov@gmail.com>
 *
 */

/** @fileOverview This is a common place for main project constants */

BASE_URI = "http://batea.docgraph.org/";

WEBSERVICE_BASE_URI = BASE_URI + "API/";
CONSENT_URI = BASE_URI + "consent/?token={0}";
ANONYMOUS_URI = BASE_URI + "study/";
OPTION_REDIRECT_URI = BASE_URI + "extension/";

// Update user variables every 24 hours
STATES_UPDATE_INTERVAL_SEC = 86400;

DAILY_FORM_DISMISS_LIMIT = 2;
TOTAL_FORM_DISMISS_LIMIT = 30;
FORM_DISMISS_SILENT_INTERVAL_SEC = 86400;

FORAGER_INTERVAL_SEC = 120;

// wating 3 seconds after selection before showing the comment popup
COMMENT_POPUP_DELAY_MS = 3000;
POPUP_SEND_HIDE_DELAY_MS = 5000;

POPUP_SHORT_COMMENT_LENGTH = 100;

WIKIPEDIA_DOMAIN = /.*\.wikipedia\.org/;
SEARCH_QUERIES = {
    'search.yahoo.com': 'p',
    'www.bing.com': 'q'
};



// Debugging overrides
WEBSERVICE_BASE_URI = "https://batea.ft1.us/API/";
CONSENT_URI = "https://batea.docgraph.org/consent/?token={0}";

