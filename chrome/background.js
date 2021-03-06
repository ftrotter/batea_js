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

/** @fileOverview Main classes for backgroun process of the extension. */

/** 
* A helper class to speed up visit traverse. 
* Instance caches all history and visit items
*
* @constructor
* @this {HistoryCache}
*/
function HistoryCache() {
    /**
    * Mapping of id to {HistoryItem}
    * @private
    * @member array
    */ 
    this._histories = [];
    /** 
    * Mapping of id to {VisitItem}
    * @private
    * @member array
    */ 
    this._visits = [];

    /**
    * Mapping of session id to its state (bool)
    * @private
    * @member array
    */
    this._sessions = [];

    /**
     * Fill cache entries from Chrome. Becuase of asynchronis nature of 
     * Chrome API a callback function is used to notify about completion
     *
     * @param {function} callback function to execute on completion.
     */
    this.refresh = function(callback) {
        var histories = [];
        var allVisits = [];
        var processed = 0;
        var cache = this;
        chrome.history.search({ text: "" }, function(historyItems) {
            for (var i = 0; i < historyItems.length; ++i) {
                var historyItem = historyItems[i];
                histories[historyItem.id] = historyItem;
                
                chrome.history.getVisits({ url: historyItem.url }, function(visits) {
                    for (var i = visits.length - 1; i >= 0; --i) {
                        var visit = visits[i];
                        allVisits[visit.visitId] = visit;
                    }
                    ++processed;
                    if (processed == historyItems.length) {
                        cache._histories = histories;
                        cache._visits = allVisits;
                        if (callback) callback(cache);
                    }
                });
            }
        });
    };

    /**
    * get session for passed visit
    *
    * @param {VisitItem} visit to find session for.
    * @return {number} id of topmost visit or 0 if passed visit id is invalid
    */
    this.getSession = function(visit) {
        var id = visit.referringVisitId > 0 ? visit.referringVisitId : visit.visitId;
        var visit = this._visits[id];

        if (visit === undefined) {
            return 0;
        }
        var session = id;
        while (visit.referringVisitId > 0 && 
               this._visits[visit.referringVisitId] !== undefined) {
            session = visit.referringVisitId;
            visit = this._visits[session];
        }
        return session;
    };

    /**
    * get HistoryItem for passed visit
    *
    * @param {VisitItem} visit to find associated history item.
    * @return {HistoryItem} found item or undefined
    */
    this.getHistory = function(visit) {
        return this._histories[visit.id];
    };

    /**
    * get VisitItem for passed visit id
    *
    * @param {id} id to find associated visit item.
    * @return {VisitItem} found item or undefined
    */
    this.getVisitById = function(id) {
        return this._visits[id];
    };

    /**
    * get maximum available visit id
    *
    * @return {number}
    */
    this.getVisitCount = function() {
        return this._visits.length;
    };

    /**
    * add new {HistoryItem} entry to the cache
    *
    * @param {HistoryItem} history item to add
    */
    this.addHistory = function(history) {
        this._histories[history.id] = history;
    };

    /**
    * add new {visitItem} entry to the cache
    *
    * @param {visitItem} history item to add
    */
    this.addVisit = function(visit) {
        this._visits[visit.visitId] = visit;
    };
    return this;
}

/**
* Helper function to obtain the hostname only from passed url
*
* @param {string} url Full url to process
* @return {string}
*/
function getHost(url) {
    return $('<a>').prop('href', url).prop('hostname');
}

/**
* Helper function to safely handle undefined value during JSON.parse
*
* @param {string} value to parse
* @param {object} defaultValue to return if value is undefined
* @return {object}
*/
function safeParseJSON(value, defaultValue) {
    try {
        if (value !== undefined) {
            return JSON.parse(value);
        }
    } catch (e) {
    }
    return defaultValue;
}

/** 
* This class combines extension logic into single instance
*
* @constructor
* @this {VisitProcessor}
*/
function VisitProcessor() {
    /**
    * load unique extension id from localStorage
    * @member string
    */
    this.Id = localStorage.id;
    this._consented = safeParseJSON(localStorage.consented, false);
    this.setClinicalUrls(safeParseJSON(localStorage.clinicalRegex, {}));

    this._dismisses = safeParseJSON(localStorage.dismisses, 0);
    this._sessionDismisses = 0;

    this._allowPopup = safeParseJSON(localStorage.allowPopup, true);
    var sleepTime = safeParseJSON(localStorage.dismissesExpire, 0) - Date.now();
    if (sleepTime > 0) {
        this._allowPopup = false;
        setTimeout(function() {
            localStorage.removeItem("dismissesExpire");
            processor._allowPopup = true;
        }, sleepTime);
    }

    /**
    * Cache of is_clinical.php call results to avoid extra network activity
    * @private
    * @member object
    */ 
    this._clinicalUrlChecks = {};

    /**
    * Request queue to avoid duplicate queries to webserver
    * @private
    * @member array
    */ 
    this._clinicalUrlRequests = [];

    /**
    * Store pair {tabid, url} for recently updated tabs
    * @private
    * @member array
    */ 
    this._recentTabs = [];

    /**
    * Map between tabId and {VisitItem} of currently visible tabs
    * @private
    * @member array
    */ 
    this._tab2Visit = [];

    /**
    * this variable stores donation state for a sessions
    * @private
    * @member Array
    */
    this._sessions = [];

    /**
    * this variable stores mapping between tabId and visit. 
    * It is filled from _tab2Visit when tab has been updated
    * @private
    * @member Array
    */
    this._lastTab2Visit = [];

    /**
    * List of already donated sessions
    * @private
    * @member Array
    */
    this._donatedSessions = safeParseJSON(localStorage.donatedSessions, []);

    /**
    * List of sessions already excluded by user
    * @private
    * @member Array
    */
    this._excludedSessions = safeParseJSON(localStorage.excludedSessions, []);

    /**
    * Common cache object to lookup history items quickly
    * @private
    * @member {HistoryCache}
    */
    this._cache = new HistoryCache();

    /**
    * map to track search query associated to session
    * @private
    * @member Array
    */
    this._foragerSearchQuery = [];

    /**
    * map to track session forager state (true/false)
    * @private
    * @member Array
    */
    this._foragerSessions = [];

    /**
    * map to track started forager timers
    * @private
    * @member Array
    */
    this._foragerTimers = [];

    /**
    * map to track wiki config associated with session
    * @private
    * @member Array
    */
    this._foragerMwConfig = [];

    var processor = this;
    // Updated state with possible consent state change then processes history
    processor.updateStates(function() {
        // Now we need to fill cache first time, only after this we can handle new requests
        processor._cache.refresh(function() {
            processor._attachListeners();
        });
    });
}

