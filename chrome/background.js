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

/** 
* A helper class to speed up visit traverse. It caches all url and visit items
* @constructor
*/
function HistoryCache() {
	this._histories = [];
	this._visits = [];

	/**
	* _sessions object maps of visitId to session visitId
	* @member Object
	*/
	this._sessions = [];

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
                        //console.log(visits.length + ' visits');
                    }
				});
			}
		});
	};

	/**
	* get session for passed visit id
	* @return id of topmost visit or 0 if passed visit id is invalid
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

	this.getHistory = function(visit) {
		return this._histories[visit.id];
	};

	this.getVisitById = function(id) {
		return this._visits[id];
	};

	this.getVisitCount = function() {
		return this._visits.length;
	};

	this.addHistory = function(history) {
		this._histories[history.id] = history;
	};

	this.addVisit = function(visit) {
		this._visits[visit.visitId] = visit;
	};
	return this;
}

/**
* Helper function to obtain the host from the url
*/
function getHost(url) {
	return $('<a>').prop('href', url).prop('hostname');
}

/**
* Helper funciton to safely handle undefined value
*/
function safeParseJSON(value, defaultValue) {
	if (value == undefined) {
		return defaultValue;
	}
	return JSON.parse(value);
}

/** 
* A helper class to speed up visit traverse. It caches all url and visit items
* @constructor
*/
function VisitProcessor() {
	/**
	* load unique extension id from localStorage
	* @member integer
	*/
	this._extensionId = localStorage.id;
	if (this._extensionId == undefined) {
		// generate and save unique id if it was not created yet
		this._extensionId = this.generateId();
		localStorage.id = this._extensionId;
	}
	this._clinicalUrlChecks = {};
	this._recentTabs = [];
	this._tab2Visit = [];
	/**
	* this variable stores donation state for a sessions
	* @member Array
	*/
	this._sessions = [];
	/**
	* this variable maps visit id to session id
	* @member Array
	*/
	this._visitSessions = [];

	/**
	* this variable stores mapping between tabId and visit. 
	* It is filled from _tab2Visit when tab has been updated
	* @member Array
	*/
	this._lastTab2Visit = [];

	/**
	* List of donated sessions
	*/
	this._donatedSessions = safeParseJSON(localStorage.donatedSessions, []);
	console.log(this._donatedSessions);
	/**
	* List of sessions excluded by user
	*/
	this._excludedSessions = safeParseJSON(localStorage.excludedSessions, []);
	console.log(this._excludedSessions);

	this._cache = new HistoryCache();
	var processor = this;
	this._cache.refresh(function() {
		processor._attachListeners();
	});
}

VisitProcessor.prototype.__onVisited = function(historyItem) {
	//console.log(historyItem);
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
			}
			this.processVisit(tabId, url, visit);
		} else {
			console.log("visit is not associated with a tab!");
			// TODO: check if visit is belong to any active session still.
			// TODO: verify if this is clinical url
		}
	});

}

VisitProcessor.prototype.__onUpdated = function(tab) {
   	//console.log(tab.url);
   	//console.log(tab);
   	// TODO: handle tab close to identify session completion
	this._recentTabs.push({ tabId: tab.id, url: tab.url });

	var lastVisit = this._tab2Visit[tab.id];
	if (lastVisit !== undefined) {
   		// check if it was last session tab
	}
	this._saveLastTabVisit(tab.id);
}

VisitProcessor.prototype.__onRemoved = function(tabId) {
	// prepare reference for _checkForCompletedSession
	this._saveLastTabVisit(tabId);
	var processor = this;
	processor._checkForCompletedSession(tabId, -1);
}

VisitProcessor.prototype.__onIconClicked = function(tab) {
	var visit = this._tab2Visit[tab.id];
	if (visit != null) {
		var session = this._cache.getSession(visit);
		var state = this._sessions[session];
		if (state === undefined) {
			state = true;
		} else {
			state = !state;
		}
		this._setSessionState(session, state);
	}
}

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
*/
VisitProcessor.prototype._setTabVisit = function(tabId, visit) {
	// we need to handle new visit in few steps
	// A) associate visit with found tab
	this._tab2Visit[tabId] = visit;
	//console.log("associate VisitItem with tab #" + tabId);
}

