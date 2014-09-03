/** @license
 *
 * This file is part of DocGraph Spade Chrome extension
 *
 * @copyright 2014, The DocGraph Journal.
 * All rights reserved.
 * http://spade.docgraph.org
 *
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
				
				chrome.history.getVisits({ url: historyItem.url }, function(visits)	{
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
		       this._visits[visit.referringVisitId] !== undefined)
		{
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
	if (value == undefined) {
		return defaultValue;
	}
	return JSON.parse(value);
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
	// Check if we need new id
	if (this.Id == undefined) {
		// generate and save unique id if it was not created yet
		this.setId(this.generateId());
	}
	
	/**
	* Cache of is_clinical.php call results to avoid extra network activity
	* @private
	* @member object
	*/ 
	
	this._clinicalUrlChecks = {};
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

	// No we need to fill cache first time, only after this we can handle new requests
	var processor = this;
	this._cache.refresh(function() {
		processor._attachListeners();
	});
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
VisitProcessor.prototype.__onUpdated = function(tab) {
	this._recentTabs.push({ tabId: tab.id, url: tab.url });

	var lastVisit = this._tab2Visit[tab.id];
	if (lastVisit !== undefined) {
   		// check if it was last session tab
	}
	this._saveLastTabVisit(tab.id);
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
		var state = this._sessions[session];
		// inverse the session state
		if (state === undefined) {
			state = true;
		} else {
			state = !state;
		}
		// and update icons for every session's tab
		this._setSessionState(session, state);
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
	chrome.history.getVisits({ url: url }, function(visitItems)	{
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
				this._excludedSessions.indexOf(session) < 0)
			{
				var history = this._cache.getHistory(visit);
				this.checkForClinicalUrl(history.url, session, function(session) {
					// url is medical, set session state to donatable
					// set icon for all affected session tabs
					this.donateSession(session);
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
	var processor = this;
	// Check for nih sub-domains first
	if (CLINICAL_URL_DOMAINS.test(host)) {
		callback.call(processor, session);
	}
	else if (POSSIBLE_CLINICAL_URL_DOMAINS.test(host)) {
		// TODO: Save this map to cache instead of session?
		// Check if we queried webservice with passed url already
		if (processor._clinicalUrlChecks.hasOwnProperty(url)) {
			if (processor._clinicalUrlChecks[url]) {
				//processor.processClinicalUrl( url, visitId);
				callback.call(processor, session);
			}
		} else {
			// Query webservice with passed url
			var webserviceUrl = WEBSERVICE_SERVER + "is_title_clinical.php?wiki_url=" + encodeURI(url);
			$.ajax(webserviceUrl, { dataType:"json", success: function(result) {
				processor._clinicalUrlChecks[url] = result.is_clinical;
				if (result.is_clinical) {
					callback.call(processor, session);
				}
			}});
		}
	}
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
			this.checkForClinicalUrl(url, session, function() {
				console.log("Session is donatable");
				// url is medical, set session state to donatable
				// and set icon for all affected session tabs
				this._setSessionState(session, true);
			});
		}
	}
	processor._checkForCompletedSession(tabId, session);
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
			console.log(tabs);
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
			if (visitSession == session)
			{
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
		"url_tree": JSON.stringify({ chrome_urls: urls, chrome_visits: visits }),
		"user_token": this.Id
	};

	var webserviceUrl = WEBSERVICE_SERVER + "save_tree.php";
	$.ajax(webserviceUrl, { dataType:"json",
						    type: "POST",
						    data: data, success: function(result) {
	}});

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
		return "img/icon-on.png";
	}
	if (state !== undefined) {
		return "img/icon-off.png";
	}
	return "img/icon-19.png";
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
* Generate unique id for extnesion. It will be used as user token for webserver posts
*
* @return {string} new unique token value
*/
VisitProcessor.prototype.generateId = function() {
	var d = new Date();
	var maxSuffix = 10000;
	return d.getTime() * maxSuffix + Math.ceil(Math.random() * maxSuffix);
}

/**
* Assign and save id as user token
*
* @param {string} id new token value to save
*/
VisitProcessor.prototype.setId = function(id) {
	this.Id = id;
	localStorage.id = this.Id;
}

/**
* Helper function to attach all necessary event listeners
* and start user interactions processing
*/
VisitProcessor.prototype._attachListeners = function() {
	var processor = this;

	chrome.history.onVisited.addListener(function(historyItem) {
		processor.__onVisited(historyItem);
	});

	chrome.tabs.onUpdated.addListener(function(target, changeInfo, tab) {
    	if (changeInfo.status == "loading" && /^(https?):/.test(tab.url)) {
    		processor.__onUpdated(tab);
    	}
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

var processor = new VisitProcessor();