/**
* Handler function for chrome.runtime.onMessage Chrome API event
* 
* @param {object} message to receive
* @param {object} sender information
* @param {callback} callback function to send response to sender
* @return {bool} true to respond asynchronisouly, false if response provided by the function
*/
VisitProcessor.prototype.__onMessage = function(message, sender, sendResponse) {
    if (message.message == "popupWikiComment") {
        // save wiki comment context and show comment popup
        this.commentInitData = {
            uri: sender.tab.uri,
            title: message.title,
            selection: message.selection,
            config: message.config,
        };
        if (this.isPopupAllowed()) {
            this.showPopup(sender.tab.id, "comment.html");
        }
    } else if (message.message == "initCommentPopup") {
        // provide wiki comment context to popup iframe
        sendResponse(this.commentInitData);
        return false;
    } else if (message.message == "initForagerPopup") {
        // check if call has been made from popup within tab iframe
        if ("tab" in sender) {
            sendResponse(processor._getForagerPopupData(sender.tab.id, false));
            return false;
        }
        chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
            sendResponse(processor._getForagerPopupData(tabs[0].id, true));
        });
        return true;
    } else if (message.message == "hidePopup") {
        // check if call has been made from popup within tab iframe
        if ("tab" in sender) {
            this.hidePopup(sender.tab.id, false);
        }
        this.onDismissForm();
    } else if (message.message == "setPopupHeight") {
        // adjust popup height based on provided value
        this.setPopupHeight(sender.tab.id, message.height);
    } else if (message.message == "postComment") {
        // post wiki comment to server
        this.postWikiComment(message.uri, message.config, message.comment, message.selection);
        this.hidePopup(sender.tab.id, true);
    } else if (message.message == "postForager") {
        // post forager comment to server
        this.postForagerComment(message.uri, message.config, message.comment);
        if ("tab" in sender) {
            this.hidePopup(sender.tab.id, true);
        }
    } else if (message.message == "toggleDonation") {
        // toggle donation state for current tab
        if ("tab" in sender) {
            processor._toggleDonation(sender.tab.id, message.state);
        } else {
            chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
                processor._toggleDonation(tabs[0].id, message.state);
            });
        }
    }
    sendResponse({});
    return false;
}

/**
* Handler function for chrome.history.OnVisited Chrome API event
*
* @param {HistoryItem} historyItem of recent visit
*/
VisitProcessor.prototype.__onVisited = function(historyItem) {
    var url = historyItem.url;
    var lastVisitTime = historyItem.lastVisitTime;
    var processor = this;

    // first we need to add new history and visit items
    this._cache.addHistory(historyItem);
    this._findVisit(url, lastVisitTime, function(visit) {
        this._cache.addVisit(visit);

        var tabId = this._findRecentTab(url);
        if (tabId >= 0) {
            if (this._tab2Visit[tabId] != null) {
                console.log("Bad tab2visit entry");
                console.log(this._tab2Visit[tabId]);
            }

            // We need to rebuild hierarchy if Chrome does not provide parent
            this.rebuildHierarchy(tabId, visit, function(visit) {
                this.processVisit(tabId, url, visit);
            });

        } else {
            console.log("visit is not associated with a tab!");
            console.log(historyItem);
            // TODO: check if visit is belong to any active session still.
            // TODO: verify if this is clinical url
        }
    });

}

/**
* Handler function for chrome.tabs.OnUpdated Chrome API event
*
* @param {Tab} tab updated tab information
*/
VisitProcessor.prototype.__onLoading = function(tab) {
    if (tab.url == OPTION_REDIRECT_URI) {
        chrome.tabs.update(tab.id, { url: chrome.extension.getURL("options.html") });
        return;
    }
    this._recentTabs.push({ tabId: tab.id, url: tab.url });

    var lastVisit = this._tab2Visit[tab.id];
    if (lastVisit !== undefined) {
        // check if it was last session tab
    }
    this._saveLastTabVisit(tab.id);
}