/**
* Looking for VisitItem with provided visitTime
* @param foundCallback will be called if VisitItem found. Found value will be passed to callback
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

VisitProcessor.prototype.findNewVisits = function() {
	var lastProcessedVisit = localStorage.lastProcessedVisit;
	if (lastProcessedVisit === undefined) {
		lastProcessedVisit = 0;
	}
	var processor = this;
	// Get last processed visit index from localStorage
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
* process new user visit. This is main logic method
*/
VisitProcessor.prototype.processVisit = function(tabId, url, visit) {
	// we need to handle new visit in few steps
	// associate visit with found tab
	this._setTabVisit(tabId, visit);

	// check visit's session state
	var session = this._cache.getSession(visit);
	console.log("Session #" + session + " -> " + url);
	//console.log(visit);
	if (session > 0) {
		var state = this._sessions[session];
		// set page icon based on session state
		//console.log("session state is " + state);
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
* check for if session copleted for passed tabId
*/
VisitProcessor.prototype._checkForCompletedSession = function(tabId, session) {
	//console.log("check for completed sessions. tab #" + tabId);
	// Check if recent tab visit's session completed 
	// with last redirect
	var associations = this._lastTab2Visit;
	//console.log(associations);
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
* process completed session, check its state first
*/
VisitProcessor.prototype.processCompletedSession = function(session) {
	var state = processor._sessions[session];
	if (state === undefined) {
		console.log("Ignored completed session #" + session);
		return;
	}
	if (!session) {
		console.log("Exclude completed session #" + session);
		// add excluded session id to list and save it permanently
		this._excludedSessions.push(session);
		localStorage.excludedSessions = JSON.stringify(this._excludedSessions);
		return;
	}

	this.donateSession(session);
}

/**
* donate session, post it to webserver save state to DB
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

VisitProcessor.prototype.postSession = function(urls, visits) {
	var data = {
		user_token: this._extensionId,
		url_tree: {
			chrome_urls: urls,
			chrome_visits: visits
		}
	};

	console.log(JSON.stringify(data));
	var webserviceUrl = WEBSERVICE_SERVER + "save_tree.php";
	$.ajax(webserviceUrl, { dataType:"json", type: "POST", data: data, success: function(result) {
		console.log(result);
	}});

}

VisitProcessor.prototype.convertHistoryItem = function(item) {
	// convert Chrome internal object into 
	// url JSON object compatible with the server
	return {
		url_id: item.id,
		url: item.url,
  		title: item.title,
  		visit_count: item.visitCount,
  		typed_count:  item.typedCount,
  		last_visit_time: item.lastVisitTime
	};
}

VisitProcessor.prototype.convertVisitItem = function(item) {
	// convert Chrome internal object into 
	// visit JSON object compatible with the server
	return {
		visit_id: item.visitId,
		url_id: item.id,
		visit_time: item.visitTime,
		from_visit: item.referringVisitId,
		transition: item.transition
	};
}

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
* update passed tab icon state based on donatable state
*/
VisitProcessor.prototype._setTabState = function(tabId, state) {
	chrome.pageAction.setIcon({ tabId: tabId, path: this._getStateIcon(state) });
	chrome.pageAction.show(tabId);
}

/**
* set donatable state for session and update associated session tabs
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
* check if any associated tabs exist for passed session
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
* generate unique id for extnesion. It will be used as user token for webserver posts
*/
VisitProcessor.prototype.generateId = function() {
	var d = new Date();
	var maxSuffix = 10000;
	return d.getTime() * maxSuffix + Math.ceil(Math.random() * maxSuffix);
}

/**
* helper function to attach necessary event listeners
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

	processor.findNewVisits();
}

var processor = new VisitProcessor();
