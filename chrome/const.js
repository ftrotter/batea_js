/** @license
 *
 * This file is part of DocGraph Batea Chrome extension
 *
 * @copyright 2014-2015, The DocGraph Journal.
 * All rights reserved.
 * http://batea.docgraph.com
 *
 * @author Fred Trotter <fred.trotter@gmail.com>
 * @author Andrey Ivanov <andrey.v.ivanov@gmail.com>
 *
 */

/** @fileOverview This is a common place for main project constants */

/**
* A base domain for Batea website URIs
*
* @constant {uri}
* @default
*/
BASE_URI = "https://batea.docgraph.com/";

/**
* URI of consent form to navigate. User id is passed instead of {0} placeholder
*
* @constant {uri}
*/
CONSENT_URI = BASE_URI + "consent/?token={0}";

/**
* URI of webpage opened right after consent form. Installed extension intersepts
* navigation to this URI and opens its options page instead
*
* @constant {uri}
*/
OPTION_REDIRECT_URI = BASE_URI + "extension/";

/**
* Base URI for webservices
*
* @constant {uri}
* @default
*/
WEBSERVICE_BASE_URI = "https://bateaapi.docgraph.com/API/";

/**
* Interval to refresh settings from webservices. Extension refreshes 
* "consented" state and list of clinical URI regex-es. Extension initially 
* refreshes these session right after start, then uses provided interval.
* By default extension does refresh every 24 hours
*
* @constant {integer}
* @default
*/
STATES_UPDATE_INTERVAL_SEC = 86400;

/**
* Daily popup dismiss limit
* Limit includes both forager and commenting popups
*
* @constant {integer}
* @default
*/
DAILY_FORM_DISMISS_LIMIT = 2;

/**
* Timout inteval for auto-disable popup when limit is reached
* This timout survives even browser restart, extension takes this into account
*
* @constant {integer}
* @default
*/
FORM_DISMISS_SILENT_INTERVAL_SEC = 86400;

/**
* Auto-disable popup dismiss limit 
* Limit includes both forager and commenting popups
*
* @constant {integer}
* @default
*/
TOTAL_FORM_DISMISS_LIMIT = 30;

/**
* Inactivity interval for forager detection (in seconds)
*
* @constant {integer}
* @default
*/
FORAGER_INACTIVE_INTERVAL_SEC = 120;

/**
* Height dimensions of popup
*
* @constant {integer}
* @default
*/
POPUP_HEIGHT = 322;

/**
* Width dimensions of popup
*
* @constant {integer}
* @default
*/
POPUP_WIDTH = 362;

/**
* Wiki commenting popup delay in ms. Extnesion does not show popup immediately 
* becuase user may continue to select text for some time. 3 secons seems 
* reasonbale delay
*
* @constant {integer}
* @default
*/
COMMENT_POPUP_DELAY_MS = 3000;

/**
* Hide animation delay after comment sending. It is set in ms
*
* @constant {integer}
* @default
*/
POPUP_SEND_HIDE_DELAY_MS = 5000;

/**
* Maximum number of characters of wiki page selection shown initially by commenting popup
*
* @constant {integer}
* @default
*/
POPUP_SHORT_COMMENT_LENGTH = 100;

/**
* Regex to determine wiki domains. It is applied to URI hostname only
*
* @constant {regex}
* @default
*/
WIKIPEDIA_DOMAIN = /.*\.wikipedia\.org/;

/**
* SERP term extraction map. It includes search engine domain (exact match) as key 
* and URI parameter for search term.
* Google search term is extracted by special function because google may use two 
* parameters in the same time (#q and ?q) and it uses may domains
*
* @constant {regex}
* @default
*/
SEARCH_QUERIES = {
    'search.yahoo.com': 'p',
    'www.bing.com': 'q'
};