/**
* Handler function for chrome.tabs.OnUpdated Chrome API event
*
* @param {Tab} tab updated tab information
*/
VisitProcessor.prototype.__onCompleted = function(tab) {
    if (tab.active) {
        this._checkForForagerSession(tab.id, tab.url);
    }
}

/**
* Handler function for chrome.tabs.onActivated Chrome API event
*
* @param {ActiveInfo} activeInfo information about active tab and window
*/
VisitProcessor.prototype.__onActivated = function(activeInfo) {
    chrome.tabs.get(activeInfo.tabId, function(tab) {
        if (tab.status == "complete") {
            processor._checkForForagerSession(tab.id, tab.url);
        }
    });
}

/**
* Handler function for chrome.tabs.OnRemoved Chrome API event
*
* @param {number} tabId closed tab id
*/
VisitProcessor.prototype.__onRemoved = function(tabId) {
    // prepare reference for _checkForCompletedSession
    this._saveLastTabVisit(tabId);
    this._checkForCompletedSession(tabId, -1);
}

/**
* Handler function for chrome.pageAction.onClicked Chrome API event
*
* @param {Tab} tab object associated with page action
*/
VisitProcessor.prototype.__onIconClicked = function(tab) {
    var visit = this._tab2Visit[tab.id];
    // First check if we have visit associated with the tab
    if (visit != null) {
        // get current session state
        var session = this._cache.getSession(visit);
        processor.showPopup(tab.id, "forager.html");
    }
}

/**
* find recent tab by url. This function may be called only once because
* this is intended to avoid possible incorrect associations by further 
* navigations
*
* @private
* @param {string} url to find
* @return {number} found id of tab or -1
*/
VisitProcessor.prototype._findRecentTab = function(url) {
    for (var i = this._recentTabs.length - 1; i >= 0; --i) {
        var tabInfo = this._recentTabs[i];
        if (tabInfo.url == url) {
            // remove processed entry, we should not associate it second 
            // time with another visit entry
            this._recentTabs.splice(i, 1);
            return tabInfo.tabId;
        }
    }
    return -1;
}

/**
* associate visit with passed tab
*
* @private
* @param {number} tabID to associate
* @param {VisitItem} visit to associate
*/
VisitProcessor.prototype._setTabVisit = function(tabId, visit) {
    this._tab2Visit[tabId] = visit;
}

/**
* Looking for a VisitItem with provided url and visitTime. Note: this check is asynchronious
*
* @private
* @param {string} url of the visit
* @param {number} visitTime the visit
* @param {function} foundCallback to be called if VisitItem found. Found {VisitItem} will be passed to callback
*/
VisitProcessor.prototype._findVisit = function(url, visitTime, foundCallback) {
    var processor = this;
    chrome.history.getVisits({ url: url }, function(visitItems) {
        for (var i = visitItems.length - 1; i >= 0; --i) {
            var visit = visitItems[i];
            if (visit.visitTime == visitTime) {
                foundCallback.call(processor, visit);
                   return;
            }
        }
    });
}

/**
* Checking entire Chrome history for new clinical url and post them
* Function takes into account previously processed items and do not 
* post them second time
*/
VisitProcessor.prototype.findNewVisits = function() {
    // Get last processed visit index from localStorage
    var lastProcessedVisit = localStorage.lastProcessedVisit;
    if (lastProcessedVisit === undefined) {
        lastProcessedVisit = 0;
    }
    var processor = this;
    // Get most recent visit index
    var visitCount = this._cache.getVisitCount();
    for (var i = lastProcessedVisit; i <= visitCount; ++i) {
        var visit = this._cache.getVisitById(i);
        if (visit) {
            var session = this._cache.getSession(visit);
            // First check if session already processed
            if (session > 0 &&
                this._donatedSessions.indexOf(session) < 0 &&
                this._excludedSessions.indexOf(session) < 0) {
                var history = this._cache.getHistory(visit);
                this.checkForClinicalUrl(history.url, session, function(session) {
                    // url is medical, set session state to donatable
                    // set icon for all affected session tabs
                    processor.donateSession(session);
                });
            }
        }
    }
    // save last processed visit index to localStorage
    localStorage.lastProcessedVisit = visitCount;
}

/**
* Checking if passed url is clinical. Note: this check is asynchronious
*
* @private
* @param {string} url to check
* @param {number} session id  associated with the url
* @param {function} callback to be called if url is clinical. session vlaue is passed as parameter to callback
*/
VisitProcessor.prototype.checkForClinicalUrl = function(url, session, callback) {
    var host = getHost(url);
    // Check for nih sub-domains first
    if (this.testClinicalUrl(url, host)) {
        callback(session);
    } else {
        this.isClinicalWiki(url, session, callback);
    }
}

/**
* Set clinical url regex-es
*
* @param {array of string} regexes to use
*/
VisitProcessor.prototype.setClinicalUrls = function(regexes) {
    //regexes = ["^(?:http(?:s)?://)?(?:[^\.]+\.)?nih\.gov/.*"];
    localStorage.clinicalRegex = JSON.stringify(regexes);
    this.ClinicalUrlsRE = [];
    for (var i = 0; i < regexes.length; ++i) {
       var re = new RegExp(regexes[i], "i");
       this.ClinicalUrlsRE.push(re)
    }
}

