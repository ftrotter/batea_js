/** @license
 *
 * This file is part of DocGraph Spade Chrome extension
 *
 * Copyright 2014, The DocGraph Journal.
 * All rights reserved.
 * http://spade.docgraph.org
 *
 * The Initial Developer of the Original Code is
 *  Andrey Ivanov <andrey.v.ivanov@gmail.com>.
 *
 */

// Helper class to speed up visit traverse. 
// It caches all url and visit items
function HistoryCache() {
	this._histories= [];
	this._visits = [];

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

var clinicalUrlChecks = {};

function __onLoad() {
	//console.log("__onLoad");
	//findNewVisits();
}

function findNewVisits() {
	var lastProcessedVisit = localStorage.lastProcessedVisit;
	if (lastProcessedVisit === undefined) {
		lastProcessedVisit = 0;
	}
	new HistoryCache().refresh(function(cache) {
		// TODO: Get value from store
		var visitCount = cache.getVisitCount();
		for (var i = lastProcessedVisit; i <= visitCount; ++i) {
			var visit = cache.getVisitById(i);
			if (visit) {
				var history = cache.getHistory(visit);
				checkForClinicalUrl(cache, history.url, visit.visitTime);
			}
		}
		// TODO: save visitCount as lastProcessedVisit;
		localStorage.lastProcessedVisit = visitCount;
	});
}

function __onVisited(historyItem) {
	//console.log(historyItem);
	checkForClinicalUrl(null, historyItem.url, historyItem.lastVisitTime);
}

// Helper funciton to obtain the host from the url
function getHost(url) {
	return $('<a>').prop('href', url).prop('hostname');
}

function checkForClinicalUrl(cache, url, visitTime) {
	var host = getHost(url);
	// Check for nih sub-domains first
	if (CLINICAL_URL_DOMAINS.test(host)) {
		processClinicalUrl(cache, url, visitTime);
	}
	else if (POSSIBLE_CLINICAL_URL_DOMAINS.test(host)) {
		// TODO: Save this map to cache instead of session?
		// Check if we queried webservice with passed url already
		if (clinicalUrlChecks.hasOwnProperty(url)) {
			if (clinicalUrlChecks[url]) {
				processClinicalUrl(cache, url, visitTime);
			}
		} else {
			// Query webservice with passed url
			var webserviceUrl = WEBSERVICE_SERVER + "is_title_clinical.php?wiki_url=" + encodeURI(url);
			$.ajax(webserviceUrl, { dataType:"json", success: function(result) {
				clinicalUrlChecks[url] = result.is_clinical;
				if (result.is_clinical) {
					processClinicalUrl(cache, url, visitTime);
				}
			}});
		}
	}
}

function processClinicalUrl(cache, url, visitTime) {
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
function traverseClinicalVisit(cache, visit) {
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

function postClinicalUrl(urls, visits) {
	//console.log(urls);
	//console.log(visits);
	var msg = "";
	for (var i = 0; i < urls.length; ++i) {
		msg += urls[i].url + "\n";
	}
	console.log(msg);
	alert(msg);
}

function convertHistoryItem(item) {
	// TODO: convert  Chrome internal object into 
	// url JSON object compatible with the server
	return item;
}

function convertVisitItem(item) {
	// TODO: convert  Chrome internal object into 
	// visit JSON object compatible with the server
	return item;
}

window.addEventListener("load", function () { __onLoad(); }, false);

chrome.history.onVisited.addListener(__onVisited);
