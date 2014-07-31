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
	this._histories= [];
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
	this.getSession = function(id) {
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

	this._buildSessionsMap = function(visits) {
		this._sessions = [];
		for (var i = 0; i < visits.length; ++i) {
			var session = this.getSession(visits, i);
			if (session > 0) {
				this._sessions[i] = session;
			}
		}
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
	return this;
}

/**
* Helper function to obtain the host from the url
*/
function getHost(url) {
	return $('<a>').prop('href', url).prop('hostname');
}

/** 
* A helper class to speed up visit traverse. It caches all url and visit items
* @constructor
*/
function VisitProcessor() {
	this._clinicalUrlChecks = {};
	this._recentTabs = [];
	this._tab2Visit = [];
	this._sessions = [];

	this._lastTab2Visit = [];
}

VisitProcessor.prototype.__onVisited = function(historyItem) {
	console.log(historyItem);
	
	var url = historyItem.url;
	var lastVisitTime = historyItem.lastVisitTime;
	var tabId = this._findRecentTab(url);
	if (tabId >= 0) {
		if (this._tab2Visit[tabId] != null) {
			console.log("bad visit entry");
		}
		var processor = this;
		this._findVisit(url, lastVisitTime, function(visit) {
			new HistoryCache().refresh(function(cache) {
				processor.processVisit(cache, tabId, url, visit);
            });
		});
	} else {
		console.log("visit is not associated with a tab!");
		// TODO: check if visit is belong to any active session still.
		// TODO: verify if this is clinical url
	}
}

VisitProcessor.prototype.__onUpdated = function(tab) {
   	console.log(tab.url);
   	console.log(tab);

   	// TODO: handle tab close to identify session completion
	this._recentTabs.push({ tabId: tab.id, url: tab.url });

	var lastVisit = this._tab2Visit[tab.id];
	if (lastVisit !== undefined) {
   		// check if it was last session tab
	}
	this._saveLastTabVisit(tab.id);
}

VisitProcessor.prototype.__onRemoved = function(tabId) {
	// prepare refernce for checkForCompletedSession
	this._saveLastTabVisit(tabId);
	var processor = this;
	new HistoryCache().refresh(function(cache) {
		processor.checkForCompletedSession(cache, tabId, -1);
	});
}

VisitProcessor.prototype.__onIconClicked = function(tab) {
	var visit = this._tab2Visit[tab.id];
	if (visit != null) {
		var processor = this;
		new HistoryCache().refresh(function(cache) {
			var session = cache.getSession(visit.visitId);
			var state = processor._sessions[session];
			if (state === undefined) {
				state = true;
			} else {
				state = !state;
			}
			processor._setSessionState(cache, session, state);
		});
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
VisitProcessor.prototype.setTabVisit = function(tabId, visit) {
	// we need to handle new visit in few steps
	// A) associate visit with found tab
	this._tab2Visit[tabId] = visit;
	console.log("associate VisitItem with tab #" + tabId);
}

/**
* Looking for VisitItem with provided visitTime
* @param foundCallback will be called if VisitItem found. Found value will be passed to callback
*/
VisitProcessor.prototype._findVisit = function(url, visitTime, foundCallback) {
	chrome.history.getVisits({ url: url }, function(visitItems)	{
		for (var i = visitItems.length - 1; i >= 0; --i) {
        	var visit = visitItems[i];
            if (visit.visitTime == visitTime) {
            	foundCallback(visit);
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
	new HistoryCache().refresh(function(cache) {
		// TODO: Get value from store
		var visitCount = cache.getVisitCount();
		for (var i = lastProcessedVisit; i <= visitCount; ++i) {
			var visit = cache.getVisitById(i);
			if (visit) {
				var history = cache.getHistory(visit);
				processor.checkForClinicalUrl(history.url);
			}
		}
		// TODO: save visitCount as lastProcessedVisit;
		localStorage.lastProcessedVisit = visitCount;
	});
}

VisitProcessor.prototype.checkForClinicalUrl = function(url, callback) {
	var host = getHost(url);
	var processor = this;
	// Check for nih sub-domains first
	if (CLINICAL_URL_DOMAINS.test(host)) {
		callback();
	}
	else if (POSSIBLE_CLINICAL_URL_DOMAINS.test(host)) {
		// TODO: Save this map to cache instead of session?
		// Check if we queried webservice with passed url already
		if (processor._clinicalUrlChecks.hasOwnProperty(url)) {
			if (processor._clinicalUrlChecks[url]) {
				//processor.processClinicalUrl(cache, url, visitId);
				callback();
			}
		} else {
			// Query webservice with passed url
			var webserviceUrl = WEBSERVICE_SERVER + "is_title_clinical.php?wiki_url=" + encodeURI(url);
			$.ajax(webserviceUrl, { dataType:"json", success: function(result) {
				processor._clinicalUrlChecks[url] = result.is_clinical;
				if (result.is_clinical) {
					callback();
				}
			}});
		}
	}
}

VisitProcessor.prototype.processClinicalUrl = function(cache, url, visitId) {
	console.log("Clinical url found: " + url);
	// Find VisitItem with provided visitTime
	chrome.history.getVisits({ url: url }, function(visitItems)	{
		for (var i = visitItems.length - 1; i >= 0; --i) {
        	var visit = visitItems[i];
            if (visit.visitTime == visitTime) {
        		// Found visit item, process it before sending to webservice
            	if (cache == null) {
                	// create new history cache if cache was not passed
            		new HistoryCache().refresh(function(cache) {
            			traverseClinicalVisit(cache, visit);
            		});
            	} else {
            	    // traverse using passed cache
            		traverseClinicalVisit(cache, visit);
            	}
           		return;
        	}
        }
	});
}

// Traverse found visit then post data
VisitProcessor.prototype.traverseClinicalVisit = function(cache, visit) {
	urls = [];
	visits = [];
	// found current visit in the array
	visits.push(convertVisitItem(visit));
	// find associated history item
	var history = cache.getHistory(visit);
	urls.push(convertHistoryItem(history));

	// traversing visits
	while (visit.referringVisitId > 0) {
		// TODO: do we need to report 
		// broken histories with missed steps?
		// looking for parent visit in the cache
   		var visit = cache.getVisitById(visit.referringVisitId);
   		visits.push(convertVisitItem(visit));

   		var history = cache.getHistory(visit);
   		urls.push(convertHistoryItem(history));
	}
	// post collected data to webservice
	postClinicalUrl(urls, visits);
}

VisitProcessor.prototype.postClinicalUrl = function(urls, visits) {
	//console.log(urls);
	//console.log(visits);
	var msg = "";
	for (var i = 0; i < urls.length; ++i) {
		msg += urls[i].url + "\n";
	}
	console.log(msg);
	alert(msg);
}

/**
* process new user visit. This is main logic method
*/
VisitProcessor.prototype.processVisit = function(cache, tabId, url, visit) {
	// we need to handle new visit in few steps
	// associate visit with found tab
	processor.setTabVisit(tabId, visit);
	// check visit's session state
	var session = cache.getSession(visit.visitId);
	console.log("session #" + session);
	console.log(visit);
	if (session > 0) {
		var state = processor._sessions[session];
		// set page icon based on session state
		console.log("session state is " + state);
		processor._setTabState(tabId, state);
		if (state === undefined) {
			// visit's session state is no defined yet
			// so let test for clinical url
			processor.checkForClinicalUrl(url, function() {
				// url is medical
				// set session state to donatable
				// set icon for all affected session tabs
				processor._setSessionState(cache, session, true);
				console.log("session is donatable");
			});
		}
	}
	processor.checkForCompletedSession(cache, tabId, session);
}

/**
* check for if session copleted for passed tabId
*/
VisitProcessor.prototype.checkForCompletedSession = function(cache, tabId, session) {
	console.log("check for completed sessions. tab #" + tabId);
	// Check if recent tab visit's session completed 
	// with last redirect
	var associations = this._lastTab2Visit;
	console.log(associations);
	for (var i = associations.length - 1; i>= 0; --i) {
		var association = associations[i];
		if (association.tabId == tabId) {
			// erase the entry
			this._lastTab2Visit = this._lastTab2Visit.slice(i, 1);
			var lastSession = cache.getSession(association.visit.visitId);
			console.log(association);
			console.log(lastSession);
			// lastSession could be 0 if user navigates quickly
			if (lastSession != 0 && session != lastSession) {
				// check if session is active still
				if (!processor._isSessionActive(cache, lastSession)) {
					// now we can process this session
					processor.processCompletedSession(cache, lastSession);
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
* process completed session (post it to webserver if needed and save state to DB)
*/
VisitProcessor.prototype.processCompletedSession = function(cache, session) {
	var state = processor._sessions[session];
	console.log("Process completed session #" + session + "(" + state + ")");
	// TODO: implement
}

VisitProcessor.prototype.convertHistoryItem = function(item) {
	// TODO: convert  Chrome internal object into 
	// url JSON object compatible with the server
	return item;
}

VisitProcessor.prototype.convertVisitItem = function(item) {
	// TODO: convert  Chrome internal object into 
	// visit JSON object compatible with the server
	return item;
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

VisitProcessor.prototype._setTabState = function(tabId, state) {
	chrome.pageAction.setIcon({ tabId: tabId, path: this._getStateIcon(state) });
	chrome.pageAction.show(tabId);
}

/**
* set donatable state for session and update associated tabs
*/
VisitProcessor.prototype._setSessionState = function(cache, session, state) {
	this._sessions[session] = state;
	for (var i = 0; i < this._tab2Visit.length; ++i) {
		var visit = this._tab2Visit[i];
		if (visit != null && cache.getSession(visit.visitId) == session) {
			this._setTabState(i, state);
		}
	}
}

/**
* check if any associated tabs exist for passed session
*/
VisitProcessor.prototype._isSessionActive = function(cache, session) {
	for (var i = 0; i < this._tab2Visit.length; ++i) {
		var visit = this._tab2Visit[i];
		if (visit != null && cache.getSession(visit.visitId) == session) {
			// session is active still
			return true;
		}
	}
	// no tabs associated with the session
	return false;
}

var processor = new VisitProcessor();

window.addEventListener("load", function () {
	//console.log("__onLoad");
	//processor.findNewVisits();
}, false);

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