/**
* Set clinical url regex-es
*
* @param {array of string} regexes to use
*/
VisitProcessor.prototype.testClinicalUrl = function(url, host) {
    for (var i = 0; i < this.ClinicalUrlsRE.length; ++i) {
       if (this.ClinicalUrlsRE[i].test(url)) {
           return true;
       }
    }
    return false;
}

/**
* Helper function to update checkClinicalWiki flag
* @param {bool} clinicalOnly is a checkClinicalOnlyWiki flag value
*/
VisitProcessor.prototype.setCheckClinicalOnlyWiki = function(clinicalOnly) {
    localStorage.checkClinicalOnlyWiki = clinicalOnly;
}

/**
* Helper function to check clinicalWiki flag
*/
VisitProcessor.prototype.checkClinicalOnlyWiki = function() {
    return safeParseJSON(localStorage.checkClinicalOnlyWiki, true);
}

/**
* Checking if passed url is clinical. Note: this check is asynchronious
*
* @private
* @param {string} url to check
* @param {number} session id  associated with the url
* @param {function} callback to be called if url is clinical. session vlaue is passed as parameter to callback
* @param {function} nonClinicalCallback to be called if url is not clinical. session vlaue is passed as parameter to callback
*/
VisitProcessor.prototype.isClinicalWiki = function(url, session, callback, nonClinicalCallback) {
    var host = getHost(url);
    var processor = this;
    var is_clinical = false;
    if (WIKIPEDIA_DOMAIN.test(host)) {
        if (!processor.checkClinicalOnlyWiki()) {
            is_clinical = true;
        } else {
            // Add to list to avoid duplicate qqueries to webserver
            processor._clinicalUrlRequests.push({
                url: url,
                session: session,
                callback: callback,
                nonClinicalCallback: nonClinicalCallback
            });

            if (processor._clinicalUrlRequests.length == 1) {
                processor.queryClinicalUrl();
            }
            return;
        }
    }

    if (is_clinical) {
        callback(session);
    } else if (nonClinicalCallback) {
        nonClinicalCallback(session);
    }
}

/**
* Query webserver for clinical url.
*
* @private
* @param {string} url to check
* @param {number} session id  associated with the url
* @param {function} callback to be called if url is clinical. session vlaue is passed as parameter to callback
* @param {function} nonClinicalCallback to be called if url is not clinical. session vlaue is passed as parameter to callback
*/
VisitProcessor.prototype.queryClinicalUrl = function() {
    if (processor._clinicalUrlRequests.length == 0) {
        return;
    }
    var query = processor._clinicalUrlRequests[0];
    // TODO: Save this map to cache instead of session?
    // Check if we queried webservice with passed url already
    if (processor._clinicalUrlChecks.hasOwnProperty(query.url)) {
        if (processor._clinicalUrlChecks[query.url]) {
            query.callback(query.session);
        } else if (query.nonClinicalCallback) {
            query.nonClinicalCallback(query.session);
        }
        processor._clinicalUrlRequests.shift();
        processor.queryClinicalUrl();
    } else {
        // Query webservice with passed url
        var webserviceUrl = WEBSERVICE_BASE_URI + "isURLClinical/" + btoa(query.url);
        $.ajax(webserviceUrl, { dataType:"json", success: function(result) {
            processor._clinicalUrlChecks[query.url] = result.is_clinical;
            if (result.is_success && result.is_clinical) {
                query.callback(query.session);
            } else if (query.nonClinicalCallback) {
                query.nonClinicalCallback(query.session);
            }
            processor._clinicalUrlRequests.shift();
            processor.queryClinicalUrl();
        }});
    }
}

/**
* Helper function to extract mwConfig from wiki scripts
* 
* @param {int} tabId to get scripts from
* @param {callback} callback function to process scripts extracted asynchroniusly from page
*/
VisitProcessor.prototype.getTabMwConfig = function(tabId, callback) {
    var code = "$('head script').text()"
    chrome.tabs.executeScript(tabId, { code: code }, function(res) {
        var script = res[0];
        if (script != null && script.length > 20) {
            var start = script.indexOf("mw.config.set({");
            if (start >= 0) {
                start += 14;
                var end = script.indexOf("});", start);
                callback(script.substr(start, end - start + 1));
            } else {
                callback("{}");
            }
        } else {
            callback("{}");
        }
    });
}

/**
* Parses passed url to extract search query
*
* @private
* @param {url} url to process
* @return search query string or null if it is not determined
*/
VisitProcessor.prototype.getSearchQuery = function(url){
    var host = getHost(url);
    // Sepcial case for google
    if (host.indexOf("www.google.") == 0) {
        var query = $.url('#q', url);
        if (query != null) {
            return query;
        }
        return $.url('?q', url);
    }

    if (host in SEARCH_QUERIES) {
        return $.url('?' + SEARCH_QUERIES[host], url);
    }
    return null;
}

/**
* Process new user visit. This is main logic method
*
* @private
* @param {number} tabId of the visit associated tab
* @param {string} url of the visit
* @param {VisitItem} visit details of the visit
*/
VisitProcessor.prototype.processVisit = function(tabId, url, visit) {
    // we need to handle new visit in few steps
    // associate visit with found tab
    this._setTabVisit(tabId, visit);

    // check visit's session state
    var session = this._cache.getSession(visit);
    console.log("Session #" + session + " -> " + url);
    if (session > 0) {
        var state = this._sessions[session];
        // set page icon based on session state
        this._setTabState(tabId, state);
        if (state === undefined) {
            // visit's session state is no defined yet
            // so let test for clinical url
            this.checkForClinicalUrl(url, session, function(session) {
                console.log("Session is donatable");
                // url is medical, set session state to donatable
                // and set icon for all affected session tabs
                processor._setSessionState(session, true);
            });
        }
    }
    processor._checkForCompletedSession(tabId, session);
    processor._checkForForagerSession(tabId, url);
}

/**
* check if session completed for passed tabId
*
* @param {number} tabId to check for completed session
* @param {number} session currently associated with tabId
*/
VisitProcessor.prototype._checkForCompletedSession = function(tabId, session) {
    // Check if recent tab visit's session completed with lastrecent navigations
    var associations = this._lastTab2Visit;
    for (var i = associations.length - 1; i>= 0; --i) {
        var association = associations[i];
        if (association.tabId == tabId) {
            // erase the entry
            this._lastTab2Visit.splice(i, 1);
            var lastSession = this._cache.getSession(association.visit);
            // lastSession could be 0 if user navigates quickly
            if (lastSession != 0 && session != lastSession) {
                // check if session is active still
                if (!this._isSessionActive(lastSession)) {
                    // now we can process this session
                    this.processCompletedSession(lastSession);
                }
            }
        }
    }
}


/**
* Common method to save association information about for passed tabId
*
* @param {number} tabId to save data
*/
VisitProcessor.prototype._saveLastTabVisit = function(tabId) {
    // record last tab visit to find completed session
    var visit = this._tab2Visit[tabId];
    if (visit != null) {
        this._lastTab2Visit.push({ tabId: tabId, visit: visit });
        // now mark the associatation as invalid
        this._tab2Visit[tabId] = null;
    }
}

/**
* Special function to determine parent visit if Chrome hides it
*
* @param {number} tabId of the visit
* @param {VisitItem} visit to processs
* @param {callback} callback for visit to processs
*/
VisitProcessor.prototype.rebuildHierarchy = function(tabId, visit, callback) {
    var processor = this;
    if (visit.referringVisitId != 0 || visit.transition != "link") {
        callback.call(processor, visit);
        return;
    }
    
    var associations = this._lastTab2Visit;
    for (var i = associations.length - 1; i>= 0; --i) {
        var association = associations[i];
        if (association.tabId == tabId) {
            console.log("Associate recent visit of the tab as parent");
            visit.referringVisitId = association.visit.visitId;
            callback.call(processor, visit);
            return;
        }
    }

    // Looking for active tab in the same window and associate it as parent
    chrome.tabs.get(tabId, function(tab) {
        chrome.tabs.query({active: true, windowId: tab.windowId}, function(tabs) {
            if (tabs.length == 1) {
                var parentVisit = processor._tab2Visit[tabs[0].id];
                if (parentVisit != null && parentVisit !== undefined) {
                    console.log("Associate active tab visit as parent for newly opened tab");
                    visit.referringVisitId = parentVisit.visitId;
                }
            }
            callback.call(processor, visit);
            return;
        });
    });
}

/**
* Process completed session
*
* @param {number} session to process
*/
VisitProcessor.prototype.processCompletedSession = function(session) {
    // Get session state first
    var state = processor._sessions[session];
    if (state === undefined) {
        console.log("Ignore completed session #" + session);
        return;
    }
    if (!session) {
        console.log("Exclude completed session #" + session);
        // add excluded session id to list and save it permanently
        this._excludedSessions.push(session);
        localStorage.excludedSessions = JSON.stringify(this._excludedSessions);
        return;
    }

    // This is donatable session
    this.donateSession(session);
}

/**
* Donate session
*
* @param {number} session to process
*/
VisitProcessor.prototype.donateSession = function(session) {
    console.log("Donating completed session #" + session);
    // add donatable session id to list and save it permanently
    this._donatedSessions.push(session);
    localStorage.donatedSessions = JSON.stringify(this._donatedSessions);

    var urls = [];
    var urlIds = [];
    var visits = [];

    // iterate over visits in the cache to find all visits 
    // related to the session
    var visitCount = this._cache.getVisitCount();
    for (var i = 0; i <= visitCount; ++i) {
        var visit = this._cache.getVisitById(i);
        if (visit) {
            var visitSession = this._cache.getSession(visit);
            // first check if a session matches
            if (visitSession == session) {
                visits.push(this.convertVisitItem(visit));
                // check if history item is not added yet
                if (urlIds.indexOf(visit.id) < 0) {
                    urlIds.push(visit.id);
                    var history = this._cache.getHistory(visit);
                    urls.push(this.convertHistoryItem(history));
                }
            }
        }
    }

    // post collected data to webservice
    this.postSession(urls, visits);
}

/**
* Post session url tree to the webserver
*
* @param {array} urls of the session to post
* @param {array} visits of the session to post
*/
VisitProcessor.prototype.postSession = function(urls, visits) {
    var data = {
        "url_tree": { chrome_urls: urls, chrome_visits: visits },
        "user_token": this.Id
    };
    var webserviceUrl = WEBSERVICE_BASE_URI + "Donator/" + this.Id + "/historyTree/new";
    $.ajax(webserviceUrl, { 
        dataType:"json",
        type: "POST",
        data: data,
        success: function(result) {
        }
    });
}

/**
* Convert Chrome internal {HistoryItem} object into 
* url JSON object compatible with the server
*
* @param {HistoryItem} item to convert
* @param {object} url object ready to post to webserver
*/
VisitProcessor.prototype.convertHistoryItem = function(item) {
    // convert only avaialble fields
    return {
        url_id: item.id,
        url: item.url,
          title: item.title,
          visit_count: item.visitCount,
          typed_count:  item.typedCount,
          last_visit_time: item.lastVisitTime
    };
}

/**
* Convert Chrome internal {VisitItem} object into 
* visit JSON object compatible with the server
*
* @param {VisitItem} item to convert
* @param {object} url object ready to post to webserver
*/
VisitProcessor.prototype.convertVisitItem = function(item) {
    // convert only avaialble fields
    return {
        visit_id: item.visitId,
        url_id: item.id,
        visit_time: item.visitTime,
        from_visit: item.referringVisitId,
        transition: item.transition
    };
}

/**
* Helper function to get page action icon image based on passed session state
*
* @param {bool} state of the session
* @return {string} path to icon image
*/
VisitProcessor.prototype._getStateIcon = function(state) {
    if (state) {
        return { "19": "img/icon-on-19.png", "38": "img/icon-on-38.png" };
    }
    if (state !== undefined) {
        return { "19": "img/icon-off-19.png", "38": "img/icon-off-38.png" };
    }
    return { "19": "img/icon-none-19.png", "38": "img/icon-none-38.png" };
}

/**
* Update passed tab icon state based on donatable state
*
* @param {number} tabId to process
* @param {bool} state of the session to show
*/
VisitProcessor.prototype._setTabState = function(tabId, state) {
    chrome.pageAction.setIcon({ tabId: tabId, path: this._getStateIcon(state) });
    chrome.pageAction.show(tabId);
}

/**
* Set donatable state for session and update associated session tabs
*
* @param {number} session to process
* @param {bool} state of the session to show
*/
VisitProcessor.prototype._setSessionState = function(session, state) {
    this._sessions[session] = state;
    for (var i = 0; i < this._tab2Visit.length; ++i) {
        var visit = this._tab2Visit[i];
        if (visit != null && this._cache.getSession(visit) == session) {
            this._setTabState(i, state);
        }
    }
}

/**
* Check if any associated tab exists for passed session
*
* @param {number} session to process
* @return {bool} true if session is active still
*/
VisitProcessor.prototype._isSessionActive = function(session) {
    for (var i = 0; i < this._tab2Visit.length; ++i) {
        var visit = this._tab2Visit[i];
        if (visit != null && this._cache.getSession(visit) == session) {
            // session is active still
            return true;
        }
    }
    // no tabs associated with the session
    return false;
}

/**
* Check for forager session
*
* @param {int} tabId of analyzed tab
* @param {string} url of the tab
*/
VisitProcessor.prototype._checkForForagerSession = function(tabId, url) {
    // 1. We need to find session id
    var visit = this._tab2Visit[tabId];
    if (visit == undefined) {
        return;
    }
    var session = this._cache.getSession(visit);
    var state = this._sessions[session];

    // 2. resetTimeout() for existing forager timers
    clearTimeout(this._foragerTimers[session]);

    // 3. check for clinical wiki and set flag if needed
    var host = getHost(url);
    this.isClinicalWiki(url, session,
        function(session) {
           processor._foragerSessions[session] = true;
           processor.getTabMwConfig(tabId, function(config) {
               processor._foragerMwConfig[session] = config;
           });
        },
        function(session) {
            // 4. extract search query for passed url
            var searchQuery = processor.getSearchQuery(url);
            if (searchQuery != null) {
                // and reset forager state if search query has been changed
                if (processor._foragerSearchQuery[session] != searchQuery) {
                   processor._foragerSearchQuery[session] = searchQuery;
                   processor._foragerSessions[session] = false;
                }
                return;
            }
            // 5. setTimeout if clinical wiki flag is set
            if (processor._foragerSessions[session]) {
                // 6. do not consider pages as forager to which user havigates from wiki pages
                var referrerVisit = processor._cache.getVisitById(visit.referringVisitId);
                console.log(referrerVisit);
                if (referrerVisit != undefined) {
                    var referrerHistory = processor._cache.getHistory(referrerVisit);
                    console.log(referrerHistory);
                    console.log(getHost(referrerHistory.url));
                    if (WIKIPEDIA_DOMAIN.test(getHost(referrerHistory.url))) {
                        //console.log("Referrer is a wikipedia page");
                        return;
                    }
                }

                console.log("Set forager timeout");
                processor._foragerTimers[session] = setTimeout(function() {
                    // show forager form
                    var config = processor._foragerMwConfig[session];
                    var configObject = JSON.parse(config);
                    if (this.isPopupAllowed()) {
                        processor.showPopup(tabId, "forager.html");
                    }
                }, FORAGER_INACTIVE_INTERVAL_SEC * 1000);
            }
        });

}

/**
* Update clinical URL from webserver
*
* @param {callback} callback to call on webservice call completion
*/
VisitProcessor.prototype.updateClinicalUrls = function(callback) {
    // update clinical domains list
    webserviceUrl = WEBSERVICE_BASE_URI + "clinicalURLStubs";
    $.ajax(webserviceUrl, {
        dataType: "json",
        type: "GET",
        data: {},
        success: function(result) {
            if (result.is_success) {
                processor.setClinicalUrls(result.clinicalURLRegex);
            }
            callback();
    }});
}

/**
* Generate unique id for extnesion (take it form the webserver). It will be used as user token for webserver posts
*
* @param {callback} callback to call on webservice call completion
*/
VisitProcessor.prototype.generateId = function(callback) {
    var data = {};
    var webserviceUrl = WEBSERVICE_BASE_URI + "DonatorToken/new";
    $.ajax(webserviceUrl, {
        dataType: "json",
        type: "POST",
        data: data,
        success: function(result) {
            if (result.is_success) {
                processor.setId(result.DonatorToken);
            }
            callback();
            processor.onFirstRun(true);
    }});
}

/**
* Update update user consented state from webserver
*
* @param {callback} callback to call on webservice call completion
*/
VisitProcessor.prototype.updateConsentedState = function(callback) {
    var webserviceUrl = WEBSERVICE_BASE_URI + "Donator/" + this.Id;
    $.ajax(webserviceUrl, { dataType: "json",
                            type: "GET",
                            data: {}, success: function(result) {
        if (result.is_success) {
            processor._consented = result.is_consented;
            localStorage.consented = result.is_consented;
            localStorage.email_provided = result.email_provided;
        }
        callback();
    }});
}

/**
* Update user states from webserver
*
* @param {callback} callback to call once all states have been updated
*/
VisitProcessor.prototype.updateStates = function(callback) {
    var processor = this;
    processor.updateClinicalUrls(function() {
        if (processor.Id == undefined) {
            chrome.storage.sync.get(null, function(items){
                if ('id' in items) {
                    processor.Id = localStorage.id = items.id;
                    processor.updateConsentedState(function() {
                        callback();
                        processor.onFirstRun(false);
                    });
                } else {
                    processor.generateId(callback);
                }
            });
        } else {
            processor.updateConsentedState(callback);
        }
    });

    // setup next states update in 24 hours
    setTimeout(function() { processor.updateStates(); }, 
        STATES_UPDATE_INTERVAL_SEC * 1000);
}

/**
* Assign and save id as user token
*
* @param {string} id new token value to save
*/
VisitProcessor.prototype.setId = function(id) {
    this.Id = id;
    localStorage.id = this.Id;
    chrome.storage.sync.set({
      'id': id
    });
}

/**
* get email flag for user
*
* @return {bool} true is user provided email already
*/
VisitProcessor.prototype.emailProvided = function() {
    return safeParseJSON(localStorage.email_provided, false);
}

/**
* Save user settings to webserver
*
* @param {object} data to send to webserver
* @param {callback} callback to call once information posed to the webserver
*/
VisitProcessor.prototype.saveSettings = function(data, callback) {
    var webserviceUrl = WEBSERVICE_BASE_URI + "Donator/" + this.Id + "/saveSettings";
    $.ajax(webserviceUrl, {
        dataType: "json",
        type: "POST",
        data: data,
        success: function(result) {
            if (callback) {
                callback(result.is_success);
            }
    }});
}

/**
* Helper function to track forager or comment popups closing without commenting
*/
VisitProcessor.prototype.onDismissForm = function() {
    ++this._dismisses;
    localStorage.dismisses = this._dismisses;
    if (this._dismisses >= TOTAL_FORM_DISMISS_LIMIT) {
        // stop showing forms
        this._allowPopup = false;
        return;
    }

    ++this._sessionDismisses;
    if (this._sessionDismisses < DAILY_FORM_DISMISS_LIMIT) {
        // TODO: set timer to decrease the counter
        return;
    }
    this._sessionDismisses = 0;

    this._allowPopup = false;
    localStorage.dismissesExpire = Date.now() + FORM_DISMISS_SILENT_INTERVAL_SEC * 1000;
    setTimeout(function() {
        localStorage.removeItem("dismissesExpire");
        processor._allowPopup = true;
    }, FORM_DISMISS_SILENT_INTERVAL_SEC * 1000);
}

/**
* Helper function to update allowPopup flag
*
* @param {bool} allow is a new value for the "allow popup" flag
*/
VisitProcessor.prototype.setAllowPopup = function(allow) {
    this._allowPopup = allow;
    localStorage.allowPopup = allow;
    if (allow) {
        // stop showing forms
        localStorage.dismisses = 0;
        this._dismisses = 0;
        this._sessionDismisses = 0;
    }

    clearTimeout(localStorage.dismissesExpire);
    localStorage.removeItem("dismissesExpire");
}

/**
* Helper function to get allowPopup flag
*
* @return {bool} current "allow popup" flag value
*/
VisitProcessor.prototype.isPopupAllowed = function() {
    return this._allowPopup;
}

/**
* Helper function to inject popup to tab content
*
* @param {int} tabId is id of tab to inject the iframe
* @param {string} page is filename of extension HTML page to inject as popup
*/
VisitProcessor.prototype.showPopup = function(tabId, page) {
    var floating = '<div id="bateaPopup" style="right: 10px; top: 30px; border: 0px none; position: fixed; z-index: 1000000000; display: none;">'
    + '<div><iframe src="' + chrome.extension.getURL(page) + '" style="height: ' + POPUP_HEIGHT + 'px; width: ' + POPUP_WIDTH + 'px; padding: 0px; margin: 0px;"></iframe></div></div>';

    var code = '$("#bateaPopup").remove();$("body").append(\'' + floating + '\');$("#bateaPopup").show(400);'

    chrome.tabs.executeScript(tabId, { file: "lib/jquery-2.1.1.js" }, function() {
        chrome.tabs.executeScript(tabId, { code: code });
    });
}

/**
* Helper function to remove Batea popup from tab content
*
* @param {int} tabId is id of tab to remobe the popup
* @param {bool} fade is set to true to apply fade animation for reming popup
*/
VisitProcessor.prototype.hidePopup = function(tabId, fade) {
    var code = '$("#bateaPopup").hide(400, function(){ $("#bateaPopup").remove(); });'
    if (fade) {
        code = '$("#bateaPopup").fadeOut(' + POPUP_SEND_HIDE_DELAY_MS + ', function(){ $("#bateaPopup").remove(); });'
    }
    chrome.tabs.executeScript(tabId, { code: code });
}

/**
* Helper function to adjust Batea popup height within tab
*
* @param {int} tabId is id of tab to process
* @param {int} height of iframe content
*/
VisitProcessor.prototype.setPopupHeight = function(tabId, height) {
    var code = '$("#bateaPopup iframe").height(' + (height + 6) +');'
    chrome.tabs.executeScript(tabId, { code: code });
}

/**
* Helper function to fill data for forager popup
*
* @param {int} tabId is id of tab to show forager popup
* @param {bool} isPageAction is set to true if popup is shown by page action click
*/
VisitProcessor.prototype._getForagerPopupData = function(tabId, isPageAction) {
    var initData = {};
    var visit = this._tab2Visit[tabId];
    if (visit != undefined) {
        var session = this._cache.getSession(visit);
        var config = processor._foragerMwConfig[session];
        initData.title = safeParseJSON(config, {})["wgTitle"];
        initData.hasWiki = initData.title != undefined;
        initData.donationState = processor._sessions[session];
        initData.isPageAction = isPageAction;
    }
    return initData;
}

/**
* Helper function to set new donation state for passed tabId
*
* @param {int} tabId is id of tab to process
* @param {bool} state of donatable session
*/
VisitProcessor.prototype._toggleDonation = function(tabId, state) {
    var visit = this._tab2Visit[tabId];
    // First check if we have visit associated with the tab
    if (visit != null) {
        // get current session state
        var session = this._cache.getSession(visit);
        // and update icons for every session's tab
        this._setSessionState(session, state);
    }
}

/**
* post forager comment to webservice
*
* @param {string} wikiUri is a page uri
* @param {string} wikiConfig is a wiki "mw.config" JSON object
* @param {string} comment to post
*/
VisitProcessor.prototype.postForagerComment = function(wikiUri, wikiConfig, comment) {
    var data = {
        user_comment: comment,
        last_wikipedia_url: wikiUri,
        mw_config_set_results: wikiConfig
    };
    var webserviceUrl = WEBSERVICE_BASE_URI + "Donator/" + this.Id + "/foragerComment/new";
    $.ajax(webserviceUrl, { 
        dataType: "json",
        type: "POST",
        data: data, success: function(result) {
    }});
}

/**
* post comment to webservice
*
* @param {string} wikiUri is a page uri
* @param {string} wikiConfig is a wiki "mw.config" JSON object
* @param {string} comment to post
* @param {string} user selection on wiki page
*/
VisitProcessor.prototype.postWikiComment = function(wikiUri, wikiConfig, comment, selection) {
    var data = {
        user_comment: comment,
        last_wikipedia_url: wikiUri,
        mw_config_set_results: wikiConfig,
        user_selected_text: selection
    };
    var webserviceUrl = WEBSERVICE_BASE_URI + "Donator/" + this.Id + "/wikiComment/new";
    $.ajax(webserviceUrl, {
        dataType: "json",
        type: "POST",
        data: data, success: function(result) {
    }});
}

/**
* common place to run an initalization routines right after extension install.
* Note: This function does not run after extension upgrade
*
* @param {bool} firstUserInstall is set to false if user installed extension on another PC previously
*/
VisitProcessor.prototype.onFirstRun = function(firstUserInstall) {
    chrome.tabs.create({ 'url': chrome.extension.getURL('options.html'), active: true });
}

/**
* Helper function to attach all necessary event listeners
* and start user interactions processing
*/
VisitProcessor.prototype._attachListeners = function() {
    var processor = this;

    chrome.runtime.onMessage.addListener(function(message, sender, sendResponse) {
        return processor.__onMessage(message, sender, sendResponse);
    });

    chrome.history.onVisited.addListener(function(historyItem) {
        processor.__onVisited(historyItem);
    });

    chrome.tabs.onUpdated.addListener(function(target, changeInfo, tab) {
        if (/^(https?):/.test(tab.url)) {
            if (changeInfo.status == "loading") {
                processor.__onLoading(tab);
            } else if (changeInfo.status == "complete") {
                processor.__onCompleted(tab);
            }
        }
    });

    chrome.tabs.onActivated.addListener(function(activeInfo) {
        processor.__onActivated(activeInfo);
    });

    chrome.tabs.onRemoved.addListener(function(tabId, removeInfo) {
        processor.__onRemoved(tabId);
    });

    chrome.pageAction.onClicked.addListener(function(tab) {
        processor.__onIconClicked(tab);
    });

    // now time to find new clinical session in the Chrome history 
    processor.findNewVisits();
}

/**
* The singleton instance of visit processor
*/
var processor = new VisitProcessor();
